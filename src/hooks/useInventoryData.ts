import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { v4 as uuidv4 } from 'uuid'
import type { StockInRow, StockOutRow, Thresholds } from '@/lib/types'

// ---- 类型定义 ----

interface InventoryPayload {
  stock_in: StockInRow[]
  stock_out: StockOutRow[]
  thresholds: Thresholds
  last_updated: string
}

interface State {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
  lastUpdated: string
  isEmpty: boolean
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

const INITIAL_STATE: State = {
  stockIn: [], stockOut: [], thresholds: {},
  lastUpdated: '', isEmpty: false,
  isDirty: false, isLoading: true, isSaving: false, error: null,
}

// ---- Hook ----

export function useInventoryData() {
  const [state, setState] = useState<State>(INITIAL_STATE)
  const stateRef = useRef<State>(state)
  useEffect(() => { stateRef.current = state }, [state])

  // ---- 加载（Rust 读 SQLite）----
  const loadData = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    try {
      const payload = await invoke<InventoryPayload | null>('load_data')
      if (!payload) {
        setState(s => ({
          ...s, stockIn: [], stockOut: [], thresholds: {},
          lastUpdated: '', isEmpty: true, isDirty: false, isLoading: false, error: null,
        }))
      } else {
        setState(s => ({
          ...s,
          stockIn: payload.stock_in,
          stockOut: payload.stock_out,
          thresholds: payload.thresholds,
          lastUpdated: payload.last_updated,
          isEmpty: false, isDirty: false, isLoading: false, error: null,
        }))
      }
    } catch (err) {
      setState(s => ({ ...s, isLoading: false, error: err instanceof Error ? err.message : '加载失败' }))
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ---- 保存到本地 SQLite（Rust）----
  const saveLocal = useCallback(async () => {
    const s = stateRef.current
    try {
      await invoke('save_data', {
        payload: {
          stock_in: s.stockIn,
          stock_out: s.stockOut,
          thresholds: s.thresholds,
          last_updated: new Date().toISOString(),
        } satisfies InventoryPayload,
      })
      setState(prev => ({ ...prev, isDirty: false, error: null }))
      return true
    } catch (err) {
      setState(prev => ({ ...prev, error: err instanceof Error ? err.message : '保存失败' }))
      return false
    }
  }, [])

  // ---- 同步到 GitHub（Rust 写 SQLite → 调起 Go binary 同步）----
  const saveToGitHub = useCallback(async () => {
    setState(s => ({ ...s, isSaving: true, error: null }))
    try {
      const s = stateRef.current
      await invoke('save_data', {
        payload: {
          stock_in: s.stockIn,
          stock_out: s.stockOut,
          thresholds: s.thresholds,
          last_updated: new Date().toISOString(),
        } satisfies InventoryPayload,
      })
      await invoke('sync_github')
      setState(prev => ({
        ...prev,
        isSaving: false, isDirty: false, error: null,
        lastUpdated: new Date().toISOString(),
      }))
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      setState(prev => ({ ...prev, isSaving: false, error: msg }))
      return false
    }
  }, [])

  // ---- importFromUpload（上传后写入 state）----
  const importFromUpload = useCallback((stockIn: StockInRow[], stockOut: StockOutRow[]) => {
    setState(s => ({
      ...s, stockIn, stockOut,
      thresholds: mergeThresholds(s.thresholds, stockIn, stockOut),
      isDirty: true, isEmpty: false, error: null,
    }))
  }, [])

  // ---- 导入 Excel（拖拽/网页上传 → base64 → Go binary 解析）----
  const parseAndImport = useCallback(async (file: File): Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number }> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // 分块转 base64，避免 call stack overflow
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)

    const result = await invoke<{
      stock_in: Omit<StockInRow, 'id'>[]
      stock_out: Omit<StockOutRow, 'id'>[]
      warnings: string[]
    }>('parse_excel', { base64 })

    const stockIn = result.stock_in.map(r => ({ ...r, id: `si_${uuidv4()}` })) as StockInRow[]
    const stockOut = result.stock_out.map(r => ({ ...r, id: `so_${uuidv4()}` })) as StockOutRow[]
    importFromUpload(stockIn, stockOut)
    return { warnings: result.warnings, stockInCount: stockIn.length, stockOutCount: stockOut.length }
  }, [importFromUpload])

  // ---- 系统文件选择框（Tauri 原生对话框 → Go binary 解析）----
  const pickAndImport = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    })
    if (!selected) return null

    const result = await invoke<{
      stock_in: Omit<StockInRow, 'id'>[]
      stock_out: Omit<StockOutRow, 'id'>[]
      warnings: string[]
    }>('parse_excel_path', { path: selected as string })

    const stockIn = result.stock_in.map(r => ({ ...r, id: `si_${uuidv4()}` })) as StockInRow[]
    const stockOut = result.stock_out.map(r => ({ ...r, id: `so_${uuidv4()}` })) as StockOutRow[]
    importFromUpload(stockIn, stockOut)
    return { warnings: result.warnings, stockInCount: stockIn.length, stockOutCount: stockOut.length }
  }, [importFromUpload])

  // ---- 导出 Excel（系统保存对话框 → Go binary 生成文件）----
  const exportExcel = useCallback(async () => {
    const s = stateRef.current
    const defaultPath = `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`
    const savePath = await save({
      defaultPath,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (!savePath) return
    await invoke('export_excel', {
      path: savePath,
      stockIn: s.stockIn,
      stockOut: s.stockOut,
    })
  }, [])

  // ---- 入库表 CRUD ----
  const addStockInRow    = useCallback((row: Omit<StockInRow, 'id'>) =>
    setState(s => ({ ...s, stockIn: [...s.stockIn, { ...row, id: `si_${uuidv4()}` } as StockInRow], isDirty: true })), [])
  const updateStockInRow = useCallback((id: string, field: keyof StockInRow, value: unknown) =>
    setState(s => ({ ...s, stockIn: s.stockIn.map(r => r.id === id ? { ...r, [field]: value } as StockInRow : r), isDirty: true })), [])
  const deleteStockInRow = useCallback((id: string) =>
    setState(s => ({ ...s, stockIn: s.stockIn.filter(r => r.id !== id), isDirty: true })), [])

  // ---- 出库表 CRUD ----
  const addStockOutRow    = useCallback((row: Omit<StockOutRow, 'id'>) =>
    setState(s => ({ ...s, stockOut: [...s.stockOut, { ...row, id: `so_${uuidv4()}` } as StockOutRow], isDirty: true })), [])
  const updateStockOutRow = useCallback((id: string, field: keyof StockOutRow, value: unknown) =>
    setState(s => ({ ...s, stockOut: s.stockOut.map(r => r.id === id ? { ...r, [field]: value } : r), isDirty: true })), [])
  const deleteStockOutRow = useCallback((id: string) =>
    setState(s => ({ ...s, stockOut: s.stockOut.filter(r => r.id !== id), isDirty: true })), [])

  // ---- 阈值 ----
  const setThresholds = useCallback((thresholds: Thresholds) =>
    setState(s => ({ ...s, thresholds, isDirty: true })), [])

  return {
    ...state,
    loadData, saveToGitHub, saveLocal,
    importFromUpload, parseAndImport, pickAndImport, exportExcel,
    addStockInRow, updateStockInRow, deleteStockInRow,
    addStockOutRow, updateStockOutRow, deleteStockOutRow,
    setThresholds,
  }
}

function mergeThresholds(existing: Thresholds, stockIn: StockInRow[], stockOut: StockOutRow[]): Thresholds {
  const codes = new Set([...stockIn.map(r => r.商品代码), ...stockOut.map(r => r.商品代码)])
  const merged: Thresholds = {}
  for (const code of codes) merged[code] = existing[code] ?? 0
  return merged
}
