import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const SS = 3;
const ACCENT = [47, 111, 235];
const BAR = [122, 167, 255];
const WHITE = [255, 255, 255];
const RADIUS = 56;

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function toPng(rgba) {
  const stride = SIZE * 4 + 1;
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function toIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

function insideRoundRect(x, y) {
  const r = RADIUS;
  if (x < r && y < r) return Math.hypot(x - r, y - r) <= r;
  if (x > SIZE - r && y < r) return Math.hypot(x - (SIZE - r), y - r) <= r;
  if (x < r && y > SIZE - r) return Math.hypot(x - r, y - (SIZE - r)) <= r;
  if (x > SIZE - r && y > SIZE - r) return Math.hypot(x - (SIZE - r), y - (SIZE - r)) <= r;
  return true;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const sumR = new Float64Array(SIZE * SIZE);
const sumG = new Float64Array(SIZE * SIZE);
const sumB = new Float64Array(SIZE * SIZE);
const hits = new Float64Array(SIZE * SIZE);

for (let sy = 0; sy < SIZE * SS; sy += 1) {
  for (let sx = 0; sx < SIZE * SS; sx += 1) {
    const x = (sx + 0.5) / SS;
    const y = (sy + 0.5) / SS;
    if (!insideRoundRect(x, y)) continue;
    let color = ACCENT;
    if (y >= 84 && y <= 100 && x >= 54 && x <= 202) color = BAR;
    if (distanceToSegment(x, y, 84, 168, 116, 200) <= 13
      || distanceToSegment(x, y, 116, 200, 176, 130) <= 13) color = WHITE;
    const index = Math.floor(y) * SIZE + Math.floor(x);
    sumR[index] += color[0];
    sumG[index] += color[1];
    sumB[index] += color[2];
    hits[index] += 1;
  }
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
const samples = SS * SS;
for (let i = 0; i < SIZE * SIZE; i += 1) {
  if (!hits[i]) continue;
  rgba[i * 4] = Math.round(sumR[i] / hits[i]);
  rgba[i * 4 + 1] = Math.round(sumG[i] / hits[i]);
  rgba[i * 4 + 2] = Math.round(sumB[i] / hits[i]);
  rgba[i * 4 + 3] = Math.round((hits[i] / samples) * 255);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
fs.mkdirSync(dir, { recursive: true });
const png = toPng(rgba);
fs.writeFileSync(path.join(dir, 'icon.png'), png);
fs.writeFileSync(path.join(dir, 'icon.ico'), toIco(png));
console.log(`已生成 build/icon.png（${png.length} 字节）与 build/icon.ico`);
