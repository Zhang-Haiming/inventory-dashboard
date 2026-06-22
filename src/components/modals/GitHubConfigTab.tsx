import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { CheckCircle, AlertCircle, GitBranch, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GitHubConfig } from '@/lib/types'

const EMPTY_CONFIG: GitHubConfig = { token: '', owner: '', repo: '', data_branch: '' }

function toMsg(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return '未知错误'
}

export function GitHubConfigTab({ onSaved }: { onSaved?: () => void } = {}) {
  const [config,   setConfig]   = useState<GitHubConfig>(EMPTY_CONFIG)
  const [draft,    setDraft]    = useState<GitHubConfig>(EMPTY_CONFIG)
  const [showToken, setShowToken] = useState(false)
  const [status,   setStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errMsg,   setErrMsg]   = useState('')
  const [loading,  setLoading]  = useState(true)

  // 加载已保存的配置
  useEffect(() => {
    invoke<GitHubConfig>('get_github_config')
      .then(cfg => {
        setConfig(cfg)
        setDraft(cfg)
      })
      .catch(e => setErrMsg(toMsg(e)))
      .finally(() => setLoading(false))
  }, [])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config)

  const isConfigured = config.token && config.owner && config.repo

  const handleSave = async () => {
    if (!draft.token || !draft.owner || !draft.repo) {
      setErrMsg('Token、Owner、Repo 为必填项')
      return
    }
    setStatus('saving')
    setErrMsg('')
    try {
      await invoke('save_github_config', { config: draft })
      setConfig(draft)
      setStatus('saved')
      onSaved?.()
      setTimeout(() => setStatus('idle'), 2500)
    } catch (e) {
      setErrMsg(toMsg(e))
      setStatus('error')
    }
  }

  const handleReset = () => {
    setDraft(config)
    setStatus('idle')
    setErrMsg('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-2">
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center">
          <GitBranch className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">GitHub 同步配置</h2>
          <p className="text-sm text-slate-500">配置后可将库存数据备份到 GitHub 仓库</p>
        </div>
        {/* 配置状态指示 */}
        {isConfigured ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            <CheckCircle className="h-3.5 w-3.5" /> 已配置
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
            <AlertCircle className="h-3.5 w-3.5" /> 未配置
          </span>
        )}
      </div>

      {/* 表单 */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        {/* Token */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            GitHub Token <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={draft.token}
              onChange={e => setDraft(d => ({ ...d, token: e.target.value }))}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="pr-10 font-mono text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            在 GitHub → Settings → Developer settings → Fine-grained tokens 创建，需要 Contents 读写权限
          </p>
        </div>

        {/* Owner */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            GitHub Owner <span className="text-red-500">*</span>
          </label>
          <Input
            value={draft.owner}
            onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}
            placeholder="your-github-username"
            className="font-mono text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">你的 GitHub 用户名或组织名</p>
        </div>

        {/* Repo */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            仓库名称 <span className="text-red-500">*</span>
          </label>
          <Input
            value={draft.repo}
            onChange={e => setDraft(d => ({ ...d, repo: e.target.value }))}
            placeholder="inventory-dashboard"
            className="font-mono text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">数据将同步到该仓库</p>
        </div>

        {/* Data Branch */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            数据 Branch
          </label>
          <Input
            value={draft.data_branch}
            onChange={e => setDraft(d => ({ ...d, data_branch: e.target.value }))}
            placeholder="例如 main、data、data-backup"
            className="font-mono text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">
            数据文件存在哪个 branch，建议与代码分支分开
          </p>
        </div>

        {/* 错误提示 */}
        {errMsg && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {errMsg}
          </div>
        )}

        {/* 成功提示 */}
        {status === 'saved' && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            配置已保存，立即生效
          </div>
        )}

        {/* 按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              取消
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={status === 'saving' || !isDirty}
          >
            {status === 'saving' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            保存配置
          </Button>
        </div>
      </div>

      {/* 说明 */}
      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 space-y-1">
        <p>• 配置持久化保存在本机，重启 app 后自动生效</p>
        <p>• 如果同时存在 <code className="bg-slate-100 px-1 rounded">.env.local</code> 文件，文件中的值优先级更高</p>
        <p>• Token 仅保存在本地 SQLite，不会上传到 GitHub</p>
      </div>
    </div>
  )
}
