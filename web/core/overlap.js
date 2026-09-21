import { toMinutes } from './dates.js';

export function findOverlaps(items) {
  const timed = items.filter((x) => x.from && x.to);
  const out = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const start = Math.max(toMinutes(timed[i].from), toMinutes(timed[j].from));
      const end = Math.min(toMinutes(timed[i].to), toMinutes(timed[j].to));
      if (end > start) out.push({ first: timed[i], second: timed[j], minutes: end - start });
    }
  }
  return out;
}
