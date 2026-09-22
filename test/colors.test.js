import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorFor, hueFor, PALETTE, TONES } from '../web/core/colors.js';

test('同一个名字每次都得到同一个颜色', () => {
  assert.equal(colorFor('高等数学'), colorFor('高等数学'));
  assert.equal(hueFor('张同学 · 文书定稿'), hueFor('张同学 · 文书定稿'));
});

test('不同名字几乎都能得到不同颜色', () => {
  const names = ['高等数学', '人工智能导论', '大学英语', '体育', '小组讨论', '面试模拟', '六级真题', '课程论文'];
  const colors = new Set(names.map(colorFor));
  assert.ok(colors.size >= 7, `8 个名字只出现了 ${colors.size} 种颜色`);
});

test('颜色是明暗两套都能用的合法 CSS 值', () => {
  const color = colorFor('高等数学');
  assert.match(color, /^light-dark\(hsl\(/);
  assert.match(color, /hsl\(\d+ \d{2}% \d{2}%\), hsl\(\d+ \d{2}% \d{2}%\)\)$/);
});

test('调色板里的色相不重复', () => {
  assert.equal(new Set(PALETTE).size, PALETTE.length);
  assert.ok(PALETTE.length >= 12, `调色板只有 ${PALETTE.length} 个色相`);
  assert.ok(TONES.length >= 2);
});
