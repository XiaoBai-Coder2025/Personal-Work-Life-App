// 高德安全配置的两种写法：
// proxy —— 安全密钥留在本机服务里，页面只配代理地址（默认）
// plain —— 安全密钥直接交给页面，由 JS API 自己带上；代理方式被高德拒绝时用它
export function securityConfig({ mode = 'proxy', origin = '', secCode = '' } = {}) {
  if (mode === 'plain') return { securityJsCode: secCode };
  return { serviceHost: `${origin}/_AMapService` };
}
