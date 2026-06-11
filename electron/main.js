const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

let mainWindow

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
    },
  })

  // 加载静态导出的 Next.js 文件
  const isPacked = app.isPackaged
  const outDir = isPacked
    ? path.join(process.resourcesPath, 'app', 'out')
    : path.join(__dirname, '..', 'out')

  mainWindow.loadFile(path.join(outDir, 'index.html'))

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 隐藏菜单栏（Windows/Linux）
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => { app.quit() })

// macOS：点击 Dock 图标重新打开窗口
app.on('activate', () => { if (mainWindow === null) createWindow() })
