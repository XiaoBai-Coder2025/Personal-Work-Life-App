import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-'));
process.env.PERSONAL_APP_DATA_DIR = DATA_DIR;
const { readCollection, writeCollection, isCollection } = await import('../src/store.js');

test('写入后能读回', async () => {
  await writeCollection('notes', { version: 1, items: [{ id: 'n1', text: '测试' }] });
  assert.deepEqual(await readCollection('notes'), { version: 1, items: [{ id: 'n1', text: '测试' }] });
});

test('没见过数据集合时返回空结构', async () => {
  assert.deepEqual(await readCollection('pending'), { version: 1, items: [] });
  assert.deepEqual(await readCollection('settings'), { version: 1 });
});

test('第二次写入会留下上一版备份', async () => {
  await writeCollection('tasks', { version: 1, items: [{ id: 'a' }] });
  await writeCollection('tasks', { version: 1, items: [{ id: 'b' }] });
  const bak = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'tasks.json.bak'), 'utf8'));
  assert.equal(bak.items[0].id, 'a');
});

test('主文件损坏时用备份恢复', async () => {
  await writeCollection('places', { version: 1, items: [{ id: 'good' }] });
  await writeCollection('places', { version: 1, items: [{ id: 'newer' }] });
  await fs.writeFile(path.join(DATA_DIR, 'places.json'), '{坏文件', 'utf8');
  const data = await readCollection('places');
  assert.equal(data.items[0].id, 'good');
});

test('并发写入不会写出损坏的文件', async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => writeCollection('events', { version: 1, items: [{ id: i }] })),
  );
  const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'events.json'), 'utf8'));
  assert.equal(data.items.length, 1);
});

test('只认白名单里的数据集合', () => {
  assert.equal(isCollection('notes'), true);
  assert.equal(isCollection('../../etc/passwd'), false);
});
