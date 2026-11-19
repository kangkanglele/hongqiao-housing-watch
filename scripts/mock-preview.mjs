import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = resolve(ROOT, 'site');
const INDEX_HTML = await readFile(resolve(SITE, 'index.html'), 'utf8');
const SESSION_ID = randomUUID();
const SESSION_TOKEN = 'local-mock-session';
const MAX_BODY = 6 * 1024 * 1024;

function makeSource(channel, id, date) {
  const host = channel === '贝壳' ? 'm.ke.com' : 'm.5i5j.com';
  const url = 'https://' + host + '/tj/ershoufang/' + id + '.html';
  return {
    channel,
    platformId: id,
    url,
    originalUrl: url,
    urlType: '模拟官方详情链接',
    relation: '本地模拟数据，不对应真实挂牌',
    checked: date
  };
}

function makeSeed() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 4,
    created: today,
    scopes: [
      { id: 'SIM-S1', name: '水木天成翠杨园', group: '水木天成', env: 'A', priority: '模拟核心内圈', note: '仅用于界面和筛选测试' },
      { id: 'SIM-S2', name: '水木天成依湖园', group: '水木天成', env: 'B', priority: '模拟核心内圈', note: '仅用于界面和筛选测试' },
      { id: 'SIM-S3', name: '民畅园', group: '师范附小周边', env: 'B', priority: '模拟候选', note: '仅用于界面和筛选测试' }
    ],
    benchmarks: [],
    marketScans: [],
    saleLeads: [],
    houses: [
      {
        id: 'SIM-HQ-0001',
        origin: '模拟数据',
        community: '水木天成翠杨园',
        title: '【模拟】南向两室 · 普通中间楼层',
        area: 82.6,
        price: 78.8,
        rooms: '2室1厅',
        floor: 5,
        total: 7,
        floorBand: '中楼层/7层',
        elevator: '有',
        noise: '安静',
        legal: '待核实',
        decoration: '简装',
        orient: '南',
        env: 'A',
        defects: [],
        drawbacks: ['oldDecoration'],
        suitability: '待判断',
        stage: '重点关注',
        top: false,
        duplex: false,
        firstSeen: today,
        lastSeen: today,
        note: '本地模拟房源：用于测试列表、详情、筛选和保存。不是实际挂牌。',
        sources: [makeSource('贝壳', '00000000001', today)],
        events: [{ id: 'SIM-EVT-1', date: today, kind: 'manual', title: '模拟录入', desc: '仅用于本地界面测试，不作为市场样本。' }]
      },
      {
        id: 'SIM-HQ-0002',
        origin: '模拟数据',
        community: '水木天成依湖园',
        title: '【模拟】南北通透小两室',
        area: 74.3,
        price: 72,
        rooms: '2室1厅',
        floor: 3,
        total: 6,
        floorBand: '中楼层/6层',
        elevator: '有',
        noise: '未知',
        legal: '待核实',
        decoration: '中装',
        orient: '南北',
        env: 'B',
        defects: [],
        drawbacks: [],
        suitability: '待判断',
        stage: '观察中',
        top: false,
        duplex: false,
        firstSeen: today,
        lastSeen: today,
        note: '本地模拟房源：用于测试普通住宅的待核验状态。不是实际挂牌。',
        sources: [makeSource('我爱我家', '00000000002', today)],
        events: [{ id: 'SIM-EVT-2', date: today, kind: 'manual', title: '模拟录入', desc: '仅用于本地界面测试，不作为市场样本。' }]
      },
      {
        id: 'SIM-HQ-0003',
        origin: '模拟数据',
        community: '民畅园',
        title: '【模拟】无电梯四层小两室',
        area: 56.2,
        price: 49.5,
        rooms: '2室1厅',
        floor: 4,
        total: 6,
        floorBand: '中楼层/6层',
        elevator: '无',
        noise: '一般可接受',
        legal: '待核实',
        decoration: '老装修',
        orient: '南',
        env: 'B',
        defects: [],
        drawbacks: ['oldDecoration', 'oldBuilding'],
        suitability: '待判断',
        stage: '观察中',
        top: false,
        duplex: false,
        firstSeen: today,
        lastSeen: today,
        note: '本地模拟房源：用于测试无电梯楼层硬伤规则。不是实际挂牌。',
        sources: [makeSource('贝壳', '00000000003', today)],
        events: [{ id: 'SIM-EVT-3', date: today, kind: 'manual', title: '模拟录入', desc: '仅用于本地界面测试，不作为市场样本。' }]
      }
    ],
    quarantine: [],
    listingCandidates: [],
    linkLedger: [],
    visitSessions: [],
    pageConfig: {}
  };
}

let state = makeSeed();
let version = 1;
let updatedAt = new Date().toISOString();
let configHash = 'local-config-1';
const uploads = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'x-robots-tag': 'noindex'
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('模拟请求超过 6 MB 限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function conflict(res) {
  sendJson(res, 409, { ok: false, conflict: true, version, error: '本地模拟数据版本已变化，请先重新读取。' });
}

async function handleApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '本地模拟接口仅接受 POST。' });
    return;
  }

  let data;
  try {
    data = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || '请求格式错误。' });
    return;
  }

  const action = String(data.action || '');
  if (action === 'login') {
    if (!/^\d{4}$/.test(String(data.pin || ''))) {
      sendJson(res, 400, { ok: false, error: '请输入任意四位数字 PIN。' });
      return;
    }
    sendJson(res, 200, { ok: true, session: SESSION_TOKEN, expiresIn: 86400000 });
    return;
  }

  if (action === 'load') {
    sendJson(res, 200, { ok: true, state: structuredClone(state), version, updatedAt });
    return;
  }
  if (action === 'ping') {
    sendJson(res, 200, { ok: true, version });
    return;
  }

  if (req.headers.authorization !== 'Bearer ' + SESSION_TOKEN) {
    sendJson(res, 401, { ok: false, error: '模拟环境未解锁，请输入任意四位数字 PIN。' });
    return;
  }

  if (action === 'config') {
    sendJson(res, 200, { ok: true, config: state.pageConfig || {}, hash: configHash });
    return;
  }

  if (action === 'configSave') {
    try {
      const next = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('页面配置格式不正确。');
      if (data.expectedHash && data.expectedHash !== configHash) {
        sendJson(res, 409, { ok: false, conflict: true, error: '模拟页面配置版本已变化。' });
        return;
      }
      state.pageConfig = next;
      configHash = 'local-config-' + Date.now();
      updatedAt = new Date().toISOString();
      sendJson(res, 200, { ok: true, config: state.pageConfig, hash: configHash });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || '配置保存失败。' });
    }
    return;
  }

  if (action === 'snapshotCommit') {
    if (Number(data.expectedVersion) !== version) {
      conflict(res);
      return;
    }
    const next = data.state;
    if (!next || typeof next !== 'object' || !Array.isArray(next.houses) || !Array.isArray(next.scopes)) {
      sendJson(res, 400, { ok: false, error: '模拟快照缺少 houses 或 scopes。' });
      return;
    }
    for (const key of ['benchmarks', 'marketScans', 'saleLeads', 'quarantine', 'listingCandidates', 'linkLedger', 'visitSessions']) {
      if (!Array.isArray(next[key])) next[key] = [];
    }
    state = next;
    version += 1;
    updatedAt = new Date().toISOString();
    sendJson(res, 200, { ok: true, version, updatedAt, houses: state.houses.length, scopes: state.scopes.length, snapshotId: 'mock-atomic-commit' });
    return;
  }

  if (action === 'begin') {
    const uploadId = String(data.uploadId || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(uploadId)) {
      sendJson(res, 400, { ok: false, error: '模拟上传编号格式不正确。' });
      return;
    }
    if (Number(data.expectedVersion) !== version) {
      conflict(res);
      return;
    }
    uploads.set(uploadId, { expectedVersion: version, total: 0, chunks: [] });
    sendJson(res, 200, { ok: true, uploadId, expectedVersion: version });
    return;
  }

  if (action === 'chunk') {
    const upload = uploads.get(String(data.uploadId || ''));
    if (!upload) {
      sendJson(res, 404, { ok: false, error: '找不到这次模拟上传。' });
      return;
    }
    if (upload.expectedVersion !== version || Number(data.expectedVersion) !== version) {
      conflict(res);
      return;
    }
    const index = Number(data.index);
    const total = Number(data.total);
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 2000 || index < 0 || index >= total) {
      sendJson(res, 400, { ok: false, error: '模拟分片序号不正确。' });
      return;
    }
    if (upload.total && upload.total !== total) {
      sendJson(res, 400, { ok: false, error: '模拟分片总数不一致。' });
      return;
    }
    upload.total = total;
    upload.chunks[index] = String(data.data || '');
    sendJson(res, 200, { ok: true, index });
    return;
  }

  if (action === 'commit') {
    const uploadId = String(data.uploadId || '');
    const upload = uploads.get(uploadId);
    if (!upload) {
      sendJson(res, 404, { ok: false, error: '找不到这次模拟上传。' });
      return;
    }
    if (upload.expectedVersion !== version) {
      conflict(res);
      return;
    }
    if (!upload.total || upload.chunks.length < upload.total) {
      sendJson(res, 400, { ok: false, error: '模拟快照尚未上传完整。' });
      return;
    }
    try {
      const payload = Array.from({ length: upload.total }, (_, index) => upload.chunks[index] || '').join('');
      const next = JSON.parse(payload);
      if (!next || !Array.isArray(next.houses) || !Array.isArray(next.scopes)) {
        throw new Error('模拟快照缺少 houses 或 scopes。');
      }
      for (const key of ['benchmarks', 'marketScans', 'saleLeads', 'quarantine', 'listingCandidates', 'linkLedger', 'visitSessions']) {
        if (!Array.isArray(next[key])) next[key] = [];
      }
      state = next;
      version += 1;
      updatedAt = new Date().toISOString();
      uploads.delete(uploadId);
      sendJson(res, 200, {
        ok: true,
        version,
        updatedAt,
        houses: state.houses.length,
        scopes: state.scopes.length,
        snapshotId: uploadId
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || '模拟快照提交失败。' });
    }
    return;
  }

  sendJson(res, 400, { ok: false, error: '本地模拟接口暂不支持操作：' + action });
}

function buildIndexHtml() {
  const bootstrap = '<script>(()=>{const sid=' + JSON.stringify(SESSION_ID) + ';try{if(localStorage.getItem("__HQ_MOCK_SESSION__")!==sid){["hongqiao_watch_v1_20261118","HQ_LOCAL_UNSYNCED_V31","HQ_CLOUD_VERSION","HQ_V35_SESSION"].forEach(k=>localStorage.removeItem(k));localStorage.setItem("__HQ_MOCK_SESSION__",sid)}}catch(e){}})();</script>';
  const banner = [
    '<style>',
    '#hq-mock-banner{position:fixed;z-index:999999;left:0;right:0;top:0;min-height:42px;box-sizing:border-box;padding:8px 14px;background:#fff2cc;color:#614600;border-bottom:1px solid #e8d49b;display:flex;align-items:center;gap:12px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)}',
    '#hq-mock-banner strong{white-space:nowrap}#hq-mock-banner span{flex:1}#hq-mock-banner button{border:1px solid #b58a2a;background:#fffaf0;border-radius:7px;padding:5px 9px;color:#614600;cursor:pointer;font:inherit}',
    'body{padding-top:48px!important}',
    '@media(max-width:700px){#hq-mock-banner{font-size:11px;gap:7px;padding:7px 9px}#hq-mock-banner span{max-width:62%;}}',
    '</style>',
    '<div id="hq-mock-banner" role="status"><strong>本地模拟环境</strong><span>仅使用虚构样本；不连接正式 Google Sheets、Apps Script 或 Netlify。PIN 可输入任意四位数字，所有写入仅保存在本地模拟服务。</span><button id="hq-mock-reset" type="button">重置模拟数据</button></div>',
    '<script>document.getElementById("hq-mock-reset").addEventListener("click",async()=>{if(!confirm("重置本地模拟数据？不会影响正式数据库。"))return;await fetch("/__mock/reset",{method:"POST"});["hongqiao_watch_v1_20261118","HQ_LOCAL_UNSYNCED_V31","HQ_CLOUD_VERSION","HQ_V35_SESSION"].forEach(k=>localStorage.removeItem(k));location.reload()});</script>'
  ].join('');
  return INDEX_HTML.replace('<head>', '<head>' + bootstrap).replace('</body>', banner + '</body>');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/.netlify/functions/hq-api') {
    await handleApi(req, res);
    return;
  }
  if (url.pathname === '/__mock/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, version, houses: state.houses.length, scopes: state.scopes.length, updatedAt });
    return;
  }
  if (url.pathname === '/__mock/reset' && req.method === 'POST') {
    state = makeSeed();
    version = 1;
    updatedAt = new Date().toISOString();
    configHash = 'local-config-1';
    uploads.clear();
    sendJson(res, 200, { ok: true, version, houses: state.houses.length });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: '本地预览只提供静态页面和模拟 API。' });
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { sendJson(res, 400, { ok: false, error: 'URL 路径格式错误。' }); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(SITE, relative);
  if (filePath !== SITE && !filePath.startsWith(SITE + sep)) {
    sendJson(res, 403, { ok: false, error: '禁止访问站点目录之外的文件。' });
    return;
  }
  try {
    const body = relative === 'index.html' ? Buffer.from(buildIndexHtml()) : await readFile(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(res, 404, { ok: false, error: '本地预览文件不存在。' });
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log('MOCK_PREVIEW_READY http://127.0.0.1:' + address.port);
  console.log('此服务只绑定 127.0.0.1；不会连接或修改正式 Google Sheets。');
});
