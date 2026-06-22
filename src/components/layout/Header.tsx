import { useState, useRef, useEffect } from 'react'
import { Upload, Download, Save, BarChart2, RefreshCw, Settings, AlertTriangle, ChevronDown, Settings2, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UploadModal } from '@/components/modals/UploadModal'
import { ThresholdModal } from '@/components/modals/ThresholdModal'
import { CompanyModal } from '@/components/modals/CompanyModal'
import type { StockInRow, StockOutRow, Thresholds, Company } from '@/lib/types'

interface Props {
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
  lastUpdated: string
  stockIn: StockInRow[]
  stockOut: StockOutRow[]
  thresholds: Thresholds
  lowStockCount: number
  // 公司相关
  companies: Company[]
  currentCompany: Company | null
  onSwitchCompany: (id: string) => void
  onRefreshCompanies: () => void
  // 数据操作
  onSave: () => void
  onRefresh: () => void
  onImport: (stockIn: StockInRow[], stockOut: StockOutRow[]) => void
  onExport: () => void
  onThresholdsSave: (thresholds: Thresholds) => void
  parseAndImport: (file: File) => Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number }>
  pickAndImport: () => Promise<{ warnings: string[]; stockInCount: number; stockOutCount: number } | null>
  onOpenGitHubConfig: () => void
}

export function Header({
  isDirty, isSaving, isLoading, lastUpdated,
  stockIn, stockOut, thresholds, lowStockCount,
  companies, currentCompany, onSwitchCompany, onRefreshCompanies,
  onSave, onRefresh, onImport, onExport, onThresholdsSave,
  parseAndImport, pickAndImport, onOpenGitHubConfig,
}: Props) {
  const [uploadOpen,    setUploadOpen]    = useState(false)
  const [thresholdOpen, setThresholdOpen] = useState(false)
  const [companyOpen,   setCompanyOpen]   = useState(false)
  const [dropdownOpen,  setDropdownOpen]  = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const lastUpdatedStr = lastUpdated
    ? new Date(parseInt(lastUpdated) * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  const handleUploadClick = async () => {
    try {
      const result = await pickAndImport()
      if (result === null) return   // 用户取消选择，静默退出
      if (result.warnings.length > 0) {
        alert(`导入成功（入库 ${result.stockInCount} 条，出库 ${result.stockOutCount} 条）\n\n注意：\n${result.warnings.join('\n')}`)
      } else {
        alert(`导入成功！入库 ${result.stockInCount} 条，出库 ${result.stockOutCount} 条`)
      }
    } catch (err) {
      // 解析失败时显示错误，不再弹出上传 Modal（避免触发额外窗口）
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : '导入失败'
      alert(`导入失败：${msg}`)
    }
  }

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">

          {/* Logo + 公司选择器 */}
          <div className="flex items-center gap-2 mr-auto">
            <BarChart2 className="h-6 w-6 text-slate-700 flex-shrink-0" />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">库存看板</h1>
              {lastUpdatedStr && (
                <p className="text-xs text-slate-400 mt-0.5">上次同步：{lastUpdatedStr}</p>
              )}
            </div>

            {/* 公司下拉选择器 */}
            <div className="relative ml-2" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors"
              >
                <span className="max-w-[120px] truncate">
                  {currentCompany?.name ?? '…'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              </button>

              {dropdownOpen && companies.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-50 py-1">
                  {companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onSwitchCompany(c.id); setDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        c.id === currentCompany?.id
                          ? 'bg-slate-100 font-medium text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 公司管理按钮 */}
            <button
              onClick={() => setCompanyOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
              title="管理公司"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>

          {/* 低库存提示 */}
          {lowStockCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowStockCount} 种低库存
            </div>
          )}

          {/* 操作按钮 */}
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading} title="从 GitHub 拉取最新数据">
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

          <Button variant="outline" size="sm" onClick={onOpenGitHubConfig} title="GitHub 同步配置">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">GitHub 配置</span>
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

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onImport={onImport} parseAndImport={parseAndImport} />
      <ThresholdModal open={thresholdOpen} onClose={() => setThresholdOpen(false)} stockIn={stockIn} stockOut={stockOut} thresholds={thresholds} onSave={onThresholdsSave} />
      <CompanyModal
        open={companyOpen}
        onClose={() => setCompanyOpen(false)}
        companies={companies}
        currentId={currentCompany?.id ?? ''}
        onSwitch={onSwitchCompany}
        onRefresh={onRefreshCompanies}
      />
    </>
  )
}
