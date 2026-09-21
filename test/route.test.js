import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestOrder, totalCost, departPlan, haversineKm, estimateMinutes } from '../web/core/route.js';

const points = [
  { id: 'A', x: 0, y: 0 },
  { id: 'B', x: 10, y: 0 },
  { id: 'C', x: 0, y: 10 },
];
const cost = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));

test('总耗时是逐段之和', () => {
  assert.equal(totalCost(['A', 'B', 'C'], (a, b) => cost(
    points.find((p) => p.id === a),
    points.find((p) => p.id === b),
  )), 24);
});

test('优化顺序保持起点不变并给出更短的走法', () => {
  const worse = (a, b) => {
    const table = { 'A>B': 10, 'B>C': 14, 'A>C': 10, 'C>B': 10 };
    return table[`${a}>${b}`] ?? 99;
  };
  const result = bestOrder(points, worse);
  assert.equal(result.order[0], 'A');
  assert.equal(result.total, 20);
  assert.deepEqual(result.order, ['A', 'C', 'B']);
});

test('出发时间按到达时间倒推并留缓冲', () => {
  const plan = departPlan({ arriveAt: '15:00', travelMinutes: 22, buffer: 5 });
  assert.equal(plan.recommend, '14:33');
});

test('自己选的出发时间晚了会被算成迟到', () => {
  const plan = departPlan({ arriveAt: '15:00', travelMinutes: 22, chosen: '14:45' });
  assert.equal(plan.late, 7);
});

test('按推荐时间出发不会迟到', () => {
  const plan = departPlan({ arriveAt: '15:00', travelMinutes: 22 });
  assert.equal(plan.late, 0);
});

test('节假日系数会拉长耗时', () => {
  const normal = departPlan({ arriveAt: '15:00', travelMinutes: 20 });
  const holiday = departPlan({ arriveAt: '15:00', travelMinutes: 20, holidayFactor: 1.35 });
  assert.equal(normal.travel, 20);
  assert.equal(holiday.travel, 27);
});

test('同一点的距离是 0', () => {
  const point = { lng: 118.79, lat: 32.05 };
  assert.equal(haversineKm(point, point), 0);
});

test('一个纬度约等于 111 公里', () => {
  const km = haversineKm({ lng: 118.79, lat: 32 }, { lng: 118.79, lat: 33 });
  assert.ok(Math.abs(km - 111) < 2, `实际 ${km}`);
});

test('耗时估算含交通工具速度与等待时间', () => {
  assert.equal(estimateMinutes(10, 'metro'), 26);
  assert.equal(estimateMinutes(2, 'walk'), 24);
  assert.equal(estimateMinutes(0, 'drive'), 2);
});
