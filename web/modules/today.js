import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { addDays, todayKey, weekdayOf, toMinutes, toTime } from '../core/dates.js';
import { buildDay, relayTimes } from '../core/scheduler.js';

let state = null;

async function ensure() {
  const [routine, events, tasks, plans, pending, profile] = await Promise.all([
    load('routine'), load('events'), load('tasks'), load('plans'), load('pending'), load('profile'),
  ]);
  if (!state) state = { date: todayKey(), add: null, snooze: null };
  state.routineItems = routine.items ?? [];
  state.events = events.items ?? [];
  state.tasks = tasks.items ?? [];
  state.plans = plans.items ?? [];
  state.pending = pending.items ?? [];
  state.profile = profile ?? {};
  return state;
}

const writePlans = () => save('plans', { version: 1, items: state.plans });
const writeTasks = () => save('tasks', { version: 1, items: state.tasks });
const writePending = () => save('pending', { version: 1, items: state.pending });

function recordOf(id) {
  return state.plans.find((r) => r.id === id && r.date === state.date);
}

function upsert(id, patch) {
  let record = recordOf(id);
  if (!record) {
    record = { id, date: state.date };
    state.plans.push(record);
  }
  Object.assign(record, patch);
  return record;
}

function entries() {
  const day = buildDay({
    dateKey: state.date,
    routineItems: state.routineItems,
    events: state.events,
    tasks: state.tasks,
    profile: state.profile,
  });
  const derived = [
    ...day.anchors.map((a) => ({ ...a, source: a.source === 'event' ? 'event' : 'routine' })),
    ...day.items.map((i) => ({ ...i, source: 'task' })),
  ];
  const manual = state.plans
    .filter((r) => r.date === state.date && r.manual && !r.removed)
    .map((r) => ({ ...r, source: 'manual' }));
  return [...derived, ...manual]
    .sort((a, b) => toMinutes(a.from ?? '23:59') - toMinutes(b.from ?? '23:59'))
    .map((entry) => {
      const record = recordOf(entry.id) ?? {};
      return {
        ...entry,
        done: !!record.done || entry.done === true,
        dropped: !!record.dropped,
        actual: record.actual ?? null,
        fixed: entry.source === 'routine' || entry.source === 'event',
      };
    });
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function promptOf(list) {
  const running = list.find((e) => e.actual?.start && !e.actual?.end && !e.done);
  if (running) return { entry: running, mode: 'end' };
  const now = nowMinutes();
  const due = list.find((e) => !e.fixed && e.kind === 'task' && !e.done && !e.dropped
    && toMinutes(e.from) <= now);
  return due ? { entry: due, mode: 'start' } : null;
}

function shiftEntry(entry, minutes) {
  const from = toMinutes(entry.from) + minutes;
  const to = toMinutes(entry.to) + minutes;
  if (entry.source === 'task') {
    const task = state.tasks.find((t) => t.id === entry.taskId);
    const slot = task?.plan?.[entry.slotIndex];
    if (slot) {
      slot.from = toTime(from);
      slot.to = toTime(to);
    }
  } else if (entry.source === 'manual') {
    upsert(entry.id, { from: toTime(from), to: toTime(to) });
  }
}

async function keep(entry) {
  const record = upsert(entry.id, { title: entry.title, kind: entry.kind ?? 'task' });
  if (entry.source === 'task') {
    const task = state.tasks.find((t) => t.id === entry.taskId);
    const slot = task?.plan?.[entry.slotIndex];
    if (slot) slot.done = !!record.done;
    await writeTasks();
  }
  await writePlans();
}

function promptCard(list) {
  const prompt = promptOf(list);
  if (!prompt) return null;
  const { entry, mode } = prompt;
  const running = mode === 'end';
  return h('section', { class: 'panel prompt' },
    h('h2', {}, running ? `正在做：${entry.title}` : `现在 ${toTime(nowMinutes())} · 该开始「${entry.title}」了`),
    h('p', { class: 'muted' }, `计划 ${entry.from}-${entry.to}${entry.phase ? ` · ${entry.phase}` : ''}`),
    h('div', { class: 'row' },
      h('button', {
        class: 'primary',
        onclick: async () => {
          if (running) {
            const end = nowMinutes();
            const minutes = end - toMinutes(entry.actual.start);
            upsert(entry.id, { done: true, actual: { ...entry.actual, end: toTime(end), minutes } });
            if (entry.source === 'task') {
              const task = state.tasks.find((t) => t.id === entry.taskId);
              const slot = task?.plan?.[entry.slotIndex];
              if (slot) slot.done = true;
              await writeTasks();
            }
            await writePlans();
            toast(`用时 ${minutes} 分钟，已标记完成`);
          } else {
            upsert(entry.id, { actual: { start: toTime(nowMinutes()) } });
            await writePlans();
            toast(`已记录开始时间 ${toTime(nowMinutes())}`);
          }
          draw();
        },
      }, running ? '是，已经做完了' : '是，现在开始'),
      h('button', {
        onclick: () => {
          state.snooze = { id: entry.id, minutes: 10 };
          draw();
        },
      }, '稍等一会'),
      h('button', {
        onclick: async () => {
          upsert(entry.id, { dropped: true });
          await writePlans();
          toast('已标记为不做了');
          draw();
        },
      }, '不做了'),
    ),
    state.snooze?.id === entry.id
      ? h('div', { class: 'row', style: 'margin-top:8px' },
        h('input', {
          type: 'number',
          min: '5',
          step: '5',
          value: String(state.snooze.minutes),
          oninput: (event) => { state.snooze.minutes = Number(event.target.value) || 10; },
        }),
        h('span', { class: 'muted' }, '分钟后开始'),
        h('button', {
          class: 'primary',
          onclick: async () => {
            shiftEntry(entry, state.snooze.minutes);
            state.snooze = null;
            await writePlans();
            await writeTasks();
            toast(`已推迟 ${entry.title}`);
            draw();
          },
        }, '确定'),
        h('button', {
          onclick: () => {
            state.snooze = null;
            draw();
          },
        }, '取消'))
      : null,
  );
}

function draftCard() {
  if (!state.pending.length) return null;
  return h('section', { class: 'panel' },
    h('h2', {}, `待确认草稿（${state.pending.length}）`),
    state.pending.map((draft) => h('div', { class: 'itemline' },
      h('span', { class: 'time' }, draft.from ? `${draft.from}-${draft.to ?? ''}` : '全天'),
      h('span', { class: 'grow' }, draft.title),
      h('span', { class: 'chip' }, draft.note ?? '草稿'),
      h('button', {
        class: 'primary',
        onclick: async () => {
          state.plans.push({
            id: `m${Date.now()}`,
            date: draft.date ?? state.date,
            from: draft.from ?? '19:00',
            to: draft.to ?? '20:00',
            title: draft.title,
            kind: 'task',
            manual: true,
          });
          state.pending = state.pending.filter((x) => x.id !== draft.id);
          await writePlans();
          await writePending();
          toast(`已采纳：${draft.title}`);
          draw();
        },
      }, '采纳'),
      h('button', {
        onclick: async () => {
          state.pending = state.pending.filter((x) => x.id !== draft.id);
          await writePending();
          toast('已忽略');
          draw();
        },
      }, '忽略'),
    )),
  );
}

function timelineCard(list) {
  const dayTasks = list.filter((e) => !e.fixed && e.kind === 'task');
  return h('section', { class: 'panel' },
    h('h2', {}, '今天的时间轴'),
    h('p', { class: 'muted' }, '顺延＝和后面一条交换先后并重新排时间，不是直接推到明天。'),
    list.length
      ? list.map((entry) => {
        const isLast = dayTasks.length > 0 && dayTasks[dayTasks.length - 1].id === entry.id;
        return h('div', { class: `itemline${entry.done ? ' done' : ''}${entry.dropped ? ' dropped' : ''}` },
          h('span', { class: 'time' }, entry.from ? `${entry.from}-${entry.to}` : '全天'),
          h('span', { class: 'grow' }, entry.title),
          h('span', { class: 'chip' }, entry.phase || (entry.fixed ? '固定' : '安排')),
          entry.actual?.minutes ? h('span', { class: 'chip' }, `实际 ${entry.actual.minutes} 分`) : null,
          entry.dropped ? h('span', { class: 'chip warn' }, '不做了') : null,
          entry.fixed
            ? null
            : h('button', {
              onclick: async () => {
                const record = recordOf(entry.id);
                const done = !(record?.done);
                upsert(entry.id, { done });
                if (entry.source === 'task') {
                  const task = state.tasks.find((t) => t.id === entry.taskId);
                  const slot = task?.plan?.[entry.slotIndex];
                  if (slot) slot.done = done;
                  await writeTasks();
                }
                await writePlans();
                draw();
              },
            }, entry.done ? '取消完成' : '完成'),
          entry.fixed
            ? null
            : h('button', {
              onclick: async () => {
                const ordered = dayTasks.slice();
                const index = ordered.findIndex((x) => x.id === entry.id);
                if (index < 0 || index === ordered.length - 1) {
                  toast('今天它后面没有别的任务了，建议顺延到明天');
                  return;
                }
                const swapped = ordered.slice();
                [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
                const relayed = relayTimes(swapped);
                for (const item of relayed) {
                  if (item.source === 'task') {
                    const task = state.tasks.find((t) => t.id === item.taskId);
                    const slot = task?.plan?.[item.slotIndex];
                    if (slot) {
                      slot.from = item.from;
                      slot.to = item.to;
                    }
                  } else {
                    upsert(item.id, { from: item.from, to: item.to });
                  }
                }
                await writeTasks();
                await writePlans();
                toast('已按顺序顺延');
                draw();
              },
            }, isLast ? '顺延到明天' : '按顺序顺延'),
          entry.source === 'manual'
            ? h('button', {
              class: 'ghost',
              onclick: async () => {
                state.plans = state.plans.filter((r) => r.id !== entry.id);
                await writePlans();
                toast('已删除');
                draw();
              },
            }, '删除')
            : null,
        );
      })
      : h('p', { class: 'muted' }, '今天还没有安排'),
    state.add
      ? h('div', { class: 'row', style: 'margin-top:12px' },
        h('input', {
          type: 'time',
          value: state.add.from,
          oninput: (event) => { state.add.from = event.target.value; },
        }),
        h('input', {
          type: 'time',
          value: state.add.to,
          oninput: (event) => { state.add.to = event.target.value; },
        }),
        h('input', {
          type: 'text',
          placeholder: '要做什么',
          value: state.add.title,
          oninput: (event) => { state.add.title = event.target.value; },
        }),
        h('button', {
          class: 'primary',
          onclick: async () => {
            if (!state.add.title.trim()) return toast('先写点什么');
            state.plans.push({
              id: `m${Date.now()}`,
              date: state.date,
              from: state.add.from,
              to: state.add.to,
              title: state.add.title.trim(),
              kind: 'task',
              manual: true,
            });
            const created = state.add;
            state.add = null;
            await writePlans();
            toast(`已加：${created.title.trim()}`);
            draw();
          },
        }, '加上'),
        h('button', {
          onclick: () => {
            state.add = null;
            draw();
          },
        }, '取消'))
      : h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', {
          class: 'primary',
          onclick: () => {
            state.add = { from: '19:00', to: '20:00', title: '' };
            draw();
          },
        }, '手动加一条')),
  );
}

function draw() {
  const view = document.getElementById('view');
  clear(view);
  const list = entries();
  view.append(...[
    h('section', { class: 'panel' },
      h('h2', {}, `${state.date} ${weekdayOf(state.date)}`),
      h('p', { class: 'muted' }, `空闲时段：${buildDay({
        dateKey: state.date,
        routineItems: state.routineItems,
        events: state.events,
        tasks: state.tasks,
        profile: state.profile,
      }).free.map((g) => `${g.from}-${g.to}`).join('、') || '没有'}`)),
    promptCard(list),
    draftCard(),
    timelineCard(list),
  ].filter(Boolean));
}

export async function renderToday(root) {
  await ensure();
  draw();
}
