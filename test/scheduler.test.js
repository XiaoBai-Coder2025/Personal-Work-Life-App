import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots, placeItems, buildDay, relayTimes } from '../web/core/scheduler.js';

test('空档计算：锚点之间与两端', () => {
  const anchors = [
    { from: '08:00', to: '09:40', title: '高等数学' },
    { from: '10:00', to: '11:40', title: '人工智能导论' },
  ];
  const free = freeSlots(anchors, '07:00', '23:00');
  assert.deepEqual(free.map((g) => [g.from, g.to]), [
    ['07:00', '08:00'],
    ['09:40', '10:00'],
    ['11:40', '23:00'],
  ]);
});

test('没有锚点时整天都是空档', () => {
  const free = freeSlots([], '08:00', '20:00');
  assert.equal(free.length, 1);
  assert.equal(free[0].minutes, 720);
});

test('任务按顺序填进最早的空档', () => {
  const anchors = [{ from: '08:00', to: '09:40', title: '课' }];
  const items = [{ title: '核对材料', minutes: 30 }];
  const { placed, unscheduled } = placeItems(freeSlots(anchors, '07:00', '23:00'), items, 0);
  assert.equal(placed[0].from, '07:00');
  assert.equal(placed[0].to, '07:30');
  assert.equal(unscheduled.length, 0);
});

test('装不下的任务进未排列表', () => {
  const items = [{ title: '大任务', minutes: 400 }];
  const { placed, unscheduled } = placeItems([{ from: '07:00', to: '08:00', minutes: 60 }], items, 0);
  assert.equal(placed.length, 0);
  assert.equal(unscheduled[0].title, '大任务');
});

test('截止更近的排在前面', () => {
  const items = [
    { title: '慢', minutes: 60, due: '2026-10-01' },
    { title: '急', minutes: 60, due: '2026-09-23' },
  ];
  const { placed } = placeItems([{ from: '07:00', to: '09:00', minutes: 120 }], items, 0);
  assert.equal(placed[0].title, '急');
  assert.equal(placed[1].title, '慢');
});

test('缓冲会拉开两件事的间隔', () => {
  const items = [{ title: 'A', minutes: 30 }, { title: 'B', minutes: 30 }];
  const { placed, unscheduled } = placeItems([{ from: '07:00', to: '08:10', minutes: 70 }], items, 5);
  assert.equal(placed[0].from, '07:00');
  assert.equal(placed[1].from, '07:35');
  assert.equal(unscheduled.length, 0);
});

test('buildDay 汇总锚点、任务时段、空档与冲突', () => {
  const result = buildDay({
    dateKey: '2026-09-22',
    routineItems: [{
      id: 'r1', title: '人工智能导论', weekdays: [2], from: '10:00', to: '11:40', place: '一教 105',
    }],
    events: [{ id: 'e1', date: '2026-09-22', from: '19:00', to: '20:30', title: '六级真题', kind: 'task' }],
    tasks: [{
      id: 'k1',
      name: '张同学 · 文书定稿',
      phases: ['写初稿'],
      plan: [
        { d: '09-22', w: '周二', from: '10:30', to: '11:30', ph: 0, done: false },
        { d: '09-22', w: '周二', from: '14:00', to: '15:00', ph: 0, done: true },
      ],
    }],
    profile: { wake: '07:00', sleep: '23:00' },
  });

  assert.equal(result.anchors.length, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, '张同学 · 文书定稿');
  assert.equal(result.items[0].from, '10:30');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].minutes, 60);
  assert.ok(result.free.length >= 1);
});

test('buildDay 把无时间的截止事项单独列出', () => {
  const result = buildDay({
    dateKey: '2026-09-25',
    events: [{ id: 'e9', date: '2026-09-25', to: '', title: '国赛报名截止', kind: 'due' }],
  });
  assert.equal(result.dueAllDay.length, 1);
  assert.equal(result.dueAllDay[0].title, '国赛报名截止');
});

test('按顺序重排后时间首尾相接', () => {
  const entries = [
    { title: 'A', from: '14:00', to: '15:00' },
    { title: 'B', from: '19:00', to: '20:30' },
  ];
  const out = relayTimes(entries);
  assert.equal(out[0].from, '14:00');
  assert.equal(out[0].to, '15:00');
  assert.equal(out[1].from, '15:00');
  assert.equal(out[1].to, '16:30');
});

test('重排保持每条任务的时长不变', () => {
  const out = relayTimes([
    { title: 'A', from: '09:00', to: '09:30' },
    { title: 'B', from: '10:00', to: '11:00' },
    { title: 'C', from: '14:00', to: '14:15' },
  ]);
  assert.deepEqual(out.map((x) => [x.from, x.to]), [
    ['09:00', '09:30'],
    ['09:30', '10:30'],
    ['10:30', '10:45'],
  ]);
});
