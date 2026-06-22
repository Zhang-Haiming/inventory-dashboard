import { GitBranch } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GitHubConfigTab } from './GitHubConfigTab'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** 首次启动时为 true，顶部显示引导提示；false 时为普通编辑 */
  isFirstLaunch?: boolean
}

export function GitHubSetupModal({ open, onClose, onSaved, isFirstLaunch }: Props) {
  const handleSaved = () => {
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-slate-700" />
            <DialogTitle>
              {isFirstLaunch ? '欢迎使用库存看板' : 'GitHub 同步配置'}
            </DialogTitle>
          </div>
          {isFirstLaunch && (
            <DialogDescription>
              请先配置 GitHub 同步设置，配置后 app 将自动从仓库拉取已有数据。
              若仓库中暂无数据，配置完成后可直接上传 Excel 开始使用。
            </DialogDescription>
          )}
        </DialogHeader>

        <GitHubConfigTab onSaved={handleSaved} />

        {isFirstLaunch && (
          <div className="flex justify-center pt-2 pb-1">
            <Button variant="ghost" size="sm" className="text-slate-400 text-xs" onClick={onClose}>
              稍后配置（跳过）
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
