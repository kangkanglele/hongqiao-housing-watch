from playwright.sync_api import sync_playwright
from pathlib import Path
src=Path('/mnt/data/hongqiao_v3_5_source/extension/extract.js').read_text()
page_html='''<!doctype html><html><head><title>水木天成碧杉园 一室 朝南</title></head><body><h1>水木天成碧杉园 南向一室</h1><div class="totalPrice"><span>56</span> 万</div><p>建筑面积：71.31㎡</p><p>1室0厅</p><p>高楼层/7层</p><p>朝向：南</p></body></html>'''
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for u in ['https://m.ke.com/tj/ershoufang/101126703003.html?shareSource=beike_app','https://m.5i5j.com/tj/ershoufang/819644244.html?said=TEST']:
  page=b.new_page();page.set_content(page_html)
  import json
  o=page.evaluate(src.replace('const loc=location.href;', 'const loc='+json.dumps(u)+';'))
  assert not o.get('error'),o
  assert o['platformId'] in u
  assert o['community']=='水木天成碧杉园',o
  assert o['area']==71.31,o
  assert o['price']==56,o
  assert o['floor'] is None,o
  print('PASS extract:',o['platform'],o['platformId'],'area',o['area'],'price',o['price'])
  page.close()
 b.close()
