import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineOnDate } from '../web/core/routine.js';

const 高数 = {
  id: 'r1',
  title: '高等数学',
  weekdays: [1, 3],
  from: '08:00',
  to: '09:40',
  place: '三教 302',
  startDate: '',
  endDate: '',
};

test('周一命中固定课表', () => {
  const result = routineOnDate([高数], '2026-09-21');
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '高等数学');
  assert.equal(result[0].kind, 'fixed');
  assert.equal(result[0].from, '08:00');
  assert.equal(result[0].place, '三教 302');
});

test('周二不命中只排周一与周三的课', () => {
  assert.deepEqual(routineOnDate([高数], '2026-09-22'), []);
});

test('过了生效区间就不再出现', () => {
  const 短课 = { ...高数, id: 'r2', startDate: '2026-09-01', endDate: '2026-09-18' };
  assert.deepEqual(routineOnDate([短课], '2026-09-21'), []);
});

test('展开结果带日期与来源标记', () => {
  const [item] = routineOnDate([高数], '2026-09-23');
  assert.equal(item.date, '2026-09-23');
  assert.equal(item.id, 'routine:r1');
});

test('周日用 7 表示', () => {
  const 周日晚课 = { ...高数, id: 'r3', weekdays: [7], from: '19:00', to: '21:00' };
  assert.equal(routineOnDate([周日晚课], '2026-09-20').length, 1);
  assert.equal(routineOnDate([周日晚课], '2026-09-21').length, 0);
});
