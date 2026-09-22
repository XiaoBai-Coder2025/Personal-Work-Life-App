let loading = null;

export function amapReady() {
  return !!globalThis.AMap;
}

export async function loadAmap(settings) {
  if (globalThis.AMap) return globalThis.AMap;
  if (!settings?.amapJsKey) throw new Error('还没有配置高德 JS Key，请到「数据与设置」里填写。');
  if (loading) return loading;
  // 高德要求 serviceHost 必须带 /_AMapService 这一段，少写就会提示「代理服务请以_AMapService作为一级路由」
  globalThis._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
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
  return new Promise((resolve, reject) => {
    if (!globalThis.AMap?.PlaceSearch) return reject(new Error('地图插件还没准备好'));
    const search = new globalThis.AMap.PlaceSearch({ pageSize: 5 });
    search.search(keyword, (status, result) => {
      if (status !== 'complete') return reject(new Error('没有搜到结果'));
      const list = (result.poiList?.pois ?? []).map((poi) => ({
        name: poi.name,
        address: poi.address ?? poi.pname ?? '',
        lng: poi.location?.lng,
        lat: poi.location?.lat,
      }));
      return resolve(list);
    });
  });
}

export function searchNearby(keyword, center) {
  return new Promise((resolve, reject) => {
    if (!globalThis.AMap?.PlaceSearch) return reject(new Error('地图插件还没准备好'));
    const search = new globalThis.AMap.PlaceSearch({ pageSize: 5 });
    search.searchNearBy(keyword, center, 1500, (status, result) => {
      if (status !== 'complete') return reject(new Error('附近没有搜到结果'));
      const list = (result.poiList?.pois ?? []).map((poi) => ({
        name: poi.name,
        address: poi.address ?? '',
        distance: poi.distance,
      }));
      return resolve(list);
    });
  });
}

export function geocode(address) {
  return new Promise((resolve, reject) => {
    if (!globalThis.AMap?.Geocoder) return reject(new Error('地图插件还没准备好'));
    const geocoder = new globalThis.AMap.Geocoder();
    geocoder.getLocation(address, (status, result) => {
      if (status !== 'complete' || !result.geocodes?.length) return reject(new Error('没找到这个地址'));
      const { lng, lat } = result.geocodes[0].location;
      return resolve({ lng, lat });
    });
  });
}
