import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PORT, WEB_DIR } from './src/paths.js';
import { isCollection, readCollection, writeCollection } from './src/store.js';
import { exportAll, importAll } from './src/backup.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const MAX_BODY = 25 * 1024 * 1024;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('请求内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) return send(res, 403, { error: '非法路径' });
  try {
    return send(res, 200, await fs.readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    return send(res, 404, { error: '找不到页面' });
  }
}

async function handleApi(req, res, parts) {
  if (parts[1] === 'health') return send(res, 200, { ok: true });

  if (parts[1] === 'data' && parts[2]) {
    const name = parts[2];
    if (!isCollection(name)) return send(res, 404, { error: '未知数据集合' });
    if (req.method === 'GET') return send(res, 200, await readCollection(name));
    if (req.method === 'PUT') {
      let data;
      try {
        data = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: '请求内容不是合法 JSON' });
      }
      return send(res, 200, await writeCollection(name, data));
    }
    return send(res, 405, { error: '不支持的方法' });
  }

  if (parts[1] === 'backup' && parts[2] === 'export' && req.method === 'POST') {
    return send(res, 200, await exportAll());
  }

  if (parts[1] === 'backup' && parts[2] === 'import' && req.method === 'POST') {
    try {
      return send(res, 200, await importAll(JSON.parse(await readBody(req))));
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  return send(res, 404, { error: '没有这个接口' });
}

async function handleAmap(req, res, url, fetchImpl) {
  const settings = await readCollection('settings');
  const jscode = settings?.amapSecCode;
  if (!jscode) return send(res, 400, { error: '还没有配置高德安全密钥，请到「数据与设置」里填写。' });
  const target = new URL(`https://restapi.amap.com/${url.pathname.replace(/^\/_AMapService\//, '')}`);
  for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
  target.searchParams.set('jscode', jscode);
  const upstream = await fetchImpl(target.toString());
  const text = await upstream.text();
  const type = upstream.headers?.get?.('content-type') ?? 'application/json; charset=utf-8';
  return send(res, upstream.status ?? 200, text, type);
}

export function createServer({ fetchImpl = globalThis.fetch } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (parts[0] === '_AMapService') {
        if (req.method !== 'GET') return send(res, 405, { error: '不支持的方法' });
        return await handleAmap(req, res, url, fetchImpl);
      }
      if (parts[0] === 'api') return await handleApi(req, res, parts);
      if (req.method !== 'GET') return send(res, 405, { error: '不支持的方法' });
      return await serveStatic(res, url.pathname);
    } catch (err) {
      console.error('[server]', err);
      return send(res, 500, { error: err.message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.on('error', (err) => {
    const message = err.code === 'EADDRINUSE'
      ? `端口 ${PORT} 已被占用，请关掉占用它的程序后重试。`
      : `服务启动失败：${err.message}`;
    console.error(message);
    process.exit(1);
  });
  server.listen(PORT, () => console.log(`本地服务已启动：http://localhost:${PORT}`));
}
