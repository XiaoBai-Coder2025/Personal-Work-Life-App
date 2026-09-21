import { toMinutes, toTime } from './dates.js';

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((item, index) => permutations([...list.slice(0, index), ...list.slice(index + 1)])
    .map((rest) => [item, ...rest]));
}

export function totalCost(order, cost) {
  let sum = 0;
  for (let i = 0; i < order.length - 1; i += 1) sum += cost(order[i], order[i + 1]);
  return sum;
}

export function bestOrder(points, cost) {
  const ids = points.map((p) => p.id);
  if (ids.length <= 2) return { order: ids, total: totalCost(ids, cost) };
  let best = ids;
  let bestTotal = totalCost(ids, cost);
  for (const rest of permutations(ids.slice(1))) {
    const trial = [ids[0], ...rest];
    const total = totalCost(trial, cost);
    if (total < bestTotal) {
      bestTotal = total;
      best = trial;
    }
  }
  return { order: best, total: bestTotal };
}

export function departPlan({ arriveAt, travelMinutes, buffer = 5, chosen, holidayFactor = 1 }) {
  const travel = Math.round(travelMinutes * holidayFactor);
  const arrive = toMinutes(arriveAt);
  const recommend = arrive - travel - buffer;
  const start = chosen ? toMinutes(chosen) : recommend;
  return {
    travel,
    recommend: toTime(recommend),
    chosen: toTime(start),
    arrive: toTime(start + travel),
    late: Math.max(0, start + travel - arrive),
  };
}

const SPEED_KMH = { walk: 5, ride: 15, transit: 22, metro: 30, drive: 35 };
const WAIT_MINUTES = { walk: 0, ride: 0, transit: 8, metro: 6, drive: 2 };

export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}

export function estimateMinutes(km, mode = 'metro') {
  const speed = SPEED_KMH[mode] ?? SPEED_KMH.metro;
  const wait = WAIT_MINUTES[mode] ?? 0;
  return Math.round((km / speed) * 60) + wait;
}
