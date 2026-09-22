import { parseKey } from './dates.js';

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_CHARS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const WEEK_ALIAS = { 每周: 'all', 全周: 'all', 单周: 'odd', 双周: 'even', 单: 'odd', 双: 'even' };
const TIME_RE = /^(\d{1,2}):(\d{2})\s*[-~到]\s*(\d{1,2}):(\d{2})$/;
const WEEK_RANGE_RE = /^第?(\d{1,2})\s*[-~到]\s*(\d{1,2})\s*周$/;
const WEEK_ONE_RE = /^第?(\d{1,2})\s*周$/;

const pad = (n) => String(n).padStart(2, '0');

function readDays(text) {
  const out = [];
  for (let i = 0; i < WEEKDAY_NAMES.length; i += 1) {
    if (text.includes(WEEKDAY_NAMES[i])) out.push(i + 1);
  }
  if (out.length) return out;
  const cleaned = text.replace(/星期|周/g, '').trim();
  if (cleaned && /^[一二三四五六日天\d、,，和\s]+$/.test(cleaned)) {
    // 「302」这种教室号不能被当成星期
    if ((cleaned.match(/\d/g) ?? []).some((d) => !'1234567'.includes(d))) return [];
    for (const ch of cleaned) {
      if (DAY_CHARS[ch]) out.push(DAY_CHARS[ch]);
      else if (/[1-7]/.test(ch)) out.push(Number(ch));
    }
  }
  return [...new Set(out)];
}

function readToken(token) {
  const time = token.match(TIME_RE);
  if (time) {
    return { kind: 'time', from: `${pad(time[1])}:${time[2]}`, to: `${pad(time[3])}:${time[4]}` };
  }
  const range = token.match(WEEK_RANGE_RE);
  if (range) {
    return { kind: 'range', from: Number(range[1]), to: Number(range[2]) };
  }
  const one = token.match(WEEK_ONE_RE);
  if (one) {
    return { kind: 'range', from: Number(one[1]), to: Number(one[1]) };
  }
  const days = readDays(token);
  if (days.length) {
    return { kind: 'days', days };
  }
  if (WEEK_ALIAS[token]) {
    return { kind: 'weeks', weeks: WEEK_ALIAS[token] };
  }
  return null;
}

export function parseTimetable(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = /[|｜,，\t]/.test(line)
      ? line.split(/[|｜,，\t]+/).map((x) => x.trim()).filter(Boolean)
      : line.split(/\s+/).filter(Boolean);

    let title = '';
    let place = '';
    let weekdays = [];
    let from = '';
    let to = '';
    let weeks = 'all';
    let weekFrom = 0;
    let weekTo = 0;

    for (const part of parts) {
      const info = readToken(part);
      if (!info) {
        if (!title) title = part;
        else place = place ? `${place} ${part}` : part;
        continue;
      }
      if (info.kind === 'time') {
        from = info.from;
        to = info.to;
      } else if (info.kind === 'days') {
        weekdays = [...new Set([...weekdays, ...info.days])];
      } else if (info.kind === 'weeks') {
        weeks = info.weeks;
      } else if (info.kind === 'range') {
        weekFrom = info.from;
        weekTo = info.to;
      }
    }

    if (!title) throw new Error(`第 ${index + 1} 行：看不清课程名，第一段请写课程名字`);
    if (!weekdays.length) throw new Error(`第 ${index + 1} 行：没写星期，用「周一」或「周一 周三」`);
    if (!from || !to) throw new Error(`第 ${index + 1} 行：没写时间，用 08:00-09:40`);
    out.push({
      title,
      weekdays: weekdays.sort((a, b) => a - b),
      from,
      to,
      weeks,
      weekFrom,
      weekTo,
      place,
    });
  });
  return out;
}

export function weekIndexOf(dateKey, termStart = '') {
  if (!termStart) return 0;
  const days = Math.round((parseKey(dateKey) - parseKey(termStart)) / 86400000);
  return Math.floor(days / 7) + 1;
}

export function previewTimetable(text) {
  return String(text)
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return null;
      try {
        const [item] = parseTimetable(line);
        return { line, ok: true, item };
      } catch (err) {
        return { line, ok: false, error: String(err.message).replace(/第 \d+ 行：/, '') };
      }
    })
    .filter(Boolean);
}

export function weekKindOf(dateKey, termStart = '') {
  if (termStart) {
    const index = weekIndexOf(dateKey, termStart);
    return index % 2 === 1 ? 'odd' : 'even';
  }
  const date = parseKey(dateKey);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const index = Math.floor(((date - jan1) / 86400000 + jan1.getDay()) / 7);
  return index % 2 === 0 ? 'odd' : 'even';
}

export const WEEK_LABEL = { all: '每周', odd: '单周', even: '双周' };

export function weekTextOf(item) {
  const base = WEEK_LABEL[item.weeks ?? 'all'];
  if (item.weekFrom && item.weekTo) return `${base} · 第 ${item.weekFrom}-${item.weekTo} 周`;
  return base;
}
