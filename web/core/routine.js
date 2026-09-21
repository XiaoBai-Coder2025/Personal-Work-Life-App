import { parseKey } from './dates.js';

export function weekdayNumber(dateKey) {
  return ((parseKey(dateKey).getDay() + 6) % 7) + 1;
}

export function routineOnDate(items, dateKey) {
  const weekday = weekdayNumber(dateKey);
  return items
    .filter((r) => Array.isArray(r.weekdays) && r.weekdays.includes(weekday))
    .filter((r) => (!r.startDate || dateKey >= r.startDate) && (!r.endDate || dateKey <= r.endDate))
    .map((r) => ({
      id: `routine:${r.id}`,
      date: dateKey,
      from: r.from,
      to: r.to,
      title: r.title,
      kind: 'fixed',
      place: r.place || '',
      source: 'routine',
    }));
}
