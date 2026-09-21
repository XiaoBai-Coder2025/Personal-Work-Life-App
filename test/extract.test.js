import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from '../src/extract.js';

test('txt 文件直接读出正文', async () => {
  const text = await extractText('通知.txt', Buffer.from('报名截止 2026-09-25', 'utf8'));
  assert.match(text, /2026-09-25/);
});

test('csv 与 md 也能读', async () => {
  assert.match(await extractText('比赛.csv', Buffer.from('比赛,日期\n国赛,9/25', 'utf8')), /国赛/);
  assert.match(await extractText('日程.md', Buffer.from('# 日程\n- 9/25 报名', 'utf8')), /报名/);
});

test('坏掉的 pdf 与 docx 给出明确提示而不是猜内容', async () => {
  await assert.rejects(() => extractText('通知.pdf', Buffer.from('不是真的 PDF', 'utf8')));
  await assert.rejects(() => extractText('通知.docx', Buffer.from('不是真的 docx', 'utf8')));
});

test('不认识的格式也说清楚', async () => {
  await assert.rejects(() => extractText('数据.xlsx', Buffer.from('x', 'utf8')), /txt/);
});
