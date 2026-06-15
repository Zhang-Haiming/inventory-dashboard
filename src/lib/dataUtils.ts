import type { StockInRow, StockOutRow, MonthlySummary, ProductInventory, Thresholds } from './types'

/** 将日期字符串截取为 YYYY-MM */
function toMonth(dateStr: string): string {
  return dateStr ? dateStr.slice(0, 7) : '未知'
}

/** 四舍五入到两位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 按月汇总入库/出库金额和数量
 * 返回按月份升序排列的数组（最近 N 个月）
 */
export function getMonthlySummary(
  stockIn: StockInRow[],
  stockOut: StockOutRow[]
): MonthlySummary[] {
  const map = new Map<string, MonthlySummary>()

  const ensure = (month: string) => {
    if (!map.has(month)) {
      map.set(month, { month, stockInAmount: 0, stockOutAmount: 0, stockInQty: 0, stockOutQty: 0 })
    }
    return map.get(month)!
  }

  for (const row of stockIn) {
    const m = ensure(toMonth(row.订单时间))
    m.stockInAmount = round2(m.stockInAmount + row.单价 * row.入库数量)
    m.stockInQty += row.入库数量
  }

  for (const row of stockOut) {
    const m = ensure(toMonth(row.订单时间))
    m.stockOutAmount = round2(m.stockOutAmount + row.单价 * row.出库数量)
    m.stockOutQty += row.出库数量
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * 按商品代码计算当前库存（总入库 - 总出库），并标记低库存
 */
export function getCategoryInventory(
  stockIn: StockInRow[],
  stockOut: StockOutRow[],
  thresholds: Thresholds
): ProductInventory[] {
  // 汇总每个商品代码的入库
  const inMap = new Map<string, { name: string; category: string; qty: number }>()
  for (const row of stockIn) {
    const existing = inMap.get(row.商品代码)
    if (existing) {
      existing.qty += row.入库数量
      // 用最新的名称和分类
      existing.name = row.商品名称
      existing.category = row.商品分类 ?? existing.category
    } else {
      inMap.set(row.商品代码, {
        name: row.商品名称,
        category: row.商品分类 ?? '',
        qty: row.入库数量,
      })
    }
  }

  // 汇总每个商品代码的出库
  const outMap = new Map<string, number>()
  for (const row of stockOut) {
    outMap.set(row.商品代码, (outMap.get(row.商品代码) ?? 0) + row.出库数量)
  }

  // 合并：以入库表中的商品为主
  const result: ProductInventory[] = []
  for (const [code, inData] of inMap.entries()) {
    const totalOut = outMap.get(code) ?? 0
    const currentStock = inData.qty - totalOut
    const threshold = thresholds[code] ?? 0

    result.push({
      商品代码: code,
      商品名称: inData.name,
      商品分类: inData.category,
      totalIn: inData.qty,
      totalOut,
      currentStock,
      threshold,
      isLow: threshold > 0 && currentStock <= threshold,
    })
  }

  // 按商品分类 + 商品名称排序
  return result.sort((a, b) => {
    if (a.商品分类 !== b.商品分类) return a.商品分类.localeCompare(b.商品分类)
    return a.商品名称.localeCompare(b.商品名称)
  })
}

/** 过滤出低库存商品 */
export function getLowStockItems(inventory: ProductInventory[]): ProductInventory[] {
  return inventory.filter((p) => p.isLow)
}

/** 获取所有不重复的月份列表（升序） */
export function getAllMonths(stockIn: StockInRow[], stockOut: StockOutRow[]): string[] {
  const set = new Set<string>()
  stockIn.forEach((r) => set.add(toMonth(r.订单时间)))
  stockOut.forEach((r) => set.add(toMonth(r.订单时间)))
  return Array.from(set).sort()
}

/** 获取所有不重复的商品分类 */
export function getAllCategories(inventory: ProductInventory[]): string[] {
  const set = new Set<string>()
  inventory.forEach((p) => p.商品分类 && set.add(p.商品分类))
  return Array.from(set).sort()
}
