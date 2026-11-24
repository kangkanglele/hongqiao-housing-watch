(function(root){
'use strict';
const DEFAULT_DATA = {
  schema: 1,
  updatedAt: '2026-11-24',
  status: '调整中 · 尚未确认底部',
  scenarios: [
    {id:'early',name:'提前企稳',probability:25,window:'2027年底前',decline:'从当前再跌约0%–3%',note:'价格跌幅收窄，成交和库存较快改善。'},
    {id:'base',name:'温和筑底',probability:45,window:'2028年前后',decline:'从当前再跌约3%–8%',note:'成交逐步恢复，价格仍需时间消化。'},
    {id:'slow',name:'长期磨底',probability:25,window:'2029年左右',decline:'从当前再跌约8%–15%',note:'收入预期和存量供给改善较慢。'},
    {id:'stress',name:'深度调整',probability:5,window:'2030年或以后',decline:'从当前再跌约15%–25%',note:'就业、收入或政策出现额外冲击。'}
  ],
  observations: []
};
const esc = value => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => /^https?:\/\//i.test(String(value || '').trim()) ? String(value).trim() : '';
function defaultData(){ return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
function normalize(value){
  const source = value && typeof value === 'object' ? value : {};
  const base = defaultData();
  return Object.assign(base, source, {
    scenarios: Array.isArray(source.scenarios) && source.scenarios.length ? source.scenarios : base.scenarios,
    observations: Array.isArray(source.observations) ? source.observations : []
  });
}
function renderTabs(view){
  const current = view === 'records' ? 'records' : 'macro';
  return '<div class="market-switch" role="tablist" aria-label="市场模块">'
    + '<button type="button" role="tab" aria-selected="' + (current === 'macro') + '" class="' + (current === 'macro' ? 'active' : '') + '" data-market-view="macro">大盘监控</button>'
    + '<button type="button" role="tab" aria-selected="' + (current === 'records') + '" class="' + (current === 'records' ? 'active' : '') + '" data-market-view="records">房源变动</button>'
    + '</div>';
}
function sourceLink(url,label){
  const safe = safeUrl(url);
  return safe ? '<a class="market-source-link" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + esc(label || '查看来源') + ' ↗</a>' : '<span class="market-source-muted">来源链接待补</span>';
}
function metric(label,value,unit,note,tone){
  return '<div class="market-metric"><span>' + esc(label) + '</span><strong class="' + esc(tone || '') + '">' + esc(value) + '<small>' + esc(unit || '') + '</small></strong><p>' + esc(note || '') + '</p></div>';
}
function renderDashboard(input, canEdit){
  const data = normalize(input);
  const total = data.scenarios.reduce((sum,item)=>sum + Math.max(0,Number(item.probability)||0),0);
  const scenarios = data.scenarios.map(item=>{
    const probability = Math.max(0,Math.min(100,Number(item.probability)||0));
    return '<div class="market-scenario"><div class="market-scenario-head"><strong>' + esc(item.name) + '</strong><b>' + probability + '%</b></div>'
      + '<div class="market-bar"><i style="width:' + probability + '%"></i></div>'
      + '<div class="market-scenario-meta"><span>' + esc(item.window) + '</span><span>' + esc(item.decline) + '</span></div>'
      + '<p>' + esc(item.note) + '</p></div>';
  }).join('');
  const observations = data.observations.slice().sort((a,b)=>String(b.period||'').localeCompare(String(a.period||''))).map(item=>{
    const link = sourceLink(item.url,item.source || '来源');
    return '<article class="market-observation"><div class="market-observation-main"><strong>' + esc(item.label) + '</strong><span>' + esc(item.period) + ' · ' + esc(item.value) + esc(item.unit || '') + '</span><p>' + esc(item.note || '') + '</p><small>' + esc(item.source || '来源待补') + ' · ' + link + '</small></div>'
      + (canEdit ? '<button type="button" class="btn text sm" data-action="marketDeleteObservation" data-id="' + esc(item.id) + '">删除</button>' : '') + '</article>';
  }).join('');
  return '<div class="market-dashboard">'
    + '<section class="market-status-card"><div><span class="market-eyebrow">天津房地产 · 大盘监控</span><h2>天津二手房仍处于调整期</h2><p>当前没有足够证据确认市场见底。成交已有一定韧性，但价格、开发资金和新房销售仍偏弱。</p><small>研究基准：2026-11-24 · 最新官方房价数据：2026年10月</small></div><div class="market-status-mark"><span>市场阶段</span><strong>调整中</strong><small>尚未确认底部</small></div></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>天津二手住宅价格</h3><p>国家统计局 · 2026年11月16日发布 · 2026年10月统计</p></div>' + sourceLink('https://www.stats.gov.cn/sj/zxfb/202611/t20261116_1965836.html','官方数据') + '</div>'
    + '<div class="market-metric-grid">' 
    + metric('环比变化','-0.5','%','指数99.5，上月=100','negative')
    + metric('同比变化','-5.3','%','指数94.7，上年同月=100','negative')
    + metric('1–10月平均同比','-5.8','%','指数94.2，上年同期=100','negative')
    + '</div><p class="market-footnote">说明：这是天津全市二手住宅指数，不等于红桥区或某个小区的实际成交跌幅。</p></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>成交量与价格出现背离</h3><p>中指研究院 CREIS · 2026年10月16日发布 · 2026年9月统计</p></div>' + sourceLink('https://www.cih-index.com/news/2026-10-16/55166389.html','市场报告') + '</div>'
    + '<div class="market-metric-grid">'
    + metric('二手住宅成交','11,292','套','同比增长9.0%','positive')
    + metric('1–9月累计成交','约10.4万','套','同比增长0.9%','neutral')
    + metric('9月价格环比','-0.63','%','同比仍下跌8.14%','negative')
    + '</div><p class="market-footnote">成交量改善但价格仍下跌，说明需求有韧性，尚不足以证明供需关系已经反转。</p></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>全国房地产行业压力</h3><p>国家统计局 · 2026年11月16日发布 · 2026年1–10月</p></div>' + sourceLink('https://www.stats.gov.cn/sj/zxfbhjd/202611/t20261116_1965840.html','官方数据') + '</div>'
    + '<div class="market-metric-grid">'
    + metric('房地产开发投资','-21.6','%','同比变化','negative')
    + metric('住宅销售面积','-14.2','%','同比变化','negative')
    + metric('二手房网签面积','+11.4','%','同比变化','positive')
    + metric('开发企业到位资金','-21.9','%','同比变化','negative')
    + '</div><p class="market-footnote">新房销售和开发资金仍弱，二手房交易相对活跃；市场正逐步转向存量房之间的竞争。</p></section>'
    + '<div class="market-two-col"><section class="market-panel"><div class="market-panel-head"><div><h3>未来底部情景概率</h3><p>主观情景权重 · 不是机构预测或统计模型结果</p></div></div>'
    + '<div class="market-scenarios">' + scenarios + '</div><p class="market-footnote">当前基准判断：约70%的情景权重落在2028年底前进入底部区域；仍有约30%对应更长时间的调整。概率需要随新数据持续修正。</p></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>当前见底信号</h3><p>基于已收录数据的阶段性判断</p></div></div>'
    + '<div class="market-signal-list">'
    + '<div><b>价格趋势</b><span class="market-tag weak">尚未企稳</span><p>10月环比仍为-0.5%，同比-5.3%。</p></div>'
    + '<div><b>成交活跃度</b><span class="market-tag mixed">有韧性</span><p>9月成交同比增长，但价格仍下跌。</p></div>'
    + '<div><b>库存与挂牌</b><span class="market-tag pending">数据待补</span><p>需要连续跟踪天津及红桥挂牌量、下架和重新挂牌情况。</p></div>'
    + '<div><b>收入与融资</b><span class="market-tag weak">整体偏弱</span><p>全国开发企业到位资金同比下降21.9%。</p></div>'
    + '</div></section></div>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>什么情况下才算真正反弹？</h3><p>看房助手内部观察规则，不是官方统计标准</p></div></div>'
    + '<div class="market-confirm-grid">'
    + '<div><b>① 价格</b><p>天津二手房环比跌幅连续收窄，随后连续3–6个月接近持平或上涨。</p></div>'
    + '<div><b>② 成交</b><p>成交量连续3–6个月改善，而不是单月政策刺激或季节性放量。</p></div>'
    + '<div><b>③ 库存</b><p>挂牌库存连续下降，正常房源成交周期缩短，滞销房源占比下降。</p></div>'
    + '<div><b>④ 基本面</b><p>就业、居民收入预期、按揭条件和人口流入至少不再恶化。</p></div>'
    + '</div><div class="market-rule-note">判断原则：至少同时看到价格、成交、库存三类信号改善，才把状态从「筑底观察」调整为「反弹初步确认」。</div></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>可能改变红桥市场的外部变量</h3><p>持续观察，不把规划或新闻直接当成房价利好</p></div></div>'
    + '<div class="market-watch-grid">'
    + '<div><b>教育与学位政策</b><p>关注招生片区、入学条件、学位供给和新学校投用。可能改变纯书包房的需求基础。</p></div>'
    + '<div><b>京津交通与医疗</b><p>关注天津西站至亦庄的实际通勤、医院院区投用和接驳改善。要验证是否形成持续居住需求。</p></div>'
    + '<div><b>老龄化与存量供给</b><p>老人购房需求可能存在，同时继承、置换和老旧住房出售也会增加供给。</p></div>'
    + '<div><b>产业与就业</b><p>关注项目是否真正落地、带来就业和人口，而不是只看规划投资额。</p></div>'
    + '</div></section>'
    + '<section class="market-panel"><div class="market-panel-head"><div><h3>持续观察记录</h3><p>后续每次更新都保留日期、指标、来源和备注</p></div>' + (canEdit ? '<button type="button" class="btn primary sm" data-action="marketOpenObservation">＋ 记录新观察</button>' : '') + '</div>'
    + (observations ? '<div class="market-observations">' + observations + '</div>' : '<div class="market-empty">还没有手工观察记录。后续可补充成交量、挂牌库存、政策变化、就业和人口等新数据。</div>')
    + '<p class="market-footnote">当前展示的是已收录的基准数据，不是自动实时抓取。新增记录会保存到看房助手云端数据，并与其他设备同步。</p></section>'
    + '<section class="market-disclaimer">数据口径说明：国家统计局为官方价格与行业数据；中指研究院为第三方市场监测；底部概率和反弹条件属于本项目的分析判断。不同来源统计口径不同，不直接混算。最新数据有发布滞后，更新时保留原始来源。</section>'
    + '</div>';
}
root.HQMarketMonitor = { defaultData: defaultData, normalize: normalize, renderTabs: renderTabs, renderDashboard: renderDashboard };
})(typeof window !== 'undefined' ? window : globalThis);
