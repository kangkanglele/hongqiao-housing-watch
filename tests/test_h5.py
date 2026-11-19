from playwright.sync_api import sync_playwright
from pathlib import Path
html=Path('/mnt/data/hongqiao_v3_5_source/site/index.html').read_text()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 p=b.new_page(viewport={'width':900,'height':800})
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.evaluate("""() => {const d={}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d[k]||null,setItem:(k,v)=>d[k]=String(v),removeItem:k=>delete d[k]}})}""")
 p.set_content(html,wait_until='domcontentloaded')
 p.locator('#nav [data-tab="settings"]').click()
 assert p.locator('#adminPin').count()==1,'should show PIN gate'
 assert p.locator('#cloudToken').count()==0,'no secret token form'
 p.evaluate('''() => {window.fetch = async (url,opts) => {const data=JSON.parse(opts.body);let answer;if(data.action==='login')answer={ok:true,session:'test-signed-session'};else if(data.action==='load')answer={ok:true,version:8,updatedAt:'2026-11-19',state:{version:4,houses:[],benchmarks:[],scopes:[{id:'S1',name:'水木天成翠杨园',group:'水木天成',env:'B',priority:'核心内圈'}],quarantine:[],marketScans:[{id:'test',date:'2026-11-19',community:'民畅园'}],saleLeads:[],listingCandidates:[]}};else if(data.action==='config')answer={ok:true,hash:'HASH',config:{colorPrimary:'#167a63',mobileNav:'right'}};else answer={ok:true,version:8};return {ok:true,status:200,json:async()=>answer};};}''')
 p.locator('#adminPin').fill('1111')
 p.locator('[data-action="saveCloudConfig"]').click()
 p.wait_for_timeout(1000)
 assert p.locator('#adminPin').count()==0, 'should unlock after authentication'
 assert p.locator('#nav [data-tab="houses"]').count()==1
 p.locator('#nav [data-tab="settings"]').click()
 assert '已解锁' in p.locator('#root').inner_text()
 assert p.locator('#cloudToken').count()==0
 p.locator('[data-action="lockCloud"]').click()
 assert p.locator('#adminPin').count()==1,'should lock'
 assert not errors,errors
 print('PASS H5: PIN gate, mock server login, cloud data read, no Google token field, lock UI; page errors=',errors)
 b.close()
