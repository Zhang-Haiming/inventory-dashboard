export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { parseExcel, newStockInId, newStockOutId } from '@/lib/excel'
import type { StockInRow, StockOutRow } from '@/lib/types'

// POST /api/upload — 接收 Excel 文件，解析并返回 JSON（不自动保存，需用户确认）
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '请选择 Excel 文件' }, { status: 400 })
    }

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: '只支持 .xlsx 或 .xls 文件' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parsed = parseExcel(buffer)

    // 为每行分配唯一 id（id 不来自 Excel，由后端生成）
    const stockIn: StockInRow[] = parsed.stockIn.map((row) => ({
      ...row,
      id: newStockInId(),
    }))
    const stockOut: StockOutRow[] = parsed.stockOut.map((row) => ({
      ...row,
      id: newStockOutId(),
    }))

    return NextResponse.json({
      stockIn,
      stockOut,
      warnings: parsed.warnings,
      stats: {
        stockInCount: stockIn.length,
        stockOutCount: stockOut.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析失败'
    return NextResponse.json({ error: `Excel 解析错误：${message}` }, { status: 500 })
  }
}

// App Router 下无需额外配置 bodyParser，Next.js 自动处理 FormData
