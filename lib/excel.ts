import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { StockInRow, StockOutRow, UploadApiResponse } from './types'
import { COLUMN_ALIASES, STOCK_IN_SHEET_NAMES, STOCK_OUT_SHEET_NAMES } from './constants'

/** 规范化列名：将 Excel 中的列名映射到标准列名 */
function normalizeColumnName(raw: string): string | null {
  const trimmed = raw.trim()
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(trimmed)) return canonical
  }
  return null
}

/** 将一行原始数据（对象）的 key 规范化 */
function normalizeRow(rawRow: Record<string, unknown>): {
  normalized: Record<string, unknown>
  unknownKeys: string[]
} {
  const normalized: Record<string, unknown> = {}
  const unknownKeys: string[] = []

  for (const [key, value] of Object.entries(rawRow)) {
    const canonical = normalizeColumnName(key)
    if (canonical) {
      normalized[canonical] = value
    } else {
      unknownKeys.push(key)
    }
  }

  return { normalized, unknownKeys }
}

/** 将 Excel 日期数字或字符串统一转为 YYYY-MM-DD */
function normalizeDate(value: unknown): string {
  if (typeof value === 'number') {
    // Excel 序列号
    const date = XLSX.SSF.parse_date_code(value)
    const y = date.y.toString().padStart(4, '0')
    const m = date.m.toString().padStart(2, '0')
    const d = date.d.toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // 尝试解析常见格式 YYYY/MM/DD → YYYY-MM-DD
    const slash = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (slash) {
      return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`
    }
    return trimmed
  }
  return String(value ?? '')
}

/** 找到 Sheet（按名称模糊匹配） */
function findSheet(workbook: XLSX.WorkBook, candidates: string[]): XLSX.WorkSheet | null {
  for (const name of candidates) {
    if (workbook.SheetNames.includes(name)) {
      return workbook.Sheets[name]
    }
  }
  // 模糊：包含关键字
  for (const sheetName of workbook.SheetNames) {
    for (const candidate of candidates) {
      if (sheetName.includes(candidate) || candidate.includes(sheetName)) {
        return workbook.Sheets[sheetName]
      }
    }
  }
  return null
}

/** 解析上传的 Excel Buffer，返回入库/出库数据（不含 id，由调用方分配） */
export function parseExcel(buffer: Buffer): UploadApiResponse {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })

  const warnings: string[] = []

  // 找入库表
  const stockInSheet = findSheet(workbook, STOCK_IN_SHEET_NAMES)
  if (!stockInSheet) {
    warnings.push(`未找到入库表（尝试了：${STOCK_IN_SHEET_NAMES.join('、')}），可用 Sheet：${workbook.SheetNames.join('、')}`)
  }

  // 找出库表
  const stockOutSheet = findSheet(workbook, STOCK_OUT_SHEET_NAMES)
  if (!stockOutSheet) {
    warnings.push(`未找到出库表（尝试了：${STOCK_OUT_SHEET_NAMES.join('、')}），可用 Sheet：${workbook.SheetNames.join('、')}`)
  }

  // 解析入库表
  const rawStockIn = stockInSheet
    ? (XLSX.utils.sheet_to_json(stockInSheet) as Record<string, unknown>[])
    : []

  const stockIn: Omit<StockInRow, 'id'>[] = []
  for (const rawRow of rawStockIn) {
    const { normalized, unknownKeys } = normalizeRow(rawRow)
    if (unknownKeys.length > 0 && rawStockIn.indexOf(rawRow) === 0) {
      warnings.push(`入库表中有未识别的列：${unknownKeys.join('、')}（已忽略）`)
    }
    if (!normalized['商品名称'] && !normalized['商品代码']) continue  // 跳过空行

    stockIn.push({
      商品名称: String(normalized['商品名称'] ?? ''),
      商品代码: String(normalized['商品代码'] ?? ''),
      单价: Number(normalized['单价'] ?? 0),
      入库数量: Number(normalized['入库数量'] ?? 0),
      订单时间: normalizeDate(normalized['订单时间']),
      商品分类: normalized['商品分类'] ? String(normalized['商品分类']) : undefined,
    })
  }

  // 解析出库表
  const rawStockOut = stockOutSheet
    ? (XLSX.utils.sheet_to_json(stockOutSheet) as Record<string, unknown>[])
    : []

  const stockOut: Omit<StockOutRow, 'id'>[] = []
  for (const rawRow of rawStockOut) {
    const { normalized, unknownKeys } = normalizeRow(rawRow)
    if (unknownKeys.length > 0 && rawStockOut.indexOf(rawRow) === 0) {
      warnings.push(`出库表中有未识别的列：${unknownKeys.join('、')}（已忽略）`)
    }
    if (!normalized['商品名称'] && !normalized['商品代码']) continue

    stockOut.push({
      商品名称: String(normalized['商品名称'] ?? ''),
      商品代码: String(normalized['商品代码'] ?? ''),
      单价: Number(normalized['单价'] ?? 0),
      出库数量: Number(normalized['出库数量'] ?? 0),
      订单时间: normalizeDate(normalized['订单时间']),
      商品分类: normalized['商品分类'] ? String(normalized['商品分类']) : undefined,
    })
  }

  return { stockIn, stockOut, warnings }
}

/** 生成 Excel 文件 Buffer（含入库表/出库表两个 Sheet） */
export function generateExcel(
  stockIn: StockInRow[],
  stockOut: StockOutRow[]
): Buffer {
  const workbook = XLSX.utils.book_new()

  // 入库表（去掉内部 id 字段）
  const stockInRows = stockIn.map(({ id: _id, ...rest }) => ({
    商品名称: rest.商品名称,
    商品代码: rest.商品代码,
    商品分类: rest.商品分类 ?? '',
    单价: rest.单价,
    入库数量: rest.入库数量,
    订单时间: rest.订单时间,
  }))
  const wsIn = XLSX.utils.json_to_sheet(stockInRows)
  XLSX.utils.book_append_sheet(workbook, wsIn, '入库表')

  // 出库表
  const stockOutRows = stockOut.map(({ id: _id, ...rest }) => ({
    商品名称: rest.商品名称,
    商品代码: rest.商品代码,
    商品分类: rest.商品分类 ?? '',
    单价: rest.单价,
    出库数量: rest.出库数量,
    订单时间: rest.订单时间,
  }))
  const wsOut = XLSX.utils.json_to_sheet(stockOutRows)
  XLSX.utils.book_append_sheet(workbook, wsOut, '出库表')

  // 输出为 Buffer
  const uint8 = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(uint8)
}

/** 生成唯一 ID（前缀区分入库/出库） */
export function newStockInId() {
  return `si_${uuidv4()}`
}
export function newStockOutId() {
  return `so_${uuidv4()}`
}
