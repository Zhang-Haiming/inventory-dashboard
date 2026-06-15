import { useState, useMemo } from 'react'
import { BarChart2, Package, AlertTriangle, ListOrdered, PackageOpen, Settings2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MonthlySummary } from '@/components/dashboard/MonthlySummary'
import { CategoryInventory } from '@/components/dashboard/CategoryInventory'
import { LowStockAlert } from '@/components/dashboard/LowStockAlert'
import { StockInTable } from '@/components/tables/StockInTable'
import { StockOutTable } from '@/components/tables/StockOutTable'
import { GitHubConfigTab } from '@/components/modals/GitHubConfigTab'
import { useInventoryData } from '@/hooks/useInventoryData'
import { getCategoryInventory, getLowStockItems } from '@/lib/dataUtils'

const TABS = [
  { id: 'summary',   label: '月度统计',   icon: BarChart2 },
  { id: 'inventory', label: '商品库存',   icon: Package },
  { id: 'alerts',    label: '库存预警',   icon: AlertTriangle },
  { id: 'stockin',   label: '入库记录',   icon: ListOrdered },
  { id: 'stockout',  label: '出库记录',   icon: PackageOpen },
  { id: 'github',    label: 'GitHub 配置', icon: Settings2 },
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
          onSave={saveToGitHub} onRefresh={refreshFromGitHub}
          onImport={importFromUpload} onExport={handleExport}
          onThresholdsSave={setThresholds}
          parseAndImport={parseAndImport}
          pickAndImport={pickAndImport}
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
        onSave={saveToGitHub} onRefresh={refreshFromGitHub}
        onImport={importFromUpload} onExport={handleExport}
        onThresholdsSave={setThresholds}
        parseAndImport={parseAndImport}
        pickAndImport={pickAndImport}
      />

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
            {activeTab === 'github' && <GitHubConfigTab />}
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
    </div>
  )
}
