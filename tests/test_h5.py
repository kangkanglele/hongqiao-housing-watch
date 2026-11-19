from playwright.sync_api import sync_playwright
from pathlib import Path
import secrets

html=(Path(__file__).resolve().parents[1] / 'site' / 'index.html').read_text()
test_pin = str(1000 + secrets.randbelow(9000))
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=['--no-sandbox'])
    p=b.new_page(viewport={'width':900,'height':800})
    errors=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.add_init_script("""(() => {
      const d={};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>d[k]||null,
        setItem:(k,v)=>d[k]=String(v),
        removeItem:k=>delete d[k]
      }});
      window.fetch=async (url,opts={}) => {
        const data=JSON.parse(opts.body||'{}');
        let answer;
        if(data.action==='login') answer={ok:true,session:'test-signed-session'};
        else if(data.action==='load') answer={ok:true,version:8,updatedAt:'2026-11-19',state:{
          version:4,houses:[],benchmarks:[],
          scopes:[{id:'S1',name:'水木天成翠杨园',group:'水木天成',env:'B',priority:'核心内圈'}],
          quarantine:[],marketScans:[{id:'test',date:'2026-11-19',community:'民畅园'}],
          saleLeads:[],listingCandidates:[],linkLedger:[]
        }};
        else if(data.action==='ping') answer={ok:true,version:8};
        else answer={ok:true,version:8};
        return {ok:true,status:200,json:async()=>answer};
      };
    })();""")
    p.set_content(html,wait_until='domcontentloaded')
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
