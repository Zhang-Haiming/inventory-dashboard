const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow
let nextServer

const PORT = 3000

// 等待 Next.js 服务器就绪
function waitForServer(url, retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve()
        else retry()
      }).on('error', () => retry())
    }
    const retry = () => {
      attempts++
      if (attempts >= retries) reject(new Error('Server did not start'))
      else setTimeout(check, 1000)
    }
    check()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '库存看板',
    // 应用图标（打包时使用）
    // icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 隐藏菜单栏
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // 启动 Next.js 服务
  const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next')
  const appDir = path.join(__dirname, '..')

  nextServer = spawn(nextBin, ['start', '--port', String(PORT)], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    // Windows 需要 shell: true
    shell: process.platform === 'win32',
  })

  nextServer.stdout?.on('data', (data) => {
    console.log('[next]', data.toString())
  })
  nextServer.stderr?.on('data', (data) => {
    console.error('[next]', data.toString())
  })

  try {
    await waitForServer(`http://localhost:${PORT}`)
    createWindow()
  } catch (err) {
    console.error('Failed to start Next.js server:', err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (nextServer) nextServer.kill()
  app.quit()
})

app.on('before-quit', () => {
  if (nextServer) nextServer.kill()
})
