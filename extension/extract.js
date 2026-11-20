'use strict';
// 注入用户当前可见的页面；不向目标网站新增请求，也不绕过权限或验证码。
function extractListingFromCurrentPage(){
 const loc=location.href; let u;try{u=new URL(loc)}catch(e){return {error:'当前页面 URL 无效'}}
 const host=u.hostname.toLowerCase();const platform=host==='ke.com'||host.endsWith('.ke.com')?'贝壳':host==='lianjia.com'||host.endsWith('.lianjia.com')?'链家':host==='5i5j.com'||host.endsWith('.5i5j.com')?'我爱我家':'';
 if(!platform)return {error:'仅支持贝壳、链家和我爱我家官网'};
 const match=u.pathname.match(/^\/(?:[a-z]{2}\/)?ershoufang\/(\d{8,})(?:\.html)?$/i);
 if(!match)return {error:'当前打开的不是单套房源详情页；请先点进某一套房子'};
 const text=(document.body?.innerText||'').slice(0,50000);
 const title=(document.querySelector('h1')?.innerText||document.title||'').replace(/\s+/g,' ').slice(0,180);
 const primary=[title,...Array.from(document.querySelectorAll('h1,h2,.house-title,.houseTitle,.title-wrapper')).slice(0,10).map(x=>x.innerText||'')].join(' ').slice(0,1500);
 const names=['翠杨园','依湖园','逸树园','望汀园','阁林园','碧杉园','闻涛园','临湾园'];
 const communities=names.map(x=>'水木天成'+x).concat(['民畅园','河怡花园','燕宇新城','龙禧园','西河名邸','金筑家园','子牙南里','礼貌楼','礼貌东里']);
 // 优先标题区域识别；不从推荐房源、附近小区文本里猜小区。
 const normalized=primary.replace(/\s/g,'');
 let community=communities.find(x=>normalized.includes(x));
 if(!community&&normalized.includes('水木天成')){
  let p=names.find(x=>normalized.includes(x));if(p)community='水木天成'+p;
 }
 if(!community){const short=text.slice(0,500).replace(/\s/g,'');community=communities.find(x=>short.includes(x))||''}
 const meta=(key)=>document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content?.trim()||'';
 let price=null,area=null,rooms='',floor=null,totalFloors=null,floorBand='',orientation='',decoration='',elevator='未知';
 const clean=s=>(s||'').replace(/[\s\u00a0]+/g,' ').trim();
 const parseAmount=s=>{const m=String(s||'').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):null};
 const bySelector=(selectors,regex)=>{
  for(const css of selectors){for(const e of Array.from(document.querySelectorAll(css)).slice(0,6)){
   const v=clean(e.innerText||e.textContent||'');if(v&&(!regex||regex.test(v)))return v;
  }}return '';
 };
 const structured=[];
 for(const tag of document.querySelectorAll('script[type="application/ld+json"]')){
  try{const parsed=JSON.parse(tag.textContent);structured.push(...(Array.isArray(parsed)?parsed:[parsed]))}catch(e){}
 }
 for(const o of structured){if(o&&typeof o==='object'){
  let offer=o.offers||o.priceSpecification;let p=typeof offer==='object'?offer.price:null;
  if(p&&Number(p)>0){price=Number(p);if(price>10000)price/=10000;break;}
 }}
 const priceMeta=meta('product:price:amount')||meta('og:price:amount');
 if(!price&&priceMeta){price=parseAmount(priceMeta);if(price>10000)price/=10000}
 if(!price){const p=bySelector(['.totalPrice span','.totalPrice','.price .total','.priceContent .price','.price .totalPrice','[class*="total-price"]','[class*="totalPrice"]'],/^\d+(?:\.\d+)?\s*(万|元)?/);
  if(p){const m=p.match(/(\d+(?:\.\d+)?)\s*(万|元)?/);if(m){price=Number(m[1]);if(m[2]==='元'||(!m[2]&&price>10000))price/=10000}}
 }
 // 极简页面通常只含「挂牌价：56万」而没有固定 CSS 类名；只在价格关键字近邻匹配，拒绝把首付误当售价。
 if(!price){const m=text.slice(0,2800).match(/(?:挂牌价格|挂牌价|房源售价|售价|总价|房屋总价)\s*[：: ]*\s*(\d+(?:\.\d+)?)\s*万/);if(m)price=Number(m[1]);}
 const areaText=bySelector(['.houseInfo','.area .mainInfo','.house-info','.content .area','[class*="houseInfo"]'],/\d+(?:\.\d+)?\s*(㎡|平米)/);
 let areaMatch=(areaText||text.slice(0,4000)).match(/(?:建筑面积|面积|建面)[：:\s]*(\d+(?:\.\d+)?)\s*(?:平米|㎡|平方米)/);
 if(!areaMatch)areaMatch=(areaText||'').match(/(\d+(?:\.\d+)?)\s*(?:平米|㎡|平方米)/);
 if(areaMatch){const n=Number(areaMatch[1]);if(n>10&&n<1000)area=n}
 if(!area){const m=text.slice(0,1600).match(/(\d+(?:\.\d+)?)\s*(?:平米|㎡|平方米)/);if(m&&Number(m[1])>10&&Number(m[1])<1000)area=Number(m[1])}
 let roomMatch=(primary+' '+text.slice(0,3000)).match(/([1-9])\s*室\s*([0-9])\s*厅/);
 if(roomMatch)rooms=`${roomMatch[1]}室${roomMatch[2]}厅`;
 else {roomMatch=(primary+' '+text.slice(0,1800)).match(/([1-9])\s*居/);if(roomMatch)rooms=roomMatch[1]+'居'}
 const first=text.slice(0,5500);
 const floorMatch=first.match(/(高|中|低)楼层\s*[/（(]\s*(?:共)?\s*(\d{1,2})\s*层\s*[）)]?/);
 if(floorMatch){floorBand=floorMatch[1]+'楼层/'+floorMatch[2]+'层';totalFloors=Number(floorMatch[2])}
 if(!floorBand){const f=first.match(/(?:所在楼层|楼层信息)[:：\s]*([^\n]{1,35})/);if(f)floorBand=f[1].slice(0,35)}
 const actual=first.match(/(?:所在楼层|实际楼层)[:：\s]*(\d{1,2})\s*(?:层|楼)(?:\s*[/共]\s*(\d{1,2})\s*层)?/);
 if(actual){floor=Number(actual[1]);if(actual[2])totalFloors=Number(actual[2])}
 if(!totalFloors){const tm=first.match(/(?:共|总)\s*(\d{1,2})\s*层/);if(tm)totalFloors=Number(tm[1])}
 const orientMatch=first.match(/(?:房屋朝向|房屋朝向：|朝向)[:：\s]*(南北|东南|西南|东北|西北|正南|正北|正东|正西|南|北|东|西)/);
 if(orientMatch)orientation=orientMatch[1];
 const decMatch=first.match(/(?:装修情况|装修)[:：\s]*(精装修|精装|简装修|简装|毛坯|其他)/);
 if(decMatch)decoration=decMatch[1];
 const elevMatch=first.match(/(?:配备电梯|有无电梯|电梯)[:：\s]*(有|无|是|否)/);
 if(elevMatch)elevator=['有','是'].includes(elevMatch[1])?'有':'无';
 // Only inspect images on the single listing being actively viewed. No web requests.
 // Exclude maps, broker avatars, related listings, logos and tracking pixels.
 const mediaCandidates=[];
 const takeImage=(raw)=>{
   if(!raw||typeof raw!=='string')return;
   let addr;try{addr=new URL(raw,location.href);}catch(_){return;}
   if(addr.protocol!=='https:')return;
   const imageHost=addr.hostname.toLowerCase();
   if(!(/(^|\.)(ljcdn\.com|ke\.com|lianjia\.com|5i5j\.com)$/.test(imageHost)))return;
   if(/(avatar|agent|broker|logo|qrcode|qr_code|map|sprite|icon|captcha)/i.test(addr.pathname))return;
   const value=addr.toString().slice(0,1000);
   if(!mediaCandidates.includes(value))mediaCandidates.push(value);
 };
 const og=document.querySelector('meta[property="og:image"]')?.getAttribute('content');
 const galleryContainers=[
   '.overview','.housePic','.house-pic','.housePhoto','.house-photo',
   '.house-img','.imglist','.house-view','.image-wrap','.photo-view',
   '.carousel','.picture','.houseImg','.frame .container','.photoList',
   '[class*="gallery"]','[class*="swiper"]','[class*="houseImg"]'
 ];
 const imgs=new Set();
 for(const selector of galleryContainers){
   try{document.querySelectorAll(selector+' img').forEach(img=>imgs.add(img));}catch(_){}
 }
 if(!imgs.size)document.querySelectorAll('main img,.content img').forEach(img=>imgs.add(img));
 for(const img of imgs){
   if(img.closest('[class*="recommend"],[class*="agent"],[class*="broker"],[class*="similar"],[class*="nearby"],footer'))continue;
   const w=img.naturalWidth||Number(img.width)||0,h=img.naturalHeight||Number(img.height)||0;
   if(w&&h&&(w<240||h<120))continue;
   for(const attr of ['data-original','data-src','data-lazy','data-img','src']){
     const value=img.getAttribute(attr);
     if(value&&!value.startsWith('data:')){takeImage(value);break;}
   }
   const set=img.getAttribute('srcset');
   if(set)takeImage(set.split(',').pop()?.trim().split(/\s+/)[0]);
 }
 // The social sharing image is a fallback only; the visible listing gallery is preferred.
 if(!mediaCandidates.length&&og)takeImage(og);
 // A thumbnail belongs to the listing only when it is inside the current detail gallery.
 const images=mediaCandidates.slice(0,12);
 // 明确不把“高楼层/7层”误读成实际第7层。
 const tags=[];if(price===null)tags.push('价格未能可靠识别');if(area===null)tags.push('面积未能可靠识别');if(!community)tags.push('小区需手动选择');
 return {platform,platformId:match[1],url:loc,community:community||'',title,area,price,rooms,floor,totalFloors,floorBand,orientation,decoration,elevator,notes:tags.join('；'),captureAt:new Date().toISOString(),images,coverImage:images[0]||'',extraction:'用户打开的官方页面 DOM（字段可能需要人工核对）'};
}

extractListingFromCurrentPage();
