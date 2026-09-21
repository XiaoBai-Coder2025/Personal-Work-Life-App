import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { todayKey, weekdayOf } from '../core/dates.js';
import { buildDay } from '../core/scheduler.js';
import { buildAdvice } from '../core/advice.js';
import { doneRatio, leftMinutes, budgetState } from '../core/taskplan.js';

const DATA_KEYS = ['profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'settings'];

let state = null;

async function ensure() {
  const data = {};
  for (const key of DATA_KEYS) data[key] = await load(key);
  if (!state) {
    state = {
      open: { due: true, plan: true, proj: false, advice: true, memo: true, where: false },
      newMemo: '',
    };
  }
  state.data = data;
  return state;
}

const persist = (key) => save(key, state.data[key]);

function drawer(id, title, extra, body) {
  const open = state.open[id];
  return h('section', { class: 'drawer' },
    h('button', {
      class: 'drawerhead',
      onclick: () => {
        state.open[id] = !open;
        draw();
      },
    },
    h('b', {}, title),
    extra ? h('span', { class: 'chip' }, extra) : null,
    h('span', { class: 'muted small', style: 'margin-left:auto' }, open ? '收起 ▲' : '展开 ▼')),
    open ? h('div', { class: 'drawerbody' }, body) : null);
}

function draw() {
  const s = state;
  const view = document.getElementById('view');
  clear(view);
  const date = todayKey();
  const day = buildDay({
    dateKey: date,
    routineItems: s.data.routine.items ?? [],
    events: s.data.events.items ?? [],
    tasks: s.data.tasks.items ?? [],
    profile: s.data.profile ?? {},
  });
  const advice = buildAdvice({ dateKey: date, weather: s.data.settings.weather ?? 'sunny', data: s.data });
  const allOpen = Object.values(s.open).every(Boolean);

  const dueItems = [
    ...(s.data.events.items ?? []).filter((e) => !e.from && e.date >= date).map((e) => ({ date: e.date, title: e.title, from: '日程' })),
    ...(s.data.tasks.items ?? []).filter((t) => t.due).map((t) => ({ date: t.due, title: t.name, from: '任务追踪' })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  const addMemo = async () => {
    if (!s.newMemo.trim()) return;
    s.data.notes.items.push({ id: `n${Date.now()}`, text: s.newMemo.trim() });
    s.newMemo = '';
    await persist('notes');
    toast('已记下');
    draw();
  };

  view.append(
    h('section', { class: 'panel' },
      h('div', { class: 'row' },
        h('b', {}, `${s.data.pending.items.length} 条待确认草稿`),
        h('span', { class: 'muted small' }, `${date} ${weekdayOf(date)}`),
        h('button', {
          style: 'margin-left:auto',
          onclick: () => {
            const next = !allOpen;
            Object.keys(s.open).forEach((k) => { s.open[k] = next; });
            draw();
          },
        }, allOpen ? '折叠所有' : '展开所有'),
        h('a', { class: 'docklink', href: '#/today' }, '去今日计划 ›'))),
    (s.data.tasks.items.length + s.data.notes.items.length + s.data.events.items.length
      + s.data.routine.items.length + s.data.places.items.length === 0) ? h('section', { class: 'panel' },
      h('h2', {}, '还没有数据'),
      h('p', { class: 'muted' }, '这个应用现在是空的。先去「数据与设置」填写你的课表与常用地址，或者一键填入一份示例数据，看看各模块怎么用。'),
      h('div', { class: 'row' },
        h('a', { class: 'docklink', href: '#/settings' }, '去数据与设置 ›'),
        h('a', { class: 'docklink', href: '#/work' }, '直接建一个长周期任务 ›'))) : null,
    h('div', { class: 'cols' },
      h('div', {},
        drawer('due', '即将截止', `${dueItems.length} 条`, dueItems.length
          ? dueItems.map((item) => h('div', { class: 'itemline' },
            h('span', { class: 'time' }, item.date),
            h('span', { class: 'grow' }, item.title),
            h('span', { class: 'chip' }, item.from)))
          : h('p', { class: 'muted' }, '近期没有截止事项')),
        drawer('plan', '今天的计划', `${day.items.length} 件安排`, day.items.length || day.anchors.length
          ? [
            ...day.anchors.map((a) => h('div', { class: 'itemline' },
              h('span', { class: 'time' }, `${a.from}-${a.to}`),
              h('span', { class: 'grow' }, a.title),
              h('span', { class: 'chip' }, '固定'))),
            ...day.items.map((i) => h('div', { class: 'itemline' },
              h('span', { class: 'time' }, `${i.from}-${i.to}`),
              h('span', { class: 'grow' }, i.title),
              h('span', { class: 'chip' }, i.phase || '安排'))),
          ]
          : h('p', { class: 'muted' }, '今天还没有安排')),
        drawer('proj', '长周期任务', `${(s.data.tasks.items ?? []).length} 个`, (s.data.tasks.items ?? []).length
          ? s.data.tasks.items.slice(0, 4).map((task) => h('div', { class: 'itemline' },
            h('span', { class: 'grow' }, task.name),
            h('span', { class: 'chip' }, `${Math.round(doneRatio(task) * 100)}%`),
            h('span', { class: 'muted small' }, `还剩 ${(leftMinutes(task) / 60).toFixed(1)} 小时`)))
          : h('p', { class: 'muted' }, '还没有长周期任务'))),
      h('div', {},
        drawer('advice', '给你的建议', '按身份 · 地点 · 天气 · 截止', advice.length
          ? advice.map((item) => h('div', { class: 'itemline' },
            h('span', { class: 'grow' }, item.text),
            h('span', { class: 'chip' }, item.by.join(' · '))))
          : h('p', { class: 'muted' }, '暂时没有要提醒的')),
        drawer('memo', '快速备忘', `${s.data.notes.items.length} 条`, [
          h('div', { class: 'row' },
            h('input', {
              type: 'text',
              placeholder: '随手记一句，回车保存',
              value: s.newMemo,
              oninput: (e) => { s.newMemo = e.target.value; },
              onkeydown: (e) => {
                if (e.key === 'Enter') addMemo();
              },
            }),
            h('button', { class: 'primary', onclick: addMemo }, '记下')),
          ...s.data.notes.items.map((note, index) => h('div', { class: 'itemline' },
            h('span', { class: 'grow' }, note.text),
            h('button', {
              class: 'ghost',
              onclick: async () => {
                s.data.notes.items.splice(index, 1);
                await persist('notes');
                draw();
              },
            }, '×'))),
        ]),
        drawer('where', '今天要去的地方', `${(s.data.places.items ?? []).length} 个地址`, [
          h('p', { class: 'muted small' }, '出门时间由地图工具按到达时间倒推；常用地址在「数据与设置」里维护。'),
          ...(s.data.places.items ?? []).slice(0, 4).map((place) => h('div', { class: 'itemline' },
            h('span', { class: 'grow' }, place.name),
            h('span', { class: 'chip' }, place.tag || '地址'))),
          h('a', { class: 'docklink', href: '#/map' }, '打开地图工具 ›'),
        ])),
    ),
    h('section', { class: 'panel' },
      h('h2', {}, '今天排超的日子'),
      (() => {
        const over = (s.data.tasks.items ?? []).flatMap((task) => budgetState(task).over
          .filter((x) => `2026-${x.d}` === date)
          .map((x) => `${task.name}：排了 ${(x.minutes / 60).toFixed(1)} 小时，上限 ${((task.perDay || 120) / 60).toFixed(1)} 小时`));
        return over.length
          ? over.map((line) => h('p', { class: 'warn' }, line))
          : h('p', { class: 'muted' }, '今天没有排超的任务');
      })()),
  );
}

export async function renderHome(root) {
  await ensure();
  draw();
}
