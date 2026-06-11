'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import * as XLSX from 'xlsx'
import type { InventoryData, StockInRow, StockOutRow, Thresholds } from '@/lib/types'

// Electron 打包后环境变量内嵌在此（构建时替换）
// 开发时从 /api/data 读取（走服务端）
const IS_ELECTRON = typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron')

// GitHub API 配置（仅 Electron 模式下直接使用）
const GH_TOKEN = process.env.NEXT_PUBLIC_GH_TOKEN ?? ''
const GH_OWNER = process.env.NEXT_PUBLIC_GH_OWNER ?? ''
const GH_REPO = process.env.NEXT_PUBLIC_GH_REPO ?? ''
const GH_PATH = 'data/inventory.json'

// ---- GitHub API 直接调用（前端） ----

async function ghFetch(data?: InventoryData, sha?: string | null): Promise<{ data: InventoryData; sha: string } | null> {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (!data) {
    // GET
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const json = await res.json()
    const content = atob(json.content.replace(/\n/g, ''))
    return { data: JSON.parse(content), sha: json.sha }
  } else {
    // PUT
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))
    const body: Record<string, unknown> = {
      message: '📦 更新库存数据',
      content,
    }
    if (sha) body.sha = sha
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 409) throw new Error('CONFLICT')
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const json = await res.json()
    return { data, sha: json.content.sha }
  }
}

// ---- Excel 解析（前端，用 SheetJS） ----

interface ParseResult {
  stockIn: Omit<StockInRow, 'id'>[]
  stockOut: Omit<StockOutRow, 'id'>[]
  warnings: string[]
}

function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const warnings: string[] = []

  const findSheet = (candidates: string[]) => {
    for (const name of candidates) {
      if (workbook.SheetNames.includes(name)) return workbook.Sheets[name]
    }
    for (const sheetName of workbook.SheetNames) {
      for (const c of candidates) {
        if (sheetName.includes(c) || c.includes(sheetName)) return workbook.Sheets[sheetName]
      }
    }
    return null
  }

  const normalizeDate = (v: unknown): string => {
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v)
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
    if (typeof v === 'string') {
      const slash = v.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`
      return v.trim()
    }
    return String(v ?? '')
  }

  const ALIASES: Record<string, string[]> = {
    商品名称: ['商品名称', '品名', '名称', '商品'],
    商品代码: ['商品代码', '代码', '编码', '货号', 'SKU', 'sku'],
    单价: ['单价', '价格', '含税单价'],
    入库数量: ['入库数量', '数量', '入库量', '入库'],
    出库数量: ['出库数量', '数量', '出库量', '出库'],
    订单时间: ['订单时间', '时间', '日期', '入库日期', '出库日期'],
    商品分类: ['商品分类', '分类', '类别', '品类'],
  }

  const normalize = (raw: Record<string, unknown>) => {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      for (const [canonical, aliases] of Object.entries(ALIASES)) {
        if (aliases.includes(k.trim())) { result[canonical] = v; break }
      }
    }
    return result
  }

  const inSheet = findSheet(['入库表', '入库', '入库记录', 'StockIn'])
  if (!inSheet) warnings.push(`未找到入库表，可用 Sheet：${workbook.SheetNames.join('、')}`)

  const outSheet = findSheet(['出库表', '出库', '出库记录', 'StockOut'])
  if (!outSheet) warnings.push(`未找到出库表，可用 Sheet：${workbook.SheetNames.join('、')}`)

  const rawIn = inSheet ? (XLSX.utils.sheet_to_json(inSheet) as Record<string, unknown>[]) : []
  const stockIn: Omit<StockInRow, 'id'>[] = rawIn
    .map(normalize)
    .filter(r => r['商品名称'] || r['商品代码'])
    .map(r => ({
      商品名称: String(r['商品名称'] ?? ''),
      商品代码: String(r['商品代码'] ?? ''),
      单价: Number(r['单价'] ?? 0),
      入库数量: Number(r['入库数量'] ?? 0),
      订单时间: normalizeDate(r['订单时间']),
      商品分类: r['商品分类'] ? String(r['商品分类']) : undefined,
    }))

  const rawOut = outSheet ? (XLSX.utils.sheet_to_json(outSheet) as Record<string, unknown>[]) : []
  const stockOut: Omit<StockOutRow, 'id'>[] = rawOut
    .map(normalize)
    .filter(r => r['商品名称'] || r['商品代码'])
    .map(r => ({
      商品名称: String(r['商品名称'] ?? ''),
      商品代码: String(r['商品代码'] ?? ''),
      单价: Number(r['单价'] ?? 0),
      出库数量: Number(r['出库数量'] ?? 0),
      订单时间: normalizeDate(r['订单时间']),
      商品分类: r['商品分类'] ? String(r['商品分类']) : undefined,
    }))

  return { stockIn, stockOut, warnings }
}

// ---- State ----

interface State {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
  sha: string | null
  lastUpdated: string
  isEmpty: boolean
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

const INITIAL_STATE: State = {
  stockIn: [], stockOut: [], thresholds: {},
  sha: null, lastUpdated: '', isEmpty: false,
  isDirty: false, isLoading: true, isSaving: false, error: null,
}

export function useInventoryData() {
  const [state, setState] = useState<State>(INITIAL_STATE)
  const stateRef = useRef<State>(state)
  useEffect(() => { stateRef.current = state }, [state])

  // ---- 加载数据 ----
  const loadData = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    try {
      let result: { data: InventoryData; sha: string } | null = null

      if (IS_ELECTRON) {
        result = await ghFetch()
      } else {
        const res = await fetch('/api/data')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        result = json.isEmpty ? null : { data: json.data, sha: json.sha }
      }

      if (!result) {
        setState(s => ({ ...s, stockIn: [], stockOut: [], thresholds: {}, sha: null, lastUpdated: '', isEmpty: true, isDirty: false, isLoading: false, error: null }))
      } else {
        setState(s => ({ ...s, ...result!.data, sha: result!.sha, isEmpty: false, isDirty: false, isLoading: false, error: null }))
      }
    } catch (err) {
      setState(s => ({ ...s, isLoading: false, error: err instanceof Error ? err.message : '加载失败' }))
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ---- 保存 ----
  const saveToGitHub = useCallback(async () => {
    setState(s => ({ ...s, isSaving: true, error: null }))
    try {
      const s = stateRef.current
      const data: InventoryData = {
        lastUpdated: new Date().toISOString(),
        stockIn: s.stockIn, stockOut: s.stockOut, thresholds: s.thresholds,
      }

      let newSha: string
      if (IS_ELECTRON) {
        const result = await ghFetch(data, s.sha)
        newSha = result!.sha
      } else {
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, sha: s.sha }),
        })
        const json = await res.json()
        if (res.status === 409) throw new Error('其他人已更新数据，请刷新后重新编辑')
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        newSha = json.sha
      }

      setState(prev => ({ ...prev, sha: newSha, lastUpdated: data.lastUpdated, isDirty: false, isSaving: false, error: null }))
      return true
    } catch (err) {
      setState(prev => ({ ...prev, isSaving: false, error: err instanceof Error ? err.message : '保存失败' }))
      return false
    }
  }, [])

  // ---- 上传 Excel ----
  const importFromUpload = useCallback((stockIn: StockInRow[], stockOut: StockOutRow[]) => {
    setState(s => ({
      ...s, stockIn, stockOut,
      thresholds: mergeThresholds(s.thresholds, stockIn, stockOut),
      isDirty: true, isEmpty: false, error: null,
    }))
  }, [])

  // Electron 模式下直接在前端解析 Excel
  const parseAndImport = useCallback(async (file: File): Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number }> => {
    const buffer = await file.arrayBuffer()
    const result = parseExcelBuffer(buffer)
    const stockIn: StockInRow[] = result.stockIn.map(r => ({ ...r, id: `si_${uuidv4()}` }))
    const stockOut: StockOutRow[] = result.stockOut.map(r => ({ ...r, id: `so_${uuidv4()}` }))
    importFromUpload(stockIn, stockOut)
    return { warnings: result.warnings, stockInCount: stockIn.length, stockOutCount: stockOut.length }
  }, [importFromUpload])

  // ---- 下载 Excel ----
  const exportExcel = useCallback(async () => {
    const s = stateRef.current

    if (IS_ELECTRON) {
      // 前端直接生成
      const wb = XLSX.utils.book_new()
      const inRows = s.stockIn.map(({ id: _id, ...r }) => r)
      const outRows = s.stockOut.map(({ id: _id, ...r }) => r)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inRows), '入库表')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outRows), '出库表')
      const dateStr = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `inventory_${dateStr}.xlsx`)
    } else {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockIn: s.stockIn, stockOut: s.stockOut }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || '下载失败') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }, [])

  // ---- 入库表操作 ----
  const addStockInRow = useCallback((row: Omit<StockInRow, 'id'>) => {
    setState(s => ({ ...s, stockIn: [...s.stockIn, { ...row, id: `si_${uuidv4()}` }], isDirty: true }))
  }, [])
  const updateStockInRow = useCallback((id: string, field: keyof StockInRow, value: unknown) => {
    setState(s => ({ ...s, stockIn: s.stockIn.map(r => r.id === id ? { ...r, [field]: value } : r), isDirty: true }))
  }, [])
  const deleteStockInRow = useCallback((id: string) => {
    setState(s => ({ ...s, stockIn: s.stockIn.filter(r => r.id !== id), isDirty: true }))
  }, [])

  // ---- 出库表操作 ----
  const addStockOutRow = useCallback((row: Omit<StockOutRow, 'id'>) => {
    setState(s => ({ ...s, stockOut: [...s.stockOut, { ...row, id: `so_${uuidv4()}` }], isDirty: true }))
  }, [])
  const updateStockOutRow = useCallback((id: string, field: keyof StockOutRow, value: unknown) => {
    setState(s => ({ ...s, stockOut: s.stockOut.map(r => r.id === id ? { ...r, [field]: value } : r), isDirty: true }))
  }, [])
  const deleteStockOutRow = useCallback((id: string) => {
    setState(s => ({ ...s, stockOut: s.stockOut.filter(r => r.id !== id), isDirty: true }))
  }, [])

  // ---- 阈值 ----
  const setThreshold = useCallback((code: string, value: number) => {
    setState(s => ({ ...s, thresholds: { ...s.thresholds, [code]: value }, isDirty: true }))
  }, [])
  const setThresholds = useCallback((thresholds: Thresholds) => {
    setState(s => ({ ...s, thresholds, isDirty: true }))
  }, [])

  return {
    ...state, loadData, saveToGitHub,
    importFromUpload, parseAndImport, exportExcel,
    addStockInRow, updateStockInRow, deleteStockInRow,
    addStockOutRow, updateStockOutRow, deleteStockOutRow,
    setThreshold, setThresholds,
    isElectron: IS_ELECTRON,
  }
}

function mergeThresholds(existing: Thresholds, stockIn: StockInRow[], stockOut: StockOutRow[]): Thresholds {
  const codes = new Set([...stockIn.map(r => r.商品代码), ...stockOut.map(r => r.商品代码)])
  const merged: Thresholds = {}
  for (const code of codes) merged[code] = existing[code] ?? 0
  return merged
}
