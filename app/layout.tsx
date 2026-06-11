import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '库存看板',
  description: '商品库存管理看板 — 查看入出库统计、库存预警',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  )
}
