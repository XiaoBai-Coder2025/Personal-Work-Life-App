import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayTotals, budgetState, replan } from '../web/core/taskplan.js';
import { toMinutes } from '../web/core/dates.js';

const 双阶段任务 = {
  id: 'k1',
  perDay: 120,
  phases: ['写初稿', '定稿'],
  plan: [
    { d: '09-23', w: '周三', from: '09:00', to: '10:00', ph: 0, done: false },
    { d: '09-23', w: '周三', from: '10:00', to: '11:00', ph: 1, done: false },
    { d: '09-24', w: '周四', from: '20:00', to: '21:00', ph: 1, done: false },
  ],
};

test('同一天分给多个阶段时按天相加', () => {
  const totals = dayTotals(双阶段任务);
  assert.equal(totals[0].d, '09-23');
  assert.equal(totals[0].minutes, 120);
  assert.equal(totals[0].phases.length, 2);
});

test('超出每天投入上限的天被标出', () => {
  const state = budgetState({ perDay: 60, plan: 双阶段任务.plan });
  assert.deepEqual(state.over.map((x) => x.d), ['09-23']);
});

test('没排满的天也被标出', () => {
  const state = budgetState(双阶段任务);
  assert.deepEqual(state.short.map((x) => x.d), ['09-24']);
  assert.deepEqual(state.over, []);
});

test('重新安排会跳过周末', () => {
  const task = { id: 'k2', ms: '2026-09-28', perDay: 120, phases: ['A', 'B'], plan: [] };
  const out = replan(task, '2026-09-24', 'today');
  assert.deepEqual(out.map((x) => x.d), ['09-24', '09-25', '09-28']);
});

test('重新安排后每段时长等于每天投入上限', () => {
  const task = { id: 'k3', ms: '2026-09-25', perDay: 90, phases: ['A', 'B'], plan: [] };
  const out = replan(task, '2026-09-21', 'today');
  assert.ok(out.every((x) => toMinutes(x.to) - toMinutes(x.from) === 90));
});

test('阶段按顺序从前往后分配', () => {
  const task = { id: 'k4', ms: '2026-09-25', perDay: 120, phases: ['A', 'B', 'C'], plan: [] };
  const out = replan(task, '2026-09-21', 'today');
  const phases = out.map((x) => x.ph);
  assert.deepEqual(phases, [...phases].sort((a, b) => a - b));
  assert.equal(phases[0], 0);
  assert.equal(phases[phases.length - 1], 2);
});

test('从明天开始时不排今天', () => {
  const task = { id: 'k5', ms: '2026-09-25', perDay: 120, phases: ['A'], plan: [] };
  const out = replan(task, '2026-09-21', 'tomorrow');
  assert.ok(!out.some((x) => x.d === '09-21'));
  assert.equal(out[0].d, '09-22');
});

test('没有交付日时不会无限铺开', () => {
  const task = { id: 'k6', ms: '', perDay: 120, phases: ['A'], plan: [] };
  const out = replan(task, '2026-09-21', 'today');
  assert.ok(out.length <= 10);
});
