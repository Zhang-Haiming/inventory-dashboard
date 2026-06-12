const { app, BrowserWindow, shell, ipcMain, dialog, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')

// 必须在 app ready 之前注册自定义协议权限
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,  // 允许页面内 fetch() 调用
      corsEnabled: true,
    },
  },
])

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
        resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf-8') })
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
  fs.writeFileSync(result.filePath, Buffer.from(data, 'base64'))
  return true
})

// 注册自定义协议，让所有资源请求都从 outDir 根目录解析
// 这样 dashboard/index.html 里的 ./_next/... 能正确找到 out/_next/...
function registerAppProtocol(outDir) {
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://', '')
    const filePath = path.join(outDir, decodeURIComponent(url))
    callback({ path: filePath })
  })
}

function createWindow(outDir) {
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
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // 用自定义协议加载，所有相对路径都以 outDir 为根
  mainWindow.loadURL('app://dashboard/index.html')

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  const isPacked = app.isPackaged
  const outDir = isPacked
    ? path.join(process.resourcesPath, 'app', 'out')
    : path.join(__dirname, '..', 'out')

  // 确保 dashboard/_next 存在（软链到上级的 _next 目录）
  // 解决 assetPrefix="./" 时相对路径从 dashboard/ 而非 out/ 查找的问题
  const nextSrc = path.join(outDir, '_next')
  const nextDst = path.join(outDir, 'dashboard', '_next')
  if (fs.existsSync(nextSrc) && !fs.existsSync(nextDst)) {
    try {
      fs.symlinkSync(nextSrc, nextDst, 'dir')
    } catch (e) {
      // Windows 上 symlink 可能需要管理员权限，改用 junction
      try { fs.symlinkSync(nextSrc, nextDst, 'junction') } catch (_) {}
    }
  }

  registerAppProtocol(outDir)
  createWindow(outDir)
})

app.on('window-all-closed', () => { app.quit() })
app.on('activate', () => {
  if (mainWindow === null) {
    const isPacked = app.isPackaged
    const outDir = isPacked
      ? path.join(process.resourcesPath, 'app', 'out')
      : path.join(__dirname, '..', 'out')
    createWindow(outDir)
  }
})
