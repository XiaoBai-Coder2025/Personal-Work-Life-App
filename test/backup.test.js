import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'pwl-bak-'));
process.env.PERSONAL_APP_DATA_DIR = DATA_DIR;
const store = await import('../src/store.js');
const { exportAll, importAll } = await import('../src/backup.js');
const BACKUP_DIR = path.join(path.dirname(DATA_DIR), 'backups');

test('导出再导入能还原数据', async () => {
  await store.writeCollection('notes', { version: 1, items: [{ id: 'n1', text: '原始' }] });
  const { data } = await exportAll();
  await store.writeCollection('notes', { version: 1, items: [] });
  await importAll(data);
  const notes = await store.readCollection('notes');
  assert.equal(notes.items[0].text, '原始');
});

test('导出会在 backups 目录留下文件', async () => {
  const { file } = await exportAll();
  assert.match(file, /^backup-\d{8}-\d{6}\.json$/);
  assert.ok((await fs.stat(path.join(BACKUP_DIR, file))).isFile());
});

test('导入前会留一份当前数据的快照', async () => {
  const { snapshot } = await importAll({ collections: { notes: { version: 1, items: [] } } });
  assert.match(snapshot, /^pre-import-\d{8}-\d{6}\.json$/);
  assert.ok((await fs.stat(path.join(BACKUP_DIR, snapshot))).isFile());
});

test('备份格式不对时明确报错', async () => {
  await assert.rejects(() => importAll({ nope: 1 }), /备份文件格式不对/);
});
