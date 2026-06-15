import type { InventoryData, StockInRow, StockOutRow, Thresholds } from './types'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = process.env.GITHUB_OWNER
const GITHUB_REPO  = process.env.GITHUB_REPO

const PATHS = {
  stockIn:    'data/stock_in.json',
  stockOut:   'data/stock_out.json',
  thresholds: 'data/thresholds.json',
}

function getApiUrl(path: string) {
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('缺少环境变量 GITHUB_OWNER 或 GITHUB_REPO')
  }
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
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

/** 读取单个文件，返回 { content, sha }，文件不存在时返回 null */
async function readFile(path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(getApiUrl(path), {
    headers: getHeaders(),
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API 错误 ${res.status}: ${text}`)
  }
  const json = await res.json()
  const content = Buffer.from(json.content, 'base64').toString('utf-8')
  return { content, sha: json.sha }
}

/** 写入单个文件 */
async function writeFile(
  path: string,
  data: unknown,
  sha: string | null,
  message: string
): Promise<string> {
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64')
  const body: Record<string, unknown> = { message, content }
  if (sha) body.sha = sha

  const res = await fetch(getApiUrl(path), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    if (res.status === 409) throw new Error('CONFLICT')
    throw new Error(`GitHub API 错误 ${res.status}: ${text}`)
  }
  const json = await res.json()
  return json.content.sha as string
}

// ---- SHA 缓存类型 ----
export interface FileShas {
  stockIn:    string | null
  stockOut:   string | null
  thresholds: string | null
}

/**
 * 从 GitHub 并行读取三个文件，合并为 InventoryData
 * 任意一个文件不存在时，该部分返回空数据（兼容首次使用和迁移场景）
 */
export async function fetchInventoryData(): Promise<{
  data: InventoryData
  shas: FileShas
  isEmpty: boolean
} | null> {
  const [inResult, outResult, thrResult] = await Promise.all([
    readFile(PATHS.stockIn),
    readFile(PATHS.stockOut),
    readFile(PATHS.thresholds),
  ])

  // 三个文件都不存在 → 全新安装，返回 null 触发空数据引导
  if (!inResult && !outResult && !thrResult) return null

  const stockIn: StockInRow[]   = inResult  ? JSON.parse(inResult.content)  : []
  const stockOut: StockOutRow[] = outResult ? JSON.parse(outResult.content) : []
  const thresholds: Thresholds  = thrResult ? JSON.parse(thrResult.content) : {}

  // 兼容旧格式：如果 stockIn 是旧的 { lastUpdated, stockIn, stockOut, thresholds } 结构
  // （首次从单文件迁移时）
  const normalizedIn: StockInRow[] = Array.isArray(stockIn)
    ? stockIn
    : (stockIn as unknown as InventoryData).stockIn ?? []
  const normalizedOut: StockOutRow[] = Array.isArray(stockOut)
    ? stockOut
    : (stockOut as unknown as InventoryData).stockOut ?? []

  return {
    data: {
      lastUpdated: '',
      stockIn: normalizedIn,
      stockOut: normalizedOut,
      thresholds,
    },
    shas: {
      stockIn:    inResult?.sha  ?? null,
      stockOut:   outResult?.sha ?? null,
      thresholds: thrResult?.sha ?? null,
    },
    isEmpty: normalizedIn.length === 0 && normalizedOut.length === 0,
  }
}

/**
 * 并行保存三个文件到 GitHub（每个文件一个 commit）
 * 返回新的 sha 集合
 */
export async function saveInventoryData(
  data: InventoryData,
  shas: FileShas
): Promise<FileShas> {
  const now = new Date().toISOString()
  const msg = `📦 更新库存数据 ${now.slice(0, 10)}`

  const [newInSha, newOutSha, newThrSha] = await Promise.all([
    writeFile(PATHS.stockIn,    data.stockIn,    shas.stockIn,    msg),
    writeFile(PATHS.stockOut,   data.stockOut,   shas.stockOut,   msg),
    writeFile(PATHS.thresholds, data.thresholds, shas.thresholds, msg),
  ])

  return {
    stockIn:    newInSha,
    stockOut:   newOutSha,
    thresholds: newThrSha,
  }
}
