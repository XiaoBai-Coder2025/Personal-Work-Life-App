export function keyOf(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return keyOf(new Date());
}

export function parseKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key, days) {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return keyOf(date);
}

export function weekdayOf(key) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseKey(key).getDay()];
}

export function formatCn(key) {
  return `${key} ${weekdayOf(key)}`;
}

export function weekStart(key) {
  const date = parseKey(key);
  return addDays(key, -((date.getDay() + 6) % 7));
}

export function isWeekend(key) {
  return [0, 6].includes(parseKey(key).getDay());
}

export function toMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

export function toTime(minutes) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
