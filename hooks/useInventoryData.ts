'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { InventoryData, StockInRow, StockOutRow, Thresholds } from '@/lib/types'

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
  stockIn: [],
  stockOut: [],
  thresholds: {},
  sha: null,
  lastUpdated: '',
  isEmpty: false,
  isDirty: false,
  isLoading: true,
  isSaving: false,
  error: null,
}

export function useInventoryData() {
  const [state, setState] = useState<State>(INITIAL_STATE)
  // 始终保存最新的 state，让异步操作可以安全读取
  const stateRef = useRef<State>(state)
  useEffect(() => { stateRef.current = state }, [state])

  // ---- 加载数据 ----
  const loadData = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      const res = await fetch('/api/data')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setState((s) => ({
        ...s,
        stockIn: json.data.stockIn ?? [],
        stockOut: json.data.stockOut ?? [],
        thresholds: json.data.thresholds ?? {},
        sha: json.sha ?? null,
        lastUpdated: json.data.lastUpdated ?? '',
        isEmpty: json.isEmpty ?? false,
        isDirty: false,
        isLoading: false,
        error: null,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : '加载失败',
      }))
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---- 保存到 GitHub ----
  const saveToGitHub = useCallback(async () => {
    setState((s) => ({ ...s, isSaving: true, error: null }))
    try {
      const s = stateRef.current
      const data: InventoryData = {
        lastUpdated: '',
        stockIn: s.stockIn,
        stockOut: s.stockOut,
        thresholds: s.thresholds,
      }

      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, sha: s.sha }),
      })

      const json = await res.json()

      if (res.status === 409) {
        throw new Error('其他人已更新数据，请刷新后重新编辑')
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setState((prev) => ({
        ...prev,
        sha: json.sha,
        lastUpdated: json.lastUpdated,
        isDirty: false,
        isSaving: false,
        error: null,
      }))
      return true
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : '保存失败',
      }))
      return false
    }
  }, [])

  // ---- 上传 Excel 后导入数据 ----
  const importFromUpload = useCallback((
    stockIn: StockInRow[],
    stockOut: StockOutRow[]
  ) => {
    setState((s) => ({
      ...s,
      stockIn,
      stockOut,
      // 合并已有阈值：新商品设为 0，移除已消失商品的阈值
      thresholds: mergeThresholds(s.thresholds, stockIn, stockOut),
      isDirty: true,
      isEmpty: false,
      error: null,
    }))
  }, [])

  // ---- 入库表操作 ----
  const addStockInRow = useCallback((row: Omit<StockInRow, 'id'>) => {
    setState((s) => ({
      ...s,
      stockIn: [...s.stockIn, { ...row, id: `si_${uuidv4()}` }],
      isDirty: true,
    }))
  }, [])

  const updateStockInRow = useCallback((id: string, field: keyof StockInRow, value: unknown) => {
    setState((s) => ({
      ...s,
      stockIn: s.stockIn.map((r) => r.id === id ? { ...r, [field]: value } : r),
      isDirty: true,
    }))
  }, [])

  const deleteStockInRow = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      stockIn: s.stockIn.filter((r) => r.id !== id),
      isDirty: true,
    }))
  }, [])

  // ---- 出库表操作 ----
  const addStockOutRow = useCallback((row: Omit<StockOutRow, 'id'>) => {
    setState((s) => ({
      ...s,
      stockOut: [...s.stockOut, { ...row, id: `so_${uuidv4()}` }],
      isDirty: true,
    }))
  }, [])

  const updateStockOutRow = useCallback((id: string, field: keyof StockOutRow, value: unknown) => {
    setState((s) => ({
      ...s,
      stockOut: s.stockOut.map((r) => r.id === id ? { ...r, [field]: value } : r),
      isDirty: true,
    }))
  }, [])

  const deleteStockOutRow = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      stockOut: s.stockOut.filter((r) => r.id !== id),
      isDirty: true,
    }))
  }, [])

  // ---- 阈值操作 ----
  const setThreshold = useCallback((code: string, value: number) => {
    setState((s) => ({
      ...s,
      thresholds: { ...s.thresholds, [code]: value },
      isDirty: true,
    }))
  }, [])

  const setThresholds = useCallback((thresholds: Thresholds) => {
    setState((s) => ({ ...s, thresholds, isDirty: true }))
  }, [])

  // ---- 下载 Excel ----
  const exportExcel = useCallback(async () => {
    const s = stateRef.current
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockIn: s.stockIn, stockOut: s.stockOut }),
    })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.error || '下载失败')
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = new Date().toISOString().slice(0, 10)
    a.download = `inventory_${dateStr}.xlsx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  return {
    ...state,
    loadData,
    saveToGitHub,
    importFromUpload,
    addStockInRow,
    updateStockInRow,
    deleteStockInRow,
    addStockOutRow,
    updateStockOutRow,
    deleteStockOutRow,
    setThreshold,
    setThresholds,
    exportExcel,
  }
}

// 合并阈值：保留已有商品的阈值，新商品初始化为 0
function mergeThresholds(
  existing: Thresholds,
  stockIn: StockInRow[],
  stockOut: StockOutRow[]
): Thresholds {
  const allCodes = new Set<string>()
  stockIn.forEach((r) => allCodes.add(r.商品代码))
  stockOut.forEach((r) => allCodes.add(r.商品代码))

  const merged: Thresholds = {}
  for (const code of allCodes) {
    merged[code] = existing[code] ?? 0
  }
  return merged
}
