'use client'
import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { StockInRow, StockOutRow } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (stockIn: StockInRow[], stockOut: StockOutRow[]) => void
}

type UploadState = 'idle' | 'uploading' | 'preview' | 'error'

interface PreviewData {
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  warnings: string[]
  stats: { stockInCount: number; stockOutCount: number }
}

export function UploadModal({ open, onClose, onImport }: Props) {
  const [state, setState] = useState<UploadState>('idle')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setState('idle')
    setPreview(null)
    setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const uploadFile = async (file: File) => {
    setState('uploading')
    setErrorMsg('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '上传失败')
      setPreview(json)
      setState('preview')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '上传失败')
      setState('error')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleConfirm = () => {
    if (!preview) return
    onImport(preview.stockIn, preview.stockOut)
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>上传 Excel 文件</DialogTitle>
          <DialogDescription>
            支持 .xlsx / .xls 格式，Excel 需包含"入库表"和"出库表"两个 Sheet
          </DialogDescription>
        </DialogHeader>

        {/* 上传区域 */}
        {(state === 'idle' || state === 'error') && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">拖拽文件到此处，或点击选择</p>
            <p className="text-xs text-slate-400 mt-1">支持 .xlsx / .xls 格式</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* 加载中 */}
        {state === 'uploading' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Upload className="h-8 w-8 text-slate-400 animate-bounce" />
            <p className="text-sm text-slate-500">正在解析 Excel...</p>
          </div>
        )}

        {/* 错误 */}
        {state === 'error' && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">上传失败</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* 预览 */}
        {state === 'preview' && preview && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-700">解析成功</p>
                <p className="text-green-600 mt-0.5">
                  入库记录 {preview.stats.stockInCount} 条，
                  出库记录 {preview.stats.stockOutCount} 条
                </p>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">注意事项：</p>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">· {w}</p>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400">
              确认导入后，已有数据将被替换。之前设置的低库存阈值会保留。
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>取消</Button>
          {state === 'preview' && (
            <Button onClick={handleConfirm}>确认导入</Button>
          )}
          {state === 'error' && (
            <Button variant="outline" onClick={reset}>重新选择</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
