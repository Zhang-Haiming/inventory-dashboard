import { InventoryData } from './types'
import { GITHUB_DATA_PATH } from './constants'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = process.env.GITHUB_OWNER
const GITHUB_REPO = process.env.GITHUB_REPO

function getApiUrl() {
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('缺少环境变量 GITHUB_OWNER 或 GITHUB_REPO')
  }
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}`
}

function getHeaders() {
  if (!GITHUB_TOKEN) {
    throw new Error('缺少环境变量 GITHUB_TOKEN')
  }
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** 从 GitHub 仓库读取 inventory.json，返回数据和当前 sha */
export async function fetchInventoryData(): Promise<{ data: InventoryData; sha: string } | null> {
  const res = await fetch(getApiUrl(), {
    headers: getHeaders(),
    // 禁止 Vercel 缓存，始终获取最新数据
    cache: 'no-store',
  })

  if (res.status === 404) {
    // 文件尚未创建，返回 null（前端显示初始引导页面）
    return null
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API 错误 ${res.status}: ${text}`)
  }

  const json = await res.json()
  const content = Buffer.from(json.content, 'base64').toString('utf-8')
  const data: InventoryData = JSON.parse(content)

  return { data, sha: json.sha }
}

/** 保存 inventory.json 到 GitHub 仓库（会创建一个 commit） */
export async function saveInventoryData(
  data: InventoryData,
  sha: string | null,   // 首次创建文件时 sha 为 null
  message = '📦 更新库存数据'
): Promise<string> {
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64')

  const body: Record<string, unknown> = {
    message,
    content,
  }
  if (sha) {
    body.sha = sha
  }

  const res = await fetch(getApiUrl(), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    // 409 表示 sha 过期（其他人已经保存了更新的版本）
    if (res.status === 409) {
      throw new Error('CONFLICT')
    }
    throw new Error(`GitHub API 错误 ${res.status}: ${text}`)
  }

  const json = await res.json()
  return json.content.sha as string
}
