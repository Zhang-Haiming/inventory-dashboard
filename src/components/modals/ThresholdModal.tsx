'use client'
import { useState, useMemo } from 'react'
import { Settings } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getCategoryInventory } from '@/lib/dataUtils'
import type { StockInRow, StockOutRow, Thresholds } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
  onSave: (thresholds: Thresholds) => void
}

export function ThresholdModal({ open, onClose, stockIn, stockOut, thresholds, onSave }: Props) {
  const inventory = useMemo(
    () => getCategoryInventory(stockIn, stockOut, thresholds),
    [stockIn, stockOut, thresholds]
  )

  // 本地草稿：避免直接修改外部状态
  const [draft, setDraft] = useState<Thresholds>(() => ({ ...thresholds }))
  const [filter, setFilter] = useState('')

  const filtered = filter
    ? inventory.filter(
        (p) => p.商品名称.includes(filter) || p.商品代码.includes(filter) || p.商品分类.includes(filter)
      )
    : inventory

  const handleChange = (code: string, raw: string) => {
    const n = Number(raw)
    if (!isNaN(n) && n >= 0) {
      setDraft((d) => ({ ...d, [code]: n }))
    }
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  const handleClose = () => {
    setDraft({ ...thresholds })  // 放弃未保存的草稿
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            库存预警阈值设置
          </DialogTitle>
          <DialogDescription>
            为每种商品设置最低库存数量。当库存 ≤ 阈值时，该商品会在"库存预警"页面醒目标记。
            设为 0 表示不报警。
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="搜索商品..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="shrink-0"
        />

        <div className="flex-1 overflow-y-auto min-h-0 rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-medium text-slate-600">商品名称</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">代码</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">分类</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">当前库存</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 min-w-[120px]">预警阈值</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">暂无商品数据</td>
                </tr>
              )}
              {filtered.map((product) => {
                const currentThreshold = draft[product.商品代码] ?? 0
                const isLow = currentThreshold > 0 && product.currentStock <= currentThreshold

                return (
                  <tr key={product.商品代码} className={`border-b border-slate-100 last:border-0 ${isLow ? 'bg-red-50' : ''}`}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{product.商品名称}</td>
                    <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">{product.商品代码}</td>
                    <td className="py-2.5 px-4">
                      {product.商品分类 ? (
                        <Badge variant="secondary">{product.商品分类}</Badge>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={isLow ? 'text-red-700 font-bold' : 'text-slate-900'}>
                        {product.currentStock}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {isLow && <span className="text-xs text-red-500">⚠️</span>}
                        <Input
                          type="number"
                          min="0"
                          value={currentThreshold}
                          onChange={(e) => handleChange(product.商品代码, e.target.value)}
                          className="w-24 h-7 text-right text-sm"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2 shrink-0">
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleSave}>保存阈值</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
