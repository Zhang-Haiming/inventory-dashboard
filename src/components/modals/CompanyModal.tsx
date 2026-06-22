import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Company } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  companies: Company[]
  currentId: string
  onSwitch: (id: string) => void
  onRefresh: () => void   // 刷新公司列表
}

function toMsg(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return '未知错误'
}

export function CompanyModal({ open, onClose, companies, currentId, onSwitch, onRefresh }: Props) {
  const [newName, setNewName]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [err, setErr]           = useState('')

  const handleAdd = async () => {
    if (!newName.trim()) return
    try {
      const company = await invoke<Company>('add_company', { name: newName.trim() })
      setNewName('')
      setAdding(false)
      setErr('')
      onRefresh()
      onSwitch(company.id)   // 自动切换到新建的公司
    } catch (e) { setErr(toMsg(e)) }
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditId(null); return }
    try {
      await invoke('rename_company', { id, name: editName.trim() })
      setEditId(null)
      setErr('')
      onRefresh()
      // 改名后异步同步到 GitHub（不阻塞 UI，失败仅提示）
      invoke('sync_company_name', { id }).catch(e => {
        setErr(`本地改名成功，远端同步失败：${toMsg(e)}`)
      })
    } catch (e) { setErr(toMsg(e)) }
  }

  const handleDelete = async (id: string) => {
    if (companies.length <= 1) return
    if (!confirm('确定删除该公司？该公司所有库存数据将一并删除，此操作不可撤销。')) return
    try {
      await invoke('delete_company', { id })
      setErr('')
      onRefresh()
      if (id === currentId) {
        // 被删公司是当前公司，切换到第一个其他公司
        const next = companies.find(c => c.id !== id)
        if (next) onSwitch(next.id)
      }
    } catch (e) { setErr(toMsg(e)) }
  }

  const handleSwitch = (id: string) => {
    if (id === currentId) return
    onSwitch(id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>公司管理</DialogTitle>
        </DialogHeader>

        {/* 公司列表 */}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {companies.map(c => (
            <div
              key={c.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer
                ${c.id === currentId
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              onClick={() => handleSwitch(c.id)}
            >
              {/* 当前标记 */}
              <span className="w-4 flex-shrink-0">
                {c.id === currentId && <Check className="h-4 w-4 text-slate-700" />}
              </span>

              {/* 名称（可编辑）*/}
              {editId === c.id ? (
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename(c.id)
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  className="h-7 text-sm flex-1"
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{c.name}</span>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {editId === c.id ? (
                  <>
                    <button onClick={() => handleRename(c.id)} className="p-1 text-emerald-600 hover:text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditId(c.id); setEditName(c.name) }}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title="改名"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className={`p-1 ${companies.length <= 1
                        ? 'text-slate-200 cursor-not-allowed'
                        : 'text-slate-400 hover:text-red-500'}`}
                      disabled={companies.length <= 1}
                      title={companies.length <= 1 ? '至少保留一家公司' : '删除'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 新增公司 */}
        {adding ? (
          <div className="flex gap-2 mt-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
              placeholder="公司名称"
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>确认</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName('') }}>取消</Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> 新增公司
          </Button>
        )}

        {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
      </DialogContent>
    </Dialog>
  )
}
