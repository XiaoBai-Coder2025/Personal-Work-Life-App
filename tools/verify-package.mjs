import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as asar from '@electron/asar';

const ARCHIVE = process.argv[2] ?? 'dist/个人工作生活-win32-x64/resources/app.asar';
const CHECKS = [
  ['web\\core\\timetable.js', 'previewTimetable'],
  ['web\\core\\timetable.js', 'weekIndexOf'],
  ['web\\modules\\settings.js', '检测地图与接口'],
  ['web\\modules\\settings.js', 'Web服务 Key'],
  ['web\\modules\\settings.js', 'fillPreview'],
  ['web\\core\\amap-config.js', 'securityJsCode'],
  ['web\\modules\\map.js', '安全密钥'],
  ['web\\modules\\map.js', '直接在地图上点一下'],
  ['web\\core\\amap.js', 'lngLatToName'],
  ['server.js', 'place/text'],
  ['web\\styles.css', '--shadow-md'],
  ['web\\styles.css', '.preview'],
];

let bad = 0;
for (const [rel, mark] of CHECKS) {
  const buf = asar.extractFile(ARCHIVE, rel);
  if (rel.endsWith('.js')) {
    const tmp = path.join(os.tmpdir(), 'pkg-check.js');
    fs.writeFileSync(tmp, buf);
    execFileSync(process.execPath, ['--check', tmp]);
  }
  const found = buf.toString('utf8').includes(mark);
  if (!found) bad += 1;
  console.log(`${found ? '有' : '缺'} ${rel} → ${mark}`);
}
console.log(bad ? `打包内容缺少 ${bad} 项` : '打包内容与源码一致');
process.exit(bad ? 1 : 0);
