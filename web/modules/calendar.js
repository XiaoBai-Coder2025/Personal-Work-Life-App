import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { addDays, keyOf, parseKey, todayKey, weekStart, weekdayOf, toMinutes } from '../core/dates.js';
import { routineOnDate } from '../core/routine.js';
import { findOverlaps } from '../core/overlap.js';

const DAY_START = 8 * 60;
const DAY_SPAN = 14 * 60;

let cache = null;

async function loadData() {
  const [events, routine] = await Promise.all([load('events'), load('routine')]);
  if (!cache) cache = { week: weekStart(todayKey()), picked: todayKey(), editing: null };
  cache.events = events.items ?? [];
  cache.routine = routine.items ?? [];
  return cache;
}

function itemsOf(dateKey) {
  const mine = cache.events
    .filter((e) => e.date === dateKey)
    .map((e) => ({ ...e, source: 'event' }));
  return [...routineOnDate(cache.routine, dateKey), ...mine];
}

async function persist() {
  await save('events', { version: 1, items: cache.events });
}

function bar(item) {
  if (!item.from) {
    return h('button', {
      class: `bar bar-${item.kind}`,
      style: 'left:96%;width:4%',
      title: item.title,
      onclick: () => openEditor(item),
    }, '◆');
  }
  const left = ((toMinutes(item.from) - DAY_START) / DAY_SPAN) * 100;
  const width = Math.max(2, ((toMinutes(item.to) - toMinutes(item.from)) / DAY_SPAN) * 100);
  return h('button', {
    class: `bar bar-${item.kind}`,
    style: `left:${left}%;width:${width}%`,
    title: `${item.from}-${item.to} ${item.title}`,
    onclick: () => openEditor(item),
  }, item.title);
}

function openEditor(item) {
  cache.editing = { ...item };
  draw();
}

function editor() {
  const e = cache.editing;
  if (!e) return null;
  const isRoutine = e.source === 'routine' || String(e.id).startsWith('routine:');
  const field = (label, props) => h('div', { class: 'field' }, h('label', {}, label), h('input', props));
  return h('div', { class: 'panel' },
    h('h2', {}, '编辑日程'),
    isRoutine ? h('p', { class: 'muted' }, '这是固定课表展开出来的条目，请到「数据与设置」里修改。') : null,
    field('标题', {
      type: 'text',
      value: e.title,
      disabled: isRoutine,
      oninput: (ev) => { e.title = ev.target.value; },
    }),
    h('div', { class: 'splits' },
      field('开始日期', {
        type: 'date',
        value: e.date,
        disabled: isRoutine,
        onchange: (ev) => { e.date = ev.target.value; },
      }),
      field('开始时间', {
        type: 'time',
        value: e.from ?? '09:00',
        disabled: isRoutine,
        onchange: (ev) => { e.from = ev.target.value; },
      }),
    ),
    h('div', { class: 'splits' },
      field('结束日期', {
        type: 'date',
        value: e.endDate ?? e.date,
        disabled: isRoutine,
        onchange: (ev) => { e.endDate = ev.target.value; },
      }),
      field('结束时间', {
        type: 'time',
        value: e.to ?? '10:00',
        disabled: isRoutine,
        onchange: (ev) => { e.to = ev.target.value; },
      }),
    ),
    h('div', { class: 'row' },
      isRoutine ? null : h('button', {
        class: 'primary',
        onclick: async () => {
          if (!e.title.trim()) return toast('标题不能为空');
          const hit = cache.events.find((x) => x.id === e.id);
          const payload = {
            id: e.id,
            date: e.date,
            from: e.from,
            to: e.to,
            title: e.title.trim(),
            kind: e.kind ?? 'task',
          };
          if (hit) Object.assign(hit, payload);
          else cache.events.push(payload);
          await persist();
          cache.picked = e.date;
          cache.editing = null;
          toast('已保存');
          draw();
        },
      }, '保存'),
      isRoutine ? null : h('button', {
        onclick: async () => {
          cache.events = cache.events.filter((x) => x.id !== e.id);
          await persist();
          cache.editing = null;
          toast('已删除');
          draw();
        },
      }, '删除'),
      h('button', {
        onclick: () => {
          cache.editing = null;
          draw();
        },
      }, '关闭'),
    ),
  );
}

function draw() {
  const view = document.getElementById('view');
  clear(view);
  const week = Array.from({ length: 7 }, (_, i) => addDays(cache.week, i));
  const monthFirst = new Date(parseKey(cache.picked).getFullYear(), parseKey(cache.picked).getMonth(), 1);
  const gridStart = new Date(monthFirst);
  gridStart.setDate(1 - ((monthFirst.getDay() + 6) % 7));

  const rows = week.map((dayKey) => {
    const items = itemsOf(dayKey);
    const overlap = findOverlaps(items);
    return h('div', { class: 'axrow' },
      h('div', { class: `axlabel${dayKey === todayKey() ? ' today' : ''}` }, `${weekdayOf(dayKey)} ${parseKey(dayKey).getDate()}`),
      h('div', { class: 'axtrack' }, items.map(bar)),
      overlap.length ? h('span', { class: 'chip warn' }, `重叠 ${overlap[0].minutes} 分`) : null,
    );
  });

  const mini = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const k = keyOf(d);
    const inMonth = d.getMonth() === monthFirst.getMonth();
    const has = itemsOf(k).length > 0;
    mini.push(h('button', {
      class: `mini${inMonth ? '' : ' out'}${k === todayKey() ? ' today' : ''}${k === cache.picked ? ' picked' : ''}`,
      onclick: () => {
        cache.picked = k;
        cache.week = weekStart(k);
        cache.editing = null;
        draw();
      },
    }, String(d.getDate()), has ? h('i', { class: 'dot' }) : null));
  }

  const dayItems = itemsOf(cache.picked);
  const overlaps = findOverlaps(dayItems);

  view.append(
    h('section', { class: 'panel' },
      h('h2', {}, '任务轴线'),
      h('div', { class: 'row', style: 'margin-bottom:10px' },
        h('button', { onclick: () => { cache.week = addDays(cache.week, -7); draw(); } }, '上一周'),
        h('button', { onclick: () => { cache.week = weekStart(todayKey()); draw(); } }, '本周'),
        h('button', { onclick: () => { cache.week = addDays(cache.week, 7); draw(); } }, '下一周'),
      ),
      h('div', { class: 'axis' }, rows),
      h('p', { class: 'muted' }, '轴线范围 08:00-22:00；点任意一条可以改时间。'),
    ),

    h('div', { class: 'cols' },
      h('section', { class: 'panel' },
        h('h2', {}, `${cache.picked} ${weekdayOf(cache.picked)}`),
        overlaps.map((o) => h('p', { class: 'warn' },
          `时间重叠 ${o.minutes} 分钟：${o.first.title} ${o.first.from}-${o.first.to} 与 ${o.second.title} ${o.second.from}-${o.second.to}`)),
        dayItems.length
          ? dayItems.map((item) => h('div', { class: 'itemline' },
            h('span', { class: 'time' }, item.from ? `${item.from}-${item.to}` : '全天'),
            h('span', { class: 'grow' }, item.title),
            h('span', { class: 'chip' }, item.kind === 'fixed' ? '课表' : item.kind === 'due' ? '截止' : '安排'),
            item.source === 'event'
              ? h('button', { class: 'ghost', onclick: () => openEditor(item) }, '改')
              : null,
          ))
          : h('p', { class: 'muted' }, '这天没有安排'),
        h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', {
            class: 'primary',
            onclick: () => {
              cache.editing = {
                id: `e${Date.now()}`,
                date: cache.picked,
                from: '19:00',
                to: '20:00',
                title: '',
                kind: 'task',
                source: 'event',
              };
              draw();
            },
          }, '加一条'),
          h('button', {
            onclick: async () => {
              if (!dayItems.length) return toast('这天没有可加入草稿的安排');
              const pending = await load('pending');
              const items = pending.items ?? [];
              for (const item of dayItems.filter((x) => x.source === 'event')) {
                items.push({
                  id: `p${Date.now()}${items.length}`,
                  kind: 'event',
                  date: item.date,
                  from: item.from,
                  to: item.to,
                  title: item.title,
                  note: '来自日历日程',
                });
              }
              await save('pending', { version: 1, items });
              toast('已加入待确认草稿');
            },
          }, '把这一天排进今日计划'),
        ),
      ),

      h('section', { class: 'panel' },
        h('h2', {}, `${monthFirst.getFullYear()} 年 ${monthFirst.getMonth() + 1} 月`),
        h('div', { class: 'cal' },
          ['一', '二', '三', '四', '五', '六', '日'].map((w) => h('div', { class: 'wd' }, w)),
          mini,
        ),
      ),
    ),

    editor(),
  );
}

export async function renderCalendar(root) {
  await loadData();
  draw();
}
