from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import secrets

html=(Path(__file__).resolve().parents[1] / 'site' / 'index.html').read_text()
test_pin = str(1000 + secrets.randbelow(9000))

def route_request(route):
    request = route.request
    if request.resource_type == 'document':
        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
        return
    if '/.netlify/functions/hq-api' in request.url:
        data = request.post_data_json or {}
        if data.get('action') == 'login':
            answer = {'ok': True, 'session': 'test-signed-session'}
        elif data.get('action') == 'load':
            answer = {'ok': True, 'version': 8, 'updatedAt': '2026-11-19', 'state': {
                'version': 4, 'houses': [], 'benchmarks': [],
                'scopes': [{'id': 'S1', 'name': '水木天成翠杨园', 'group': '水木天成', 'env': 'B', 'priority': '核心内圈'}],
                'quarantine': [], 'marketScans': [{'id': 'test', 'date': '2026-11-19', 'community': '民畅园'}],
                'saleLeads': [], 'listingCandidates': [], 'linkLedger': []
            }}
        elif data.get('action') == 'ping':
            answer = {'ok': True, 'version': 8}
        else:
            answer = {'ok': True, 'version': 8}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(answer, ensure_ascii=False))
        return
    route.fulfill(status=204, body='')

with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=['--no-sandbox'])
    p=b.new_page(viewport={'width':900,'height':800})
    errors=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.route('**/*', route_request)
    p.goto('https://hongqiao-housing-watch.netlify.app/', wait_until='domcontentloaded')
    p.wait_for_timeout(300)
    root_text=p.locator('#root').inner_text()
    assert '公开只读模式' in root_text, f'should open in public read-only mode; page errors={errors}; root={root_text[:500]}'
    assert p.locator('#adminPin').count()==0,'PIN should not block public browsing'
    p.locator('#nav [data-tab="settings"]').click()
    assert p.locator('#adminPin').count()==1,'settings should offer PIN unlock'
    assert p.locator('#cloudToken').count()==0,'no secret token form'
    p.locator('#adminPin').fill(test_pin)
    p.locator('[data-action="saveCloudConfig"]').click()
    p.wait_for_timeout(500)
    assert p.locator('#adminPin').count()==0,'should unlock after authentication'
    p.locator('#nav [data-tab="settings"]').click()
    assert '已解锁' in p.locator('#root').inner_text()
    assert p.locator('#cloudToken').count()==0
    p.locator('[data-action="lockCloud"]').click()
    assert p.locator('#adminPin').count()==1,'should return to read-only mode after lock'
    assert not errors,errors
    print('PASS H5: public read-only view, PIN-gated editing, no Google token field, lock UI; page errors=',errors)
    b.close()
