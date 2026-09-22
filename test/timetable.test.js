import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimetable, weekKindOf } from '../web/core/timetable.js';
import { routineOnDate } from '../web/core/routine.js';

test('解析一行完整课表', () => {
  const list = parseTimetable('高等数学 | 周一 | 08:00-09:40 | 单周 | 三教 302');
  assert.equal(list.length, 1);
  assert.equal(list[0].title, '高等数学');
  assert.deepEqual(list[0].weekdays, [1]);
  assert.equal(list[0].from, '08:00');
  assert.equal(list[0].to, '09:40');
  assert.equal(list[0].weeks, 'odd');
  assert.equal(list[0].place, '三教 302');
});

test('一门课占多个星期', () => {
  const [item] = parseTimetable('人工智能导论 | 周二 周四 | 10:00-11:40 | 每周');
  assert.deepEqual(item.weekdays, [2, 4]);
  assert.equal(item.weeks, 'all');
});

test('单双周可以写在任意位置', () => {
  const [a] = parseTimetable('体育 | 双周 | 周三 | 15:00-16:30');
  assert.equal(a.weeks, 'even');
  assert.deepEqual(a.weekdays, [3]);
});

test('逗号和顿号也能当分隔符', () => {
  const [item] = parseTimetable('大学英语，周五，08:00~09:40，双周，一教');
  assert.equal(item.title, '大学英语');
  assert.deepEqual(item.weekdays, [5]);
  assert.equal(item.from, '08:00');
  assert.equal(item.to, '09:40');
  assert.equal(item.weeks, 'even');
});

test('空行与注释会被跳过', () => {
  const list = parseTimetable(['# 这是我的课表', '', '高数 | 周一 | 08:00-09:40', '  '].join('\n'));
  assert.equal(list.length, 1);
});

test('缺时间或星期时明确报错并指出第几行', () => {
  assert.throws(() => parseTimetable('高数 | 周一'), /第 1 行/);
  assert.throws(() => parseTimetable('高数 | 08:00-09:40'), /第 1 行/);
});

test('没有学期起始周时按自然周交替', () => {
  assert.notEqual(weekKindOf('2026-09-21'), weekKindOf('2026-09-28'));
  assert.equal(weekKindOf('2026-09-21'), weekKindOf('2026-10-05'));
});

test('设了学期起始周就从第一周开始数单双', () => {
  const termStart = '2026-09-07';
  assert.equal(weekKindOf('2026-09-07', termStart), 'odd');
  assert.equal(weekKindOf('2026-09-14', termStart), 'even');
  assert.equal(weekKindOf('2026-09-21', termStart), 'odd');
});

test('单周课只在单周出现', () => {
  const items = [{
    id: 'r1', title: '高数', weekdays: [1], from: '08:00', to: '09:40', weeks: 'odd', startDate: '', endDate: '',
  }];
  const termStart = '2026-09-07';
  assert.equal(routineOnDate(items, '2026-09-07', { termStart }).length, 1);
  assert.equal(routineOnDate(items, '2026-09-14', { termStart }).length, 0);
  assert.equal(routineOnDate(items, '2026-09-21', { termStart }).length, 1);
});

test('每周的课不受单双周影响', () => {
  const items = [{
    id: 'r2', title: '英语', weekdays: [5], from: '08:00', to: '09:40', weeks: 'all', startDate: '', endDate: '',
  }];
  const termStart = '2026-09-07';
  assert.equal(routineOnDate(items, '2026-09-11', { termStart }).length, 1);
  assert.equal(routineOnDate(items, '2026-09-18', { termStart }).length, 1);
});
