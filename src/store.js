import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

export const COLLECTIONS = [
  'profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'chats', 'settings',
];

const OBJECT_ONLY = new Set(['profile', 'settings']);
const queues = new Map();

export function isCollection(name) {
  return COLLECTIONS.includes(name);
}

export function emptyCollection(name) {
  return OBJECT_ONLY.has(name) ? { version: 1 } : { version: 1, items: [] };
}

const fileOf = (name) => path.join(DATA_DIR, `${name}.json`);

function serialize(name, job) {
  const previous = queues.get(name) ?? Promise.resolve();
  const next = previous.then(job, job);
  queues.set(name, next.then(() => {}, () => {}));
  return next;
}

async function put(name, data, { keepBackup }) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = fileOf(name);
  if (keepBackup) {
    try {
      await fs.copyFile(file, `${file}.bak`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return data;
}

export function writeCollection(name, data) {
  return serialize(name, () => put(name, data, { keepBackup: true }));
}

export function readCollection(name) {
  return serialize(name, async () => {
    try {
      return JSON.parse(await fs.readFile(fileOf(name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return emptyCollection(name);
      return recover(name, err);
    }
  });
}

async function recover(name, err) {
  try {
    const data = JSON.parse(await fs.readFile(`${fileOf(name)}.bak`, 'utf8'));
    await put(name, data, { keepBackup: false });
    console.warn(`[store] ${name}.json 读取失败，已用备份恢复：${err.message}`);
    return data;
  } catch {
    console.warn(`[store] ${name}.json 读取失败且无可用备份，返回空数据：${err.message}`);
    return emptyCollection(name);
  }
}

export async function readAll() {
  const all = {};
  for (const name of COLLECTIONS) all[name] = await readCollection(name);
  return all;
}
