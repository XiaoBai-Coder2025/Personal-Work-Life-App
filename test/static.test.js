import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PERSONAL_APP_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-static-'));
const { createServer } = await import('../server.js');
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');

async function allFiles(dir, base = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...await allFiles(path.join(dir, entry.name), rel));
    else out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('每个前端文件都能被服务出去', async () => {
  const files = await allFiles(WEB_DIR);
  assert.ok(files.length >= 12, `前端文件只有 ${files.length} 个`);
  for (const file of files) {
    const res = await fetch(`${base}/${file}`);
    assert.equal(res.status, 200, `${file} 没有正确返回`);
  }
});

test('入口引用的模块都真实存在', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /app\.js/);
  const app = await (await fetch(`${base}/app.js`)).text();
  const imports = [...app.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length >= 5, `app.js 只引用了 ${imports.length} 个模块`);
  for (const rel of imports) {
    const res = await fetch(`${base}/${rel}`);
    assert.equal(res.status, 200, `${rel} 缺失`);
  }
});

test('七个模块都有对应的渲染函数导出', async () => {
  const modules = ['home', 'today', 'calendar', 'work', 'map', 'ai', 'settings'];
  for (const name of modules) {
    const source = await fs.readFile(path.join(WEB_DIR, 'modules', `${name}.js`), 'utf8');
    assert.match(source, /export async function render/, `${name}.js 没有导出渲染函数`);
  }
});
