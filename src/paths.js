import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIR = path.join(ROOT, 'web');
export const DATA_DIR = process.env.PERSONAL_APP_DATA_DIR
  ? path.resolve(process.env.PERSONAL_APP_DATA_DIR)
  : path.join(ROOT, 'data');
export const BACKUP_DIR = path.join(path.dirname(DATA_DIR), 'backups');
export const PORT = Number(process.env.PERSONAL_APP_PORT || 4317);
