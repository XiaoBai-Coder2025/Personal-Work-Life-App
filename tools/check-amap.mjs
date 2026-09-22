// 高德配置诊断：分别走「直连高德」和「本机代理」两条路，把高德的原始返回打出来。
// 用法：node tools/check-amap.mjs   （读 data/settings.json，或 dist 下应用自己的 data）
import fs from 'node:fs';
import path from 'node:path';

function findDataDir() {
  const candidates = [
    process.env.PERSONAL_APP_DATA_DIR,
    'dist/个人工作生活-win32-x64/data',
    'data',
  ].filter(Boolean);
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'settings.json')));
}

const dir = findDataDir();
if (!dir) {
  console.log('没有找到 settings.json，请先在软件里填好 Key（数据与设置 → 接口 Key → 保存 Key）。');
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
const jsKey = (settings.amapJsKey ?? '').trim();
const secCode = (settings.amapSecCode ?? '').trim();
console.log(`读取配置：${path.join(dir, 'settings.json')}`);
console.log(`高德 JS Key：${jsKey ? `${jsKey.slice(0, 4)}…${jsKey.slice(-4)}（${jsKey.length} 位）` : '未填写'}`);
console.log(`安全密钥：${secCode ? `${secCode.slice(0, 4)}…${secCode.slice(-4)}（${secCode.length} 位）` : '未填写'}`);
console.log('（安全密钥一般是 32 位；如果两串完全一样，说明把 Key 抄进安全密钥了）');

if (!jsKey || !secCode) {
  console.log('Key 或安全密钥没填齐，先在软件里补齐。');
  process.exit(1);
}

async function probe(label, host, apiPath) {
  const url = new URL(host + apiPath);
  url.searchParams.set('key', jsKey);
  url.searchParams.set('jscode', secCode);
  url.searchParams.set('address', '南京大学');
  try {
    const res = await fetch(url);
    const text = (await res.text()).slice(0, 220).replace(/\s+/g, ' ');
    console.log(`\n[${label}] ${res.status}\n${text}`);
  } catch (err) {
    console.log(`\n[${label}] 请求失败：${err.message}`);
  }
}

console.log('\n=== 1. 直连高德（判断 Key 与安全密钥本身对不对）===');
await probe('直连 restapi', 'https://restapi.amap.com', '/v3/geocode/geo');

console.log('\n=== 2. 经过本机服务代理（判断代理链路对不对）===');
const port = process.env.PERSONAL_APP_PORT || '4317';
await probe('本机代理', `http://127.0.0.1:${port}`, '/_AMapService/v3/geocode/geo');

console.log('\n判断方法：');
console.log('  两段都报 INVALID_USER_KEY / INVALID_USER_SCODE → Key 或安全密钥填错了');
console.log('  第一段正常、第二段异常 → 代理链路的问题，把两段结果发给我');
console.log('  两段都正常（status=1）→ 配置没问题');
