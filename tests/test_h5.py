from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import secrets

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'site' / 'index.html').read_text()
merge_js = (ROOT / 'site' / 'sync-merge.js').read_text()
layout_css = (ROOT / 'site' / 'buyhouse-v08.css').read_text()
test_pin = str(1000 + secrets.randbelow(9000))

def basic_route(route):
    request = route.request
    if request.resource_type == 'document':
        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
        return
    if request.url.endswith('/buyhouse-v08.css'):
        route.fulfill(status=200, content_type='text/css; charset=utf-8', body=layout_css)
        return
    if request.url.endswith('/sync-merge.js'):
        route.fulfill(status=200, content_type='text/javascript; charset=utf-8', body=merge_js)
        return
    if '/.netlify/functions/hq-api' in request.url:
        data = request.post_data_json or {}
        if data.get('action') == 'login':
            answer = {'ok': True, 'session': 'test-signed-session'}
        elif data.get('action') == 'load':
            answer = {'ok': True, 'version': 8, 'updatedAt': '2026-11-19', 'state': {
                'version': 4, 'houses': [
                    {'id':'TJ-HQ-1001','community':'水木天成翠杨园','title':'南向一居','price':49.5,'area':54,'rooms':'1室1厅','floor':4,'total':7,'stage':'重点关注','defects':[], 'sources':[{'channel':'贝壳','url':'https://m.ke.com/tj/ershoufang/101126703003.html'}], 'events':[]},
                    {'id':'TJ-HQ-1002','community':'民畅园','title':'顶层二居','price':55,'area':65,'rooms':'2室1厅','stage':'观察中','defects':['top'], 'sources':[{'channel':'我爱我家','url':'https://m.5i5j.com/tj/ershoufang/819644244.html'}], 'events':[]},
                    {'id':'TJ-HQ-1003','community':'河怡花园','title':'历史档案','price':60,'deletedAt':'2026-11-19','defects':[], 'sources':[{'channel':'贝壳','url':'https://m.ke.com/tj/ershoufang/22222222222.html'}], 'events':[]}
                 ], 'benchmarks': [],
                'scopes': [{'id': 'S1', 'name': '水木天成翠杨园', 'group': '水木天成', 'env': 'B', 'priority': '核心内圈'}],
                'quarantine': [], 'marketScans': [{'id': 'test', 'date': '2026-11-19', 'community': '民畅园'}],
                'saleLeads': [], 'listingCandidates': [], 'linkLedger': [], 'visitSessions': []
            }}
        elif data.get('action') == 'ping':
            answer = {'ok': True, 'version': 8}
        elif data.get('action') == 'config':
            answer = {'ok': True, 'config': {}, 'hash': 'test-config'}
        else:
            answer = {'ok': True, 'version': 8}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(answer, ensure_ascii=False))
        return
    route.fulfill(status=204, body='')

def conflict_route_factory():
    begin_versions = []
    commits = []
    actions = []
    remote_version = 8
    remote_state = {
        'version': 4,
        'houses': [
            {'id': 'REMOTE-1', 'community': '民畅园', 'title': '云端新增房源', 'sources': [{'channel': '贝壳', 'url': 'https://m.ke.com/tj/ershoufang/22222222222.html'}], 'events': []},
            {'id': 'SHARED-1', 'community': '民畅园', 'title': '云端标题', 'note': '云端备注', 'price': 70, 'sources': [{'channel': '贝壳', 'url': 'https://m.ke.com/tj/ershoufang/101126703003.html'}], 'events': [{'id': 'E-REMOTE', 'title': '云端事件'}]}
        ],
        'scopes': [{'id': 'S-REMOTE', 'name': '云端小区'}],
        'benchmarks': [], 'marketScans': [{'id': 'SCAN-REMOTE', 'community': '云端扫描'}],
        'saleLeads': [], 'quarantine': [], 'listingCandidates': [], 'linkLedger': [],
        'visitSessions': [{'id': 'VISIT-1', 'date': '2026-11-19', 'entries': [{'id': 'ENTRY-REMOTE', 'houseId': 'REMOTE-1'}]}],
        'pageConfig': {'colorBackground': '#ffffff'}
    }

    def route(route):
        request = route.request
        if request.resource_type == 'document':
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
            return
        if request.url.endswith('/buyhouse-v08.css'):
            route.fulfill(status=200, content_type='text/css; charset=utf-8', body=layout_css)
            return
        if request.url.endswith('/sync-merge.js'):
            route.fulfill(status=200, content_type='text/javascript; charset=utf-8', body=merge_js)
            return
        if '/.netlify/functions/hq-api' not in request.url:
            route.fulfill(status=204, body='')
            return
        data = request.post_data_json or {}
        action = data.get('action')
        nonlocal remote_version
        actions.append(action)
        if action == 'ping':
            answer = {'ok': True, 'version': remote_version}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(answer))
        elif action == 'load':
            answer = {'ok': True, 'version': remote_version, 'updatedAt': '2026-11-19T10:00:00Z', 'state': remote_state}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(answer, ensure_ascii=False))
        elif action == 'snapshotCommit':
            expected = int(data.get('expectedVersion', 0))
            begin_versions.append(expected)
            if len(begin_versions) == 1:
                route.fulfill(status=409, content_type='application/json', body=json.dumps({
                    'ok': False, 'conflict': True, 'version': remote_version,
                    'error': '云端数据已被其他设备更新，请自动合并后重试'
                }, ensure_ascii=False))
                return
            if expected != remote_version:
                route.fulfill(status=409, content_type='application/json', body=json.dumps({
                    'ok': False, 'conflict': True, 'version': remote_version,
                    'error': '模拟云端版本不一致'
                }, ensure_ascii=False))
                return
            committed = data['state']
            commits.append(committed)
            remote_state.clear()
            remote_state.update(committed)
            remote_version += 1
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'ok': True, 'version': remote_version,
                'updatedAt': '2026-11-19T10:01:00Z'
            }))
        elif action == 'config':
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'config': remote_state.get('pageConfig', {}), 'hash': 'test-config'}))
        else:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True}))
    return route, begin_versions, commits, actions, remote_state

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])

    # Public read-only and PIN unlock.
    page = browser.new_page(viewport={'width': 900, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/*', basic_route)
    page.goto('https://hongqiao-housing-watch.netlify.app/', wait_until='domcontentloaded')
    page.wait_for_timeout(300)
    root_text = page.locator('#root').inner_text()
    assert page.locator('.bh-overview-head h1').inner_text() == '房源概览', f'new dynamic overview missing; errors={errors}; root={root_text[:500]}'
    assert page.locator('.bh-metric').count() == 3, 'three independent overview metrics expected'
    assert page.locator('#nav [data-tab="config"]').count() == 0, 'page configuration must not appear in navigation'
    page.wait_for_function("document.querySelectorAll('.bh-metric-value').length === 3 && document.querySelector('.bh-metric-value').textContent.includes('2')", timeout=6000)
    assert [x.replace('套','').strip() for x in page.locator('.bh-metric-value').all_inner_texts()] == ['2','0','1'], 'total, pending and focus must reflect loaded records'
    assert page.locator('.bh-sync-line').count() == 0, 'redundant homepage refresh strip removed'
    assert page.locator('.bh-filter-accordion .filters').is_visible(), 'filters visible by default'
    assert page.locator('.bh-filter-accordion .chip').count() == 8, 'filters remain horizontally scrollable'
    assert page.locator('.bh-listing').count() == 1, 'default list excludes hard defects and deleted records'
    assert '水木天成翠杨园' in page.locator('.bh-listing-name').inner_text()
    page.locator('[data-view="table"]').click()
    assert page.locator('.bh-listings.compact').count() == 1
    page.locator('[data-view="cards"]').click()
    page.locator('[data-ui="searchToggle"]').click()
    assert page.locator('#search').is_visible()
    page.locator('#search').fill('不存在的小区')
    assert page.locator('.bh-listing').count() == 0
    page.locator('[data-ui="searchClose"]').click()
    assert page.locator('.bh-listing').count() == 1
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), '390px layout must not scroll horizontally'
    page.set_viewport_size({'width':320,'height':740})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), '320px layout must not scroll horizontally'

    assert page.locator('#adminPin').count() == 0
    page.locator('#navToggle').click()
    page.locator('#nav [data-tab="settings"]').click()
    assert page.locator('#adminPin').count() == 1
    assert page.locator('#cloudToken').count() == 0
    page.locator('#adminPin').fill(test_pin)
    page.locator('[data-action="saveCloudConfig"]').click()
    page.wait_for_timeout(500)
    assert page.locator('#adminPin').count() == 0
    page.locator('#navToggle').click()
    page.locator('#nav [data-tab="settings"]').click()
    assert '已解锁' in page.locator('#root').inner_text()
    page.locator('[data-action="lockCloud"]').click()
    assert page.locator('#adminPin').count() == 1
    assert not errors, errors
    page.close()

    # Simulate two devices writing at once: stale local v7 must merge remote v8 and retry automatically.
    local_state = {
        'version': 4,
        'houses': [
            {'id': 'LOCAL-1', 'community': '民畅园', 'title': '本地新增房源', 'sources': [{'channel': '我爱我家', 'url': 'https://m.5i5j.com/tj/ershoufang/11111111111.html'}], 'events': []},
            {'id': 'SHARED-1', 'community': '民畅园', 'title': '本地标题', 'note': '本地备注', 'sources': [{'channel': '贝壳', 'url': 'https://m.ke.com/tj/ershoufang/101126703003.html'}], 'events': [{'id': 'E-LOCAL', 'title': '本地事件'}]}
        ],
        'scopes': [{'id': 'S-LOCAL', 'name': '本地小区'}],
        'benchmarks': [], 'marketScans': [{'id': 'SCAN-LOCAL', 'community': '本地扫描'}],
        'saleLeads': [], 'quarantine': [], 'listingCandidates': [], 'linkLedger': [],
        'visitSessions': [{'id': 'VISIT-1', 'date': '2026-11-19', 'entries': [{'id': 'ENTRY-LOCAL', 'houseId': 'LOCAL-1'}]}],
        'pageConfig': {'colorPrimary': '#123456'}
    }
    conflict_page = browser.new_page(viewport={'width': 900, 'height': 800})
    conflict_errors = []
    conflict_page.on('pageerror', lambda error: conflict_errors.append(str(error)))
    conflict_route, begin_versions, commits, actions, remote_state = conflict_route_factory()
    conflict_page.route('**/*', conflict_route)
    conflict_page.add_init_script("""
      localStorage.setItem('hongqiao_watch_v1_20261118', %s);
      localStorage.setItem('HQ_LOCAL_UNSYNCED_V31', '1');
      localStorage.setItem('HQ_CLOUD_VERSION', '7');
      localStorage.setItem('HQ_V35_SESSION', 'test-signed-session');
    """ % json.dumps(json.dumps(local_state, ensure_ascii=False)))
    conflict_page.goto('https://hongqiao-housing-watch.netlify.app/', wait_until='domcontentloaded')
    conflict_page.wait_for_function("document.getElementById('cloudSidebarStatus')?.textContent.includes('已同步 · v9')", timeout=8000)
    assert begin_versions[:2] == [7, 8], f'expected stale v7 then automatic retry at v8; got {begin_versions}'
    assert len(commits) == 1, f'expected one merged atomic POST; got {len(commits)}'
    committed = commits[0]
    assert len(committed['houses']) == 3, [house['id'] for house in committed['houses']]
    assert {house['id'] for house in committed['houses']} == {'LOCAL-1', 'REMOTE-1', 'SHARED-1'}
    shared = next(house for house in committed['houses'] if house['id'] == 'SHARED-1')
    assert shared['title'] == '本地标题'
    assert shared['price'] == 70
    assert {event['id'] for event in shared['events']} == {'E-LOCAL', 'E-REMOTE'}
    assert len(committed['marketScans']) == 2
    assert {entry['id'] for entry in committed['visitSessions'][0]['entries']} == {'ENTRY-LOCAL', 'ENTRY-REMOTE'}
    assert committed['pageConfig']['colorPrimary'] == '#123456'
    assert committed['pageConfig'].get('colorBackground') == '#ffffff', f"remote pageConfig was not preserved: {committed.get('pageConfig')}"
    assert committed['syncConflicts'], 'same-field differences must be archived for later review'
    assert not conflict_errors, conflict_errors
    # Idle tabs must not poll at any interval; startup only loads once.
    finished_actions = list(actions)
    conflict_page.wait_for_timeout(2000)
    assert actions == finished_actions, f'background request detected without user activity: {actions[len(finished_actions):]}'
    # Switching a H5 view is an explicit event; it may check the version once.
    conflict_page.locator('#navToggle').click()
    conflict_page.locator('#nav [data-tab="scopes"]').click()
    conflict_page.wait_for_function("document.getElementById('cloudSidebarStatus')?.textContent.includes('已同步')", timeout=6000)
    conflict_page.wait_for_timeout(400)
    assert actions.count('ping') >= 1, f'expected on-navigation version check, got {actions}'
    # A real edit still uploads after the 1.4-second debounce; no page refresh is required.
    conflict_page.locator('[data-scope="S-LOCAL"]').select_option('C')
    conflict_page.wait_for_function("document.getElementById('cloudSidebarStatus')?.textContent.includes('云端同步成功 · v10')", timeout=8000)
    assert len(commits) == 2, f'expected a second atomic POST for the edited scope, got {len(commits)}'
    assert next(scope for scope in remote_state['scopes'] if scope['id']=='S-LOCAL')['env']=='C'
    assert conflict_page.evaluate("localStorage.getItem('HQ_LOCAL_UNSYNCED_V31')") is None
    finished_actions = list(actions)
    conflict_page.wait_for_timeout(1800)
    assert actions == finished_actions, 'idle H5 made an unrequested background call'
    print('PASS H5: PIN access, one-POST conflict merge, edit auto-upload, explicit navigation check, no idle polling')
    browser.close()
