'use client'
import { useState } from 'react'
import { Upload, Download, Save, BarChart2, RefreshCw, Settings, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UploadModal } from '@/components/modals/UploadModal'
import { ThresholdModal } from '@/components/modals/ThresholdModal'
import type { StockInRow, StockOutRow, Thresholds } from '@/lib/types'

interface Props {
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
  lastUpdated: string
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
  lowStockCount: number
  isElectron: boolean
  onSave: () => void
  onRefresh: () => void
  onImport: (stockIn: StockInRow[], stockOut: StockOutRow[]) => void
  onExport: () => void
  onThresholdsSave: (thresholds: Thresholds) => void
  parseAndImport?: (file: File) => Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number }>
  pickAndImport?: () => Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number } | null>
}

export function Header({
  isDirty, isSaving, isLoading, lastUpdated,
  stockIn, stockOut, thresholds, lowStockCount,
  isElectron,
  onSave, onRefresh, onImport, onExport, onThresholdsSave,
  parseAndImport, pickAndImport,
}: Props) {
  const [uploadOpen, setUploadOpen] = useState(false)

  const [thresholdOpen, setThresholdOpen] = useState(false)

  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  // Electron 模式：直接弹系统文件选择框
  const handleUploadClick = async () => {
    if (isElectron && pickAndImport) {
      const result = await pickAndImport()
      if (result && result.warnings.length > 0) {
        alert(`导入成功（入库 ${result.stockInCount} 条，出库 ${result.stockOutCount} 条）\n\n注意：\n${result.warnings.join('\n')}`)
      }
    } else {
      setUploadOpen(true)
    }
  }

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          {/* 标题 */}
          <div className="flex items-center gap-2 mr-auto">
            <BarChart2 className="h-6 w-6 text-slate-700" />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">库存看板</h1>
              {lastUpdatedStr && (
                <p className="text-xs text-slate-400 mt-0.5">上次同步：{lastUpdatedStr}</p>
              )}
            </div>
          </div>

          {/* 低库存提示 */}
          {lowStockCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowStockCount} 种低库存
            </div>
          )}

          {/* 操作按钮 */}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading} title="刷新数据">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1">刷新</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleUploadClick}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">上传 Excel</span>
          </Button>

          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">下载 Excel</span>
          </Button>

          <Button variant="outline" size="sm" onClick={() => setThresholdOpen(true)} title="预警阈值设置">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">预警设置</span>
          </Button>

          <Button
            variant={isDirty ? 'success' : 'secondary'}
            size="sm"
            onClick={onSave}
            disabled={!isDirty || isSaving}
          >
            <Save className="h-4 w-4" />
            <span className="ml-1">{isSaving ? '保存中…' : isDirty ? '保存更改' : '已同步'}</span>
          </Button>
        </div>
      </header>

      {/* Web 模式才用 Modal，Electron 用系统对话框 */}
      {!isElectron && (
        <UploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onImport={onImport}
          parseAndImport={parseAndImport}
        />
      )}

      <ThresholdModal
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        stockIn={stockIn}
        stockOut={stockOut}
        thresholds={thresholds}
        onSave={onThresholdsSave}
      />
    </>
  )
}
