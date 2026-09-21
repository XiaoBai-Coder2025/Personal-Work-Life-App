import { h, clear, toast } from '../core/ui.js';
import { COLLECTIONS, emptyOf, exportBackup, importBackup, load, save } from '../core/api.js';
import { applyTheme } from '../core/theme.js';

const IDENTITIES = [
  '在校大学生（985/211/双一流）',
  '在校大学生（普通本科）',
  '在校大学生（专科）',
  '研究生',
  '工作党',
];
const COMMUTES = ['步行', '骑行', '公交', '地铁', '驾车'];
const APPEARANCE = [['light', '亮'], ['dark', '暗'], ['auto', '跟随系统']];
const THEMES = [['blue', '默认蓝'], ['green', '墨绿'], ['amber', '暖橙'], ['night', '夜紫'], ['weather', '跟随天气']];
const WEATHERS = [['sunny', '晴'], ['cloudy', '多云'], ['rain', '小雨'], ['snow', '小雪'], ['fog', '有雾']];
const WD_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

let state = null;

async function ensure() {
  const all = {};
  for (const name of COLLECTIONS) all[name] = await load(name);
  const previous = state?.newRoutine;
  state = {
    all,
    profile: { identity: '', wake: '07:00', sleep: '23:30', commute: '地铁', ...all.profile },
    settings: {
      amapJsKey: '',
      amapSecCode: '',
      aiBaseUrl: '',
      aiModel: '',
      aiKey: '',
      appearance: 'auto',
      theme: 'blue',
      weather: 'sunny',
      ...all.settings,
    },
    routine: { version: 1, items: all.routine.items ?? [] },
    places: { version: 1, items: all.places.items ?? [] },
    newRoutine: previous ?? { title: '', place: '', from: '08:00', to: '09:40', weekdays: [] },
    newPlace: { name: '', tag: '常用' },
  };
  return state;
}

function field(label, control) {
  return h('div', { class: 'field' }, h('label', {}, label), control);
}

function textInput(value, onChange, type = 'text') {
  return h('input', {
    type,
    value: value ?? '',
    oninput: (event) => onChange(event.target.value),
  });
}

function selectInput(options, value, onChange) {
  const select = h('select', { onchange: (event) => onChange(event.target.value) });
  for (const option of options) {
    select.append(h('option', { value: option, selected: option === value }, option));
  }
  return select;
}

function keyInput(value, onChange) {
  const input = textInput(value, onChange);
  input.type = 'password';
  const toggle = h('button', {
    type: 'button',
    onclick: () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggle.textContent = input.type === 'password' ? '显示' : '隐藏';
    },
  }, '显示');
  return h('div', { class: 'row' }, input, toggle);
}

function panel(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', {}, title), ...children);
}

function draw(root) {
  const s = state;
  clear(root);
  const redraw = () => draw(root);

  const filePicker = h('input', {
    type: 'file',
    accept: '.json',
    style: 'display:none',
    onchange: async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const { snapshot } = await importBackup(JSON.parse(await file.text()));
        toast(`导入完成，导入前的数据已存为 backups/${snapshot}`);
      } catch (err) {
        toast(`导入失败：${err.message}`);
      } finally {
        event.target.value = '';
      }
    },
  });

  const counts = COLLECTIONS.map((name) => {
    const n = Array.isArray(s.all[name]?.items) ? s.all[name].items.length : 0;
    return h('span', {}, `${name} `, h('b', {}, String(n)));
  });

  const routineRows = s.routine.items.length
    ? s.routine.items.map((r, index) => h('div', { class: 'itemline' },
      h('span', { class: 'grow' },
        `${r.title} · ${r.weekdays.map((w) => WD_NAMES[w - 1]).join(' ')} ${r.from}-${r.to}${r.place ? ` · ${r.place}` : ''}`),
      h('button', {
        class: 'ghost',
        onclick: async () => {
          s.routine.items.splice(index, 1);
          await save('routine', s.routine);
          s.all.routine = s.routine;
          toast('已删除');
          redraw();
        },
      }, '删除'),
    ))
    : [h('p', { class: 'muted' }, '还没有固定日程')];

  const weekdayButtons = WD_NAMES.map((name, i) => h('button', {
    class: s.newRoutine.weekdays.includes(i + 1) ? 'primary' : '',
    onclick: () => {
      const list = s.newRoutine.weekdays;
      const at = list.indexOf(i + 1);
      if (at >= 0) list.splice(at, 1);
      else list.push(i + 1);
      redraw();
    },
  }, name));

  const placeRows = s.places.items.length
    ? s.places.items.map((p, index) => h('div', { class: 'itemline' },
      h('span', { class: 'grow' }, `${p.name}${p.tag ? ` · ${p.tag}` : ''}`),
      h('button', {
        class: 'ghost',
        onclick: async () => {
          s.places.items.splice(index, 1);
          await save('places', s.places);
          s.all.places = s.places;
          toast('已删除');
          redraw();
        },
      }, '删除'),
    ))
    : [h('p', { class: 'muted' }, '还没有常用地址')];

  root.append(
    panel('身份与作息',
      field('身份', selectInput(IDENTITIES, s.profile.identity, (v) => { s.profile.identity = v; })),
      field('起床时间', textInput(s.profile.wake, (v) => { s.profile.wake = v; }, 'time')),
      field('睡觉时间', textInput(s.profile.sleep, (v) => { s.profile.sleep = v; }, 'time')),
      field('默认通勤方式', selectInput(COMMUTES, s.profile.commute, (v) => { s.profile.commute = v; })),
      h('button', {
        class: 'primary',
        onclick: async () => {
          await save('profile', s.profile);
          toast('身份与作息已保存');
        },
      }, '保存身份与作息')),

    panel('外观',
      h('div', { class: 'field' }, h('label', {}, '明暗'),
        h('div', { class: 'row' }, APPEARANCE.map(([value, name]) => h('button', {
          class: s.settings.appearance === value ? 'primary' : '',
          onclick: async () => {
            s.settings.appearance = value;
            await save('settings', s.settings);
            s.all.settings = s.settings;
            applyTheme(document.body, s.settings);
            redraw();
          },
        }, name)))),
      h('div', { class: 'field' }, h('label', {}, '配色'),
        h('div', { class: 'row' }, THEMES.map(([value, name]) => h('button', {
          class: s.settings.theme === value ? 'primary' : '',
          onclick: async () => {
            s.settings.theme = value;
            await save('settings', s.settings);
            s.all.settings = s.settings;
            applyTheme(document.body, s.settings);
            redraw();
          },
        }, name)))),
      h('div', { class: 'field' }, h('label', {}, '选「跟随天气」时用哪种天气'),
        h('select', {
          onchange: async (event) => {
            s.settings.weather = event.target.value;
            await save('settings', s.settings);
            s.all.settings = s.settings;
            applyTheme(document.body, s.settings);
            redraw();
          },
        }, WEATHERS.map(([value, name]) => h('option', {
          value,
          selected: s.settings.weather === value,
        }, name)))),
      h('p', { class: 'muted' }, '明暗与配色保存在本机，重启后保持上次的设置。')),

    panel('固定课表 / 工作表',
      ...routineRows,
      h('h3', {}, '添加一条'),
      field('名称', textInput(s.newRoutine.title, (v) => { s.newRoutine.title = v; })),
      h('div', { class: 'field' }, h('label', {}, '星期'), h('div', { class: 'row' }, weekdayButtons)),
      h('div', { class: 'splits' },
        field('开始时间', textInput(s.newRoutine.from, (v) => { s.newRoutine.from = v; }, 'time')),
        field('结束时间', textInput(s.newRoutine.to, (v) => { s.newRoutine.to = v; }, 'time'))),
      field('地点', textInput(s.newRoutine.place, (v) => { s.newRoutine.place = v; })),
      h('button', {
        class: 'primary',
        onclick: async () => {
          const nr = s.newRoutine;
          if (!nr.title.trim()) return toast('先填名称');
          if (!nr.weekdays.length) return toast('至少选一个星期');
          s.routine.items.push({
            id: `r${Date.now()}`,
            title: nr.title.trim(),
            weekdays: [...nr.weekdays].sort((a, b) => a - b),
            from: nr.from,
            to: nr.to,
            place: nr.place.trim(),
            startDate: '',
            endDate: '',
          });
          await save('routine', s.routine);
          s.all.routine = s.routine;
          s.newRoutine = { title: '', place: '', from: '08:00', to: '09:40', weekdays: [] };
          toast('已添加固定日程');
          redraw();
        },
      }, '添加')),

    panel('常用地址',
      ...placeRows,
      h('h3', {}, '添加一个'),
      h('div', { class: 'splits' },
        field('名称', textInput(s.newPlace.name, (v) => { s.newPlace.name = v; })),
        field('标签', textInput(s.newPlace.tag, (v) => { s.newPlace.tag = v; }))),
      h('button', {
        class: 'primary',
        onclick: async () => {
          if (!s.newPlace.name.trim()) return toast('先填名称');
          s.places.items.push({
            id: `p${Date.now()}`,
            name: s.newPlace.name.trim(),
            tag: s.newPlace.tag.trim(),
            lng: null,
            lat: null,
          });
          await save('places', s.places);
          s.all.places = s.places;
          s.newPlace = { name: '', tag: '常用' };
          toast('已添加地址');
          redraw();
        },
      }, '添加')),

    panel('接口 Key',
      field('高德 JS Key（地图显示、路线与天气）', keyInput(s.settings.amapJsKey, (v) => { s.settings.amapJsKey = v; })),
      field('高德安全密钥（由本机服务代转，不进页面）', keyInput(s.settings.amapSecCode, (v) => { s.settings.amapSecCode = v; })),
      field('AI 服务地址', textInput(s.settings.aiBaseUrl, (v) => { s.settings.aiBaseUrl = v; })),
      field('AI 模型名', textInput(s.settings.aiModel, (v) => { s.settings.aiModel = v; })),
      field('AI Key', keyInput(s.settings.aiKey, (v) => { s.settings.aiKey = v; })),
      h('button', {
        class: 'primary',
        onclick: async () => {
          await save('settings', s.settings);
          toast('Key 已保存');
        },
      }, '保存 Key'),
      h('p', { class: 'muted' }, 'Key 只存在本机 data/settings.json，不写进代码，也不上传。')),

    panel('数据',
      h('div', { class: 'stat' }, counts),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', {
          class: 'primary',
          onclick: async () => {
            const { file, data } = await exportBackup();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = h('a', { href: url, download: file });
            link.click();
            URL.revokeObjectURL(url);
            toast(`已导出 ${file}`);
          },
        }, '导出备份'),
        h('button', { onclick: () => filePicker.click() }, '导入备份'),
        h('button', {
          class: 'danger',
          onclick: async () => {
            if (!confirm('确定清空全部数据吗？清空前会自动导出一份备份。')) return;
            await exportBackup();
            for (const name of COLLECTIONS) await save(name, emptyOf(name));
            toast('已清空，刷新页面生效');
          },
        }, '清空全部数据'),
      ),
      filePicker,
      h('p', { class: 'muted' }, '导出会在 backups 目录留一份，同时下载到本机；导入会整体覆盖现有数据，并自动留下导入前快照。')),
  );
}

export async function renderSettings(root) {
  await ensure();
  draw(root);
}
