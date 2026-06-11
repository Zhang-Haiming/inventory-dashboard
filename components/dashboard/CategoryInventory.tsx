'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getCategoryInventory, getAllCategories } from '@/lib/dataUtils'
import { formatQty } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { StockInRow, StockOutRow, Thresholds } from '@/lib/types'

interface Props {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
}

export function CategoryInventory({ stockIn, stockOut, thresholds }: Props) {
  const inventory = useMemo(
    () => getCategoryInventory(stockIn, stockOut, thresholds),
    [stockIn, stockOut, thresholds]
  )
  const categories = useMemo(() => getAllCategories(inventory), [inventory])
  const [filterCategory, setFilterCategory] = useState<string>('全部')
  const [showLowOnly, setShowLowOnly] = useState(false)

  const lowCount = inventory.filter((p) => p.isLow).length

  const filtered = useMemo(() => {
    let list = inventory
    if (filterCategory !== '全部') {
      list = list.filter((p) => p.商品分类 === filterCategory)
    }
    if (showLowOnly) {
      list = list.filter((p) => p.isLow)
    }
    return list
  }, [inventory, filterCategory, showLowOnly])

  return (
    <div className="space-y-4">
      {/* 过滤栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">分类：</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="全部">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {lowCount > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer text-sm text-amber-700">
            <input
              type="checkbox"
              checked={showLowOnly}
              onChange={(e) => setShowLowOnly(e.target.checked)}
              className="rounded"
            />
            <AlertTriangle className="h-3.5 w-3.5" />
            只看库存不足（{lowCount} 种）
          </label>
        )}

        <span className="text-sm text-slate-400 ml-auto">共 {filtered.length} 种商品</span>
      </div>

      {/* 库存表格 */}
      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-medium text-slate-600">商品名称</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">商品代码</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">分类</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">入库合计</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">出库合计</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">当前库存</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">预警阈值</th>
              <th className="text-center py-3 px-4 font-medium text-slate-600">状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">暂无数据</td>
              </tr>
            )}
            {filtered.map((product) => (
              <tr
                key={product.商品代码}
                className={`border-b border-slate-100 last:border-0 transition-colors ${
                  product.isLow ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'
                }`}
              >
                <td className="py-3 px-4 font-medium text-slate-900">{product.商品名称}</td>
                <td className="py-3 px-4 text-slate-500 font-mono text-xs">{product.商品代码}</td>
                <td className="py-3 px-4">
                  {product.商品分类 ? (
                    <Badge variant="secondary">{product.商品分类}</Badge>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-green-700">{formatQty(product.totalIn)}</td>
                <td className="py-3 px-4 text-right text-red-600">{formatQty(product.totalOut)}</td>
                <td className={`py-3 px-4 text-right font-bold ${product.isLow ? 'text-red-700' : 'text-slate-900'}`}>
                  {formatQty(product.currentStock)}
                </td>
                <td className="py-3 px-4 text-right text-slate-500">
                  {product.threshold > 0 ? formatQty(product.threshold) : <span className="text-slate-300">未设</span>}
                </td>
                <td className="py-3 px-4 text-center">
                  {product.isLow ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      库存不足
                    </Badge>
                  ) : product.threshold > 0 ? (
                    <Badge variant="success">充足</Badge>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
