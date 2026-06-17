import { useState, useEffect } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

interface UpdaterState {
  update: Update | null
  checking: boolean
  installing: boolean
  progress: number       // 0-100
  error: string | null
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    update: null, checking: false, installing: false, progress: 0, error: null,
  })

  // 启动后静默检查（延迟 3 秒，让 app 先加载完成）
  useEffect(() => {
    const timer = setTimeout(async () => {
      setState(s => ({ ...s, checking: true }))
      try {
        const update = await check()
        setState(s => ({ ...s, update: update ?? null, checking: false }))
      } catch {
        // 离线或请求失败时静默忽略
        setState(s => ({ ...s, checking: false }))
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const install = async () => {
    if (!state.update) return
    setState(s => ({ ...s, installing: true, progress: 0, error: null }))
    try {
      let downloaded = 0
      let total = 0
      await state.update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          const pct = total > 0 ? Math.round(downloaded / total * 100) : 0
          setState(s => ({ ...s, progress: pct }))
        }
      })
      // 下载安装完成，重启 app
      await relaunch()
    } catch (err) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : '更新失败'
      setState(s => ({ ...s, installing: false, error: msg }))
    }
  }

  const dismiss = () => setState(s => ({ ...s, update: null }))

  return { ...state, install, dismiss }
}
