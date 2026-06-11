export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { fetchInventoryData, saveInventoryData } from '@/lib/github'
import type { InventoryData } from '@/lib/types'

// GET /api/data — 从 GitHub 获取库存数据
export async function GET() {
  try {
    const result = await fetchInventoryData()

    if (!result) {
      // 文件还不存在，返回空数据结构
      return NextResponse.json({
        data: {
          lastUpdated: '',
          stockIn: [],
          stockOut: [],
          thresholds: {},
        } as InventoryData,
        sha: null,
        isEmpty: true,
      })
    }

    return NextResponse.json({ data: result.data, sha: result.sha, isEmpty: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/data — 保存库存数据到 GitHub
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, sha } = body as { data: InventoryData; sha: string | null }

    if (!data) {
      return NextResponse.json({ error: '缺少 data 字段' }, { status: 400 })
    }

    // 更新最后修改时间（服务端加时间戳，避免客户端时区问题）
    const dataWithTimestamp: InventoryData = {
      ...data,
      lastUpdated: new Date().toISOString(),
    }

    const newSha = await saveInventoryData(dataWithTimestamp, sha ?? null)
    return NextResponse.json({ sha: newSha, lastUpdated: dataWithTimestamp.lastUpdated })
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
