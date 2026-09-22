import { parseKey } from './dates.js';
import { weekIndexOf, weekKindOf } from './timetable.js';

export function weekdayNumber(dateKey) {
  return ((parseKey(dateKey).getDay() + 6) % 7) + 1;
}

export function routineOnDate(items, dateKey, options = {}) {
  const weekday = weekdayNumber(dateKey);
  const kind = weekKindOf(dateKey, options.termStart ?? '');
  return items
    .filter((r) => Array.isArray(r.weekdays) && r.weekdays.includes(weekday))
    .filter((r) => (!r.startDate || dateKey >= r.startDate) && (!r.endDate || dateKey <= r.endDate))
    .filter((r) => !r.weeks || r.weeks === 'all' || r.weeks === kind)
    .filter((r) => {
      if (!r.weekFrom && !r.weekTo) return true;
      const index = weekIndexOf(dateKey, options.termStart ?? '');
      if (!index) return true;
      if (r.weekFrom && index < r.weekFrom) return false;
      if (r.weekTo && index > r.weekTo) return false;
      return true;
    })
    .map((r) => ({
      id: `routine:${r.id}`,
      date: dateKey,
      from: r.from,
      to: r.to,
      title: r.title,
      kind: 'fixed',
      place: r.place || '',
      weeks: r.weeks ?? 'all',
      source: 'routine',
    }));
}
