import { h, toast } from '../core/ui.js';
import { COLLECTIONS, emptyOf, exportBackup, importBackup, load, save } from '../core/api.js';

const IDENTITIES = [
  '在校大学生（985/211/双一流）',
  '在校大学生（普通本科）',
  '在校大学生（专科）',
  '研究生',
  '工作党',
];
const COMMUTES = ['步行', '骑行', '公交', '地铁', '驾车'];

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

export async function renderSettings(root) {
  const [profileData, settingsData, ...others] = await Promise.all([
    load('profile'),
    load('settings'),
    ...COLLECTIONS.map((name) => load(name)),
  ]);
  const profile = { identity: '', wake: '07:00', sleep: '23:30', commute: '地铁', ...profileData };
  const settings = {
    amapJsKey: '', amapSecCode: '', aiBaseUrl: '', aiModel: '', aiKey: '', ...settingsData,
  };

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

  const counts = COLLECTIONS.map((name, i) => {
    const data = others[i];
    const n = Array.isArray(data?.items) ? data.items.length : 0;
    return h('span', {}, `${name} `, h('b', {}, String(n)));
  });

  root.append(
    h('section', { class: 'panel' },
      h('h2', {}, '身份与作息'),
      field('身份', selectInput(IDENTITIES, profile.identity, (v) => { profile.identity = v; })),
      field('起床时间', textInput(profile.wake, (v) => { profile.wake = v; }, 'time')),
      field('睡觉时间', textInput(profile.sleep, (v) => { profile.sleep = v; }, 'time')),
      field('默认通勤方式', selectInput(COMMUTES, profile.commute, (v) => { profile.commute = v; })),
      h('button', {
        class: 'primary',
        onclick: async () => {
          await save('profile', profile);
          toast('身份与作息已保存');
        },
      }, '保存身份与作息'),
    ),

    h('section', { class: 'panel' },
      h('h2', {}, '接口 Key'),
      field('高德 JS Key（地图显示、路线与天气）', keyInput(settings.amapJsKey, (v) => { settings.amapJsKey = v; })),
      field('高德安全密钥（由本机服务代转，不进页面）', keyInput(settings.amapSecCode, (v) => { settings.amapSecCode = v; })),
      field('AI 服务地址', textInput(settings.aiBaseUrl, (v) => { settings.aiBaseUrl = v; })),
      field('AI 模型名', textInput(settings.aiModel, (v) => { settings.aiModel = v; })),
      field('AI Key', keyInput(settings.aiKey, (v) => { settings.aiKey = v; })),
      h('button', {
        class: 'primary',
        onclick: async () => {
          await save('settings', settings);
          toast('Key 已保存');
        },
      }, '保存 Key'),
      h('p', { class: 'muted' }, 'Key 只存在本机 data/settings.json，不会写进代码，也不会上传。'),
    ),

    h('section', { class: 'panel' },
      h('h2', {}, '数据'),
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
      h('p', { class: 'muted' }, '导出会在 backups 目录留一份，同时下载到你的下载文件夹；导入会整体覆盖现有数据，并自动把导入前的数据另存一份。'),
    ),
  );
}
