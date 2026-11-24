// Admin page for the Kit campaign-tagging feature (served by functions/dashboard/kit-tagging.js behind the login).
// NOTE: this is a template string, so it must not contain backticks or dollar-brace sequences.
export const KIT_TAGGING_PAGE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Kit campaign tagging · Grok for Closers</title>
<style>
:root{--ink:#121212;--paper:#F4F4F1;--white:#fff;--amber:#FFB020;--line:#E2E2DC;--muted:#5A5A55;--ok:#0C7A4B;--bad:#B3261E}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:var(--ink);color:var(--paper);padding:14px 20px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
header b{font-size:18px}header b span{color:var(--amber)}header a{color:#D2D2CD;font-size:14px;margin-left:14px}
main{max-width:980px;margin:0 auto;padding:26px 20px 70px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:0 0 8px}p.lead{color:var(--muted);margin:0 0 18px}
.card{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:16px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input[type=text]{flex:1 1 260px;font:inherit;padding:11px 13px;border:1px solid #CFCFC8;border-radius:8px}
button{font:inherit;font-weight:700;padding:11px 18px;border:0;border-radius:8px;background:var(--amber);color:var(--ink);cursor:pointer}
button.sec{background:#E9E9E4}button.danger{background:#F7D4D0;color:#7A1912}button:disabled{opacity:.55;cursor:not-allowed}
.badge{display:inline-block;font-weight:700;padding:3px 10px;border-radius:99px;font-size:13px}
.yes{background:#D6F5E6;color:var(--ok)}.no{background:#FDECEA;color:var(--bad)}.mid{background:#FFF1CC;color:#8A5A00}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid #F0EFEA;vertical-align:top}
code,pre{font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
pre{background:#121212;color:#E8E8E3;padding:12px 14px;border-radius:10px;overflow:auto;max-height:360px;margin:8px 0 0;white-space:pre-wrap;word-break:break-word}
.kv{display:grid;grid-template-columns:190px 1fr;gap:6px 14px}.kv div:nth-child(odd){color:var(--muted)}
.hint{font-size:13px;color:var(--muted)}label.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:8px 0}
@media(max-width:640px){.kv{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><b>Grok For <span>Closers</span> · Kit campaign tagging</b><span><a href="/dashboard">Dashboard</a><a href="/dashboard/kit-attribution">Attribution check</a></span></header>
<main>
  <h1>Campaign tags from Kit's native attribution</h1>
  <p class="lead">When someone subscribes to the course form, a webhook asks Kit for their original UTM source and campaign, then finds or creates the tag <code>source-campaign</code> (lower-case) and applies it. This page lets you test it and register the webhook. Everything here is a deliberate admin action; nothing runs on the landing page.</p>

  <div class="card">
    <h2>1. Tag one subscriber now (test)</h2>
    <p class="hint" style="margin:0 0 10px">Runs the exact tagging logic for one Kit subscriber ID: reads their attribution, builds the tag name, finds or creates the tag and applies it. This <b>writes to Kit</b> (creates the tag if missing, tags the subscriber).</p>
    <div class="row"><input type="text" id="sid" placeholder="Kit subscriber ID, e.g. 4405107448" inputmode="numeric" autocomplete="off"><button id="runTag">Run tagging</button></div>
    <div id="tagOut"></div>
  </div>

  <div class="card">
    <h2>2. Webhook</h2>
    <div id="status" class="hint">Checking…</div>
    <label class="chk"><input type="checkbox" id="confirmReg"> I understand this registers a webhook in Kit for the course form, and that new subscribers will then be tagged automatically.</label>
    <div class="row"><button id="register" disabled>Register webhook</button><button id="refresh" class="sec">Refresh status</button></div>
    <div id="regOut"></div>
  </div>
</main>
<script>
(function(){
  function el(tag,attrs,text){var e=document.createElement(tag);if(attrs)for(var k in attrs)e.setAttribute(k,attrs[k]);if(text!==undefined)e.textContent=text;return e}
  function badge(kind,text){return el('span',{'class':'badge '+kind},text)}
  function kv(rows){var d=el('div',{'class':'kv'});rows.forEach(function(r){d.appendChild(el('div',null,r[0]));var v=el('div');if(r[1] instanceof Node)v.appendChild(r[1]);else v.textContent=r[1];d.appendChild(v)});return d}
  function post(body){return fetch('/dashboard/kit-tagging',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}).then(function(r){if(r.status===401){location.reload();return null}return r.json().then(function(j){j._http=r.status;return j})})}
  function table(head,rows){var t=el('table'),h=el('tr');head.forEach(function(x){h.appendChild(el('th',null,x))});t.appendChild(h);rows.forEach(function(r){var tr=el('tr');r.forEach(function(c){var td=el('td');if(c instanceof Node)td.appendChild(c);else td.textContent=c;tr.appendChild(td)});t.appendChild(tr)});return t}

  var tagOut=document.getElementById('tagOut'),runTag=document.getElementById('runTag');
  runTag.addEventListener('click',function(){
    var id=document.getElementById('sid').value.trim();tagOut.textContent='';
    if(!/^[0-9]{1,15}$/.test(id)){tagOut.appendChild(badge('no','Enter a numeric subscriber ID.'));return}
    runTag.disabled=true;runTag.textContent='Working…';
    post({action:'tag',subscriber_id:id}).then(function(r){
      if(!r)return;var box=el('div',{style:'margin-top:12px'});
      if(r.error){box.appendChild(badge('no',r.error));tagOut.appendChild(box);return}
      var kind=r.outcome==='tagged'?'yes':(r.outcome==='skipped'?'mid':'no');
      box.appendChild(kv([['Outcome',badge(kind,r.outcome.toUpperCase())],['Subscriber ID',r.subscriber_id],['Tag',r.tag||'(none)'],['Tag created now?',r.tag?(r.created?'Yes, it did not exist':'No, it already existed'):'n/a'],['Reason',r.reason||'']]));
      if(r.steps&&r.steps.length){box.appendChild(el('h3',{style:'margin:14px 0 0;font-size:15px'},'Steps'));box.appendChild(el('pre',null,JSON.stringify(r.steps,null,2)))}
      tagOut.appendChild(box);
    }).catch(function(){tagOut.appendChild(badge('no','Could not reach the server.'))}).then(function(){runTag.disabled=false;runTag.textContent='Run tagging'});
  });

  var statusEl=document.getElementById('status'),reg=document.getElementById('register'),conf=document.getElementById('confirmReg'),regOut=document.getElementById('regOut');
  conf.addEventListener('change',function(){reg.disabled=!conf.checked||reg.getAttribute('data-blocked')==='1'});
  function loadStatus(){
    statusEl.textContent='Checking…';
    post({action:'status'}).then(function(s){
      if(!s)return;statusEl.textContent='';
      if(s.error){statusEl.appendChild(badge('no',s.error));return}
      var rows=[['Kit API key',badge(s.apiKeySet?'yes':'no',s.apiKeySet?'set':'NOT SET')],
        ['Webhook secret (KIT_WEBHOOK_SECRET)',badge(s.secretSet?'yes':'no',s.secretSet?'set':(s.secretTooShort?'too short (16+ characters needed)':'NOT SET'))],
        ['Form',s.formId],['Event',s.event],['Endpoint',s.endpoint],
        ['Viewing from',s.hostIsProduction?badge('yes','grokforclosers.com'):badge('mid','not the live site: registering is disabled here')]];
      statusEl.appendChild(kv(rows));
      var our=(s.webhooks||[]).filter(function(w){return w.ours});
      statusEl.appendChild(el('h3',{style:'margin:14px 0 6px;font-size:15px'},'Webhooks in Kit ('+(s.webhooks||[]).length+')'));
      if(!(s.webhooks||[]).length)statusEl.appendChild(el('p',{'class':'hint'},'None registered yet.'));
      else statusEl.appendChild(table(['ID','Event','Target','Ours',''],s.webhooks.map(function(w){
        var cell=el('div');
        if(w.ours){var b=el('button',{'class':'danger'},'Delete');b.addEventListener('click',function(){if(!confirm('Delete this webhook? New subscribers will stop being tagged.'))return;b.disabled=true;post({action:'delete',webhook_id:String(w.id)}).then(function(r){regOut.textContent='';regOut.appendChild(el('pre',null,JSON.stringify(r,null,2)));loadStatus()})});cell.appendChild(b)}
        return [String(w.id),JSON.stringify(w.event),w.target_url||'',w.ours?badge('yes','yes'):'no',cell];
      })));
      var can=s.apiKeySet&&s.secretSet&&s.hostIsProduction&&!our.length;
      reg.setAttribute('data-blocked',can?'0':'1');reg.disabled=!can||!conf.checked;
      if(our.length)statusEl.appendChild(el('p',{'class':'hint'},'Our webhook is already registered, so registering is disabled.'));
    }).catch(function(){statusEl.appendChild(badge('no','Could not reach the server.'))});
  }
  document.getElementById('refresh').addEventListener('click',loadStatus);
  reg.addEventListener('click',function(){
    reg.disabled=true;regOut.textContent='';
    post({action:'register'}).then(function(r){if(!r)return;regOut.appendChild(el('p',{'class':'hint'},'Kit\'s answer (the token is hidden):'));regOut.appendChild(el('pre',null,JSON.stringify(r,null,2)));loadStatus()});
  });
  loadStatus();
})();
</script>
</body>
</html>`;
