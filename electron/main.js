const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const { net } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

// ---- IPC：代理 GitHub API 请求（绕过 file:// 跨域限制）----
ipcMain.handle('github-request', async (_event, { method, url, headers, body }) => {
  return new Promise((resolve, reject) => {
    const req = net.request({ method, url })
    Object.entries(headers || {}).forEach(([k, v]) => req.setHeader(k, v))
    req.on('response', (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode, text })
      })
    })
    req.on('error', reject)
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
})

// ---- IPC：打开文件选择对话框并读取 Excel ----
ipcMain.handle('open-excel-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Excel 文件',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const buffer = fs.readFileSync(filePath)
  // 返回 base64 编码的文件内容
  return { name: path.basename(filePath), data: buffer.toString('base64') }
})

// ---- IPC：保存文件到本地（下载 Excel）----
ipcMain.handle('save-excel-dialog', async (_event, { defaultName, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存 Excel 文件',
    defaultPath: defaultName,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
  })
  if (result.canceled || !result.filePath) return false
  const buffer = Buffer.from(data, 'base64')
  fs.writeFileSync(result.filePath, buffer)
  return true
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '库存看板',
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 加载 preload 脚本，把 IPC 暴露给渲染进程
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // 加载静态导出的 Next.js 文件
  const isPacked = app.isPackaged
  const outDir = isPacked
    ? path.join(process.resourcesPath, 'app', 'out')
    : path.join(__dirname, '..', 'out')

  // 直接加载 dashboard 页面（跳过根路径的 307 重定向）
  mainWindow.loadFile(path.join(outDir, 'dashboard', 'index.html'))

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })
