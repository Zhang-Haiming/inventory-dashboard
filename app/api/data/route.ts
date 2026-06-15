export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { fetchInventoryData, saveInventoryData, type FileShas } from '@/lib/github'
import type { InventoryData } from '@/lib/types'

// GET /api/data — 从 GitHub 并行读取三个文件
export async function GET() {
  try {
    const result = await fetchInventoryData()

    if (!result) {
      return NextResponse.json({
        data: { lastUpdated: '', stockIn: [], stockOut: [], thresholds: {} } as InventoryData,
        shas: { stockIn: null, stockOut: null, thresholds: null },
        isEmpty: true,
      })
    }

    return NextResponse.json({ data: result.data, shas: result.shas, isEmpty: result.isEmpty })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/data — 并行保存三个文件到 GitHub
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, shas } = body as { data: InventoryData; shas: FileShas }

    if (!data) {
      return NextResponse.json({ error: '缺少 data 字段' }, { status: 400 })
    }

    const dataWithTimestamp: InventoryData = {
      ...data,
      lastUpdated: new Date().toISOString(),
    }

    const newShas = await saveInventoryData(dataWithTimestamp, shas ?? { stockIn: null, stockOut: null, thresholds: null })
    return NextResponse.json({ shas: newShas, lastUpdated: dataWithTimestamp.lastUpdated })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    if (message === 'CONFLICT') {
      return NextResponse.json(
        { error: 'CONFLICT', message: '其他人已更新数据，请刷新后重新编辑' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
