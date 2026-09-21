import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../web/core/context.js';

const data = {
  profile: { identity: '在校大学生（普通本科）', wake: '07:00', sleep: '23:00' },
  plans: {
    version: 1,
    items: [
      { id: 'a', date: '2026-09-22', from: '14:00', to: '15:00', title: '文书初稿', manual: true },
      { id: 'b', date: '2026-09-21', from: '09:00', to: '10:00', title: '昨天的' },
    ],
  },
  tasks: {
    version: 1,
    items: [{
      id: 'k1',
      name: '张同学 · 文书定稿',
      due: '2026-09-24',
      phases: ['写初稿', '定稿'],
      plan: [{ d: '09-22', from: '14:00', to: '15:00', ph: 0, done: false }],
    }],
  },
  events: { version: 1, items: [{ id: 'e1', date: '2026-09-23', from: '09:00', to: '10:00', title: '面试模拟' }] },
  routine: { version: 1, items: [{ id: 'r1', title: '人工智能导论', weekdays: [2], from: '10:00', to: '11:40', place: '一教 105' }] },
  places: { version: 1, items: [{ id: 'p1', name: '家', tag: '常用' }] },
};

test('按模块打包上下文并列出可读条目', () => {
  const context = buildContext({ view: 'today', dateKey: '2026-09-22', data });
  const labels = context.items.map((x) => x.label);
  assert.ok(labels.some((x) => x.includes('今日计划')));
  assert.ok(labels.some((x) => x.includes('长周期任务')));
  const plans = context.items.find((x) => x.label.includes('今日计划'));
  assert.equal(plans.items.length, 1);
  assert.match(plans.items[0], /文书初稿/);
});

test('上下文里带上当天的固定课表', () => {
  const context = buildContext({ view: 'today', dateKey: '2026-09-22', data });
  const routine = context.items.find((x) => x.label.includes('课表'));
  assert.equal(routine.items.length, 1);
  assert.match(routine.items[0], /人工智能导论/);
});

test('每个界面给出各自的提示语与快捷问题', () => {
  const today = buildContext({ view: 'today', dateKey: '2026-09-22', data });
  const map = buildContext({ view: 'map', dateKey: '2026-09-22', data });
  assert.notEqual(today.placeholder, map.placeholder);
  assert.ok(today.quick.length >= 1);
  assert.ok(map.quick.length >= 1);
});

test('交给模型的文本里包含本机数据摘要', () => {
  const context = buildContext({ view: 'work', dateKey: '2026-09-22', data });
  assert.match(context.prompt, /张同学/);
  assert.ok(context.prompt.length > 40);
});
