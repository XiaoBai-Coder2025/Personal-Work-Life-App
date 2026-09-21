import { load, save } from './api.js';

export async function addDraft(entry) {
  const pending = await load('pending');
  const items = pending.items ?? [];
  items.push({ id: `d${Date.now()}${items.length}`, ...entry });
  await save('pending', { version: 1, items });
  return items.length;
}
