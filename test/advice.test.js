import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvice } from '../web/core/advice.js';
import { themeAttrs } from '../web/core/theme.js';

const base = {
  plans: { items: [] },
  events: { items: [] },
  tasks: { items: [] },
  places: { items: [{ id: 'p1', name: '家' }, { id: 'p2', name: '学校' }] },
  routine: { items: [] },
};

test('下雨天给出带伞提醒', () => {
  const advice = buildAdvice({ dateKey: '2026-09-22', weather: 'rain', data: base });
  const hit = advice.find((a) => a.by.includes('天气'));
  assert.ok(hit);
  assert.match(hit.text, /伞/);
});

test('三天内到期的截止事项会被点名', () => {
  const data = {
    ...base,
    events: { items: [{ id: 'e1', date: '2026-09-24', title: '国赛报名截止', kind: 'due' }] },
  };
  const advice = buildAdvice({ dateKey: '2026-09-22', weather: 'sunny', data });
  const hit = advice.find((a) => a.by.includes('截止'));
  assert.ok(hit);
  assert.match(hit.text, /国赛报名截止/);
});

test('临近交付且没做完的任务会被提醒', () => {
  const data = {
    ...base,
    tasks: {
      items: [{
        id: 'k1',
        name: '张同学 · 文书定稿',
        due: '2026-09-24',
        perDay: 120,
        phases: ['写初稿'],
        plan: [{ d: '09-22', w: '周二', from: '14:00', to: '15:00', ph: 0, done: false }],
      }],
    },
  };
  const advice = buildAdvice({ dateKey: '2026-09-22', weather: 'sunny', data });
  const hit = advice.find((a) => a.by.includes('任务'));
  assert.ok(hit);
  assert.match(hit.text, /张同学/);
});

test('同一天排超了会提示', () => {
  const data = {
    ...base,
    tasks: {
      items: [{
        id: 'k2',
        name: '超排的任务',
        due: '2026-10-01',
        perDay: 60,
        phases: ['A'],
        plan: [
          { d: '09-22', w: '周二', from: '09:00', to: '10:00', ph: 0, done: false },
          { d: '09-22', w: '周二', from: '10:00', to: '11:00', ph: 0, done: false },
        ],
      }],
    },
  };
  const advice = buildAdvice({ dateKey: '2026-09-22', weather: 'sunny', data });
  assert.ok(advice.some((a) => /超/.test(a.text)));
});

test('没有常用地址时提示去设置里补', () => {
  const data = { ...base, places: { items: [] } };
  const advice = buildAdvice({ dateKey: '2026-09-22', weather: 'sunny', data });
  assert.ok(advice.some((a) => a.by.includes('设置')));
});

test('明暗三态与配色转换成页面属性', () => {
  assert.equal(themeAttrs({ appearance: 'dark', theme: 'blue' }).scheme, 'dark');
  assert.equal(themeAttrs({ appearance: 'auto', theme: 'blue' }).scheme, 'light dark');
  const weather = themeAttrs({ appearance: 'light', theme: 'weather', weather: 'rain' });
  assert.equal(weather.weather, 'rain');
  assert.equal(themeAttrs({ appearance: 'light', theme: 'green' }).weather, undefined);
});
