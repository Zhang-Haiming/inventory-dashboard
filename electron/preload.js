const { contextBridge, ipcRenderer } = require('electron')

// 把 Electron 能力安全地暴露给渲染进程（前端 React 代码）
contextBridge.exposeInMainWorld('electronAPI', {
  // 代理 GitHub API 请求（绕过 file:// 跨域）
  githubRequest: (opts) => ipcRenderer.invoke('github-request', opts),
  // 打开系统文件选择框并读取 Excel
  openExcelDialog: () => ipcRenderer.invoke('open-excel-dialog'),
  // 弹出系统保存对话框并写入文件
  saveExcelDialog: (opts) => ipcRenderer.invoke('save-excel-dialog', opts),
})
