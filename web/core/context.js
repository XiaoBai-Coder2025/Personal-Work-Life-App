import { routineOnDate } from './routine.js';
import { doneRatio, leftMinutes } from './taskplan.js';

const PLACEHOLDERS = {
  home: '今天有什么要我提醒的？',
  today: '今天还能塞进什么？',
  calendar: '这周哪天最忙？',
  work: '哪条线要延期了？',
  map: '几点出门、怎么排顺序？',
  ai: '想问什么？',
  settings: '设置怎么填？',
};

const QUICK = {
  home: ['今天要干嘛', '有什么要交', '给我一条建议'],
  today: ['还能塞什么', '顺延是怎么算的', '今天没做完怎么办'],
  calendar: ['哪天最忙', '哪里有冲突', '怎么改时间'],
  work: ['哪些要延期', '这周要交付什么', '把下一步排进今天'],
  map: ['几点出门', '优化顺序', '节假日要提前多久'],
  ai: ['今天还有什么没做', '整理这周的交付', '帮我把冲突挪开'],
  settings: ['Key 去哪申请', '备份放哪', '数据会不会丢'],
};

export function buildContext({ view, dateKey, data }) {
  const items = [];

  const plans = (data.plans?.items ?? []).filter((p) => p.date === dateKey);
  items.push({
    label: `今日计划 ${plans.length} 条`,
    items: plans.map((p) => `${p.from}-${p.to} ${p.title}`),
  });

  const routine = routineOnDate(data.routine?.items ?? [], dateKey);
  items.push({
    label: `当天固定课表 ${routine.length} 门`,
    items: routine.map((r) => `${r.from}-${r.to} ${r.title}${r.place ? ` · ${r.place}` : ''}`),
  });

  const events = (data.events?.items ?? []).filter((e) => e.date === dateKey);
  items.push({
    label: `当天日程 ${events.length} 条`,
    items: events.map((e) => `${e.from ? `${e.from}-${e.to} ` : '全天 '}${e.title}`),
  });

  const tasks = data.tasks?.items ?? [];
  items.push({
    label: `长周期任务 ${tasks.length} 个`,
    items: tasks.map((t) => {
      const done = (t.plan ?? []).filter((s) => s.done).length;
      return `${t.name}｜${t.due || '无交付日'} 交付｜进度 ${Math.round(doneRatio(t) * 100)}%｜还剩 ${(leftMinutes(t) / 60).toFixed(1)} 小时｜${done}/${(t.plan ?? []).length} 段完成`;
    }),
  });

  const places = data.places?.items ?? [];
  items.push({
    label: `常用地址 ${places.length} 个`,
    items: places.map((p) => `${p.name}${p.tag ? ` · ${p.tag}` : ''}`),
  });

  const profile = data.profile ?? {};
  const lines = [
    `我正在使用本机的工作生活助手，当前在「${view}」模块，日期 ${dateKey}。`,
    profile.identity ? `身份：${profile.identity}；作息：${profile.wake}-${profile.sleep}。` : '',
    '',
    '以下是本机数据（只读，不要改动）：',
    ...items.flatMap((group) => [
      `【${group.label}】`,
      ...(group.items.length ? group.items.map((x) => `- ${x}`) : ['- （空）']),
    ]),
    '',
    '请用简短中文回答，必要时给出可执行的下一步；如果信息不足，先反问我一个最关键的细节。',
  ];

  return {
    view,
    placeholder: PLACEHOLDERS[view] ?? '想问什么？',
    quick: QUICK[view] ?? [],
    items,
    prompt: lines.filter((x) => x !== undefined).join('\n'),
  };
}
