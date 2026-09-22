import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityConfig } from '../web/core/amap-config.js';

test('代理方式必须带上 /_AMapService 前缀', () => {
  const config = securityConfig({ mode: 'proxy', origin: 'http://127.0.0.1:4317' });
  assert.equal(config.serviceHost, 'http://127.0.0.1:4317/_AMapService');
  assert.equal(config.securityJsCode, undefined);
});

test('明文方式把安全密钥交给页面', () => {
  const config = securityConfig({ mode: 'plain', origin: 'http://127.0.0.1:4317', secCode: 'abc123' });
  assert.equal(config.securityJsCode, 'abc123');
  assert.equal(config.serviceHost, undefined);
});

test('不填方式时默认代理', () => {
  const config = securityConfig({ origin: 'http://localhost:4317' });
  assert.equal(config.serviceHost, 'http://localhost:4317/_AMapService');
});
