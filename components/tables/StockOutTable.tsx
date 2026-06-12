'use client'
import { useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { EditableCell } from './EditableCell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatAmount } from '@/lib/utils'
import type { StockOutRow } from '@/lib/types'

const FIXED_COLS = ['商品名称', '商品代码', '商品分类', '单价', '出库数量', '订单时间']

interface Props {
  rows: StockOutRow[]
  onUpdate: (id: string, field: keyof StockOutRow, value: unknown) => void
  onDelete: (id: string) => void
  onAdd: (row: Omit<StockOutRow, 'id'>) => void
}

export function StockOutTable({ rows, onUpdate, onDelete, onAdd }: Props) {
  const [filterText, setFilterText] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // 按时间从新到旧排序
  const sorted = useMemo(() =>
    [...rows].sort((a, b) => {
      const ta = a.订单时间 || ''
      const tb = b.订单时间 || ''
      return tb.localeCompare(ta)
    }), [rows])

  const filtered = filterText
    ? sorted.filter(r =>
        String(r.商品名称 ?? '').includes(filterText) ||
        String(r.商品代码 ?? '').includes(filterText) ||
        String(r.商品分类 ?? '').includes(filterText)
      )
    : sorted

  // 获取额外列
  const extraCols = useMemo(() => {
    const cols = new Set<string>()
    rows.forEach(r => {
      Object.keys(r).forEach(k => {
        if (k !== 'id' && !FIXED_COLS.includes(k)) cols.add(k)
      })
    })
    return Array.from(cols)
  }, [rows])

  const handleAdd = () => {
    const today = new Date().toISOString().slice(0, 10)
    onAdd({
      商品名称: '',
      商品代码: '',
      单价: 0,
      出库数量: 1,
      订单时间: today,
      商品分类: '',
    })
  }

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.单价) || 0) * (Number(r.出库数量) || 0), 0)

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
          共 {rows.length} 条记录 · 合计出库金额 {formatAmount(totalAmount)}
        </span>
        <Button size="sm" onClick={handleAdd} variant="outline" className="gap-1">
          <Plus className="h-4 w-4" />
          新增出库
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
              <th className="text-right py-3 px-3 font-medium text-slate-600 min-w-[80px]">出库数量</th>
              <th className="text-right py-3 px-3 font-medium text-slate-600 min-w-[100px]">金额</th>
              <th className="text-left py-3 px-3 font-medium text-slate-600 min-w-[110px]">订单时间</th>
              {extraCols.map(col => (
                <th key={col} className="text-left py-3 px-3 font-medium text-slate-600 min-w-[100px]">
                  {col}
                </th>
              ))}
              <th className="py-3 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8 + extraCols.length} className="text-center py-8 text-slate-400">
                  {filterText ? '没有匹配的记录' : '暂无出库记录，点击"新增出库"添加'}
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
                  <EditableCell value={String(row.商品名称 ?? '')} onSave={(v) => onUpdate(row.id, '商品名称', v)} placeholder="输入商品名称" />
                </td>
                <td className="py-2 px-3 font-mono">
                  <EditableCell value={String(row.商品代码 ?? '')} onSave={(v) => onUpdate(row.id, '商品代码', v)} placeholder="输入代码" />
                </td>
                <td className="py-2 px-3">
                  <EditableCell value={String(row.商品分类 ?? '')} onSave={(v) => onUpdate(row.id, '商品分类', v)} placeholder="分类" />
                </td>
                <td className="py-2 px-3">
                  <EditableCell value={Number(row.单价 ?? 0)} onSave={(v) => onUpdate(row.id, '单价', v)} type="number" />
                </td>
                <td className="py-2 px-3">
                  <EditableCell value={Number(row.出库数量 ?? 0)} onSave={(v) => onUpdate(row.id, '出库数量', v)} type="number" />
                </td>
                <td className="py-2 px-3 text-right text-red-600 text-xs font-medium">
                  {formatAmount((Number(row.单价) || 0) * (Number(row.出库数量) || 0))}
                </td>
                <td className="py-2 px-3">
                  <EditableCell value={String(row.订单时间 ?? '')} onSave={(v) => onUpdate(row.id, '订单时间', v)} type="date" />
                </td>
                {extraCols.map(col => (
                  <td key={col} className="py-2 px-3">
                    <EditableCell
                      value={String(row[col] ?? '')}
                      onSave={(v) => onUpdate(row.id, col as keyof StockOutRow, v)}
                      placeholder={col}
                    />
                  </td>
                ))}
                <td className="py-2 px-3">
                  {deleteTarget === row.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => { onDelete(row.id); setDeleteTarget(null) }} className="text-xs text-red-500 hover:underline">确认</button>
                      <button onClick={() => setDeleteTarget(null)} className="text-xs text-slate-400 hover:underline">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteTarget(row.id)} className="text-slate-300 hover:text-red-400 transition-colors">
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
