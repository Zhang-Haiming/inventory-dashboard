import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化金额（人民币，两位小数） */
export function formatAmount(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 格式化数量 */
export function formatQty(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 将 YYYY-MM 格式化为 "2025年6月" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${Number(m)}月`
}

/** 获取当前月份 YYYY-MM */
export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
