import { securityConfig } from './amap-config.js';

let loading = null;

export function amapReady() {
  return !!globalThis.AMap;
}

export async function loadAmap(settings) {
  if (globalThis.AMap) return globalThis.AMap;
  if (!settings?.amapJsKey) throw new Error('还没有配置高德 JS Key，请到「数据与设置」里填写。');
  if (loading) return loading;
  globalThis._AMapSecurityConfig = securityConfig({
    mode: settings?.amapKeyMode,
    origin: location.origin,
    secCode: settings?.amapSecCode,
  });
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // 插件不在这里挂：插件名写错会让整个脚本加载失败，改成用到时用 AMap.plugin 按需加载
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(settings.amapJsKey)}`;
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error('高德地图脚本加载超时，请检查网络与 Key'));
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (!globalThis.AMap) {
        loading = null;
        reject(new Error('高德脚本回来了，但没有拿到 AMap：通常是 Key 填错、Key 平台不是「Web端(JS API)」，或这把 Key 被限制'));
        return;
      }
      resolve(globalThis.AMap);
    };
    script.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error('高德地图脚本加载失败，请检查网络与 Key'));
    };
    document.head.append(script);
  });
  return loading;
}

export function searchPlace(keyword) {
  return ensurePlugins(['AMap.PlaceSearch']).then((AMap) => new Promise((resolve, reject) => {
    const search = new AMap.PlaceSearch({ pageSize: 8 });
    search.search(keyword, (status, result) => {
      if (status !== 'complete') return reject(new Error('没有搜到结果'));
      const list = (result.poiList?.pois ?? [])
        .filter((poi) => poi.location)
        .map((poi) => ({
          name: poi.name,
          address: poi.address ?? poi.pname ?? '',
          lng: poi.location.lng,
          lat: poi.location.lat,
        }));
      return resolve(list);
    });
  }));
}

export function searchNearby(keyword, center) {
  return ensurePlugins(['AMap.PlaceSearch']).then((AMap) => new Promise((resolve, reject) => {
    const search = new AMap.PlaceSearch({ pageSize: 5 });
    search.searchNearBy(keyword, center, 1500, (status, result) => {
      if (status !== 'complete') return reject(new Error('附近没有搜到结果'));
      const list = (result.poiList?.pois ?? []).map((poi) => ({
        name: poi.name,
        address: poi.address ?? '',
        distance: poi.distance,
      }));
      return resolve(list);
    });
  }));
}

export function geocode(address) {
  return ensurePlugins(['AMap.Geocoder']).then((AMap) => new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder();
    geocoder.getLocation(address, (status, result) => {
      if (status !== 'complete' || !result.geocodes?.length) return reject(new Error('没找到这个地址'));
      const { lng, lat } = result.geocodes[0].location;
      return resolve({ lng, lat });
    });
  }));
}

export function lngLatToName(lnglat) {
  return { lng: Number(lnglat.getLng().toFixed(6)), lat: Number(lnglat.getLat().toFixed(6)) };
}

const ROUTE_PLUGIN = {
  drive: 'AMap.Driving',
  walk: 'AMap.Walking',
  ride: 'AMap.Riding',
  transit: 'AMap.Transfer',
  metro: 'AMap.Transfer',
};

// 按交通方式真实规划一段路：返回沿途坐标、耗时与距离；公交/地铁需要城市
export async function planLeg(from, to, mode, city = '') {
  const pluginName = ROUTE_PLUGIN[mode] ?? 'AMap.Transfer';
  const needsCity = pluginName === 'AMap.Transfer';
  if (needsCity && !city) throw new Error('公交与地铁需要先填城市');
  const AMap = await ensurePlugins([pluginName]);
  const Ctor = AMap[pluginName.split('.').pop()];
  return new Promise((resolve, reject) => {
    const service = new Ctor({ hideMarkers: true, map: null });
    let settled = false;
    const callback = (status, result) => {
      if (settled) return;
      settled = true;
      if (status !== 'complete' || !result?.routes?.length) return reject(new Error('没规划出路线'));
      const route = result.routes[0];
      const path = (route.steps ?? [])
        .flatMap((step) => step.path ?? [])
        .map((point) => [point.lng, point.lat]);
      if (path.length < 2) return reject(new Error('路线为空'));
      resolve({
        path,
        minutes: Math.max(1, Math.round((route.time ?? 0) / 60)),
        km: Math.round((route.distance ?? 0) / 100) / 10,
      });
    };
    try {
      if (needsCity) service.search([from.lng, from.lat], [to.lng, to.lat], { city, cityd: city }, callback);
      else service.search([from.lng, from.lat], [to.lng, to.lat], callback);
    } catch (err) {
      reject(err);
    }
  });
}

function ensurePlugins(names) {
  return new Promise((resolve, reject) => {
    const AMap = globalThis.AMap;
    if (!AMap) return reject(new Error('地图还没加载好'));
    if (typeof AMap.plugin !== 'function') return resolve(AMap);
    return AMap.plugin(names, () => {
      const missing = names.filter((name) => typeof AMap[name.split('.').pop()] !== 'function');
      if (missing.length) reject(new Error(`地图插件没装上：${missing.join('、')}`));
      else resolve(AMap);
    });
  });
}
