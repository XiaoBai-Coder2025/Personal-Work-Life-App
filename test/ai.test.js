import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PERSONAL_APP_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-ai-'));
const { createServer } = await import('../server.js');
const { writeCollection } = await import('../src/store.js');

let server;
let base;
let captured;

before(async () => {
  await writeCollection('settings', {
    version: 1,
    aiBaseUrl: 'https://api.example.com/v1',
    aiModel: 'demo-model',
    aiKey: 'AI-SECRET-KEY',
  });
  server = createServer({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => '{"choices":[{"message":{"content":"好的"}}]}',
        body: null,
      };
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('AI 请求由服务端带上密钥转发', async () => {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '今天还有什么没做' }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(captured.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer AI-SECRET-KEY');
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.model, 'demo-model');
  assert.equal(payload.messages[0].content, '今天还有什么没做');
});

test('页面拿不到密钥', async () => {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  const text = await res.text();
  assert.ok(!text.includes('AI-SECRET-KEY'));
});

test('没配 AI Key 时给出明确提示', async () => {
  await writeCollection('settings', { version: 1, aiBaseUrl: 'https://api.example.com/v1' });
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /AI Key/);
  await writeCollection('settings', {
    version: 1,
    aiBaseUrl: 'https://api.example.com/v1',
    aiModel: 'demo-model',
    aiKey: 'AI-SECRET-KEY',
  });
});

test('空消息被拒绝', async () => {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(res.status, 400);
});
