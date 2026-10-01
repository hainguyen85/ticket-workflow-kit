import { readFile, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { fail } from './config.mjs'
import { hasSecret } from './policy.mjs'

export const CHAT_NAME = 'chat.md'
const FILE_LIMIT = 20 * 1024 * 1024
const CHAT_LIMIT = 1024 * 1024
const SCAN_LIMIT = 2 * 1024 * 1024
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

function scan(data) {
  if (data.length > SCAN_LIMIT) return
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return // binary sources (docx, pdf, images) are stored as-is
  }
  if (hasSecret(text)) fail('Nguồn yêu cầu chứa mẫu secret; loại bỏ trước khi đưa vào hồ sơ.')
}

// Request sources are untrusted data. They are copied byte for byte, never interpreted.
export function fileSource(name, data) {
  if (
    typeof name !== 'string' ||
    name.length > 150 ||
    !/^[^\\/:*?"<>|\0-\x1f]+$/.test(name) ||
    name.startsWith('.') ||
    /[ .]$/.test(name) ||
    name.toLowerCase() === CHAT_NAME
  )
    fail(`Tên file nguồn không hợp lệ (hoặc trùng tên dành riêng ${CHAT_NAME}); đổi tên rồi sync lại.`)
  if (!data.length || data.length > FILE_LIMIT) fail('File nguồn phải có nội dung và dưới 20 MB.')
  scan(data)
  return { kind: 'file', name, data, sha256: sha256(data) }
}
export function chatSource(text) {
  if (typeof text !== 'string' || !text.trim()) fail('Nội dung chat nguồn không được rỗng.')
  const data = Buffer.from(text.replace(/^﻿/, ''), 'utf8')
  if (data.length > CHAT_LIMIT) fail('Nội dung chat nguồn phải dưới 1 MB.')
  scan(data)
  return { kind: 'chat', name: CHAT_NAME, data, sha256: sha256(data) }
}

async function regularFile(file) {
  if (/(?:^|[/\\])\.env|credential|\.ssh/i.test(file))
    fail('Không dùng credential file làm nguồn yêu cầu.')
  let stat
  try {
    stat = await lstat(file)
  } catch {
    fail('Không đọc được file nguồn; kiểm tra đường dẫn.')
  }
  if (!stat.isFile()) fail('Nguồn yêu cầu phải là file thường, không phải thư mục hoặc symlink.')
  if (stat.size > FILE_LIMIT) fail('File nguồn phải dưới 20 MB.')
  return readFile(file)
}

export async function readSources({ files = [], chat = null } = {}) {
  if (files.length > 20) fail('Mỗi lần sync tối đa 20 file nguồn.')
  const sources = []
  const names = new Set()
  for (const file of files) {
    const source = fileSource(path.basename(file), await regularFile(file))
    if (names.has(source.name.toLowerCase())) fail('Các file nguồn trong một lần sync bị trùng tên.')
    names.add(source.name.toLowerCase())
    sources.push(source)
  }
  if (chat !== null) sources.push(chatSource((await regularFile(chat)).toString('utf8')))
  return sources
}
