import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function jsFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...await jsFiles(full));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

test('所有前端与服务端脚本语法正确', async () => {
  const files = [
    ...await jsFiles(path.join(ROOT, 'web')),
    ...await jsFiles(path.join(ROOT, 'src')),
    path.join(ROOT, 'server.js'),
    path.join(ROOT, 'main.js'),
  ];
  assert.ok(files.length >= 15, `只找到 ${files.length} 个脚本`);
  const broken = [];
  for (const file of files) {
    try {
      await run(process.execPath, ['--check', file]);
    } catch (err) {
      broken.push(`${path.relative(ROOT, file)}: ${String(err.stderr || err.message).split('\n')[0]}`);
    }
  }
  assert.deepEqual(broken, [], `语法错误的文件：\n${broken.join('\n')}`);
});
