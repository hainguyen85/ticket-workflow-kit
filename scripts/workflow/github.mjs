import { fail, issueNumber, segment, redact } from './config.mjs'

export function githubClient(settings, fetchImpl = fetch) {
  const {
    token,
    config: { github: gh },
  } = settings
  async function request(endpoint, body) {
    if (!endpoint.startsWith('/') || endpoint.startsWith('//')) fail('API endpoint không hợp lệ.')
    let response
    try {
      response = await fetchImpl(`https://api.github.com${endpoint}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      fail('Không kết nối được GitHub API; kiểm tra mạng và thử lại.')
    }
    if (!response.ok)
      fail(`GitHub API HTTP ${response.status}; kiểm tra PAT, quyền repo/Project hoặc rate limit.`)
    let data
    try {
      data = await response.json()
    } catch {
      fail('GitHub trả về dữ liệu không phải JSON.')
    }
    if (data.errors?.length)
      fail('GitHub GraphQL từ chối truy vấn; kiểm tra GH_PROJECT_URL trong env và quyền Project.')
    return data
  }
  const graphql = async (query, variables) => (await request('/graphql', { query, variables })).data
  async function identity() {
    const [user, repository, owner] = await Promise.all([
      request('/user'),
      request(`/repos/${gh.repository}`),
      request(`/users/${gh.project.owner}`),
    ])
    segment(user.login)
    if (repository.full_name?.toLowerCase() !== gh.repository.toLowerCase() || !repository.node_id)
      fail('Repo không khớp cấu hình env.')
    if (!repository.permissions?.push) fail('Account/PAT chưa có quyền Write repo.')
    if (
      owner.login?.toLowerCase() !== gh.project.owner.toLowerCase() ||
      !['Organization', 'User'].includes(owner.type)
    )
      fail('Project owner không hợp lệ.')
    if (gh.project.ownerType && gh.project.ownerType !== owner.type)
      fail('Loại owner trong GH_PROJECT_URL không khớp GitHub; kiểm tra /orgs/ hoặc /users/.')
    const kind = owner.type === 'Organization' ? 'organization' : 'user'
    const data = await graphql(
      `query ($owner: String!, $number: Int!, $after: String) {
      ${kind}(login: $owner) {
        projectV2(number: $number) {
          id number title url viewerCanUpdate
          fields(first: 100, after: $after) {
            nodes { ... on ProjectV2SingleSelectField { id name options { id name } } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }`,
      { owner: gh.project.owner, number: gh.project.number, after: null },
    )
    const project = data?.[kind]?.projectV2
    if (!project?.id || project.number !== gh.project.number || !project.viewerCanUpdate)
      fail('Project không tồn tại hoặc account/PAT chưa có quyền cập nhật.')
    // Status is a built-in Project field. Refuse an incomplete listing instead of guessing IDs.
    if (project.fields?.pageInfo?.hasNextPage)
      fail('Project vượt 100 fields; chưa hỗ trợ đầy đủ, không đoán Status ID.')
    const statuses = (project.fields?.nodes ?? []).filter((field) => field.name === 'Status')
    if (statuses.length !== 1 || !statuses[0].id || !Array.isArray(statuses[0].options))
      fail('Project phải có một field Status dạng single-select.')
    const status = statuses[0],
      options = {}
    for (const name of gh.statusNames) {
      const matches = status.options.filter((option) => option.name === name && option.id)
      if (matches.length !== 1) fail('Project thiếu hoặc trùng Status cần cho workflow: ' + name)
      options[name] = matches[0].id
    }
    // Resolve IDs afresh per invocation; switching boards cannot reuse old option IDs.
    gh.repository = repository.full_name
    gh.pushUrl = `https://github.com/${gh.repository}.git`
    gh.project.owner = owner.login
    gh.repositoryNodeId = repository.node_id
    gh.project.nodeId = project.id
    gh.project.url = project.url
    gh.project.statusFieldId = status.id
    gh.project.statusOptions = options
    return {
      login: user.login,
      repository: repository.full_name,
      project: { id: project.id, number: project.number, url: project.url, canUpdate: true },
      canPush: true,
    }
  }
  async function projectItem(issueNodeId) {
    let after = null
    const cursors = new Set()
    for (let page = 0; page < 100; page++) {
      const data = await graphql(
        `
          query ($id: ID!, $after: String) {
            node(id: $id) {
              ... on ProjectV2 {
                items(first: 100, after: $after) {
                  nodes {
                    id
                    content {
                      ... on Issue {
                        id
                      }
                      ... on PullRequest {
                        id
                      }
                    }
                    fieldValueByName(name: "Status") {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        optionId
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        `,
        { id: gh.project.nodeId, after },
      )
      const connection = data?.node?.items
      if (!Array.isArray(connection?.nodes) || !connection.pageInfo)
        fail('Không đọc được Project items.')
      const found = connection.nodes.find((item) => item.content?.id === issueNodeId)
      if (found)
        return {
          id: found.id,
          status: found.fieldValueByName?.name ?? null,
          statusOptionId: found.fieldValueByName?.optionId ?? null,
        }
      if (!connection.pageInfo.hasNextPage) fail('Issue chưa được thêm vào Project của workshop.')
      after = connection.pageInfo.endCursor
      if (!after || cursors.has(after)) fail('Project pagination không hợp lệ.')
      cursors.add(after)
    }
    fail('Project quá lớn để sync trong một lần; chưa ghi dữ liệu.')
  }
  async function ticket(number) {
    const id = issueNumber(number)
    const issue = await request(`/repos/${gh.repository}/issues/${id}`)
    if (issue.pull_request || issue.number !== id || typeof issue.title !== 'string')
      fail('ID không phải Issue hợp lệ.')
    const comments = []
    for (let page = 1; ; page++) {
      if (page > 100) fail('Issue vượt giới hạn 10.000 comments; chưa ghi dữ liệu.')
      const batch = await request(
        `/repos/${gh.repository}/issues/${id}/comments?per_page=100&page=${page}`,
      )
      if (!Array.isArray(batch)) fail('Comments không hợp lệ.')
      comments.push(...batch)
      if (batch.length < 100) break
    }
    const item = await projectItem(issue.node_id)
    // Detect concurrent edits instead of claiming an internally consistent snapshot.
    const confirmed = await request(`/repos/${gh.repository}/issues/${id}`)
    if (confirmed.updated_at !== issue.updated_at || confirmed.comments !== comments.length)
      fail('Issue thay đổi trong khi sync; chạy lại để lấy snapshot nhất quán.')
    const sanitize = (value) => redact(value, token)
    return {
      repository: gh.repository,
      number: id,
      nodeId: issue.node_id,
      url: issue.html_url,
      title: sanitize(issue.title),
      body: sanitize(issue.body),
      state: issue.state,
      updatedAt: issue.updated_at,
      labels: (issue.labels ?? []).map((label) => sanitize(label.name)).sort(),
      assignees: (issue.assignees ?? []).map((user) => segment(user.login)).sort(),
      comments: comments.map((comment) => ({
        id: comment.id,
        author: sanitize(comment.user?.login ?? 'deleted-user'),
        body: sanitize(comment.body),
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        url: comment.html_url,
      })),
      project: { number: gh.project.number, ...item },
    }
  }
  async function setStatus(issueNodeId, name) {
    const option = gh.project.statusOptions[name]
    if (!option) fail('Project status không được hỗ trợ.')
    const item = await projectItem(issueNodeId)
    if (item.statusOptionId !== option)
      await graphql(
        `
          mutation ($project: ID!, $item: ID!, $field: ID!, $option: String!) {
            updateProjectV2ItemFieldValue(
              input: {
                projectId: $project
                itemId: $item
                fieldId: $field
                value: { singleSelectOptionId: $option }
              }
            ) {
              projectV2Item {
                id
              }
            }
          }
        `,
        { project: gh.project.nodeId, item: item.id, field: gh.project.statusFieldId, option },
      )
    const verified = await projectItem(issueNodeId)
    if (verified.statusOptionId !== option)
      fail('Project chưa phản ánh status mới; kiểm tra rồi thử lại.')
    return verified
  }
  async function findPR(branch) {
    const head = encodeURIComponent(`${gh.repository.split('/')[0]}:${branch}`)
    const list = await request(
      `/repos/${gh.repository}/pulls?state=open&head=${head}&base=${encodeURIComponent(gh.baseBranch)}`,
    )
    if (!Array.isArray(list) || list.length > 1) fail('Không xác định được PR duy nhất cho branch.')
    return list[0] ?? null
  }
  async function attachPR(pr) {
    if (
      !Number.isSafeInteger(pr.number) ||
      pr.number < 1 ||
      !pr.node_id ||
      pr.base?.repo?.full_name !== gh.repository ||
      pr.head?.repo?.full_name !== gh.repository
    )
      fail('PR không thuộc repo workshop; không cập nhật Project.')
    // GitHub returns the existing item when the content is already in this Project.
    // A retry after a lost response therefore cannot create a duplicate card.
    const result = await graphql(
      `
        mutation ($project: ID!, $content: ID!) {
          addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
            item {
              id
            }
          }
        }
      `,
      { project: gh.project.nodeId, content: pr.node_id },
    )
    if (!result?.addProjectV2ItemById?.item?.id)
      fail('Chưa xác nhận được PR đã vào Project; chạy lại publish để kiểm tra.')
    return setStatus(pr.node_id, 'PR ready')
  }
  async function createPR(branch, title, body) {
    return request(`/repos/${gh.repository}/pulls`, {
      title,
      body,
      head: branch,
      base: gh.baseBranch,
      draft: false,
      maintainer_can_modify: true,
    })
  }
  return { identity, ticket, setStatus, findPR, createPR, attachPR }
}
