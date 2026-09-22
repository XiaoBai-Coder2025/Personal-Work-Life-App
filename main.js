import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu } from 'electron';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PERSONAL_APP_PORT || 4317);

// 打包后数据放在用户目录（%APPDATA%\个人工作生活\data），重打包、挪位置都不会丢；
// 源码运行时仍用项目里的 data 目录
if (app.isPackaged) {
  app.setName('个人工作生活');
  const userData = path.join(app.getPath('userData'), 'data');
  const legacy = path.join(path.dirname(process.execPath), 'data');
  // 老版本把数据放在 exe 旁边，第一次启动时搬过来
  if (!fs.existsSync(userData) && fs.existsSync(legacy)) {
    try {
      fs.cpSync(legacy, userData, { recursive: true });
      console.log('[data] 已把 exe 旁边的 data 迁移到', userData);
    } catch (err) {
      console.warn('[data] 迁移老数据失败：', err.message);
    }
  }
  process.env.PERSONAL_APP_DATA_DIR = userData;
}

async function startServer() {
  const { createServer } = await import('./server.js');
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      // 端口被占用说明已经有一个实例在跑，直接复用，不再起第二个
      if (err.code === 'EADDRINUSE') resolve(null);
      else reject(err);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  const iconFile = path.join(here, 'build', 'icon.png');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#eef0f4',
    title: '个人工作生活',
    ...(process.platform === 'win32' ? {} : { icon: iconFile }),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.maximize();
  await win.loadURL(`http://127.0.0.1:${PORT}`);
  win.show();
  return win;
}

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  await startServer();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('[app] 启动失败：', err);
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});
