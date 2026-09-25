import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { todayKey, addDays } from '../core/dates.js';
import { buildContext } from '../core/context.js';
import { askAI, parseFile, fileToBase64 } from '../core/ai.js';
import { replan } from '../core/taskplan.js';
import { WEEK_LABEL } from '../core/timetable.js';

const DATA_KEYS = ['profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'chats', 'settings'];

let state = null;

async function ensure() {
  const data = {};
  for (const key of DATA_KEYS) data[key] = await load(key);
  if (!state) {
    state = {
      picked: null,
      input: '',
      busy: false,
      read: {},
      wizard: null,
      imported: null,
      imageBusy: false,
      imageCourses: null,
    };
  }
  state.data = data;
  state.chats = data.chats.items ?? [];
  if (!state.chats.length) {
    state.chats.push({ id: `c${Date.now()}`, title: '新会话', messages: [] });
  }
  if (!state.chats.some((c) => c.id === state.picked)) state.picked = state.chats[0].id;
  return state;
}

const currentChat = () => state.chats.find((c) => c.id === state.picked) ?? state.chats[0];
const persistChats = () => save('chats', { version: 1, items: state.chats });

async function send(text) {
  const question = (text ?? '').trim();
  if (!question) return;
  const context = buildContext({ view: 'ai', dateKey: todayKey(), data: state.data });
  const chat = currentChat();
  chat.messages.push({ role: 'user', content: question });
  if (chat.title === '新会话') chat.title = question.slice(0, 14);
  state.input = '';
  state.busy = true;
  draw();
  try {
    const reply = await askAI([{ role: 'system', content: context.prompt }, ...chat.messages]);
    chat.messages.push({ role: 'assistant', content: reply });
  } catch (err) {
    chat.messages.push({ role: 'assistant', content: `（出错了：${err.message}）` });
  }
  state.busy = false;
  await persistChats();
  draw();
}

function readablePanel() {
  const context = buildContext({ view: 'ai', dateKey: todayKey(), data: state.data });
  return h('section', { class: 'panel' },
    h('h2', {}, '它能读到什么'),
    context.items.map((group) => h('div', {},
      h('button', {
        class: 'ghost',
        onclick: () => {
          state.read[group.label] = !state.read[group.label];
          draw();
        },
      }, `${group.label} · ${state.read[group.label] ? '收起' : '看具体内容'}`),
      state.read[group.label]
        ? h('div', { class: 'readlist' }, group.items.length
          ? group.items.map((line) => h('div', {}, `· ${line}`))
          : h('div', { class: 'muted' }, '（空）'))
        : null)),
    h('p', { class: 'muted' }, '它产出的内容会先进入待确认草稿，采纳后才写入正式数据。'),
  );
}

function wizardPanel() {
  const w = state.wizard;
  if (!w) return null;
  const stepTitle = ['说清目标', 'AI 反问', '生成安排'][w.step - 1];
  if (w.step === 1) {
    return h('section', { class: 'panel' },
      h('h2', {}, `AI 智能安排 · ${stepTitle}`),
      h('div', { class: 'field' }, h('label', {}, '想完成什么（可以很模糊）'),
        h('input', {
          type: 'text',
          value: w.goal,
          placeholder: '比如：把这门课的论文写完',
          oninput: (e) => { w.goal = e.target.value; },
        })),
      h('p', { class: 'muted' }, '下一步我会反问你几个问题，再把它拆成每天做一点的具体安排。'),
      h('button', {
        class: 'primary',
        onclick: () => {
          if (!w.goal.trim()) return toast('先说说你想完成什么');
          w.step = 2;
          draw();
        },
      }, '下一步'));
  }
  if (w.step === 2) {
    return h('section', { class: 'panel' },
      h('h2', {}, `AI 智能安排 · ${stepTitle}`),
      h('p', {}, `「${w.goal}」我按"每天推进一点"来理解。确认三件事，就能排出具体日程。`),
      h('div', { class: 'splits' },
        h('div', { class: 'field' }, h('label', {}, '最晚什么时候完成'),
          h('input', {
            type: 'date',
            value: w.due,
            onchange: (e) => { w.due = e.target.value; },
          })),
        h('div', { class: 'field' }, h('label', {}, '每天最多投入（小时）'),
          h('input', {
            type: 'number',
            min: '0.5',
            step: '0.5',
            value: w.hours,
            oninput: (e) => { w.hours = Number(e.target.value) || 1; },
          }))),
      h('div', { class: 'row' },
        h('button', {
          class: 'primary',
          onclick: () => {
            const task = {
              id: `k${Date.now()}`,
              name: w.goal.trim(),
              due: w.due,
              perDay: Math.round(w.hours * 60),
              phases: ['准备', '推进', '收尾', '交付'],
            };
            w.slots = replan(task, todayKey(), 'today');
            w.task = task;
            w.step = 3;
            draw();
          },
        }, '生成安排'),
        h('button', { onclick: () => { w.step = 1; draw(); } }, '上一步')));
  }
  return h('section', { class: 'panel' },
    h('h2', {}, `AI 智能安排 · ${stepTitle}`),
    h('p', { class: 'muted' }, `拆成 ${w.slots.length} 段，最晚 ${w.due} 完成。采纳后才会建成任务。`),
    w.slots.map((slot) => h('div', { class: 'itemline' },
      h('span', { class: 'time' }, `${slot.d} ${slot.w}`),
      h('span', { class: 'grow' }, w.task.phases[slot.ph]),
      h('span', { class: 'chip' }, `${slot.from}-${slot.to}`))),
    h('div', { class: 'row' },
      h('button', {
        class: 'primary',
        onclick: async () => {
          state.data.tasks.items = [...(state.data.tasks.items ?? []), {
            id: w.task.id,
            name: w.task.name,
            from: w.slots[0].d,
            to: w.due,
            due: w.due,
            perDay: w.task.perDay,
            phases: w.task.phases,
            phase: 0,
            risk: '中',
            dep: '由 AI 智能安排生成',
            plan: w.slots,
          }];
          await save('tasks', state.data.tasks);
          state.wizard = null;
          toast('已按 AI 的安排建成任务');
          draw();
        },
      }, '采纳，建成任务'),
      h('button', { onclick: () => { state.wizard = null; draw(); } }, '取消')));
}

const TIMETABLE_PROMPT = '你是课表识别助手。识别图片里的课程表，只输出 JSON 数组，每项格式：'
  + '{"title":"课程名","weekdays":[1,3],"from":"08:00","to":"09:40","weeks":"all","place":"教室"}。'
  + 'weekdays 用 1-7 表示周一到周日；weeks 填 all、odd（单周）或 even（双周）；识别不到的信息留空；只输出 JSON。';

function toRoutineCourse(item, index) {
  const weekdays = (Array.isArray(item.weekdays) ? item.weekdays : [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 7);
  return {
    id: `img${Date.now()}${index}`,
    title: String(item.title ?? '').trim(),
    weekdays,
    from: String(item.from ?? '08:00'),
    to: String(item.to ?? '09:40'),
    weeks: ['odd', 'even'].includes(item.weeks) ? item.weeks : 'all',
    place: String(item.place ?? '').trim(),
    startDate: '',
    endDate: '',
  };
}

function imageImportPanel() {
  const picker = h('input', {
    type: 'file',
    accept: 'image/*',
    onchange: async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      state.imageBusy = true;
      state.imageCourses = null;
      draw();
      try {
        const base64 = await fileToBase64(file);
        const reply = await askAI([
          { role: 'system', content: TIMETABLE_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '这是课表图片，请按格式输出 JSON。' },
              { type: 'image_url', image_url: { url: `data:${file.type || 'image/png'};base64,${base64}` } },
            ],
          },
        ]);
        const match = reply.match(/\[[\s\S]*\]/);
        const list = match ? JSON.parse(match[0]) : [];
        const courses = list.map(toRoutineCourse).filter((course) => course.title && course.weekdays.length);
        if (!courses.length) throw new Error('没识别出带星期的课程');
        state.imageCourses = courses;
        toast(`识别到 ${courses.length} 门课，确认后再导入`);
      } catch (err) {
        toast(`识别失败：${err.message}`);
      }
      state.imageBusy = false;
      draw();
    },
  });
  return h('section', { class: 'panel' },
    h('h2', {}, '从图片导入课表'),
    h('p', { class: 'muted' }, '截图或拍照的课表都可以试，需要你的 AI 服务支持看图（多数多模态模型支持）。'),
    h('div', { class: 'row' }, picker),
    state.imageBusy ? h('p', { class: 'muted small' }, '正在识别图片…') : null,
    state.imageCourses
      ? h('div', {},
        h('p', { class: 'small muted' }, `${state.imageCourses.length} 门课。名字、星期、时间、单双周、教室都能直接改；不要的删掉，漏了的补上。`),
        h('div', { class: 'scrollbox' }, ...state.imageCourses.map(courseRow)),
        h('div', { class: 'row' },
          h('button', {
            onclick: () => {
              state.imageCourses.push({
                id: `img${Date.now()}`,
                title: '',
                weekdays: [],
                from: '08:00',
                to: '09:40',
                weeks: 'all',
                place: '',
                startDate: '',
                endDate: '',
              });
              draw();
            },
          }, '＋ 加一门课'),
          h('button', {
            class: 'primary',
            onclick: async () => {
              const ready = state.imageCourses.filter((course) => course.title.trim() && course.weekdays.length);
              const skipped = state.imageCourses.length - ready.length;
              if (!ready.length) return toast('还没有填完整的课（要有课程名和至少一个星期）');
              const routine = await load('routine');
              const items = routine.items ?? [];
              for (const course of ready) items.push(course);
              await save('routine', { version: 1, items });
              toast(skipped
                ? `已导入 ${ready.length} 门课，${skipped} 门没填完整被跳过`
                : `已导入 ${ready.length} 门课，可在「数据与设置 → 固定课表」查看`);
              state.imageCourses = null;
              draw();
              return undefined;
            },
          }, '导入到固定课表'),
          h('button', {
            onclick: () => {
              state.imageCourses = null;
              draw();
            },
          }, '取消')))
      : null,
  );
}

// 识别完的课照样可以精细调整：改名、改星期、改时间、换单双周、填教室、删除
function courseRow(course, index) {
  const patch = (fields) => Object.assign(state.imageCourses[index], fields);
  return h('div', { class: 'coursebox' },
    h('div', { class: 'row', style: 'gap:6px' },
      h('input', {
        type: 'text',
        value: course.title,
        placeholder: '课程名',
        style: 'flex:1;min-width:90px',
        oninput: (event) => patch({ title: event.target.value }),
      }),
      h('select', {
        style: 'max-width:92px',
        onchange: (event) => patch({ weeks: event.target.value }),
      }, Object.entries(WEEK_LABEL).map(([value, name]) => h('option', {
        value,
        selected: course.weeks === value,
      }, name))),
      h('button', {
        class: 'ghost',
        title: '删掉这门课',
        onclick: () => {
          state.imageCourses.splice(index, 1);
          draw();
        },
      }, '×')),
    h('div', { class: 'row', style: 'gap:3px' },
      ...['一', '二', '三', '四', '五', '六', '日'].map((label, i) => h('button', {
        class: course.weekdays.includes(i + 1) ? 'primary' : '',
        style: 'padding:3px 8px;font-size:12px',
        onclick: () => {
          const at = course.weekdays.indexOf(i + 1);
          if (at >= 0) course.weekdays.splice(at, 1);
          else course.weekdays.push(i + 1);
          course.weekdays.sort((a, b) => a - b);
          draw();
        },
      }, label))),
    h('div', { class: 'row', style: 'gap:6px' },
      h('input', {
        type: 'time',
        value: course.from,
        onchange: (event) => patch({ from: event.target.value }),
      }),
      h('span', { class: 'muted small' }, '到'),
      h('input', {
        type: 'time',
        value: course.to,
        onchange: (event) => patch({ to: event.target.value }),
      }),
      h('input', {
        type: 'text',
        value: course.place,
        placeholder: '教室',
        style: 'flex:1;min-width:70px',
        oninput: (event) => patch({ place: event.target.value }),
      })),
  );
}

function importPanel() {
  const picker = h('input', {
    type: 'file',
    accept: '.txt,.md,.csv,.pdf,.docx',
    onchange: async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const base64 = await fileToBase64(file);
        const text = await parseFile(file.name, base64);
        state.imported = { name: file.name, text, drafts: [] };
        toast('已读出正文，可以让 AI 抽取日期');
      } catch (err) {
        toast(`读取失败：${err.message}`);
      }
      draw();
    },
  });
  return h('section', { class: 'panel' },
    h('h2', {}, '从文件导入日程'),
    h('p', { class: 'muted' }, '支持 txt、md、csv、pdf、docx；读不出文字时会明确提示，不会猜内容。'),
    h('div', { class: 'row' }, picker),
    state.imported
      ? h('div', {},
        h('p', { class: 'muted' }, `已读取：${state.imported.name}（${state.imported.text.length} 字）`),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary',
            onclick: async () => {
              state.busy = true;
              draw();
              try {
                const reply = await askAI([
                  { role: 'system', content: '你从文本中抽取日期与事项。只输出 JSON 数组，每项形如 {"date":"2026-09-25","from":"","to":"","title":"国赛报名截止"}，没有日期就不要输出。' },
                  { role: 'user', content: state.imported.text.slice(0, 8000) },
                ]);
                const match = reply.match(/\[[\s\S]*\]/);
                state.imported.drafts = match ? JSON.parse(match[0]) : [];
                toast(state.imported.drafts.length ? `抽到 ${state.imported.drafts.length} 条` : '没抽到带日期的条目');
              } catch (err) {
                toast(`抽取失败：${err.message}`);
              }
              state.busy = false;
              draw();
            },
          }, '让 AI 抽取日期事项'),
          h('button', {
            onclick: () => {
              state.imported = null;
              draw();
            },
          }, '清空')),
        state.imported.drafts.map((draft) => h('div', { class: 'itemline' },
          h('span', { class: 'time' }, draft.date ?? ''),
          h('span', { class: 'grow' }, draft.title ?? ''),
          h('span', { class: 'chip' }, `${draft.from ?? ''}${draft.to ? `-${draft.to}` : ''}`))),
        state.imported.drafts.length
          ? h('button', {
            class: 'primary',
            onclick: async () => {
              const pending = state.data.pending;
              pending.items = [...(pending.items ?? []), ...state.imported.drafts.map((d, i) => ({
                id: `d${Date.now()}${i}`,
                kind: 'event',
                title: d.title ?? '未命名',
                date: d.date ?? todayKey(),
                from: d.from ?? '',
                to: d.to ?? '',
                note: `来自 ${state.imported.name}`,
              }))];
              await save('pending', pending);
              toast('已写入待确认草稿，去今日计划采纳');
              state.imported = null;
              draw();
            },
          }, '全部写入待确认草稿')
          : null)
      : null);
}

function draw() {
  const view = document.getElementById('view');
  clear(view);
  const chat = currentChat();
  view.append(
    h('div', { class: 'cols-3' },
      h('section', { class: 'panel' },
        h('h2', {}, '会话'),
        state.chats.map((item) => h('button', {
          class: `taskbtn${item.id === state.picked ? ' picked' : ''}`,
          onclick: () => {
            state.picked = item.id;
            draw();
          },
        }, item.title)),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary',
            onclick: () => {
              state.chats.push({ id: `c${Date.now()}`, title: '新会话', messages: [] });
              state.picked = state.chats[state.chats.length - 1].id;
              draw();
            },
          }, '新建会话'),
          h('button', {
            onclick: () => {
              state.wizard = { step: 1, goal: '', due: addDays(todayKey(), 7), hours: 1.5 };
              draw();
            },
          }, 'AI 智能安排'))),
      h('div', {},
        h('section', { class: 'panel' },
          h('h2', {}, chat.title),
          chat.messages.length
            ? chat.messages.map((message) => h('div', { class: `msg ${message.role}` }, message.content))
            : h('p', { class: 'muted' }, '还没有对话，问点什么吧。'),
          state.busy ? h('p', { class: 'muted' }, '正在读本机数据…') : null,
          h('div', { class: 'row', style: 'margin-top:12px' },
            h('input', {
              type: 'text',
              placeholder: '问它今天的事、任务进度，或让它排一版草稿',
              value: state.input,
              oninput: (e) => { state.input = e.target.value; },
              onkeydown: (e) => {
                if (e.key === 'Enter') send(state.input);
              },
            }),
            h('button', {
              class: 'primary',
              onclick: () => send(state.input),
            }, '发送'))),
        wizardPanel(),
        imageImportPanel(),
        importPanel()),
      readablePanel()),
  );
}

export async function renderAi(root) {
  await ensure();
  draw();
}

export async function askFromDock(view, question, inputEl) {
  const data = {};
  for (const key of DATA_KEYS) data[key] = await load(key);
  const context = buildContext({ view, dateKey: todayKey(), data });
  inputEl.value = '';
  return askAI([{ role: 'system', content: context.prompt }, { role: 'user', content: question }]);
}
