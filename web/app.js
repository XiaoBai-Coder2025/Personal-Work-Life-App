import { formatCn, todayKey } from './core/dates.js';
import { clear, h } from './core/ui.js';
import { load } from './core/api.js';
import { buildContext } from './core/context.js';
import { askFromDock, renderAi } from './modules/ai.js';
import { renderSettings } from './modules/settings.js';
import { renderCalendar } from './modules/calendar.js';
import { renderToday } from './modules/today.js';
import { renderWork } from './modules/work.js';
import { renderMap } from './modules/map.js';
import { renderHome } from './modules/home.js';
import { applyTheme } from './core/theme.js';

const ROUTES = [
  { hash: '#/home', title: '首页总览', render: renderHome },
  { hash: '#/today', title: '今日计划', render: renderToday },
  { hash: '#/calendar', title: '日历日程', render: renderCalendar },
  { hash: '#/work', title: '任务追踪', render: renderWork },
  { hash: '#/map', title: '地图工具', render: renderMap },
  { hash: '#/ai', title: 'AI 助手', render: renderAi },
  { hash: '#/settings', title: '数据与设置', render: renderSettings },
];

const nav = document.getElementById('nav');
const view = document.getElementById('view');

const DATA_KEYS = ['profile', 'places', 'routine', 'events', 'plans', 'tasks', 'notes', 'pending', 'chats', 'settings'];

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
  const routeId = (location.hash || '#/home').replace('#/', '');
  answerBox.hidden = false;
  answerBox.textContent = '正在读本机数据…';
  try {
    answerBox.textContent = await askFromDock(routeId, question, input);
  } catch (err) {
    answerBox.textContent = `出错了：${err.message}`;
  }
}

document.getElementById('dock-send').addEventListener('click', dockSend);
document.getElementById('dock-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') dockSend();
});

function buildNav(current) {
  clear(nav);
  for (const route of ROUTES) {
    nav.append(h('a', { href: route.hash, class: route.hash === current ? 'active' : '' }, route.title));
  }
}

async function route() {
  const item = ROUTES.find((r) => r.hash === location.hash) ?? ROUTES[0];
  buildNav(item.hash);
  clear(view);
  if (item.render) {
    try {
      await item.render(view);
    } catch (err) {
      view.append(h('section', { class: 'panel' }, h('h2', {}, item.title), h('p', { class: 'error' }, err.message)));
    }
  } else {
    view.append(
      h('section', { class: 'panel' },
        h('h2', {}, item.title),
        h('p', { class: 'muted' }, '本模块将在后续阶段实现。')),
    );
  }
  await refreshDock(item.hash.replace('#/', ''));
}

window.addEventListener('hashchange', route);
document.getElementById('today-label').textContent = formatCn(todayKey());
load('settings').then((settings) => applyTheme(document.body, settings)).catch(() => {});
route();
