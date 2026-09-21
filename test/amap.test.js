import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PERSONAL_APP_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-amap-'));
const { createServer } = await import('../server.js');
const { writeCollection } = await import('../src/store.js');

let server;
let base;
let captured;

before(async () => {
  await writeCollection('settings', { version: 1, amapSecCode: 'SECRET-CODE' });
  server = createServer({
    fetchImpl: async (url) => {
      captured = url;
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '{"status":"1","info":"OK"}',
      };
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('代理会把安全密钥补上并且不返回给页面', async () => {
  const res = await fetch(`${base}/_AMapService/v3/geocode/geo?address=南京大学&key=JSKEY`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(captured.includes('jscode=SECRET-CODE'));
  assert.ok(captured.includes('address='));
  assert.ok(!text.includes('SECRET-CODE'));
});

test('没配安全密钥时给出明确错误', async () => {
  await writeCollection('settings', { version: 1, amapSecCode: '' });
  const res = await fetch(`${base}/_AMapService/v3/geocode/geo?address=x`);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /安全密钥/);
  await writeCollection('settings', { version: 1, amapSecCode: 'SECRET-CODE' });
});

test('代理只会把请求发给高德域名', async () => {
  await fetch(`${base}/_AMapService/v3/place/text?keywords=图书馆`);
  assert.ok(captured.startsWith('https://restapi.amap.com/'));
  assert.ok(captured.includes('keywords='));
});
