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
  const plugins = ['AMap.PlaceSearch', 'AMap.Geocoder', 'AMap.Driving', 'AMap.Walking', 'AMap.Riding', 'AMap.Transfer'];
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(settings.amapJsKey)}&plugin=${plugins.join(',')}`;
    script.onload = () => resolve(globalThis.AMap);
    script.onerror = () => {
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
