'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import * as XLSX from 'xlsx'
import type { InventoryData, StockInRow, StockOutRow, Thresholds } from '@/lib/types'

// 判断是否在 Electron 环境（用 userAgent 更可靠，preload 注入前也能检测到）
const IS_ELECTRON = typeof window !== 'undefined' &&
  (window.navigator.userAgent.includes('Electron') || 'electronAPI' in window)

// GitHub 配置
// - Electron：构建时通过 NEXT_PUBLIC_ 内嵌
// - Web：通过服务端 API Routes 中转（不暴露 token）
const GH_TOKEN = process.env.NEXT_PUBLIC_GH_TOKEN ?? ''
const GH_OWNER = process.env.NEXT_PUBLIC_GH_OWNER ?? ''
const GH_REPO  = process.env.NEXT_PUBLIC_GH_REPO ?? ''
const GH_PATH  = 'data/inventory.json'

// ---- GitHub API（Electron 走主进程 net 模块，Web 走服务端 API）----

type ElectronAPI = {
  githubRequest: (opts: { method: string; url: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; text: string }>
  openExcelDialog: () => Promise<{ name: string; data: string } | null>
  saveExcelDialog: (opts: { defaultName: string; data: string }) => Promise<boolean>
}

declare global {
  interface Window { electronAPI?: ElectronAPI }
}

async function ghGet(): Promise<{ data: InventoryData; sha: string } | null> {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  let status: number
  let text: string

  if (IS_ELECTRON && window.electronAPI) {
    const res = await window.electronAPI.githubRequest({ method: 'GET', url, headers })
    status = res.status; text = res.text
  } else {
    const res = await fetch('/api/data')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    if (json.isEmpty) return null
    return { data: json.data, sha: json.sha }
  }

  if (status === 404) return null
  if (status >= 400) throw new Error(`GitHub API ${status}`)
  const json = JSON.parse(text)
  const content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))))
  return { data: JSON.parse(content), sha: json.sha }
}

async function ghPut(data: InventoryData, sha: string | null): Promise<string> {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({
    message: '📦 更新库存数据',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    ...(sha ? { sha } : {}),
  })

  let status: number
  let text: string

  if (IS_ELECTRON && window.electronAPI) {
    const res = await window.electronAPI.githubRequest({ method: 'PUT', url, headers, body })
    status = res.status; text = res.text
  } else {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, sha }),
    })
    if (res.status === 409) throw new Error('CONFLICT')
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || `HTTP ${res.status}`) }
    const j = await res.json()
    return j.sha
  }

  if (status === 409) throw new Error('CONFLICT')
  if (status >= 400) throw new Error(`GitHub API ${status}`)
  return JSON.parse(text).content.sha
}

// ---- Excel 解析（前端 SheetJS）----

function parseExcelBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const warnings: string[] = []

  const findSheet = (candidates: string[]) => {
    for (const name of candidates) {
      if (workbook.SheetNames.includes(name)) return workbook.Sheets[name]
    }
    for (const sn of workbook.SheetNames) {
      for (const c of candidates) {
        if (sn.includes(c) || c.includes(sn)) return workbook.Sheets[sn]
      }
    }
    return null
  }

  const normalizeDate = (v: unknown): string => {
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v)
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    }
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
      return v.trim()
    }
    return String(v ?? '')
  }

  const ALIASES: Record<string, string[]> = {
    商品名称: ['商品名称','品名','名称','商品'],
    商品代码: ['商品代码','代码','编码','货号','SKU','sku'],
    单价:     ['单价','价格','含税单价'],
    入库数量: ['入库数量','数量','入库量','入库'],
    出库数量: ['出库数量','数量','出库量','出库'],
    订单时间: ['订单时间','时间','日期','入库日期','出库日期'],
    商品分类: ['商品分类','分类','类别','品类'],
  }

  const normalize = (raw: Record<string, unknown>) => {
    const r: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      for (const [canon, aliases] of Object.entries(ALIASES)) {
        if (aliases.includes(k.trim())) { r[canon] = v; break }
      }
    }
    return r
  }

  const inSheet  = findSheet(['入库表','入库','入库记录','StockIn'])
  const outSheet = findSheet(['出库表','出库','出库记录','StockOut'])
  if (!inSheet)  warnings.push(`未找到入库表，可用 Sheet：${workbook.SheetNames.join('、')}`)
  if (!outSheet) warnings.push(`未找到出库表，可用 Sheet：${workbook.SheetNames.join('、')}`)

  const toStockIn = (raw: Record<string, unknown>[]): Omit<StockInRow,'id'>[] =>
    raw.map(normalize).filter(r => r['商品名称'] || r['商品代码']).map(r => ({
      商品名称: String(r['商品名称'] ?? ''),
      商品代码: String(r['商品代码'] ?? ''),
      单价:     Number(r['单价'] ?? 0),
      入库数量: Number(r['入库数量'] ?? 0),
      订单时间: normalizeDate(r['订单时间']),
      商品分类: r['商品分类'] ? String(r['商品分类']) : undefined,
    }))

  const toStockOut = (raw: Record<string, unknown>[]): Omit<StockOutRow,'id'>[] =>
    raw.map(normalize).filter(r => r['商品名称'] || r['商品代码']).map(r => ({
      商品名称: String(r['商品名称'] ?? ''),
      商品代码: String(r['商品代码'] ?? ''),
      单价:     Number(r['单价'] ?? 0),
      出库数量: Number(r['出库数量'] ?? 0),
      订单时间: normalizeDate(r['订单时间']),
      商品分类: r['商品分类'] ? String(r['商品分类']) : undefined,
    }))

  const stockIn  = inSheet  ? toStockIn(XLSX.utils.sheet_to_json(inSheet)  as Record<string,unknown>[]) : []
  const stockOut = outSheet ? toStockOut(XLSX.utils.sheet_to_json(outSheet) as Record<string,unknown>[]) : []

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
      const result = await ghGet()
      if (!result) {
        setState(s => ({ ...s, stockIn:[], stockOut:[], thresholds:{}, sha:null, lastUpdated:'', isEmpty:true, isDirty:false, isLoading:false, error:null }))
      } else {
        setState(s => ({ ...s, ...result.data, sha:result.sha, isEmpty:false, isDirty:false, isLoading:false, error:null }))
      }
    } catch (err) {
      setState(s => ({ ...s, isLoading:false, error: err instanceof Error ? err.message : '加载失败' }))
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ---- 保存 ----
  const saveToGitHub = useCallback(async () => {
    setState(s => ({ ...s, isSaving:true, error:null }))
    try {
      const s = stateRef.current
      const data: InventoryData = {
        lastUpdated: new Date().toISOString(),
        stockIn: s.stockIn, stockOut: s.stockOut, thresholds: s.thresholds,
      }
      const newSha = await ghPut(data, s.sha)
      setState(prev => ({ ...prev, sha:newSha, lastUpdated:data.lastUpdated, isDirty:false, isSaving:false, error:null }))
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      setState(prev => ({ ...prev, isSaving:false, error: msg === 'CONFLICT' ? '其他人已更新数据，请刷新后重新编辑' : msg }))
      return false
    }
  }, [])

  // ---- 导入（上传后调用）----
  const importFromUpload = useCallback((stockIn: StockInRow[], stockOut: StockOutRow[]) => {
    setState(s => ({
      ...s, stockIn, stockOut,
      thresholds: mergeThresholds(s.thresholds, stockIn, stockOut),
      isDirty:true, isEmpty:false, error:null,
    }))
  }, [])

  // ---- Electron：弹出系统文件选择框上传 Excel ----
  const pickAndImport = useCallback(async (): Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number } | null> => {
    if (!window.electronAPI) return null
    const file = await window.electronAPI.openExcelDialog()
    if (!file) return null

    const buffer = Uint8Array.from(atob(file.data), c => c.charCodeAt(0)).buffer
    const result = parseExcelBuffer(buffer)
    const stockIn: StockInRow[]  = result.stockIn.map(r  => ({ ...r, id: `si_${uuidv4()}` }))
    const stockOut: StockOutRow[] = result.stockOut.map(r => ({ ...r, id: `so_${uuidv4()}` }))
    importFromUpload(stockIn, stockOut)
    return { warnings: result.warnings, stockInCount: stockIn.length, stockOutCount: stockOut.length }
  }, [importFromUpload])

  // ---- Web：通过 API Route 上传 Excel ----
  const parseAndImport = useCallback(async (file: File): Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number }> => {
    const buffer = await file.arrayBuffer()
    const result = parseExcelBuffer(buffer)
    const stockIn: StockInRow[]  = result.stockIn.map(r  => ({ ...r, id: `si_${uuidv4()}` }))
    const stockOut: StockOutRow[] = result.stockOut.map(r => ({ ...r, id: `so_${uuidv4()}` }))
    importFromUpload(stockIn, stockOut)
    return { warnings: result.warnings, stockInCount: stockIn.length, stockOutCount: stockOut.length }
  }, [importFromUpload])

  // ---- 下载 Excel ----
  const exportExcel = useCallback(async () => {
    const s = stateRef.current
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.stockIn.map(({id:_,...r})=>r)),  '入库表')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.stockOut.map(({id:_,...r})=>r)), '出库表')
    const dateStr = new Date().toISOString().slice(0,10)
    const filename = `inventory_${dateStr}.xlsx`

    if (IS_ELECTRON && window.electronAPI) {
      // Electron：弹出系统保存对话框
      const uint8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
      const base64 = btoa(String.fromCharCode(...uint8))
      await window.electronAPI.saveExcelDialog({ defaultName: filename, data: base64 })
    } else {
      // Web：触发浏览器下载
      XLSX.writeFile(wb, filename)
    }
  }, [])

  // ---- 入库表 CRUD ----
  const addStockInRow    = useCallback((row: Omit<StockInRow,'id'>) => setState(s => ({ ...s, stockIn: [...s.stockIn, { ...row, id:`si_${uuidv4()}` }], isDirty:true })), [])
  const updateStockInRow = useCallback((id: string, field: keyof StockInRow, value: unknown) => setState(s => ({ ...s, stockIn: s.stockIn.map(r => r.id===id ? {...r,[field]:value} : r), isDirty:true })), [])
  const deleteStockInRow = useCallback((id: string) => setState(s => ({ ...s, stockIn: s.stockIn.filter(r => r.id!==id), isDirty:true })), [])

  // ---- 出库表 CRUD ----
  const addStockOutRow    = useCallback((row: Omit<StockOutRow,'id'>) => setState(s => ({ ...s, stockOut: [...s.stockOut, { ...row, id:`so_${uuidv4()}` }], isDirty:true })), [])
  const updateStockOutRow = useCallback((id: string, field: keyof StockOutRow, value: unknown) => setState(s => ({ ...s, stockOut: s.stockOut.map(r => r.id===id ? {...r,[field]:value} : r), isDirty:true })), [])
  const deleteStockOutRow = useCallback((id: string) => setState(s => ({ ...s, stockOut: s.stockOut.filter(r => r.id!==id), isDirty:true })), [])

  // ---- 阈值 ----
  const setThreshold  = useCallback((code: string, value: number) => setState(s => ({ ...s, thresholds:{...s.thresholds,[code]:value}, isDirty:true })), [])
  const setThresholds = useCallback((thresholds: Thresholds) => setState(s => ({ ...s, thresholds, isDirty:true })), [])

  return {
    ...state,
    isElectron: IS_ELECTRON,
    loadData, saveToGitHub,
    importFromUpload, parseAndImport, pickAndImport, exportExcel,
    addStockInRow, updateStockInRow, deleteStockInRow,
    addStockOutRow, updateStockOutRow, deleteStockOutRow,
    setThreshold, setThresholds,
  }
}

function mergeThresholds(existing: Thresholds, stockIn: StockInRow[], stockOut: StockOutRow[]): Thresholds {
  const codes = new Set([...stockIn.map(r=>r.商品代码), ...stockOut.map(r=>r.商品代码)])
  const merged: Thresholds = {}
  for (const code of codes) merged[code] = existing[code] ?? 0
  return merged
}
