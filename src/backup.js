import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKUP_DIR } from './paths.js';
import { COLLECTIONS, readAll, writeCollection } from './store.js';

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function exportAll() {
  const data = {
    app: 'personal-work-life',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: await readAll(),
  };
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const file = `backup-${stamp()}.json`;
  await fs.writeFile(path.join(BACKUP_DIR, file), JSON.stringify(data, null, 2), 'utf8');
  return { file, data };
}

export async function importAll(payload) {
  const collections = payload?.collections;
  if (!collections || typeof collections !== 'object') throw new Error('备份文件格式不对');
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const snapshot = `pre-import-${stamp()}.json`;
  await fs.writeFile(
    path.join(BACKUP_DIR, snapshot),
    JSON.stringify({ collections: await readAll() }, null, 2),
    'utf8',
  );
  for (const name of COLLECTIONS) {
    if (collections[name]) await writeCollection(name, collections[name]);
  }
  return { snapshot };
}
