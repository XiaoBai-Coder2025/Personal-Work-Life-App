import { addDays, parseKey, toMinutes, toTime } from './dates.js';

export const DEFAULT_PER_DAY = 120;
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DEFAULT_START = '20:00';
const MAX_DAYS = 10;

const isWorkday = (key) => ![0, 6].includes(parseKey(key).getDay());

export function dayTotals(task) {
  const map = new Map();
  for (const slot of task.plan ?? []) {
    if (!map.has(slot.d)) map.set(slot.d, []);
    map.get(slot.d).push(slot);
  }
  return [...map.entries()]
    .map(([d, slots]) => ({
      d,
      minutes: slots.reduce((sum, s) => sum + Math.max(0, toMinutes(s.to) - toMinutes(s.from)), 0),
      phases: [...new Set(slots.map((s) => s.ph))].sort((a, b) => a - b),
      slots,
    }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

export function budgetState(task) {
  const perDay = task.perDay || DEFAULT_PER_DAY;
  const totals = dayTotals(task);
  return {
    perDay,
    totals,
    over: totals.filter((x) => x.minutes > perDay),
    short: totals.filter((x) => x.minutes < perDay),
  };
}

export function replan(task, startKey, mode = 'today') {
  const perDay = task.perDay || DEFAULT_PER_DAY;
  const last = task.due || task.ms || addDays(startKey, 6);
  const days = [];
  let cursor = mode === 'tomorrow' ? addDays(startKey, 1) : startKey;
  while (cursor <= last && days.length < MAX_DAYS) {
    if (isWorkday(cursor)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  if (!days.length) return [];
  const phases = task.phases?.length ? task.phases : ['准备'];
  const perPhase = Math.max(1, Math.ceil(days.length / phases.length));
  const from = DEFAULT_START;
  const to = toTime(toMinutes(from) + perDay);
  return days.map((key, index) => ({
    d: key.slice(5),
    w: WEEKDAY_NAMES[parseKey(key).getDay()],
    from,
    to,
    ph: Math.min(phases.length - 1, Math.floor(index / perPhase)),
    done: false,
  }));
}

export function doneRatio(task) {
  const plan = task.plan ?? [];
  if (!plan.length) return 0;
  return plan.filter((s) => s.done).length / plan.length;
}

export function leftMinutes(task) {
  return (task.plan ?? [])
    .filter((s) => !s.done)
    .reduce((sum, s) => sum + Math.max(0, toMinutes(s.to) - toMinutes(s.from)), 0);
}
