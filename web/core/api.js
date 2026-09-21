export const COLLECTIONS = [
  'profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'chats', 'settings',
];

const OBJECT_ONLY = new Set(['profile', 'settings']);

export function emptyOf(name) {
  return OBJECT_ONLY.has(name) ? { version: 1 } : { version: 1, items: [] };
}

async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data;
}

export function load(name) {
  return request(`/api/data/${name}`);
}

export function save(name, data) {
  return request(`/api/data/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function exportBackup() {
  return request('/api/backup/export', { method: 'POST' });
}

export function importBackup(payload) {
  return request('/api/backup/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
