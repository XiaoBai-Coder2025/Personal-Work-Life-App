import { h, clear, toast } from '../core/ui.js';
import { load, save } from '../core/api.js';
import { bestOrder, departPlan, haversineKm, estimateMinutes, totalCost } from '../core/route.js';
import { loadAmap, searchNearby, geocode, lngLatToName, planLeg } from '../core/amap.js';
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
      overlays: [],
      searchState: '',
      city: '',
      routeInfo: {},
      routeKey: '',
      optimizing: false,
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

// 优化顺序用真实耗时：先补齐各点对的路线，再在这些数字上找最短
async function optimizeOrder() {
  const ids = state.order.map((id) => byId(id)).filter(Boolean);
  if (ids.length < 3) {
    toast('至少三个点才能优化顺序');
    return;
  }
  if (ids.some((place) => place.lng == null)) {
    toast('有地点还没有坐标：先搜索标记，或者直接在地图上点一下');
    return;
  }
  state.optimizing = true;
  draw();
  for (const from of ids) {
    for (const to of ids) {
      if (from.id === to.id) continue;
      const key = `${from.id}>${to.id}`;
      if (state.routeInfo[key] && !state.routeInfo[key].error) continue;
      try {
        // 同一段用当前选的交通方式
        state.routeInfo[key] = await planLeg(from, to, state.legMode[key] ?? 'metro', state.city.trim());
      } catch (err) {
        state.routeInfo[key] = { error: err.message };
      }
    }
  }
  const cost = (a, b) => {
    const info = state.routeInfo[`${a}>${b}`];
    if (info && !info.error) return info.minutes;
    return legMinutes(a, b);
  };
  const before = totalCost(state.order, cost);
  const best = bestOrder(ids, cost);
  const improved = best.total < before;
  if (improved) state.order = best.order;
  state.optimizing = false;
  toast(improved
    ? `优化完成：${before} 分钟 → ${best.total} 分钟，少走 ${before - best.total} 分钟`
    : `当前顺序已经是最短的（共 ${before} 分钟）`);
  draw();
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
  if (!state.map) {
    // 建地图前必须把容器清干净，否则之前画的示意图会盖在地图上、也会挡住点击
    box.replaceChildren();
    const view = state.view ?? {};
    const first = state.places.find((p) => p.lng != null);
    try {
      state.map = new state.amap.Map('amap', {
        zoom: view.zoom ?? 12,
        center: view.center ?? (first ? [first.lng, first.lat] : [118.79, 32.05]),
      });
    } catch (err) {
      state.map = null;
      state.mapError = `地图对象没建起来：${err.message}`;
      drawSchematic(box);
      return;
    }
    // 初始化时容器可能还没量到尺寸，主动重算一次；窗口变化时也跟着重算
    setTimeout(() => {
      try {
        state.map?.resize();
      } catch {
        /* 忽略 */
      }
    }, 300);
    if (!state.resizeBound) {
      state.resizeBound = true;
      window.addEventListener('resize', () => {
        try {
          state.map?.resize();
        } catch {
          /* 忽略 */
        }
      });
    }
    // 直接在地图上点一下就能标记一个地点
    state.map.on('click', async (event) => {
      const point = lngLatToName(event.lnglat);
      state.places.push({
        id: `p${Date.now()}`,
        name: state.query.trim() || `标记点 ${state.places.length + 1}`,
        tag: '自己标的',
        lng: point.lng,
        lat: point.lat,
      });
      state.query = '';
      await persist();
      toast('已在地图上的这个位置标记一个点');
      draw();
    });
  } else if (state.overlays.length) {
    state.overlays.forEach((overlay) => overlay.setMap(null));
    state.overlays = [];
  }
  for (const place of state.places) {
    if (place.lng == null) continue;
    const active = state.order.includes(place.id);
    const marker = new state.amap.Marker({
      position: [place.lng, place.lat],
      title: place.name,
      label: { content: place.name, direction: 'top' },
      opacity: active ? 1 : 0.55,
    });
    marker.on('click', () => {
      state.order = state.order.includes(place.id)
        ? state.order.filter((x) => x !== place.id)
        : [...state.order, place.id];
      draw();
    });
    marker.setMap(state.map);
    state.overlays.push(marker);
  }
  drawRoute();
}

// 画真实路线：拿不到（缺城市、插件失败）就退回直线，并标记为估算
function drawRoute() {
  const legs = [];
  for (let i = 0; i < state.order.length - 1; i += 1) {
    const from = byId(state.order[i]);
    const to = byId(state.order[i + 1]);
    if (from?.lng == null || to?.lng == null) continue;
    legs.push({ from, to, key: `${from.id}>${to.id}` });
  }
  for (const leg of legs) {
    const mode = state.legMode[leg.key] ?? 'metro';
    const straight = [[leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat]];
    const cached = state.routeInfo[leg.key];
    const path = cached?.path?.length > 1 ? cached.path : straight;
    const line = new state.amap.Polyline({
      path,
      strokeColor: mode === 'walk' ? '#0d9488' : mode === 'drive' ? '#2f6feb' : '#7c5cff',
      strokeWeight: 5,
      strokeStyle: cached ? 'solid' : 'dashed',
      showDir: true,
      lineJoin: 'round',
    });
    line.setMap(state.map);
    state.overlays.push(line);
  }
  // 没算过的路段去要高德算一次真实路线，回来后再画一遍
  const pending = legs.filter((leg) => !state.routeInfo[leg.key]);
  if (!pending.length) return;
  const signature = pending.map((leg) => leg.key + (state.legMode[leg.key] ?? 'metro')).join('|');
  if (state.routeKey === signature) return;
  state.routeKey = signature;
  (async () => {
    for (const leg of pending) {
      const mode = state.legMode[leg.key] ?? 'metro';
      try {
        const info = await planLeg(leg.from, leg.to, mode, state.city.trim());
        state.routeInfo[leg.key] = info;
      } catch (err) {
        state.routeInfo[leg.key] = { error: err.message };
      }
    }
    state.routeKey = '';
    draw();
  })();
}

function mapDiagnostic() {
  const box = document.getElementById('amap');
  if (!box) return '';
  const canvas = box.querySelector('canvas');
  const size = `${box.clientWidth}×${box.clientHeight}`;
  return `画布 ${canvas ? '有' : '无'} · 容器 ${size}`;
}

function draw() {
  // 重画会换掉地图容器，旧实例随之失效：先记住视角再销毁，重建后标记才会立刻出现
  if (state.map) {
    try {
      const center = state.map.getCenter();
      state.view = { center: [center.getLng(), center.getLat()], zoom: state.map.getZoom() };
      state.map.destroy();
    } catch {
      /* 忽略 */
    }
    state.map = null;
    state.overlays = [];
    state.routeKey = '';
  }
  const view = document.getElementById('view');
  clear(view);
  const { legs, travel, depart } = plan();

  const placeRows = state.places.map((place) => {
    const inRoute = state.order.includes(place.id);
    return h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' },
      h('button', {
        class: `placebtn${inRoute ? ' picked' : ''}`,
        style: 'padding:6px 9px',
        title: inRoute ? '点一下移出路线' : '点一下加入路线',
        onclick: () => {
          state.order = inRoute
            ? state.order.filter((x) => x !== place.id)
            : [...state.order, place.id];
          draw();
        },
      }, inRoute ? '在路线' : '加入'),
      h('input', {
        type: 'text',
        value: place.name,
        style: 'flex:1;min-width:80px',
        onchange: async (event) => {
          place.name = event.target.value.trim() || place.name;
          await persist();
          draw();
        },
      }),
      place.lng == null ? h('span', { class: 'chip' }, '无坐标') : null,
      h('button', {
        class: 'ghost',
        title: '删除这个地点',
        onclick: async () => {
          state.places = state.places.filter((p) => p.id !== place.id);
          state.order = state.order.filter((x) => x !== place.id);
          await persist();
          draw();
        },
      }, '×'),
    );
  });

  view.append(
    h('section', { class: 'panel' },
      h('h2', {}, '地图工具'),
      h('div', { class: 'row' },
        h('span', { class: `chip${state.amap ? ' ok' : state.mapError ? ' warn' : ''}` },
          state.amap ? '地图已加载' : state.mapError ? '地图未加载' : '正在加载地图…'),
        state.amap ? h('span', { class: 'chip' }, mapDiagnostic()) : null,
        state.amap ? h('button', {
          class: 'ghost',
          onclick: () => {
            try {
              state.map?.destroy();
            } catch {
              /* 忽略 */
            }
            state.map = null;
            state.overlays = [];
            draw();
          },
        }, '重新加载地图') : null,
        h('span', { class: 'muted small' },
          state.mapError || '左侧是地点与周边，右侧是顺序与行程；在地图上点一下就能标记一个点。')),
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
          h('input', {
            type: 'text',
            placeholder: '城市',
            style: 'max-width:78px',
            title: '高德的地点搜索按城市找更准，留空则全国范围',
            value: state.city,
            oninput: (e) => { state.city = e.target.value; },
          }),
          h('button', {
            class: 'primary',
            onclick: async () => {
              if (!state.query.trim()) return;
              state.searchState = '正在搜索…';
              draw();
              try {
                const res = await fetch(`/api/poi?keywords=${encodeURIComponent(state.query.trim())}&city=${encodeURIComponent(state.city.trim())}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? '搜索失败');
                state.results = data.items ?? [];
                state.searchState = data.message
                  ? data.message
                  : state.results.length
                    ? `找到 ${state.results.length} 个，点「标记」加到地图`
                    : '没有搜到结果：换个写法，或者把城市填上再试';
              } catch (err) {
                state.results = [];
                state.searchState = `搜索失败：${err.message}`;
              }
              draw();
            },
          }, '搜索')),
        h('p', { class: 'small muted', style: 'margin:2px 0 4px' },
          state.searchState || '搜不到也可以直接在地图上点一下，就在那个位置打标记。'),
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
        (state.settings.amapWebKey ?? '').trim() ? null : h('p', { class: 'small muted' },
          '提示：路线、周边、天气属于高德「Web服务」，需要再填一把 Web服务 Key（数据与设置 → 第三格）。'),
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
            disabled: state.optimizing,
            onclick: () => optimizeOrder(),
          }, state.optimizing ? '正在计算各点之间的耗时…' : '优化顺序'),
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
          ? legs.map((leg) => {
            const info = state.routeInfo[`${leg.from}>${leg.to}`];
            return h('div', { class: 'row' },
            h('span', { class: 'grow small' }, `${byId(leg.from)?.name} → ${byId(leg.to)?.name}`),
            h('span', { class: `chip${info && !info.error ? ' ok' : ''}` },
              info?.error
                ? `${leg.minutes} 分钟（估算）`
                : info ? `${info.minutes} 分钟 · ${info.km} 公里` : `${leg.minutes} 分钟（估算）`),
            h('select', {
              onchange: (e) => {
                state.legMode[`${leg.from}>${leg.to}`] = e.target.value;
                state.routeKey = '';
                draw();
              },
            }, Object.entries(MODE_NAMES).map(([value, name]) => h('option', {
              value,
              selected: leg.mode === value,
            }, name))));
          })
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
      draw();
      return;
    }
    try {
      state.amap = await loadAmap(state.settings);
      // 拿到 SDK 后整页重画：这一次 #amap 是干净容器，地图才建得起来
      if (state.map) {
        state.map.destroy();
        state.map = null;
        state.overlays = [];
      }
    } catch (err) {
      state.mapError = `${err.message}。还可以试试：把「数据与设置」里的地图密钥方式改成「明文」再打开本页。`;
    }
    draw();
  }
}
