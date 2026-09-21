import { save } from './api.js';
import { addDays, parseKey, todayKey } from './dates.js';
import { replan } from './taskplan.js';

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function nextWorkday(offset) {
  let key = addDays(todayKey(), offset);
  while ([0, 6].includes(parseKey(key).getDay())) key = addDays(key, 1);
  return key;
}

export async function fillSampleData() {
  const today = todayKey();
  const due = nextWorkday(6);
  const examDue = addDays(today, 20);

  await save('profile', {
    version: 1,
    identity: '在校大学生（普通本科）',
    wake: '07:00',
    sleep: '23:30',
    commute: '地铁',
  });

  await save('places', {
    version: 1,
    items: [
      { id: 'sample-home', name: '家', tag: '常用', lng: null, lat: null },
      { id: 'sample-school', name: '学校', tag: '常用', lng: null, lat: null },
      { id: 'sample-lib', name: '图书馆', tag: '常去', lng: null, lat: null },
    ],
  });

  await save('routine', {
    version: 1,
    items: [
      {
        id: 'sample-r1', title: '高等数学', weekdays: [1, 3], from: '08:00', to: '09:40', place: '三教 302', startDate: '', endDate: '',
      },
      {
        id: 'sample-r2', title: '人工智能导论', weekdays: [2, 4], from: '10:00', to: '11:40', place: '一教 105', startDate: '', endDate: '',
      },
    ],
  });

  await save('events', {
    version: 1,
    items: [
      { id: 'sample-e1', date: nextWorkday(2), to: '', title: '国赛报名截止', kind: 'due' },
      { id: 'sample-e2', date: nextWorkday(1), from: '15:00', to: '16:00', title: '面试模拟', kind: 'task' },
      { id: 'sample-e3', date: nextWorkday(4), from: '19:00', to: '20:00', title: '小组讨论', kind: 'task' },
    ],
  });

  await save('notes', {
    version: 1,
    items: [
      { id: 'sample-n1', text: '记得找老师要推荐信' },
      { id: 'sample-n2', text: '图书馆的书周五到期' },
    ],
  });

  await save('pending', {
    version: 1,
    items: [{
      id: 'sample-p1', kind: 'event', title: '整理报名材料', date: today, from: '20:00', to: '20:30', note: '示例草稿',
    }],
  });

  const paper = {
    id: 'sample-k1',
    name: '课程论文初稿',
    from: today,
    to: due,
    due,
    perDay: 120,
    phases: ['选题', '写初稿', '收尾', '交付'],
    phase: 0,
    risk: '中',
    dep: '示例任务，可以直接改或删',
    plan: [],
  };
  paper.plan = replan(paper, today, 'today');

  const exam = {
    id: 'sample-k2',
    name: '六级备考 · 真题阶段',
    from: today,
    to: examDue,
    due: examDue,
    perDay: 90,
    phases: ['词汇', '真题', '听力', '模考'],
    phase: 1,
    risk: '低',
    dep: '示例任务，每周二、四、六各 1.5 小时',
    plan: [],
  };
  exam.plan = replan(exam, today, 'tomorrow').filter((_slot, index) => index % 2 === 0);

  await save('tasks', { version: 1, items: [paper, exam] });

  return { tasks: 2, notes: 2, events: 3, routine: 2, places: 3 };
}

export function weekdayName(key) {
  return WEEKDAY_NAMES[parseKey(key).getDay()];
}
