import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [resolve(root, 'scripts/mock-preview.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
const baseUrl = await new Promise((resolveReady, reject) => {
  const timer = setTimeout(() => reject(new Error('本地模拟服务启动超时。\n' + stdout + '\n' + stderr)), 10000);
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
    const match = stdout.match(/MOCK_PREVIEW_READY (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      clearTimeout(timer);
      resolveReady(match[1]);
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.once('exit', code => {
    clearTimeout(timer);
    reject(new Error('本地模拟服务提前退出，代码 ' + code + '\n' + stdout + '\n' + stderr));
  });
});

async function api(action, body = {}, session = '') {
  const response = await fetch(baseUrl + '/.netlify/functions/hq-api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: 'Bearer ' + session } : {})
    },
    body: JSON.stringify({ action, ...body })
  });
  return { status: response.status, body: await response.json() };
}

try {
  const page = await fetch(baseUrl + '/');
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes('本地模拟环境'));
  assert.ok(html.includes('不连接正式 Google Sheets'));

  const health = await (await fetch(baseUrl + '/__mock/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.version, 1);
  assert.equal(health.houses, 3);

  const unauthorized = await api('begin', { uploadId: 'mock-upload-0001', expectedVersion: 1 });
  assert.equal(unauthorized.status, 401, '写入必须先经过模拟 PIN 登录');

  const login = await api('login', { pin: '1234' });
  assert.equal(login.status, 200);
  const session = login.body.session;
  assert.ok(session);

  const loaded = await api('load');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.state.houses.length, 3);
  const nextState = structuredClone(loaded.body.state);
  nextState.houses[0].note = 'LOCAL-MOCK-SYNC-TEST';

  const uploadId = 'mock-upload-0001';
  const begin = await api('begin', { uploadId, expectedVersion: loaded.body.version }, session);
  assert.equal(begin.status, 200);
  const payload = JSON.stringify(nextState);
  const chunkSize = 320;
  const total = Math.ceil(payload.length / chunkSize);
  for (let index = 0; index < total; index += 1) {
    const result = await api('chunk', {
      uploadId,
      index,
      total,
      expectedVersion: loaded.body.version,
      data: payload.slice(index * chunkSize, (index + 1) * chunkSize)
    }, session);
    assert.equal(result.status, 200);
  }

  const commit = await api('commit', { uploadId }, session);
  assert.equal(commit.status, 200);
  assert.equal(commit.body.version, 2);

  const readBack = await api('load');
  assert.equal(readBack.body.state.houses[0].note, 'LOCAL-MOCK-SYNC-TEST');
  assert.equal(readBack.body.state.houses.length, 3);

  const reset = await fetch(baseUrl + '/__mock/reset', { method: 'POST' });
  assert.equal(reset.status, 200);
  const restored = await api('load');
  assert.equal(restored.body.version, 1);
  assert.notEqual(restored.body.state.houses[0].note, 'LOCAL-MOCK-SYNC-TEST');
  assert.equal(restored.body.state.houses.length, 3);

  console.log('PASS local mock preview: banner, isolated seed data, PIN gate, snapshot write/read-back, reset; production data untouched');
} finally {
  child.kill();
}
