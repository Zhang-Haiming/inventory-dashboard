import { useState, useMemo, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { BarChart2, Package, AlertTriangle, ListOrdered, PackageOpen } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MonthlySummary } from '@/components/dashboard/MonthlySummary'
import { CategoryInventory } from '@/components/dashboard/CategoryInventory'
import { LowStockAlert } from '@/components/dashboard/LowStockAlert'
import { StockInTable } from '@/components/tables/StockInTable'
import { StockOutTable } from '@/components/tables/StockOutTable'
import { GitHubSetupModal } from '@/components/modals/GitHubSetupModal'
import { useInventoryData } from '@/hooks/useInventoryData'
import { useUpdater } from '@/hooks/useUpdater'
import { getCategoryInventory, getLowStockItems } from '@/lib/dataUtils'
import type { Company, GitHubConfig } from '@/lib/types'

const TABS = [
  { id: 'summary',   label: '月度统计', icon: BarChart2 },
  { id: 'inventory', label: '商品库存', icon: Package },
  { id: 'alerts',    label: '库存预警', icon: AlertTriangle },
  { id: 'stockin',   label: '入库记录', icon: ListOrdered },
  { id: 'stockout',  label: '出库记录', icon: PackageOpen },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const {
    stockIn, stockOut, thresholds,
    lastUpdated, isEmpty,
    isDirty, isLoading, isSaving, error,
    loadData, refreshFromGitHub, saveToGitHub, importFromUpload, parseAndImport, pickAndImport, exportExcel,
    addStockInRow, updateStockInRow, deleteStockInRow,
    addStockOutRow, updateStockOutRow, deleteStockOutRow,
    setThresholds,
  } = useInventoryData()

  const [activeTab, setActiveTab] = useState<TabId>('summary')

  // ---- 公司状态 ----
  const [companies,      setCompanies]      = useState<Company[]>([])
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)

  const loadCompanies = useCallback(async () => {
    const list = await invoke<Company[]>('list_companies').catch(() => [] as Company[])
    setCompanies(list)
    const cur = await invoke<Company>('get_current_company').catch(() => null)
    setCurrentCompany(cur)
  }, [])

  useEffect(() => { loadCompanies() }, [loadCompanies])

  const handleSwitchCompany = useCallback(async (id: string) => {
    await invoke('switch_company', { id }).catch(() => null)
    const cur = companies.find(c => c.id === id) ?? null
    setCurrentCompany(cur)
    loadData()   // 重新加载新公司数据
  }, [companies, loadData])

  // ---- GitHub 配置弹窗 ----
  const [githubModalOpen, setGithubModalOpen] = useState(false)
  const [isFirstLaunch,   setIsFirstLaunch]   = useState(false)

  // 首次启动时检测 GitHub 配置，若未配置则自动弹出引导弹窗
  useEffect(() => {
    invoke<GitHubConfig>('get_github_config')
      .then(cfg => {
        if (!cfg.token || !cfg.owner || !cfg.repo) {
          setIsFirstLaunch(true)
          setGithubModalOpen(true)
        }
      })
      .catch(() => {
        // 无法读取配置（首次安装等），同样弹出引导
        setIsFirstLaunch(true)
        setGithubModalOpen(true)
      })
  }, [])

  // pull 完后同时刷新公司列表（pull 可能更新了本机的公司名称）
  const handleRefresh = useCallback(async () => {
    await refreshFromGitHub()
    await loadCompanies()
  }, [refreshFromGitHub, loadCompanies])

  // 配置保存后：关闭首次引导标记，自动从 GitHub 拉取数据
  const handleGithubSaved = useCallback(() => {
    setIsFirstLaunch(false)
    handleRefresh()
  }, [handleRefresh])

  // ---- 自动更新 ----
  const { update, installing, progress, error: updateError, install, dismiss } = useUpdater()

  const lowStockCount = useMemo(() => {
    const inv = getCategoryInventory(stockIn, stockOut, thresholds)
    return getLowStockItems(inv).length
  }, [stockIn, stockOut, thresholds])

  const handleExport = async () => {
    try {
      await exportExcel()
    } catch (err) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : '下载失败'
      alert(msg)
    }
  }

  // ---- 空数据引导页 ----
  if (!isLoading && isEmpty && stockIn.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header
          isDirty={isDirty} isSaving={isSaving} isLoading={isLoading}
          lastUpdated={lastUpdated}
          stockIn={stockIn} stockOut={stockOut} thresholds={thresholds}
          lowStockCount={0}
          companies={companies} currentCompany={currentCompany}
          onSwitchCompany={handleSwitchCompany} onRefreshCompanies={loadCompanies}
          onSave={saveToGitHub} onRefresh={handleRefresh}
          onImport={importFromUpload} onExport={handleExport}
          onThresholdsSave={setThresholds}
          parseAndImport={parseAndImport}
          pickAndImport={pickAndImport}
          onOpenGitHubConfig={() => setGithubModalOpen(true)}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-700 mb-2">尚无库存数据</h2>
          <p className="text-slate-500 max-w-sm">
            点击右上角「上传 Excel」按钮，上传包含入库表和出库表的 Excel 文件开始使用
          </p>
        </div>

      <GitHubSetupModal
        open={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onSaved={handleGithubSaved}
        isFirstLaunch={isFirstLaunch}
      />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        isDirty={isDirty} isSaving={isSaving} isLoading={isLoading}
        lastUpdated={lastUpdated}
        stockIn={stockIn} stockOut={stockOut} thresholds={thresholds}
        lowStockCount={lowStockCount}
        companies={companies} currentCompany={currentCompany}
        onSwitchCompany={handleSwitchCompany} onRefreshCompanies={loadCompanies}
        onSave={saveToGitHub} onRefresh={refreshFromGitHub}
        onImport={importFromUpload} onExport={handleExport}
        onThresholdsSave={setThresholds}
        parseAndImport={parseAndImport}
        pickAndImport={pickAndImport}
        onOpenGitHubConfig={() => setGithubModalOpen(true)}
      />

      {/* 更新提示横幅 */}
      {update && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center justify-between">
          <p className="text-sm text-blue-700">
            🆕 发现新版本 <strong>{update.version}</strong>，当前版本 {update.currentVersion}
          </p>
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            {installing ? (
              <span className="text-sm text-blue-600">
                下载中… {progress}%
                <span className="ml-2 inline-block w-24 h-1.5 bg-blue-200 rounded-full overflow-hidden align-middle">
                  <span className="block h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </span>
              </span>
            ) : (
              <>
                {updateError && <span className="text-xs text-red-500">{updateError}</span>}
                <button
                  onClick={install}
                  className="text-sm font-medium text-blue-700 hover:text-blue-900 underline"
                >
                  立即更新
                </button>
                <button onClick={dismiss} className="text-sm text-blue-400 hover:text-blue-600">
                  稍后
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={loadData} className="text-red-500 hover:underline text-xs ml-4">重新加载</button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">加载数据中…</p>
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4">
          <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                } ${id === 'alerts' && lowStockCount > 0 ? 'text-red-600 hover:text-red-700' : ''}`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === 'alerts' && lowStockCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 leading-none">
                    {lowStockCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="pb-8">
            {activeTab === 'summary'   && <MonthlySummary stockIn={stockIn} stockOut={stockOut} />}
            {activeTab === 'inventory' && <CategoryInventory stockIn={stockIn} stockOut={stockOut} thresholds={thresholds} />}
            {activeTab === 'alerts'    && <LowStockAlert stockIn={stockIn} stockOut={stockOut} thresholds={thresholds} />}
            {activeTab === 'stockin'   && (
              <StockInTable rows={stockIn}
                onUpdate={updateStockInRow} onDelete={deleteStockInRow} onAdd={addStockInRow} />
            )}
            {activeTab === 'stockout'  && (
              <StockOutTable rows={stockOut}
                onUpdate={updateStockOutRow} onDelete={deleteStockOutRow} onAdd={addStockOutRow} />
            )}

          </div>
        </div>
      )}

      {isDirty && !isSaving && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-center justify-between z-40">
          <p className="text-sm text-amber-700">⚠️ 有未保存的更改</p>
          <button onClick={saveToGitHub} className="text-sm font-medium text-amber-800 underline hover:no-underline">
            立即保存
          </button>
        </div>
      )}

      <GitHubSetupModal
        open={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onSaved={handleGithubSaved}
        isFirstLaunch={isFirstLaunch}
      />
    </div>
  )
}
