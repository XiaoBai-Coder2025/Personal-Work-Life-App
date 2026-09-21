import { formatCn, todayKey, weekdayOf } from './core/dates.js';
import { clear, h } from './core/ui.js';
import { load, save } from './core/api.js';
import { buildContext } from './core/context.js';
import { applyTheme } from './core/theme.js';
import { askFromDock, renderAi } from './modules/ai.js';
import { renderHome } from './modules/home.js';
import { renderToday } from './modules/today.js';
import { renderCalendar } from './modules/calendar.js';
import { renderWork } from './modules/work.js';
import { renderMap } from './modules/map.js';
import { renderSettings } from './modules/settings.js';

const ROUTES = [
  { id: 'home', hash: '#/home', title: '首页总览', render: renderHome },
  { id: 'today', hash: '#/today', title: '今日计划', render: renderToday },
  { id: 'calendar', hash: '#/calendar', title: '日历日程', render: renderCalendar },
  { id: 'work', hash: '#/work', title: '任务追踪', render: renderWork },
  { id: 'map', hash: '#/map', title: '地图工具', render: renderMap },
  { id: 'ai', hash: '#/ai', title: 'AI 助手', render: renderAi },
  { id: 'settings', hash: '#/settings', title: '数据与设置', render: renderSettings },
];

const APPEARANCE = [['light', '亮'], ['dark', '暗'], ['auto', '跟随系统']];
const THEME_NAMES = { blue: '默认蓝', green: '墨绿', amber: '暖橙', night: '夜紫', weather: '跟随天气' };
const WEATHER_NAMES = { sunny: '晴', cloudy: '多云', rain: '小雨', snow: '小雪', fog: '有雾' };
const DATA_KEYS = ['profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'chats', 'settings'];

const sidenav = document.getElementById('sidenav');
const view = document.getElementById('view');
const pageTitle = document.getElementById('page-title');
const todayLabel = document.getElementById('today-label');
const weatherChip = document.getElementById('weather');
const appearanceSeg = document.getElementById('appearance');
const themeTag = document.getElementById('theme-tag');

let settings = {};
let currentRoute = 'home';

function buildSide() {
  clear(sidenav);
  for (const route of ROUTES) {
    sidenav.append(h('button', {
      class: `navbtn${route.id === currentRoute ? ' active' : ''}`,
      onclick: () => {
        if (location.hash === route.hash) route();
        else location.hash = route.hash;
      },
    }, route.title));
  }
}

function buildTopBar() {
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  todayLabel.textContent = `${formatCn(todayKey())} · 现在 ${clock}`;
  weatherChip.textContent = `${WEATHER_NAMES[settings.weather ?? 'sunny'] ?? '晴'} · 出门看地图`;
  themeTag.textContent = `配色：${THEME_NAMES[settings.theme ?? 'blue'] ?? '默认蓝'}`;
  clear(appearanceSeg);
  for (const [value, name] of APPEARANCE) {
    appearanceSeg.append(h('button', {
      class: settings.appearance === value ? 'active' : '',
      onclick: async () => {
        settings.appearance = value;
        applyTheme(document.body, settings);
        await save('settings', settings);
        buildTopBar();
      },
    }, name));
  }
}

async function refreshDock(routeId) {
  const data = {};
  for (const key of DATA_KEYS) data[key] = await load(key);
  const context = buildContext({ view: routeId, dateKey: todayKey(), data });
  const input = document.getElementById('dock-input');
  const quick = document.getElementById('dock-quick');
  input.placeholder = context.placeholder;
  clear(quick);
  for (const item of context.quick) {
    quick.append(h('button', {
      class: 'ghost',
      onclick: () => {
        input.value = item;
      },
    }, item));
  }
}

async function dockSend() {
  const input = document.getElementById('dock-input');
  const question = input.value.trim();
  if (!question) return;
  const answerBox = document.getElementById('dock-answer');
  answerBox.hidden = false;
  answerBox.textContent = '正在读本机数据…';
  try {
    answerBox.textContent = await askFromDock(currentRoute, question, input);
  } catch (err) {
    answerBox.textContent = `出错了：${err.message}`;
  }
}

async function route() {
  const item = ROUTES.find((r) => r.hash === location.hash) ?? ROUTES[0];
  currentRoute = item.id;
  buildSide();
  pageTitle.textContent = item.title;
  buildTopBar();
  clear(view);
  try {
    await item.render(view);
  } catch (err) {
    view.append(h('section', { class: 'panel' }, h('h2', {}, item.title), h('p', { class: 'error' }, err.message)));
  }
  await refreshDock(item.id);
}

document.getElementById('dock-send').addEventListener('click', dockSend);
document.getElementById('dock-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') dockSend();
});
window.addEventListener('hashchange', route);

load('settings')
  .then((data) => {
    settings = { appearance: 'auto', theme: 'blue', weather: 'sunny', ...data };
    applyTheme(document.body, settings);
  })
  .catch(() => {})
  .finally(route);
