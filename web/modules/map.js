import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { bestOrder, departPlan, haversineKm, estimateMinutes } from '../core/route.js';
import { loadAmap, searchPlace, searchNearby, geocode } from '../core/amap.js';
import { colorFor } from '../core/colors.js';

function drawSchematic(box) {
  const stops = state.order.map((id) => byId(id)).filter(Boolean);
  const { legs } = plan();
  box.replaceChildren(h('div', { class: 'schematic' },
    h('div', { class: 'schematic-head' },
      h('span', { class: `chip${state.mapError ? ' warn' : ''}` }, state.mapError ? '未接地图' : '正在加载'),
      h('span', { class: 'small muted' }, state.mapError || '正在加载地图…')),
    stops.length
      ? stops.flatMap((place, index) => {
        const leg = legs[index];
        return [
          h('div', { class: 'stop' },
            h('span', { class: 'stop-dot', style: `background:${colorFor(place.name)}` }, place.name.slice(0, 1)),
            h('span', { class: 'stop-body' },
              h('b', {}, place.name),
              place.tag ? h('span', { class: 'small muted' }, `· ${place.tag}`) : null)),
          leg ? h('div', { class: 'leg' },
            h('span', { class: 'leg-line' }),
            h('span', { class: 'small muted' },
              `${MODE_NAMES[state.legMode[`${leg.from}>${leg.to}`] ?? 'metro']} ${leg.minutes} 分钟`)) : null,
        ];
      })
      : [h('p', { class: 'muted' }, '左边还没有勾选地点')],
    state.mapError
      ? h('a', { class: 'docklink', href: '#/settings', style: 'margin-top:8px' }, '去「数据与设置」填高德 Key ›')
      : null,
  ));
}

const MODE_NAMES = { metro: '地铁', transit: '公交', ride: '骑行', drive: '驾车', walk: '步行' };
const POIS = ['地铁站', '打印店', '咖啡', '餐厅', '超市', '药店', '银行', '快递点', '便利店', '停车场'];
const HOLIDAY_FACTOR = 1.35;

let state = null;

async function ensure() {
  const [places, settings] = await Promise.all([load('places'), load('settings')]);
  const items = places.items ?? [];
  if (!state) {
    state = {
      order: items.slice(0, 3).map((p) => p.id),
      legMode: {},
      arriveAt: '15:00',
      chosen: '',
      holiday: false,
      query: '',
      results: [],
      poi: '',
      poiResults: [],
      mapError: '',
      map: null,
      amap: null,
    };
  }
  state.places = items;
  state.settings = settings ?? {};
  state.order = state.order.filter((id) => items.some((p) => p.id === id));
  return state;
}

const byId = (id) => state.places.find((p) => p.id === id);
const distKm = (a, b) => (a?.lng != null && b?.lng != null ? haversineKm(a, b) : 4);

function legMinutes(fromId, toId) {
  const from = byId(fromId);
  const to = byId(toId);
  const mode = state.legMode[`${fromId}>${toId}`] ?? 'metro';
  const base = estimateMinutes(distKm(from, to), mode);
  return state.holiday ? Math.round(base * HOLIDAY_FACTOR) : base;
}

function plan() {
  const legs = [];
  let travel = 0;
  for (let i = 0; i < state.order.length - 1; i += 1) {
    const from = state.order[i];
    const to = state.order[i + 1];
    const minutes = legMinutes(from, to);
    travel += minutes;
    legs.push({ from, to, minutes, mode: state.legMode[`${from}>${to}`] ?? 'metro' });
  }
  const depart = departPlan({
    arriveAt: state.arriveAt,
    travelMinutes: travel,
    chosen: state.chosen || undefined,
  });
  return { legs, travel, depart };
}

async function persist() {
  await save('places', { version: 1, items: state.places });
}

function drawMap() {
  const box = document.getElementById('amap');
  if (!box) return;
  if (!state.amap) {
    drawSchematic(box);
    return;
  }
  box.innerHTML = '';
  const center = state.places.find((p) => p.lng != null);
  state.map = new state.amap.Map('amap', {
    zoom: 12,
    center: center ? [center.lng, center.lat] : [118.79, 32.05],
  });
  for (const place of state.places) {
    if (place.lng == null) continue;
    const active = state.order.includes(place.id);
    new state.amap.Marker({
      position: [place.lng, place.lat],
      title: place.name,
      label: { content: place.name, direction: 'top' },
      opacity: active ? 1 : 0.55,
    }).setMap(state.map);
  }
  const line = state.order.map((id) => byId(id)).filter((p) => p?.lng != null);
  if (line.length > 1) {
    new state.amap.Polyline({
      path: line.map((p) => [p.lng, p.lat]),
      strokeColor: '#0d9488',
      strokeWeight: 4,
    }).setMap(state.map);
  }
}

function draw() {
  const view = document.getElementById('view');
  clear(view);
  const { legs, travel, depart } = plan();

  const placeRows = state.places.map((place, index) => h('div', { class: 'row' },
    h('button', {
      class: `placebtn${state.order.includes(place.id) ? ' picked' : ''}`,
      onclick: () => {
        state.order = state.order.includes(place.id)
          ? state.order.filter((x) => x !== place.id)
          : [...state.order, place.id];
        draw();
      },
    }, `${place.name}${place.tag ? ` · ${place.tag}` : ''}${place.lng == null ? '（无坐标）' : ''}`),
    h('button', {
      class: 'ghost',
      onclick: async () => {
        state.places.splice(index, 1);
        state.order = state.order.filter((x) => x !== place.id);
        await persist();
        draw();
      },
    }, '×')));

  view.append(
    h('section', { class: 'panel' },
      h('h2', {}, '地图工具'),
      h('p', { class: 'muted' }, '左侧是地点与周边，右侧是顺序与行程；地图铺满中间。没有配 Key 时仍然可以估算顺序与出发时间。'),
    ),
    h('div', { class: 'mapwrap' },
      h('div', { id: 'amap', class: 'mapcanvas' }),
      h('div', { class: 'float left' },
        h('h3', {}, `找地点（已标记 ${state.places.length}）`),
        h('div', { class: 'row' },
          h('input', {
            type: 'text',
            placeholder: '搜学校、地铁站、店名',
            value: state.query,
            oninput: (e) => { state.query = e.target.value; },
          }),
          h('button', {
            class: 'primary',
            onclick: async () => {
              if (!state.query.trim()) return;
              try {
                state.results = await searchPlace(state.query.trim());
                if (!state.results.length) toast('没有搜到结果');
              } catch (err) {
                toast(err.message);
              }
              draw();
            },
          }, '搜索')),
        state.results.map((result) => h('div', { class: 'row' },
          h('span', { class: 'grow small' }, `${result.name} · ${result.address}`),
          h('button', {
            onclick: async () => {
              state.places.push({
                id: `p${Date.now()}`,
                name: result.name,
                tag: '搜到的',
                lng: result.lng,
                lat: result.lat,
              });
              state.results = state.results.filter((x) => x !== result);
              await persist();
              toast(`已标记 ${result.name}`);
              draw();
            },
          }, '标记'))),
        h('h3', {}, '已标记'),
        placeRows.length ? placeRows : h('p', { class: 'muted' }, '还没有地址，先到「数据与设置」里加常用地址'),
        h('h3', {}, '周边'),
        h('div', { class: 'row' }, POIS.map((poi) => h('button', {
          class: state.poi === poi ? 'primary' : '',
          onclick: async () => {
            state.poi = poi;
            const last = byId(state.order[state.order.length - 1]) ?? state.places[0];
            if (!last) return toast('先标记一个地点');
            try {
              let center = [last.lng, last.lat];
              if (last.lng == null) {
                const point = await geocode(last.name);
                last.lng = point.lng;
                last.lat = point.lat;
                center = [point.lng, point.lat];
                await persist();
              }
              state.poiResults = await searchNearby(poi, center);
              draw();
            } catch (err) {
              toast(err.message);
            }
          },
        }, poi))),
        state.poiResults.map((item) => h('div', { class: 'small muted' },
          `${item.name}${item.distance ? ` · ${item.distance} 米` : ''}`)),
      ),
      h('div', { class: 'float right' },
        h('h3', {}, `经过顺序（${state.order.length} 个点）`),
        state.order.map((id, index) => h('div', { class: 'row' },
          h('span', { class: 'grow' }, `${index + 1}. ${byId(id)?.name ?? ''}`),
          h('button', {
            class: 'ghost',
            onclick: () => {
              if (index === 0) return;
              const list = [...state.order];
              [list[index - 1], list[index]] = [list[index], list[index - 1]];
              state.order = list;
              draw();
            },
          }, '↑'),
          h('button', {
            class: 'ghost',
            onclick: () => {
              if (index === state.order.length - 1) return;
              const list = [...state.order];
              [list[index + 1], list[index]] = [list[index], list[index + 1]];
              state.order = list;
              draw();
            },
          }, '↓'))),
        h('div', { class: 'row' },
          h('button', {
            class: 'primary',
            onclick: () => {
              if (state.order.length < 3) return toast('至少三个点才能优化顺序');
              const before = plan().travel;
              const ids = state.order.map((id) => byId(id));
              const result = bestOrder(ids, (a, b) => legMinutes(a.id, b.id));
              state.order = result.order;
              const after = plan().travel;
              toast(`优化完成：${before} 分钟 → ${after} 分钟，少走 ${before - after} 分钟`);
              draw();
            },
          }, '优化顺序'),
          h('button', {
            onclick: () => {
              state.holiday = !state.holiday;
              toast(state.holiday ? '按节假日算，加了管制与拥堵' : '切回平日估算');
              draw();
            },
          }, state.holiday ? '按节假日算' : '按平日算')),
        h('h3', {}, '几点出门'),
        h('div', { class: 'row' },
          h('span', { class: 'muted small' }, '要求到达'),
          h('input', {
            type: 'time',
            value: state.arriveAt,
            onchange: (e) => {
              state.arriveAt = e.target.value;
              draw();
            },
          })),
        h('div', { class: 'row' },
          h('span', { class: 'muted small' }, '自己定出发'),
          h('input', {
            type: 'time',
            value: depart.chosen,
            onchange: (e) => {
              state.chosen = e.target.value;
              draw();
            },
          }),
          h('button', {
            onclick: () => {
              state.chosen = '';
              draw();
            },
          }, '用推荐')),
        h('p', { class: depart.late ? 'warn' : 'muted' },
          depart.late
            ? `按 ${depart.chosen} 出发，路上 ${depart.travel} 分钟，会迟到 ${depart.late} 分钟`
            : `推荐 ${depart.recommend} 出发（路上 ${depart.travel} 分钟 + 留 5 分钟）`),
        h('h3', {}, '逐段行程'),
        legs.length
          ? legs.map((leg) => h('div', { class: 'row' },
            h('span', { class: 'grow small' }, `${byId(leg.from)?.name} → ${byId(leg.to)?.name}`),
            h('span', { class: 'chip' }, `${leg.minutes} 分钟`),
            h('select', {
              onchange: (e) => {
                state.legMode[`${leg.from}>${leg.to}`] = e.target.value;
                draw();
              },
            }, Object.entries(MODE_NAMES).map(([value, name]) => h('option', {
              value,
              selected: leg.mode === value,
            }, name)))))
          : h('p', { class: 'muted' }, '至少选两个点'),
        h('p', { class: 'muted small' },
          `总耗时 ${travel} 分钟；${state.holiday ? '已按节假日系数放大' : '按平日估算'}`),
      ),
    ),
  );
  drawMap();
}

export async function renderMap(root) {
  await ensure();
  draw();
  if (!state.amap && !state.mapError) {
    const jsKey = (state.settings.amapJsKey ?? '').trim();
    const sec = (state.settings.amapSecCode ?? '').trim();
    if (!jsKey || !sec) {
      state.mapError = !jsKey
        ? '还没有配置高德 JS Key，请到「数据与设置」里填写。'
        : '还没有配置高德安全密钥。JS API 的安全模式必须配它：在高德控制台同一个应用里复制「安全密钥」，填到「数据与设置」的第二格。';
      drawMap();
      return;
    }
    try {
      state.amap = await loadAmap(state.settings);
    } catch (err) {
      state.mapError = `${err.message}。还可以试试：把「数据与设置」里的地图密钥方式改成「明文」再打开本页。`;
    }
    drawMap();
  }
}
