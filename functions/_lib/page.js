// The dashboard page. Served by functions/dashboard/index.js behind the login, never as a public file.
// NOTE: this is a template string, so it must not contain backticks or dollar-brace sequences.
export const PAGE_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Dashboard · Grok for Closers</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..900&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#121212;--paper:#F4F4F1;--white:#fff;--amber:#FFB020;--amber-d:#8A5A00;--line:#E2E2DC;--muted:#5A5A55;--bad:#B3261E}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Public Sans',system-ui,sans-serif;font-size:16px;line-height:1.5}
h1,h2,h3{font-family:'Archivo',sans-serif;margin:0}
.top{background:var(--ink);color:var(--paper);padding:14px 20px;display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between}
.brand{font-family:'Archivo',sans-serif;font-weight:900;font-stretch:112%;font-size:20px}
.brand span{color:var(--amber)}
.brand em{font-style:normal;font-weight:600;font-size:14px;color:#B9B9B4;margin-left:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase}
.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px;color:#D2D2CD}
select,button.ghost{font:inherit;font-size:14px;padding:8px 12px;border-radius:8px;border:1px solid #4A4A45;background:#1B1B1A;color:var(--paper);cursor:pointer}
main{max-width:1100px;margin:0 auto;padding:28px 20px 64px}
h2{font-weight:900;font-size:clamp(22px,3vw,30px);letter-spacing:-.01em;margin:36px 0 14px}
h2 small{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-left:10px;text-transform:uppercase}
.funnel{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:10px;align-items:stretch}
.rate{display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);text-align:center;min-width:76px}
.rate b{font-size:18px;color:var(--ink);font-family:'Archivo',sans-serif}
.kpi{all:unset;box-sizing:border-box;cursor:pointer;background:var(--white);border:2px solid var(--line);border-radius:16px;padding:18px 20px;display:block}
.kpi:hover{border-color:#C9C9C2}
.kpi:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
.kpi[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.kpi .lbl{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--amber-d)}
.kpi[aria-pressed="true"] .lbl{color:var(--amber)}
.kpi .val{font-family:'Archivo',sans-serif;font-weight:900;font-size:clamp(36px,5vw,52px);line-height:1.05;margin-top:6px}
.kpi .sub{font-size:14px;color:var(--muted);margin-top:2px}
.kpi[aria-pressed="true"] .sub{color:#B9B9B4}
.panel{background:var(--white);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:14px}
.panel h3{font-size:18px;margin:0 0 10px}
.panel h3:not(:first-child){margin-top:26px}
.hint{font-size:13px;color:var(--muted);margin:6px 0 0}
.bars{display:flex;align-items:flex-end;gap:3px;height:150px;padding-top:8px;border-bottom:1px solid var(--line)}
.bar{flex:1 1 0;min-width:2px;background:var(--amber);border-radius:3px 3px 0 0;position:relative}
.bar.zero{background:#ECEBE5;height:2px!important}
.bar:hover{background:var(--ink)}
.axis{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:15px}
th{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid #F0EFEA;vertical-align:middle}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
.meter{height:8px;background:#F0EFEA;border-radius:99px;overflow:hidden;min-width:60px}
.meter i{display:block;height:100%;background:var(--amber)}
details{margin-top:14px}
summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--muted)}
.alert{background:#FDECEA;border:1px solid #F3B9B3;color:#7A1912;border-radius:12px;padding:12px 16px;margin:0 0 18px;font-size:14px}
.alert b{display:block;margin-bottom:4px}
.alert ul,.notes ul{margin:4px 0 0;padding-left:18px}
.notes{font-size:13px;color:var(--muted);margin-top:28px}
.op-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.op-kpis .kpi{cursor:default}
.loading{color:var(--muted);padding:40px 0;text-align:center}
@media (max-width:760px){
  .funnel{grid-template-columns:1fr}
  .rate{flex-direction:row;gap:8px;min-width:0;padding:2px 0}
  .op-kpis{grid-template-columns:1fr}
}
</style>
</head>
<body>
<header class="top">
  <div class="brand">Grok For <span>Closers</span><em>Dashboard</em></div>
  <div class="controls">
    <label for="days">Range</label>
    <select id="days"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
    <button class="ghost" id="refresh" type="button">Refresh</button>
    <span id="updated"></span>
  </div>
</header>
<main>
  <div id="alerts"></div>
  <h2>Funnel <small id="rangeLabel"></small></h2>
  <div id="funnel" class="loading">Loading…</div>
  <div id="detail"></div>
  <h2>/onepercent <small>free email course</small></h2>
  <div id="op" class="loading">Loading…</div>
  <div id="notes" class="notes"></div>
</main>
<script>
(function(){
  var state={data:null,selected:'visits',days:30};
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function fmt(n){return Number(n||0).toLocaleString('en-US')}
  function money(n,c){try{return new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD',maximumFractionDigits:0}).format(n||0)}catch(e){return '$'+Math.round(n||0)}}
  function pct(a,b){return b>0?(Math.round(a/b*1000)/10)+'%':'—'}
  function dlabel(d){var p=d.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}
  function pageLabel(p){return p==='/'?'/ (main)':p}

  function bars(series,key,fmtFn){
    var max=0,i;for(i=0;i<series.length;i++){if(series[i][key]>max)max=series[i][key]}
    var h='<div class="bars">';
    for(i=0;i<series.length;i++){
      var v=series[i][key],pc=max>0?Math.max(v/max*100,2):2;
      h+='<div class="bar'+(v?'':' zero')+'" style="height:'+pc+'%" title="'+esc(dlabel(series[i].date)+': '+(fmtFn?fmtFn(v):fmt(v)))+'"></div>';
    }
    h+='</div><div class="axis"><span>'+esc(dlabel(series[0].date))+'</span><span>'+esc(dlabel(series[Math.floor(series.length/2)].date))+'</span><span>'+esc(dlabel(series[series.length-1].date))+'</span></div>';
    return h;
  }
  function dailyTable(series,cols){
    var h='<details><summary>Show the daily numbers</summary><table><thead><tr><th>Day</th>';
    cols.forEach(function(c){h+='<th class="n">'+esc(c.label)+'</th>'});
    h+='</tr></thead><tbody>';
    for(var i=series.length-1;i>=0;i--){
      h+='<tr><td>'+esc(dlabel(series[i].date))+'</td>';
      cols.forEach(function(c){h+='<td class="n">'+c.fmt(series[i][c.key])+'</td>'});
      h+='</tr>';
    }
    return h+'</tbody></table></details>';
  }
  function shareTable(rows,nameKey,valKey,total,labelFn,extra){
    var h='<table><thead><tr><th>'+esc(extra.head)+'</th><th class="n">'+esc(extra.valHead)+'</th>'+(extra.revKey?'<th class="n">Revenue</th>':'')+'<th style="width:28%">Share</th></tr></thead><tbody>';
    rows.forEach(function(r){
      var share=total>0?r[valKey]/total*100:0;
      h+='<tr><td>'+esc(labelFn?labelFn(r[nameKey]):r[nameKey])+'</td><td class="n">'+fmt(r[valKey])+'</td>'+(extra.revKey?'<td class="n">'+money(r[extra.revKey],extra.currency)+'</td>':'')+'<td><div class="meter"><i style="width:'+share+'%"></i></div></td></tr>';
    });
    if(!rows.length)h+='<tr><td colspan="4" style="color:#5A5A55">Nothing in this range yet.</td></tr>';
    return h+'</tbody></table>';
  }

  function kpi(id,label,val,sub,unavailable){
    return '<button type="button" class="kpi" data-k="'+id+'" aria-pressed="'+(state.selected===id)+'"><div class="lbl">'+label+'</div><div class="val">'+(unavailable?'—':val)+'</div><div class="sub">'+esc(unavailable?'Not available — see the notice above':sub)+'</div></button>';
  }
  function renderFunnel(d){
    var f=d.funnel,v=f.visits,c=f.clicks,p=f.purchases;
    var h=kpi('visits','Visits',v?fmt(v.total):'',v?'on /, /partner, /sameday, /blackfriday and /cybermonday':'',!v);
    h+='<div class="rate"><span>clicks ÷ visits</span><b>'+((v&&c)?pct(c.total,v.total):'—')+'</b></div>';
    h+=kpi('clicks','Clicks',c?fmt(c.total):'','Join / buy button clicks',!c);
    h+='<div class="rate"><span>purchases ÷ clicks</span><b>'+((c&&p)?pct(p.total,c.total):'—')+'</b></div>';
    h+=kpi('purchases','Purchases',p?fmt(p.total):'',p?money(p.revenue,p.currency)+' collected':'',!p);
    $('funnel').className='funnel';$('funnel').innerHTML=h;
  }
  function renderDetail(d){
    var f=d.funnel,k=state.selected,h='<div class="panel">';
    if(k==='visits'){
      var v=f.visits;
      if(!v){h+='<p class="hint">Visit data is unavailable right now.</p>'}
      else{
        h+='<h3>Visits by day</h3>'+bars(v.byDay,'value')+dailyTable(v.byDay,[{key:'value',label:'Visits',fmt:fmt}]);
        h+='<h3>By page</h3>'+shareTable(v.byPage,'page','value',v.total,pageLabel,{head:'Page',valHead:'Visits'});
      }
    }else if(k==='clicks'){
      var c=f.clicks;
      if(!c){h+='<p class="hint">Click data is unavailable right now.</p>'}
      else{
        h+='<h3>Clicks by day</h3>'+bars(c.byDay,'value')+dailyTable(c.byDay,[{key:'value',label:'Clicks',fmt:fmt}]);
        h+='<h3>By page</h3>';
        h+=c.byPage?shareTable(c.byPage,'page','value',c.total,pageLabel,{head:'Page',valHead:'Clicks'}):'<p class="hint">Fathom did not return a per-page split for clicks.</p>';
        h+='<h3>By button</h3>'+shareTable(c.byButton,'name','value',c.total,null,{head:'Button',valHead:'Clicks'});
      }
    }else{
      var p=f.purchases;
      if(!p){h+='<p class="hint">Purchase data is unavailable right now.</p>'}
      else{
        h+='<h3>Purchases by day</h3>'+bars(p.byDay,'value')+dailyTable(p.byDay,[{key:'value',label:'Purchases',fmt:fmt},{key:'revenue',label:'Revenue',fmt:function(x){return money(x,p.currency)}}]);
        h+='<h3>By coupon code</h3>';
        var cr=p.byCoupon.map(function(x){return {name:x.code,value:x.count,revenue:x.revenue}});
        h+=shareTable(cr,'name','value',p.total,null,{head:'Coupon code',valHead:'Purchases',revKey:'revenue',currency:p.currency});
        h+='<h3>By page</h3>'+shareTable(p.byPage,'page','value',p.total,pageLabel,{head:'Page',valHead:'Purchases',revKey:'revenue',currency:p.currency});
        var map=d.pageByCoupon||{},parts=[];for(var code in map){parts.push(code+' → '+map[code])}
        h+='<p class="hint">Stripe checkout happens off-site, so purchases are assigned to a page by coupon code ('+esc(parts.join(', '))+'). Purchases with any other code or no code count toward / (main).</p>';
      }
    }
    $('detail').innerHTML=h+'</div>';
  }
  function renderOp(d){
    var o=d.onepercent;
    if(!o){$('op').className='';$('op').innerHTML='<div class="panel"><p class="hint">/onepercent data is unavailable right now.</p></div>';return}
    var h='<div class="op-kpis"><div class="kpi"><div class="lbl">Visits</div><div class="val">'+fmt(o.visits)+'</div></div><div class="kpi"><div class="lbl">Signups</div><div class="val">'+fmt(o.signups)+'</div></div><div class="kpi"><div class="lbl">Signup rate</div><div class="val">'+pct(o.signups,o.visits)+'</div></div></div><div class="panel">';
    h+='<h3>By campaign</h3>';
    if(o.byCampaign){
      h+='<table><thead><tr><th>Campaign (utm_campaign)</th><th class="n">Visits</th><th class="n">Signups</th><th class="n">Signup rate</th></tr></thead><tbody>';
      o.byCampaign.forEach(function(r){h+='<tr><td>'+esc(r.campaign)+'</td><td class="n">'+fmt(r.visits)+'</td><td class="n">'+fmt(r.signups)+'</td><td class="n">'+pct(r.signups,r.visits)+'</td></tr>'});
      if(!o.byCampaign.length)h+='<tr><td colspan="4" style="color:#5A5A55">No visits in this range yet.</td></tr>';
      h+='</tbody></table><p class="hint">Only visits that start from a link with ?utm_campaign=… are counted under that campaign.</p>';
    }else{h+='<p class="hint">Fathom did not return a per-campaign split.</p>'}
    h+='<h3>Visits by day</h3>'+bars(o.byDay,'visits')+'<h3>Signups by day</h3>'+bars(o.byDay,'signups')+dailyTable(o.byDay,[{key:'visits',label:'Visits',fmt:fmt},{key:'signups',label:'Signups',fmt:fmt}]);
    $('op').className='';$('op').innerHTML=h+'</div>';
  }
  function renderMeta(d){
    var a='';
    if(d.errors&&d.errors.length){a='<div class="alert"><b>Some data could not be loaded</b><ul>';d.errors.forEach(function(e){a+='<li><strong>'+esc(e.source)+':</strong> '+esc(e.message)+'</li>'});a+='</ul></div>'}
    $('alerts').innerHTML=a;
    $('notes').innerHTML=(d.notes&&d.notes.length)?'<b>Notes</b><ul>'+d.notes.map(function(n){return '<li>'+esc(n)+'</li>'}).join('')+'</ul>':'';
    $('rangeLabel').textContent=dlabel(d.range.from)+' – '+dlabel(d.range.to)+' · Eastern time';
    $('updated').textContent='Updated '+new Date(d.generatedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  }
  function render(){var d=state.data;if(!d)return;renderMeta(d);renderFunnel(d);renderDetail(d);renderOp(d)}
  function fail(msg){$('funnel').className='loading';$('funnel').textContent=msg;$('op').textContent='';$('detail').innerHTML=''}
  function load(){
    $('funnel').className='loading';$('funnel').textContent='Loading…';
    fetch('/dashboard/data?days='+state.days,{credentials:'same-origin',cache:'no-store'}).then(function(r){
      if(r.status===401){location.reload();return null}
      if(!r.ok)throw new Error('The server returned '+r.status+'.');
      return r.json();
    }).then(function(d){if(d){state.data=d;render()}}).catch(function(e){fail('Could not load the dashboard. '+e.message)});
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.kpi[data-k]');
    if(b&&state.data){state.selected=b.getAttribute('data-k');renderFunnel(state.data);renderDetail(state.data)}
  });
  $('days').addEventListener('change',function(){state.days=+this.value;load()});
  $('refresh').addEventListener('click',load);
  load();
})();
</script>
</body>
</html>`;
