import { addDays, parseKey } from './dates.js';
import { budgetState, doneRatio, leftMinutes } from './taskplan.js';

const WEATHER_TIPS = {
  sunny: '晴天，出门注意防晒；晒被子正好。',
  cloudy: '多云，早晚有点凉，带件外套。',
  rain: '今天有雨，出门记得带伞，路上多留 10 分钟。',
  snow: '有小雪，路上慢一点，出门提前。',
  fog: '有雾，能见度低，去远处尽量坐车。',
};

function daysBetween(from, to) {
  return Math.round((parseKey(to) - parseKey(from)) / 86400000);
}

export function buildAdvice({ dateKey, weather = 'sunny', data = {} }) {
  const out = [];

  if (WEATHER_TIPS[weather]) out.push({ text: WEATHER_TIPS[weather], by: ['天气'] });

  const limit = addDays(dateKey, 3);
  const events = data.events?.items ?? [];
  for (const event of events) {
    if (event.date < dateKey || event.date > limit) continue;
    const left = daysBetween(dateKey, event.date);
    out.push({
      text: `「${event.title}」${left === 0 ? '今天' : `${left} 天后`}到期，别忘留时间。`,
      by: ['截止'],
    });
  }

  const tasks = data.tasks?.items ?? [];
  for (const task of tasks) {
    if (!task.due) continue;
    const left = daysBetween(dateKey, task.due);
    if (left < 0) {
      out.push({ text: `「${task.name}」已过交付日，需要重新安排。`, by: ['任务'] });
      continue;
    }
    if (left <= 3 && doneRatio(task) < 1) {
      out.push({
        text: `「${task.name}」还剩 ${(leftMinutes(task) / 60).toFixed(1)} 小时，${left} 天后交付。`,
        by: ['任务'],
      });
    }
    const over = budgetState(task).over.filter((x) => `2026-${x.d}` === dateKey);
    if (over.length) {
      out.push({
        text: `「${task.name}」今天排超了 ${((over[0].minutes - (task.perDay || 120)) / 60).toFixed(1)} 小时，考虑挪一段。`,
        by: ['任务'],
      });
    }
  }

  if ((data.places?.items ?? []).length < 2) {
    out.push({ text: '常用地址还不到两个，建议先把家和学校/公司补上，路线和出门时间才准。', by: ['设置'] });
  }

  return out;
}
