import { parseKey } from './dates.js';

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEK_ALIAS = { 每周: 'all', 全周: 'all', 单周: 'odd', 双周: 'even' };
const TIME_RE = /^(\d{1,2}:\d{2})\s*[-~到]\s*(\d{1,2}:\d{2})$/;

function parseWeekdays(text) {
  const out = [];
  for (let i = 0; i < WEEKDAY_NAMES.length; i += 1) {
    if (text.includes(WEEKDAY_NAMES[i])) out.push(i + 1);
  }
  if (out.length) return out;
  const digested = text.replace(/星期|周/g, '').trim();
  if (/^[\d\s、,，和]+$/.test(digested)) {
    return (digested.match(/[1-7]/g) ?? []).map(Number);
  }
  return [];
}

export function parseTimetable(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[|｜,，\t]+/).map((x) => x.trim()).filter(Boolean);
    const title = parts.shift();
    if (!title) throw new Error(`第 ${index + 1} 行：缺少课程名称`);

    let weekdays = [];
    let from = '';
    let to = '';
    let weeks = 'all';
    let place = '';
    for (const part of parts) {
      const time = part.match(TIME_RE);
      if (time) {
        [, from, to] = time;
        continue;
      }
      const days = parseWeekdays(part);
      if (days.length) {
        weekdays = [...new Set([...weekdays, ...days])];
        continue;
      }
      const week = WEEK_ALIAS[part] ?? (part.includes('单') ? 'odd' : part.includes('双') ? 'even' : null);
      if (week && part.length <= 3) {
        weeks = week;
        continue;
      }
      place = place ? `${place} ${part}` : part;
    }

    if (!weekdays.length) throw new Error(`第 ${index + 1} 行：没写星期，用「周一」或「周二 周四」`);
    if (!from || !to) throw new Error(`第 ${index + 1} 行：没写时间，用 08:00-09:40`);
    out.push({
      title,
      weekdays: weekdays.sort((a, b) => a - b),
      from,
      to,
      weeks,
      place,
    });
  });
  return out;
}

export function weekKindOf(dateKey, termStart = '') {
  if (termStart) {
    const days = Math.round((parseKey(dateKey) - parseKey(termStart)) / 86400000);
    const index = Math.floor(days / 7);
    return index % 2 === 0 ? 'odd' : 'even';
  }
  const date = parseKey(dateKey);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const index = Math.floor(((date - jan1) / 86400000 + jan1.getDay()) / 7);
  return index % 2 === 0 ? 'odd' : 'even';
}

export const WEEK_LABEL = { all: '每周', odd: '单周', even: '双周' };
