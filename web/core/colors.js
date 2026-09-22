// 按名字取色：同一个名字永远是同一个颜色，不同名字尽量分得开，深浅两套主题各一版。
// 色相之间留出间距，避免两个名字拿到看起来差不多的颜色。
export const PALETTE = [8, 26, 44, 62, 96, 132, 158, 176, 194, 214, 240, 268, 296, 326];

// 同一色相配三档明度，进一步拉开不同名字
export const TONES = [
  { s: 62, l: 46, d: 60 },
  { s: 48, l: 40, d: 54 },
  { s: 70, l: 52, d: 66 },
];

function hashOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < String(text ?? '').length; i += 1) {
    hash ^= String(text ?? '').charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function hueFor(title) {
  // 用除法把高位也搅进来，实测比直接取模分布均匀得多
  return PALETTE[Math.floor(hashOf(title) / 29) % PALETTE.length];
}

export function toneFor(title) {
  return TONES[Math.floor(hashOf(`${title}#tone`) / 7) % TONES.length];
}

export function colorFor(title) {
  const hue = hueFor(title);
  const tone = toneFor(title);
  return `light-dark(hsl(${hue} ${tone.s}% ${tone.l}%), hsl(${hue} ${tone.s}% ${tone.d}%))`;
}

export function softColorFor(title) {
  const hue = hueFor(title);
  const tone = toneFor(title);
  return `light-dark(hsl(${hue} ${tone.s}% ${tone.l}% / .13), hsl(${hue} ${tone.s}% ${tone.d}% / .2))`;
}
