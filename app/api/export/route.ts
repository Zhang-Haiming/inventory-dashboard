export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { generateExcel } from '@/lib/excel'
import type { StockInRow, StockOutRow } from '@/lib/types'

// POST /api/export — 接收 JSON 数据，生成 Excel 文件供下载
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { stockIn, stockOut } = body as { stockIn: StockInRow[]; stockOut: StockOutRow[] }

    if (!Array.isArray(stockIn) || !Array.isArray(stockOut)) {
      return NextResponse.json({ error: '无效的数据格式' }, { status: 400 })
    }

    const buffer = generateExcel(stockIn, stockOut)

    // 文件名包含日期
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `inventory_${dateStr}.xlsx`

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败'
    return NextResponse.json({ error: `Excel 生成错误：${message}` }, { status: 500 })
  }
}
