import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PERSONAL_APP_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-http-'));
const { createServer } = await import('../server.js');

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('健康检查', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('保存后能读回', async () => {
  const put = await fetch(`${base}/api/data/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, items: [{ id: 'x' }] }),
  });
  assert.equal(put.status, 200);
  const data = await (await fetch(`${base}/api/data/notes`)).json();
  assert.equal(data.items[0].id, 'x');
});

test('未知集合返回 404', async () => {
  assert.equal((await fetch(`${base}/api/data/hack`)).status, 404);
});

test('非法 JSON 返回 400', async () => {
  const res = await fetch(`${base}/api/data/notes`, { method: 'PUT', body: '{坏' });
  assert.equal(res.status, 400);
});

test('首页能打开', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /个人工作生活/);
});

test('路径穿越被挡住', async () => {
  const res = await fetch(`${base}/../package.json`);
  assert.ok(res.status === 404 || res.status === 403);
});
