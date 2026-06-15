'use client'
import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getCategoryInventory, getLowStockItems } from '@/lib/dataUtils'
import { formatQty } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { StockInRow, StockOutRow, Thresholds } from '@/lib/types'

interface Props {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
}

export function LowStockAlert({ stockIn, stockOut, thresholds }: Props) {
  const lowItems = useMemo(() => {
    const inventory = getCategoryInventory(stockIn, stockOut, thresholds)
    return getLowStockItems(inventory)
  }, [stockIn, stockOut, thresholds])

  if (lowItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
          <span className="text-2xl">✅</span>
        </div>
        <p className="text-slate-600 font-medium">所有商品库存充足</p>
        <p className="text-sm text-slate-400 mt-1">没有低于预警阈值的商品</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
        <p className="text-sm text-red-700 font-medium">
          有 <strong>{lowItems.length}</strong> 种商品库存低于预警阈值，请及时补货
        </p>
      </div>

      <div className="rounded-lg border border-red-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-red-200 bg-red-50">
              <th className="text-left py-3 px-4 font-medium text-red-800">商品名称</th>
              <th className="text-left py-3 px-4 font-medium text-red-800">商品代码</th>
              <th className="text-left py-3 px-4 font-medium text-red-800">分类</th>
              <th className="text-right py-3 px-4 font-medium text-red-800">当前库存</th>
              <th className="text-right py-3 px-4 font-medium text-red-800">预警阈值</th>
              <th className="text-right py-3 px-4 font-medium text-red-800">缺口</th>
            </tr>
          </thead>
          <tbody>
            {lowItems.map((product) => {
              const gap = product.threshold - product.currentStock
              return (
                <tr
                  key={product.商品代码}
                  className="border-b border-red-100 last:border-0 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <td className="py-3 px-4 font-medium text-red-900">{product.商品名称}</td>
                  <td className="py-3 px-4 text-red-600 font-mono text-xs">{product.商品代码}</td>
                  <td className="py-3 px-4">
                    {product.商品分类 ? (
                      <Badge variant="warning">{product.商品分类}</Badge>
                    ) : (
                      <span className="text-red-300">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-red-700">
                    {formatQty(product.currentStock)}
                  </td>
                  <td className="py-3 px-4 text-right text-red-500">
                    {formatQty(product.threshold)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Badge variant="destructive">差 {formatQty(gap)} 件</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
