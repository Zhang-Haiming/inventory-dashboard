import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string
  subtitle?: string
  icon?: LucideIcon
  variant?: 'default' | 'income' | 'expense' | 'neutral'
  className?: string
}

export function StatsCard({ title, value, subtitle, icon: Icon, variant = 'default', className }: StatsCardProps) {
  const variantStyles = {
    default: 'border-slate-200',
    income: 'border-green-200 bg-green-50',
    expense: 'border-red-200 bg-red-50',
    neutral: 'border-blue-200 bg-blue-50',
  }

  const valueStyles = {
    default: 'text-slate-900',
    income: 'text-green-700',
    expense: 'text-red-700',
    neutral: 'text-blue-700',
  }

  return (
    <div className={cn('rounded-lg border p-4 bg-white', variantStyles[variant], className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <p className={cn('text-2xl font-bold', valueStyles[variant])}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}
