'use client'
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatAmount } from '@/lib/utils'
import type { StockInRow } from '@/lib/types'

interface Props {
  rows: StockInRow[]
  onUpdate: (id: string, field: keyof StockInRow, value: unknown) => void
  onDelete: (id: string) => void
  onAdd: (row: Omit<StockInRow, 'id'>) => void
}

export function StockInTable({ rows, onUpdate, onDelete, onAdd }: Props) {
  const [filterText, setFilterText] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const filtered = filterText
    ? rows.filter(
        (r) =>
          r.商品名称.includes(filterText) ||
          r.商品代码.includes(filterText) ||
          (r.商品分类 ?? '').includes(filterText)
      )
    : rows

  const handleAdd = () => {
    const today = new Date().toISOString().slice(0, 10)
    onAdd({
      商品名称: '',
      商品代码: '',
      单价: 0,
      入库数量: 1,
      订单时间: today,
      商品分类: '',
    })
  }

  const totalAmount = rows.reduce((sum, r) => sum + r.单价 * r.入库数量, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="搜索商品名称、代码或分类..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-sm text-slate-500 ml-auto">
          共 {rows.length} 条记录 · 合计入库金额 {formatAmount(totalAmount)}
        </span>
        <Button size="sm" onClick={handleAdd} variant="outline" className="gap-1">
          <Plus className="h-4 w-4" />
          新增入库
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-3 font-medium text-slate-600 min-w-[120px]">商品名称</th>
              <th className="text-left py-3 px-3 font-medium text-slate-600 min-w-[100px]">商品代码</th>
              <th className="text-left py-3 px-3 font-medium text-slate-600 min-w-[80px]">分类</th>
              <th className="text-right py-3 px-3 font-medium text-slate-600 min-w-[80px]">单价</th>
              <th className="text-right py-3 px-3 font-medium text-slate-600 min-w-[80px]">入库数量</th>
              <th className="text-right py-3 px-3 font-medium text-slate-600 min-w-[100px]">金额</th>
              <th className="text-left py-3 px-3 font-medium text-slate-600 min-w-[110px]">订单时间</th>
              <th className="py-3 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  {filterText ? '没有匹配的记录' : '暂无入库记录，点击"新增入库"添加'}
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${
                  deleteTarget === row.id ? 'opacity-50' : ''
                }`}
              >
                <td className="py-2 px-3">
                  <EditableCell
                    value={row.商品名称}
                    onSave={(v) => onUpdate(row.id, '商品名称', v)}
                    placeholder="输入商品名称"
                  />
                </td>
                <td className="py-2 px-3 font-mono">
                  <EditableCell
                    value={row.商品代码}
                    onSave={(v) => onUpdate(row.id, '商品代码', v)}
                    placeholder="输入代码"
                  />
                </td>
                <td className="py-2 px-3">
                  <EditableCell
                    value={row.商品分类 ?? ''}
                    onSave={(v) => onUpdate(row.id, '商品分类', v)}
                    placeholder="分类"
                  />
                </td>
                <td className="py-2 px-3">
                  <EditableCell
                    value={row.单价}
                    onSave={(v) => onUpdate(row.id, '单价', v)}
                    type="number"
                  />
                </td>
                <td className="py-2 px-3">
                  <EditableCell
                    value={row.入库数量}
                    onSave={(v) => onUpdate(row.id, '入库数量', v)}
                    type="number"
                  />
                </td>
                <td className="py-2 px-3 text-right text-green-700 text-xs font-medium">
                  {formatAmount(row.单价 * row.入库数量)}
                </td>
                <td className="py-2 px-3">
                  <EditableCell
                    value={row.订单时间}
                    onSave={(v) => onUpdate(row.id, '订单时间', v)}
                    type="date"
                  />
                </td>
                <td className="py-2 px-3">
                  {deleteTarget === row.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { onDelete(row.id); setDeleteTarget(null) }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setDeleteTarget(null)}
                        className="text-xs text-slate-400 hover:underline"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteTarget(row.id)}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
