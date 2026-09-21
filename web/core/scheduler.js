import { routineOnDate } from './routine.js';
import { findOverlaps } from './overlap.js';
import { toMinutes, toTime } from './dates.js';

export function freeSlots(anchors, windowFrom, windowTo) {
  const start = toMinutes(windowFrom);
  const end = toMinutes(windowTo);
  const busy = anchors
    .filter((a) => a.from && a.to)
    .map((a) => [toMinutes(a.from), toMinutes(a.to)])
    .sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let cursor = start;
  for (const [from, to] of busy) {
    if (from > cursor) gaps.push({ from: toTime(cursor), to: toTime(from), minutes: from - cursor });
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) gaps.push({ from: toTime(cursor), to: toTime(end), minutes: end - cursor });
  return gaps;
}

export function placeItems(gaps, items, buffer = 0) {
  const free = gaps.map((g) => ({ ...g }));
  const queue = items.map((it) => ({ ...it }));
  queue.sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999'))
    || (a.order ?? 0) - (b.order ?? 0));
  const placed = [];
  const unscheduled = [];
  for (const item of queue) {
    const need = item.minutes ?? 30;
    const idx = free.findIndex((g) => g.minutes >= need);
    if (idx < 0) {
      unscheduled.push(item);
      continue;
    }
    const gap = free[idx];
    const from = toMinutes(gap.from);
    const to = from + need;
    placed.push({ ...item, from: toTime(from), to: toTime(to) });
    const restStart = to + buffer;
    if (restStart < toMinutes(gap.to)) {
      free[idx] = { from: toTime(restStart), to: gap.to, minutes: toMinutes(gap.to) - restStart };
    } else {
      free.splice(idx, 1);
    }
  }
  return { placed, unscheduled, remaining: free };
}

export function buildDay({ dateKey, routineItems = [], events = [], tasks = [], profile = {} }) {
  const windowFrom = profile.wake || '07:00';
  const windowTo = profile.sleep || '23:00';
  const dayEvents = events.filter((e) => e.date === dateKey);
  const anchors = [
    ...routineOnDate(routineItems, dateKey),
    ...dayEvents.filter((e) => e.from && e.to).map((e) => ({ ...e, source: 'event' })),
  ].sort((a, b) => toMinutes(a.from) - toMinutes(b.from));

  const shortDate = dateKey.slice(5);
  const items = [];
  for (const task of tasks) {
    const plan = task.plan ?? [];
    for (let index = 0; index < plan.length; index += 1) {
      const slot = plan[index];
      if (slot.d !== shortDate || slot.done) continue;
      items.push({
        id: `${task.id}:${index}`,
        title: task.name,
        from: slot.from,
        to: slot.to,
        kind: 'task',
        phase: task.phases?.[slot.ph] ?? '',
        taskId: task.id,
        slotIndex: index,
      });
    }
  }
  items.sort((a, b) => toMinutes(a.from) - toMinutes(b.from));

  return {
    anchors,
    items,
    free: freeSlots(anchors, windowFrom, windowTo),
    conflicts: findOverlaps([...anchors, ...items]),
    dueAllDay: dayEvents.filter((e) => !e.from || !e.to),
    window: { from: windowFrom, to: windowTo },
  };
}

export function relayTimes(entries) {
  if (!entries.length) return [];
  let cursor = toMinutes(entries[0].from);
  return entries.map((entry) => {
    const duration = toMinutes(entry.to) - toMinutes(entry.from);
    const start = cursor;
    cursor = start + duration;
    return { ...entry, from: toTime(start), to: toTime(start + duration) };
  });
}
