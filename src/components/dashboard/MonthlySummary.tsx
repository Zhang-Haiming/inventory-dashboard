'use client'
import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, Package, PackageOpen } from 'lucide-react'
import { getMonthlySummary, getAllMonths } from '@/lib/dataUtils'
import { formatAmount, formatQty, formatMonth, currentMonth } from '@/lib/utils'
import { StatsCard } from './StatsCard'
import type { StockInRow, StockOutRow } from '@/lib/types'

interface Props {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
}

export function MonthlySummary({ stockIn, stockOut }: Props) {
  const allMonths = useMemo(() => getAllMonths(stockIn, stockOut), [stockIn, stockOut])
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const cur = currentMonth()
    return allMonths.includes(cur) ? cur : allMonths[allMonths.length - 1] ?? cur
  })

  const summaries = useMemo(() => getMonthlySummary(stockIn, stockOut), [stockIn, stockOut])

  const current = useMemo(
    () => summaries.find((s) => s.month === selectedMonth) ?? {
      month: selectedMonth,
      stockInAmount: 0,
      stockOutAmount: 0,
      stockInQty: 0,
      stockOutQty: 0,
    },
    [summaries, selectedMonth]
  )

  // 图表数据：取最近 12 个月
  const chartData = useMemo(() => {
    const last12 = summaries.slice(-12)
    return last12.map((s) => ({
      month: formatMonth(s.month),
      入库金额: s.stockInAmount,
      出库金额: s.stockOutAmount,
    }))
  }, [summaries])

  return (
    <div className="space-y-4">
      {/* 月份选择器 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">选择月份：</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          {allMonths.length === 0 && (
            <option value={currentMonth()}>{formatMonth(currentMonth())}</option>
          )}
          {allMonths.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>
      </div>

      {/* 四格统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatsCard
          title="入库金额"
          value={formatAmount(current.stockInAmount)}
          icon={TrendingUp}
          variant="income"
        />
        <StatsCard
          title="出库金额"
          value={formatAmount(current.stockOutAmount)}
          icon={TrendingDown}
          variant="expense"
        />
        <StatsCard
          title="入库数量"
          value={`${formatQty(current.stockInQty)} 件`}
          icon={Package}
          variant="neutral"
        />
        <StatsCard
          title="出库数量"
          value={`${formatQty(current.stockOutQty)} 件`}
          icon={PackageOpen}
          variant="neutral"
        />
      </div>

      {/* 近 12 个月趋势图 */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-4">近 {chartData.length} 个月趋势</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => formatAmount(Number(value))} />
              <Legend />
              <Bar dataKey="入库金额" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="出库金额" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
