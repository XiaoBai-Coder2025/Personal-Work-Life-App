import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PERSONAL_APP_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-poi-'));
const { createServer } = await import('../server.js');
const { writeCollection } = await import('../src/store.js');

let server;
let base;
let capturedUrl;
let replyBody;

before(async () => {
  server = createServer({
    fetchImpl: async (url) => {
      capturedUrl = url;
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => replyBody,
      };
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(async () => {
  capturedUrl = undefined;
  replyBody = '{"status":"1","info":"OK","pois":[{"name":"南京大学图书馆","address":"汉口路22号","location":"118.79,32.05"}]}';
  await writeCollection('settings', { version: 1, amapWebKey: 'WEBKEY' });
});

test('搜索接口用 Web服务 Key 调高德并把结果整理好', async () => {
  const res = await fetch(`${base}/api/poi?keywords=${encodeURIComponent('图书馆')}&city=${encodeURIComponent('南京')}`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].name, '南京大学图书馆');
  assert.equal(data.items[0].lng, 118.79);
  assert.equal(data.items[0].lat, 32.05);
  assert.ok(capturedUrl.startsWith('https://restapi.amap.com/v3/place/text'));
  assert.ok(capturedUrl.includes('key=WEBKEY'));
  assert.ok(capturedUrl.includes('keywords='));
  assert.ok(capturedUrl.includes('city='));
});

test('高德报错时把原文带回来，不再吞掉', async () => {
  replyBody = '{"status":"0","info":"INVALID_PARAMS","infocode":"20000"}';
  const res = await fetch(`${base}/api/poi?keywords=test`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.items, []);
  assert.match(data.message, /INVALID_PARAMS/);
  assert.match(data.message, /20000/);
});

test('没配 Web服务 Key 时明确说要配哪把', async () => {
  await writeCollection('settings', { version: 1 });
  const res = await fetch(`${base}/api/poi?keywords=test`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Web服务 Key/);
});

test('关键词为空时不发请求', async () => {
  const res = await fetch(`${base}/api/poi?keywords=`);
  assert.equal(res.status, 400);
  assert.equal(capturedUrl, undefined);
});
