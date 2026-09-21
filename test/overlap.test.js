import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOverlaps } from '../web/core/overlap.js';

test('首尾相接不算重叠', () => {
  const items = [
    { title: 'A', from: '09:00', to: '10:00' },
    { title: 'B', from: '10:00', to: '11:00' },
  ];
  assert.deepEqual(findOverlaps(items), []);
});

test('部分重叠算出分钟数', () => {
  const items = [
    { title: '高等数学', from: '08:00', to: '09:40' },
    { title: '面试模拟', from: '09:00', to: '10:00' },
  ];
  const result = findOverlaps(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].minutes, 40);
  assert.equal(result[0].first.title, '高等数学');
  assert.equal(result[0].second.title, '面试模拟');
});

test('包含关系按较短的一段计算', () => {
  const items = [
    { title: '大块', from: '09:00', to: '12:00' },
    { title: '小块', from: '10:00', to: '11:00' },
  ];
  assert.equal(findOverlaps(items)[0].minutes, 60);
});

test('全天条目不参与重叠判断', () => {
  const items = [
    { title: '截止', to: '' },
    { title: '任务', from: '09:00', to: '10:00' },
  ];
  assert.deepEqual(findOverlaps(items), []);
});

test('三件事互相重叠时逐对给出结果', () => {
  const items = [
    { title: 'A', from: '09:00', to: '11:00' },
    { title: 'B', from: '09:30', to: '10:30' },
    { title: 'C', from: '10:00', to: '12:00' },
  ];
  assert.equal(findOverlaps(items).length, 3);
});
