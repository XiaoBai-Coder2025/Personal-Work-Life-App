import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4399;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pwl-ui-'));
process.env.PERSONAL_APP_DATA_DIR = DATA_DIR;
process.env.PERSONAL_APP_PORT = String(PORT);

const errors = [];
const results = [];

function record(args, level, message) {
  const event = args[0];
  const lv = event && typeof event === 'object' && 'level' in event ? event.level : level;
  const msg = event && typeof event === 'object' && 'message' in event ? event.message : message;
  if (String(lv) === 'error' || lv === 3) errors.push(String(msg));
}

async function main() {
  const { createServer } = await import('../server.js');
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const win = new BrowserWindow({ show: false, width: 1440, height: 900 });
  win.webContents.on('console-message', (...args) => record(args, args[1], args[2]));
  win.webContents.on('render-process-gone', (_e, details) => errors.push(`renderer 退出：${JSON.stringify(details)}`));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`加载失败 ${code} ${desc} ${url}`));
  win.webContents.on('preload-error', (_e, file, err) => errors.push(`preload 出错 ${file} ${err.message}`));

  const routes = ['home', 'today', 'calendar', 'work', 'map', 'ai', 'settings'];
  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop
    await win.loadURL(`http://127.0.0.1:${PORT}/#/${route}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 700));
    // eslint-disable-next-line no-await-in-loop
    const info = await win.webContents.executeJavaScript(`(() => {
      const view = document.getElementById('view');
      return {
        title: document.getElementById('page-title')?.textContent ?? '',
        navCount: document.querySelectorAll('#sidenav .navbtn').length,
        active: document.querySelector('#sidenav .navbtn.active')?.textContent ?? '',
        blocks: view ? view.children.length : -1,
        text: (view?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 140),
      };
    })()`);
    results.push({ route, ...info });
  }

  // 填入示例数据后再检查一遍，确认不是只有空壳
  await win.loadURL(`http://127.0.0.1:${PORT}/#/settings`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const filled = await win.webContents.executeJavaScript(`(() => {
    window.confirm = () => true;
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('填入示例数据'));
    if (button) button.click();
    return !!button;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  results.push({ route: 'sample-data', filled });

  for (const route of ['calendar', 'today', 'work', 'home']) {
    await win.loadURL(`http://127.0.0.1:${PORT}/#/${route}`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const info = await win.webContents.executeJavaScript(`(() => {
      const view = document.getElementById('view');
      const bars = [...view.querySelectorAll('.bar')];
      const colors = new Set(bars.map((b) => getComputedStyle(b).backgroundColor));
      return {
        blocks: view.children.length,
        textLength: (view.innerText ?? '').length,
        bars: bars.length,
        barColors: colors.size,
      };
    })()`);
    results.push({ route: `filled-${route}`, ...info });
  }

  await new Promise((resolve) => server.close(resolve));
  console.log(JSON.stringify({ dataDir: DATA_DIR, results, errors }, null, 2));
  app.exit(errors.length ? 1 : 0);
}

app.whenReady().then(main).catch((err) => {
  console.error('自检脚本本身出错：', err);
  app.exit(2);
});
