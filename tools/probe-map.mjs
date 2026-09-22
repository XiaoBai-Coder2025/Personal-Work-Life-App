// 地图排障：把地图页真跑起来，打印控制台、DOM 状态和高德自己的报错
// 用法：node tools/probe-map.mjs   （读应用自己的 data/settings.json；也可用 PERSONAL_APP_DATA_DIR 指定）
import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow } from 'electron';

const PORT = 4395;
const DATA_DIR = process.env.PERSONAL_APP_DATA_DIR
  ?? (fs.existsSync('dist/个人工作生活-win32-x64/data/settings.json')
    ? 'dist/个人工作生活-win32-x64/data'
    : 'data');
process.env.PERSONAL_APP_DATA_DIR = DATA_DIR;
process.env.PERSONAL_APP_PORT = String(PORT);

const logs = [];
const settingsFile = path.join(DATA_DIR, 'settings.json');
if (fs.existsSync(settingsFile)) {
  const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  console.log('配置来源:', settingsFile);
  console.log('  地图密钥方式:', s.amapKeyMode ?? '代理(默认)');
  console.log('  JS Key:', s.amapJsKey ? `${s.amapJsKey.slice(0, 4)}…（${s.amapJsKey.length} 位）` : '未填');
  console.log('  安全密钥:', s.amapSecCode ? `已填（${s.amapSecCode.length} 位）` : '未填');
  console.log('  Web服务 Key:', s.amapWebKey ? `已填（${s.amapWebKey.length} 位）` : '未填');
} else {
  console.log('没有找到 settings.json：', settingsFile);
}

async function main() {
  const { createServer } = await import('../server.js');
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const win = new BrowserWindow({ show: false, width: 1440, height: 900 });
  win.webContents.on('console-message', (...args) => {
    const event = args[0];
    const message = event && typeof event === 'object' && 'message' in event ? event.message : args[2];
    logs.push(String(message));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => logs.push(`加载失败 ${code} ${desc} ${url}`));

  await win.loadURL(`http://127.0.0.1:${PORT}/#/map`);
  await new Promise((resolve) => setTimeout(resolve, 9000));

  const state = await win.webContents.executeJavaScript(`(() => {
    const box = document.getElementById('amap');
    return {
      hasAMap: typeof window.AMap !== 'undefined',
      boxChildren: box ? box.children.length : -1,
      hasCanvas: !!(box && box.querySelector('canvas')),
      boxSize: box ? box.clientWidth + 'x' + box.clientHeight : 'n/a',
      schematicShown: !!document.querySelector('.schematic'),
      mapText: (box?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 200),
    };
  })()`);

  console.log('\nDOM 状态:', JSON.stringify(state, null, 1));
  console.log('\n控制台（前 15 条）:');
  logs.slice(0, 15).forEach((line) => console.log('  ' + line.replace(/\s+/g, ' ').slice(0, 200)));
  if (!logs.length) console.log('  （没有输出）');

  await new Promise((resolve) => server.close(resolve));
  app.exit(0);
}

setTimeout(() => {
  console.log('\n探针超时退出（页面可能卡住）');
  app.exit(3);
}, 30000);

app.whenReady().then(main).catch((err) => {
  console.error('探针出错：', err);
  app.exit(2);
});
