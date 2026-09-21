import { formatCn, todayKey } from './core/dates.js';
import { clear, h } from './core/ui.js';
import { renderSettings } from './modules/settings.js';
import { renderCalendar } from './modules/calendar.js';

const ROUTES = [
  { hash: '#/home', title: '首页总览' },
  { hash: '#/today', title: '今日计划' },
  { hash: '#/calendar', title: '日历日程', render: renderCalendar },
  { hash: '#/work', title: '任务追踪' },
  { hash: '#/map', title: '地图工具' },
  { hash: '#/ai', title: 'AI 助手' },
  { hash: '#/settings', title: '数据与设置', render: renderSettings },
];

const nav = document.getElementById('nav');
const view = document.getElementById('view');

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
}

window.addEventListener('hashchange', route);
document.getElementById('today-label').textContent = formatCn(todayKey());
route();
