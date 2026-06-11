const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow
let nextServer

const PORT = 3000

// 判断是否是打包后的环境
const isPacked = app.isPackaged

// 获取应用根目录
// 开发时：项目根目录
// 打包后：resources/app 目录（asar 外）
function getAppRoot() {
  if (isPacked) {
    // 打包后 main.js 在 resources/app/electron/main.js
    return path.join(process.resourcesPath, 'app')
  }
  // 开发时 main.js 在 <root>/electron/main.js
  return path.join(__dirname, '..')
}

// 获取 next 可执行文件路径
function getNextBin() {
  const appRoot = getAppRoot()
  if (process.platform === 'win32') {
    return path.join(appRoot, 'node_modules', '.bin', 'next.cmd')
  }
  return path.join(appRoot, 'node_modules', '.bin', 'next')
}

// 等待 Next.js 服务器就绪（最多等 60 秒）
function waitForServer(url, retries = 60) {
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
      if (attempts >= retries) reject(new Error('Next.js server did not start in time'))
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
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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

  // 隐藏菜单栏（Windows/Linux）
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  const appRoot = getAppRoot()
  const nextBin = getNextBin()

  console.log('[electron] isPacked:', isPacked)
  console.log('[electron] appRoot:', appRoot)
  console.log('[electron] nextBin:', nextBin)

  nextServer = spawn(nextBin, ['start', '--port', String(PORT)], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
    },
    shell: process.platform === 'win32',
  })

  nextServer.stdout?.on('data', (data) => {
    console.log('[next]', data.toString().trim())
  })
  nextServer.stderr?.on('data', (data) => {
    console.error('[next:err]', data.toString().trim())
  })
  nextServer.on('exit', (code) => {
    console.log('[next] exited with code', code)
  })

  try {
    await waitForServer(`http://localhost:${PORT}`)
    console.log('[electron] Next.js ready, opening window')
    createWindow()
  } catch (err) {
    console.error('[electron] Failed to start Next.js:', err.message)
    // 显示错误窗口而不是直接退出
    mainWindow = new BrowserWindow({ width: 600, height: 300, title: '启动失败' })
    mainWindow.loadURL(`data:text/html,<h2 style="font-family:sans-serif;padding:20px;color:red">
      启动失败：Next.js 服务器未能在 60 秒内启动<br>
      <small style="color:#666">请重试，或联系管理员</small>
    </h2>`)
  }
})

app.on('window-all-closed', () => {
  if (nextServer) nextServer.kill()
  app.quit()
})

app.on('before-quit', () => {
  if (nextServer) nextServer.kill()
})

// macOS：点击 Dock 图标重新打开窗口
app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
