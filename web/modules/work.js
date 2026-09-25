import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { addDays, parseKey, todayKey, weekStart, toMinutes, toTime } from '../core/dates.js';
import { budgetState, doneRatio, leftMinutes, replan, DEFAULT_PER_DAY } from '../core/taskplan.js';
import { askAI } from '../core/ai.js';

const TEMPLATES = [
  { id: 'consult', name: '咨询项目', phases: ['收材料', '写初稿', '定稿', '交付'] },
  { id: 'contest', name: '比赛', phases: ['组队', '选题', '建模', '写作', '提交'] },
  { id: 'course', name: '课程作业', phases: ['选题', '实现', '报告', '答辩'] },
  { id: 'exam', name: '备考', phases: ['词汇', '真题', '听力', '模考'] },
];
const PHASE_COLORS = ['fixed', 'task', 'travel', 'due', 'break'];
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

let state = null;

async function ensure() {
  const [tasks, plans] = await Promise.all([load('tasks'), load('plans')]);
  if (!state) state = { picked: null, newTask: null, draft: null, newStage: '', phasesBusy: false };
  state.tasks = tasks.items ?? [];
  state.plans = plans.items ?? [];
  if (!state.tasks.some((t) => t.id === state.picked)) {
    state.picked = state.tasks[0]?.id ?? null;
    state.draft = null;
  }
  return state;
}

const writeTasks = () => save('tasks', { version: 1, items: state.tasks });
const writePlans = () => save('plans', { version: 1, items: state.plans });
const picked = () => state.tasks.find((t) => t.id === state.picked) ?? state.tasks[0];
const perDayOf = (task) => task.perDay || DEFAULT_PER_DAY;

function gantt() {
  const start = weekStart(todayKey());
  const span = 28;
  const index = (key) => Math.max(0, Math.min(span, Math.round((parseKey(key) - parseKey(start)) / 86400000)));
  const todayLeft = (index(todayKey()) / span) * 100;
  const weekends = [];
  for (let i = 0; i < span; i += 1) {
    if ([0, 6].includes(parseKey(addDays(start, i)).getDay())) {
      weekends.push(h('i', { class: 'weekend', style: `left:${(i / span) * 100}%;width:${100 / span}%` }));
    }
  }
  const rows = state.tasks.map((task) => {
    const from = index(task.from || todayKey());
    const to = Math.max(from + 1, index(task.due || task.to || addDays(todayKey(), 7)));
    const left = (from / span) * 100;
    const width = Math.max(3, ((to - from) / span) * 100);
    return h('div', { class: `growrow${task.id === state.picked ? ' picked' : ''}` },
      h('button', {
        class: 'gname',
        onclick: () => {
          state.picked = task.id;
          state.draft = null;
          draw();
        },
      }, task.name, h('br'), h('span', { class: 'muted small' },
        `${Math.round(doneRatio(task) * 100)}% · 还剩 ${(leftMinutes(task) / 60).toFixed(1)} 小时`)),
      h('div', { class: 'gtrack' },
        weekends,
        h('span', { class: 'todayline', style: `left:${todayLeft}%` }),
        h('span', {
          class: 'gbar',
          style: `left:${left}%;width:${width}%`,
        },
        h('i', { style: `width:${doneRatio(task) * 100}%` }),
        h('span', {}, `${Math.round(doneRatio(task) * 100)}%`)),
        task.due ? h('span', { class: 'mile', style: `left:${(index(task.due) / span) * 100}%` }, '◆') : null,
      ),
    );
  });
  return h('section', { class: 'panel' },
    h('h2', {}, `任务进程（${start} 起 4 周，斜纹是周末）`),
    h('div', { class: 'gantt' }, rows.length ? rows : h('p', { class: 'muted' }, '还没有任务，先在左边新建一个')),
  );
}

// 放在模块作用域：按钮在 listPanel 里，函数如果定义在 draw 内部就点不到了
async function suggestPlan(extra = '') {
  const form = state.newTask;
  if (!form?.name?.trim()) {
    toast('先填任务名，AI 才知道该分哪几个阶段');
    return;
  }
  form.aiMessages = form.aiMessages ?? [];
  if (!form.aiMessages.length) {
    form.aiMessages.push({
      role: 'user',
      content: `任务名：${form.name}\n最晚完成：${form.due}\n每天投入：${form.hours} 小时\n今天：${todayKey()}`,
    });
  }
  if (extra) form.aiMessages.push({ role: 'user', content: `修改意见：${extra}` });
  state.phasesBusy = true;
  draw();
  try {
    const reply = await askAI([
      {
        role: 'system',
        content: '你是任务规划助手。根据任务名、期限和每天可投入的时间，输出一份规划。'
          + '只输出 JSON 对象，不要解释，格式：'
          + '{"phases":["阶段名",...],"plan":"两三句话说明总体思路和节奏",'
          + '"schedule":[{"date":"YYYY-MM-DD","from":"HH:MM","to":"HH:MM","phase":"属于哪个阶段","focus":"这一次具体做什么"}]}。'
          + '要求：阶段 3-5 个，按先后顺序；schedule 按工作日铺开（跳过周末），每段时长等于每天投入，'
          + '从明天开始排到最晚完成日，最后一段落在交付日之前；focus 要具体，不要写"继续推进"这种空话。',
      },
      ...form.aiMessages,
    ]);
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 没给出可解析的规划');
    const data = JSON.parse(match[0]);
    const phases = (data.phases ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
    if (!phases.length) throw new Error('AI 没给出阶段名');
    const schedule = (data.schedule ?? [])
      .filter((x) => x?.date && x?.from && x?.to)
      .map((x) => ({
        d: String(x.date).slice(5),
        w: WEEKDAY_NAMES[parseKey(String(x.date)).getDay()],
        from: String(x.from),
        to: String(x.to),
        ph: Math.max(0, phases.indexOf(String(x.phase ?? '').trim())),
        focus: String(x.focus ?? ''),
        done: false,
      }))
      .slice(0, 20);
    state.newTask.phases = phases;
    state.newTask.ai = { plan: String(data.plan ?? ''), schedule };
    form.aiMessages.push({ role: 'assistant', content: reply });
    toast(schedule.length
      ? `AI 给了 ${phases.length} 个阶段和 ${schedule.length} 天安排，看一下再决定`
      : `AI 给了 ${phases.length} 个阶段（没给逐日安排）`);
  } catch (err) {
    toast(`AI 规划失败：${err.message}`);
  }
  state.phasesBusy = false;
  draw();
}

function listPanel() {
  return h('section', { class: 'panel' },
    h('h2', {}, `全部长周期任务（${state.tasks.length}）`),
    state.tasks.map((task) => h('button', {
      class: `taskbtn${task.id === state.picked ? ' picked' : ''}`,
      onclick: () => {
        state.picked = task.id;
        state.draft = null;
        draw();
      },
    },
    h('span', { class: 'grow' }, task.name),
    h('span', { class: 'chip' }, task.due ? `${task.due.slice(5)} 交付` : '无交付日'),
    h('span', { class: 'small muted' }, `还剩 ${(leftMinutes(task) / 60).toFixed(1)} 小时`))),
    state.newTask
      ? h('div', { class: 'newbox' },
        h('h3', {}, '新建任务'),
        h('input', {
          type: 'text',
          placeholder: '任务名',
          value: state.newTask.name,
          oninput: (e) => { state.newTask.name = e.target.value; },
        }),
        h('div', { class: 'splits' },
          h('div', { class: 'field' }, h('label', {}, '开始日期'), h('input', {
            type: 'date',
            value: state.newTask.from,
            onchange: (e) => { state.newTask.from = e.target.value; },
          })),
          h('div', { class: 'field' }, h('label', {}, '交付日'), h('input', {
            type: 'date',
            value: state.newTask.due,
            onchange: (e) => { state.newTask.due = e.target.value; },
          }))),
        h('div', { class: 'splits' },
          h('div', { class: 'field' }, h('label', {}, '每天投入（小时）'), h('input', {
            type: 'number',
            min: '0.5',
            step: '0.5',
            value: state.newTask.hours,
            oninput: (e) => { state.newTask.hours = Number(e.target.value) || 1; },
          })),
          h('div', { class: 'field' }, h('label', {}, '阶段模板（可选，AI 分阶段会覆盖它）'),
            h('select', {
              onchange: (e) => {
                state.newTask.tpl = e.target.value;
                state.newTask.phases = (TEMPLATES.find((t) => t.id === e.target.value) ?? TEMPLATES[0]).phases;
                draw();
              },
            }, TEMPLATES.map((t) => h('option', {
              value: t.id,
              selected: t.id === state.newTask.tpl,
            }, t.name))))),
        h('p', { class: 'small muted', style: 'margin:0' },
          `阶段：${(state.newTask.phases
            ?? (TEMPLATES.find((t) => t.id === state.newTask.tpl) ?? TEMPLATES[0]).phases).join(' → ')}`),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary',
            disabled: state.phasesBusy,
            onclick: () => suggestPlan(),
          }, state.phasesBusy ? 'AI 正在规划…' : '让 AI 出规划和分阶段'),
          h('span', { class: 'small muted' }, '它会按任务名给出阶段、思路，以及每天做哪一段；你同意后再建任务')),
        state.newTask.ai
          ? h('div', { class: 'aibox' },
            state.newTask.ai.plan
              ? h('div', { style: 'margin:0 0 6px' },
                h('p', {
                  class: `small muted${state.newTask.planOpen ? '' : ' clamp2'}`,
                  style: 'margin:0',
                }, `思路：${state.newTask.ai.plan}`),
                h('button', {
                  class: 'ghost small',
                  onclick: () => {
                    state.newTask.planOpen = !state.newTask.planOpen;
                    draw();
                  },
                }, state.newTask.planOpen ? '收起思路' : '展开思路'))
              : null,
            state.newTask.ai.schedule.length
              ? [
                h('p', { class: 'small muted', style: 'margin:0 0 4px' },
                  `逐日安排 ${state.newTask.ai.schedule.length} 段：`),
                h('div', { class: 'scrollbox' },
                  ...state.newTask.ai.schedule.map((slot) => h('div', { class: 'slotline' },
                  h('span', { class: 'time' }, `${slot.d} ${slot.w}`),
                  h('span', { class: 'grow small' }, `${state.newTask.phases[slot.ph] ?? ''} · ${slot.focus || '（未写内容）'}`),
                  h('span', { class: 'chip' }, `${slot.from}-${slot.to}`)))),
                h('div', { class: 'row' },
                  h('span', { class: 'small muted' }, '同意这份安排就点右边；不满意可以让 AI 重新生成'),
                  h('button', {
                    class: 'primary',
                    style: 'margin-left:auto',
                    onclick: () => {
                      toast('已采用 AI 的安排，点下面「建好」就会按这份安排建任务');
                      state.newTask.agreed = true;
                      draw();
                    },
                  }, state.newTask.agreed ? '已采用' : '同意这份安排')),
                h('div', { class: 'row', style: 'margin-top:6px' },
                  h('input', {
                    type: 'text',
                    placeholder: '想改哪里？比如：第二周太赶，往后挪两天',
                    value: state.newTask.aiReply ?? '',
                    oninput: (e) => { state.newTask.aiReply = e.target.value; },
                    onkeydown: (e) => {
                      if (e.key === 'Enter' && state.newTask.aiReply?.trim()) {
                        suggestPlan(state.newTask.aiReply.trim());
                      }
                    },
                  }),
                  h('button', {
                    disabled: state.phasesBusy,
                    onclick: () => {
                      const text = (state.newTask.aiReply ?? '').trim();
                      if (!text) return toast('先写下想改的地方');
                      state.newTask.aiReply = '';
                      return suggestPlan(text);
                    },
                  }, '让它改')),
              ]
              : h('p', { class: 'small muted' }, 'AI 只给了阶段名，逐日安排会在建任务时按工作日自动铺开。'),
          )
          : null,
        h('div', { class: 'row' },
          h('button', {
            class: 'primary',
            onclick: async () => {
              const form = state.newTask;
              if (!form.name.trim()) return toast('先填任务名');
              const tpl = TEMPLATES.find((t) => t.id === form.tpl) ?? TEMPLATES[0];
              const phases = (form.phases?.length ? form.phases : tpl.phases).slice(0, 6);
              const task = {
                id: `k${Date.now()}`,
                name: form.name.trim(),
                from: form.from,
                to: form.due,
                due: form.due,
                perDay: Math.round(form.hours * 60),
                phases,
                phase: 0,
                risk: '中',
                dep: '',
                plan: [],
              };
              task.plan = replan(task, todayKey(), 'today');
              if (form.ai?.schedule?.length && form.agreed) {
                task.plan = form.ai.schedule.map((slot) => ({
                  d: slot.d, w: slot.w, from: slot.from, to: slot.to, ph: slot.ph, done: false,
                }));
              }
              state.tasks.push(task);
              state.picked = task.id;
              state.newTask = null;
              await writeTasks();
              toast(`已建「${task.name}」，铺开 ${task.plan.length} 段`);
              draw();
            },
          }, '建好并铺开工作日'),
          h('button', { onclick: () => { state.newTask = null; draw(); } }, '取消')))
      : h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', {
          class: 'primary',
          onclick: () => {
            state.newTask = {
              name: '',
              from: todayKey(),
              due: addDays(todayKey(), 7),
              hours: 2,
              tpl: 'consult',
            };
            draw();
          },
        }, '新建任务'),
        h('button', {
          onclick: async () => {
            const task = picked();
            if (!task) return toast('先建一个任务');
            state.draft = { taskId: task.id, mode: 'today', slots: replan(task, todayKey(), 'today') };
            draw();
          },
        }, 'AI 智能安排')),
  );
}

function detailPanel() {
  const task = picked();
  if (!task) return h('section', { class: 'panel' }, h('p', { class: 'muted' }, '还没有任务'));
  const budget = budgetState(task);
  const phases = task.phases?.length ? task.phases : ['准备'];

  const phaseBlocks = phases.map((name, index) => {
    const slots = (task.plan ?? []).map((slot, i) => ({ slot, i })).filter((x) => x.slot.ph === index);
    const minutes = slots.reduce((sum, x) => sum + Math.max(0, toMinutes(x.slot.to) - toMinutes(x.slot.from)), 0);
    return h('div', { class: `phase${index === task.phase ? ' now' : ''}` },
      h('div', { class: 'row' },
        h('button', {
          class: `stage${index === task.phase ? ' on' : ''}`,
          onclick: async () => {
            task.phase = index;
            await writeTasks();
            draw();
          },
        }, name),
        h('span', { class: 'chip' }, `${slots.length} 段`),
        h('span', { class: 'chip' }, `${(minutes / 60).toFixed(1)} 小时`),
        h('button', {
          class: 'ghost',
          onclick: async () => {
            if (phases.length <= 1) return toast('至少留一个阶段');
            task.phases.splice(index, 1);
            task.plan = task.plan.filter((s) => s.ph !== index).map((s) => (s.ph > index ? { ...s, ph: s.ph - 1 } : s));
            if (task.phase >= task.phases.length) task.phase = task.phases.length - 1;
            await writeTasks();
            draw();
          },
        }, '删阶段')),
      slots.map(({ slot, i }) => h('div', { class: 'slotline' },
        h('span', { class: 'time' }, `${slot.d} ${slot.w}`),
        h('input', {
          type: 'time',
          value: slot.from,
          onchange: async (e) => {
            slot.from = e.target.value;
            await writeTasks();
            draw();
          },
        }),
        h('span', { class: 'muted' }, '到'),
        h('input', {
          type: 'time',
          value: slot.to,
          onchange: async (e) => {
            slot.to = e.target.value;
            await writeTasks();
            draw();
          },
        }),
        h('button', {
          onclick: async () => {
            slot.done = !slot.done;
            const record = state.plans.find((r) => r.id === `${task.id}:${i}`);
            if (record) record.done = slot.done;
            await writeTasks();
            toast(slot.done ? '这一段完成了，今日计划同步更新' : '取消完成');
            draw();
          },
        }, slot.done ? '已完成' : '完成'),
        h('button', {
          class: 'ghost',
          onclick: async () => {
            task.plan.splice(i, 1);
            await writeTasks();
            draw();
          },
        }, '×'))),
      h('div', { class: 'row' },
        h('button', {
          class: 'ghost',
          onclick: async () => {
            const last = slots[slots.length - 1]?.slot;
            const nextKey = last ? `2026-${last.d}` : task.from || todayKey();
            const dayKey = addDays(nextKey, 1);
            task.plan.push({
              d: dayKey.slice(5),
              w: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseKey(dayKey).getDay()],
              from: '20:00',
              to: toTime(toMinutes('20:00') + perDayOf(task)),
              ph: index,
              done: false,
            });
            await writeTasks();
            toast(`已给「${name}」排一段`);
            draw();
          },
        }, '＋ 给这个阶段排一段')),
    );
  });

  const dayLines = budget.totals.map((total) => {
    const over = total.minutes > budget.perDay;
    const short = total.minutes < budget.perDay;
    const label = over
      ? `超了 ${((total.minutes - budget.perDay) / 60).toFixed(1)} 小时`
      : short ? `还差 ${((budget.perDay - total.minutes) / 60).toFixed(1)} 小时` : '排满了';
    const names = total.slots.map((s) => `${phases[s.ph] ?? '阶段'} ${((toMinutes(s.to) - toMinutes(s.from)) / 60).toFixed(1)} 小时`).join(' + ');
    return h('div', { class: 'dayblock' },
      h('div', { class: 'row' },
        h('b', {}, `${total.d} ${total.slots[0].w}`),
        h('span', { class: 'small muted' }, `排了 ${(total.minutes / 60).toFixed(1)} / ${(budget.perDay / 60).toFixed(1)} 小时`),
        h('span', { class: `chip${over ? ' warn' : short ? '' : ' ok'}` }, label)),
      h('div', { class: 'small muted' }, names),
      h('div', { class: 'daybar' },
        total.slots.map((s, idx) => h('i', {
          style: `width:${Math.min(100, ((toMinutes(s.to) - toMinutes(s.from)) / budget.perDay) * 100)}%;background:${
            ['#7c5cff', 'var(--accent)', '#0d9488', '#c2410c', '#94a3b8'][(s.ph ?? 0) % 5]}`,
          title: phases[s.ph] ?? '',
        }))),
    );
  });

  return h('section', { class: 'panel' },
    h('h2', {}, task.name),
    h('div', { class: 'row' },
      h('span', { class: `chip${task.risk === '高' ? ' warn' : ''}` }, `风险 ${task.risk ?? '中'}`),
      h('span', { class: 'chip' }, `还剩 ${(leftMinutes(task) / 60).toFixed(1)} 小时`),
      h('span', { class: 'chip' }, `进度 ${Math.round(doneRatio(task) * 100)}%`),
      task.due ? h('span', { class: 'chip' }, `${task.due} 交付`) : null,
    ),
    h('h3', {}, '阶段（点一下就切到那一段，也可以加、可以删）'),
    phaseBlocks,
    h('div', { class: 'row' },
      h('input', {
        type: 'text',
        placeholder: '加一个阶段',
        value: state.newStage,
        oninput: (e) => { state.newStage = e.target.value; },
      }),
      h('button', {
        onclick: async () => {
          if (!state.newStage.trim()) return toast('先写阶段名字');
          task.phases.push(state.newStage.trim());
          state.newStage = '';
          await writeTasks();
          draw();
        },
      }, '加阶段')),
    h('h3', {}, '每天的安排（同一天分给几个阶段时，加起来不能超过每天投入上限）'),
    h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('span', { class: 'muted' }, '每天最多安排'),
      h('input', {
        type: 'number',
        min: '0.5',
        step: '0.5',
        style: 'max-width:90px',
        value: (budget.perDay / 60).toFixed(1),
        onchange: async (e) => {
          task.perDay = Math.max(30, Math.round((Number(e.target.value) || 2) * 60));
          await writeTasks();
          draw();
        },
      }),
      h('span', { class: 'muted' }, '小时')),
    dayLines.length ? dayLines : h('p', { class: 'muted' }, '还没有排任何时段'),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', {
        onclick: () => {
          state.draft = { taskId: task.id, mode: 'today', slots: replan(task, todayKey(), 'today') };
          draw();
        },
      }, '让 AI 重新安排这条'),
      h('button', {
        class: 'danger',
        onclick: async () => {
          const related = state.plans.filter((r) => String(r.id).startsWith(`${task.id}:`)).length;
          if (!confirm(`确定删除「${task.name}」吗？会同时移除今日计划里关联的 ${related} 条记录。`)) return;
          state.tasks = state.tasks.filter((t) => t.id !== task.id);
          state.plans = state.plans.filter((r) => !String(r.id).startsWith(`${task.id}:`));
          state.picked = state.tasks[0]?.id ?? null;
          await writeTasks();
          await writePlans();
          toast('已删除任务与关联记录');
          draw();
        },
      }, '删除任务'),
    ),
    state.draft?.taskId === task.id ? draftBox(task) : null,
  );
}

function draftBox(task) {
  const draft = state.draft;
  return h('div', { class: 'newbox' },
    h('h3', {}, `AI 给「${task.name}」排的一版`),
    h('p', { class: 'muted' },
      `从${draft.mode === 'tomorrow' ? '明天' : '今天'}排到交付日 ${task.due ?? '（未设）'}，每天 ${(perDayOf(task) / 60).toFixed(1)} 小时，按 ${task.phases.length} 个阶段顺次划分；采纳后会替换现在的 ${task.plan.length} 段安排。`),
    draft.slots.map((slot) => h('div', { class: 'slotline' },
      h('span', { class: 'time' }, `${slot.d} ${slot.w}`),
      h('span', { class: 'grow' }, task.phases[slot.ph] ?? ''),
      h('span', { class: 'chip' }, `${slot.from}-${slot.to}`))),
    h('div', { class: 'row' },
      h('button', {
        class: 'primary',
        onclick: async () => {
          task.plan = draft.slots.map((s) => ({ ...s }));
          state.draft = null;
          await writeTasks();
          toast(`已替换为 ${task.plan.length} 段安排`);
          draw();
        },
      }, '采纳，替换现在的安排'),
      h('button', {
        onclick: () => {
          draft.mode = draft.mode === 'today' ? 'tomorrow' : 'today';
          draft.slots = replan(task, todayKey(), draft.mode);
          draw();
        },
      }, `改成从${draft.mode === 'today' ? '明天' : '今天'}开始`),
      h('button', { onclick: () => { state.draft = null; draw(); } }, '取消')),
  );
}

function draw() {
  const view = document.getElementById('view');
  clear(view);
  const today = todayKey();
  const sunday = addDays(weekStart(today), 6);
  const tasks = state.tasks;
  const todayCount = tasks.filter((t) => (t.plan ?? []).some((s) => `2026-${s.d}` === today)).length;
  const weekDue = tasks.filter((t) => t.due && t.due >= today && t.due <= sunday).length;
  const risky = tasks.filter((t) => t.risk === '高'
    || (t.due && t.due < today)
    || budgetState(t).over.length > 0).length;
  view.append(
    h('div', { class: 'overview' },
      h('div', { class: 'ov' }, h('span', {}, '进行中的长周期任务'), h('b', {}, String(tasks.length))),
      h('div', { class: 'ov' }, h('span', {}, '本周要交付'), h('b', {}, String(weekDue))),
      h('div', { class: 'ov' }, h('span', {}, '有延期风险'), h('b', { class: risky ? 'warn' : '' }, String(risky))),
      h('div', { class: 'ov' }, h('span', {}, '今天排进计划'), h('b', {}, `${todayCount} 段`))),
    gantt(),
    h('div', { class: 'cols wide-left' }, listPanel(), detailPanel()),
  );
}

export async function renderWork(root) {
  await ensure();
  draw();
}
