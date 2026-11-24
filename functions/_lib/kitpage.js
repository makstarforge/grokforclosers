// The read-only Kit attribution diagnostic page (served by functions/dashboard/kit-attribution.js behind the login).
// NOTE: this is a template string, so it must not contain backticks or dollar-brace sequences.
export const KIT_ATTRIBUTION_PAGE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Kit attribution check · Grok for Closers</title>
<style>
:root{--ink:#121212;--paper:#F4F4F1;--white:#fff;--amber:#FFB020;--line:#E2E2DC;--muted:#5A5A55;--ok:#0C7A4B;--bad:#B3261E}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:var(--ink);color:var(--paper);padding:14px 20px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
header b{font-size:18px}header b span{color:var(--amber)}header a{color:#D2D2CD;font-size:14px}
main{max-width:980px;margin:0 auto;padding:26px 20px 70px}
h1{font-size:26px;margin:0 0 6px}p.lead{color:var(--muted);margin:0 0 18px}
.card{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0}
form{display:flex;gap:10px;flex-wrap:wrap}
input[type=email]{flex:1 1 320px;font:inherit;padding:12px 14px;border:1px solid #CFCFC8;border-radius:8px}
button.go{font:inherit;font-weight:700;padding:12px 20px;border:0;border-radius:8px;background:var(--amber);color:var(--ink);cursor:pointer}
button.go:disabled{opacity:.6;cursor:wait}
.badge{display:inline-block;font-weight:700;padding:3px 10px;border-radius:99px;font-size:13px}
.yes{background:#D6F5E6;color:var(--ok)}.no{background:#FDECEA;color:var(--bad)}.mid{background:#FFF1CC;color:#8A5A00}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:8px;border-bottom:1px solid #F0EFEA;vertical-align:top}
code,pre{font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
pre{background:#121212;color:#E8E8E3;padding:12px 14px;border-radius:10px;overflow:auto;max-height:420px;margin:8px 0 0;white-space:pre-wrap;word-break:break-word}
details{margin:8px 0}summary{cursor:pointer;font-weight:600}
.kv{display:grid;grid-template-columns:200px 1fr;gap:6px 14px}.kv div:nth-child(odd){color:var(--muted)}
.hint{font-size:13px;color:var(--muted)}
@media(max-width:640px){.kv{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><b>Grok For <span>Closers</span> · Kit attribution check</b><a href="/dashboard">← Dashboard</a></header>
<main>
  <h1>Does Kit's API return a subscriber's attribution?</h1>
  <p class="lead">Read-only diagnostic. It only sends GET requests to Kit, so it creates and changes nothing, and it never shows the API key. Enter the email of a subscriber whose UTM Source and Campaign you can see in Kit.</p>
  <div class="card">
    <form id="f"><input type="email" id="email" placeholder="subscriber@example.com" required autocomplete="off"><button class="go" id="go" type="submit">Retrieve from Kit</button></form>
    <p class="hint" style="margin:10px 0 0">For an address with a plus (like name+tag@gmail.com) type it exactly as it appears in Kit.</p>
  </div>
  <div id="out"></div>
</main>
<script>
(function(){
  var out=document.getElementById('out'),go=document.getElementById('go');
  function el(tag,attrs,text){var e=document.createElement(tag);if(attrs)for(var k in attrs)e.setAttribute(k,attrs[k]);if(text!==undefined)e.textContent=text;return e}
  function badge(kind,text){return el('span',{'class':'badge '+kind},text)}
  function kv(rows){var d=el('div',{'class':'kv'});rows.forEach(function(r){d.appendChild(el('div',null,r[0]));var v=el('div');if(r[1] instanceof Node)v.appendChild(r[1]);else v.textContent=r[1];d.appendChild(v)});return d}
  function statusBadge(s){return badge(s>=200&&s<300?'yes':(s===0?'no':'mid'),String(s))}
  function table(head,rows){var t=el('table'),h=el('tr');head.forEach(function(x){h.appendChild(el('th',null,x))});t.appendChild(h);rows.forEach(function(r){var tr=el('tr');r.forEach(function(c){var td=el('td');if(c instanceof Node)td.appendChild(c);else td.textContent=c;tr.appendChild(td)});t.appendChild(tr)});return t}
  function card(title){var c=el('div',{'class':'card'});if(title)c.appendChild(el('h3',{style:'margin:0 0 10px'},title));return c}
  function render(r){
    out.textContent='';
    var v=r.verdict||{},kind=v.supportsAttribution?'yes':(/^PARTLY/.test(v.text||'')?'mid':'no');
    var c=card('Result');
    c.appendChild(kv([
      ['Subscriber ID',r.subscriberId||'(not found)'],
      ['Supports retrieving attribution',badge(kind,v.supportsAttribution?'YES':(kind==='mid'?'PARTLY':'NO'))],
      ['include=attribution needed?',v.supportsAttribution?(v.includeAttributionNeeded?'Yes, only with include=attribution':'No, returned without it too'):'n/a'],
      ['Native attribution found',(r.utm&&Object.keys(r.utm).length)?Object.keys(r.utm).map(function(k){return 'utm_'+k+' = '+r.utm[k]}).join(' · '):'none'],
      ['API key accepted via',(r.auth&&r.auth.scheme)||'not accepted'],
      ['Verdict',v.text||'']
    ]));
    out.appendChild(c);

    if(r.auth&&r.auth.attempts&&r.auth.attempts.length){
      var a=card('Authentication');
      a.appendChild(table(['Method','HTTP status'],r.auth.attempts.map(function(x){return [x.scheme,statusBadge(x.status)]})));
      out.appendChild(a);
    }
    if(r.keyChecks&&r.keyChecks.length){
      var k=card('What the key can read (statuses only)');
      k.appendChild(table(['Check','Request','HTTP status','Top-level fields'],r.keyChecks.map(function(x){return [x.check,'GET '+x.path,statusBadge(x.status),(x.topLevelFields||[]).join(', ')]})));
      out.appendChild(k);
    }
    if(r.calls&&r.calls.length){
      var t=card('Requests made (all GET)');
      t.appendChild(table(['Request','HTTP status','Attribution fields in the response'],r.calls.map(function(x){
        var f=x.attributionFields.length?x.attributionFields.map(function(h){return h.path+' = '+JSON.stringify(h.value)}).join('\n'):'none';
        var cell=el('div');cell.appendChild(el('div',null,x.label));cell.appendChild(el('code',null,x.method+' '+x.path));
        return [cell,statusBadge(x.status),el('pre',{style:'margin:0;max-height:140px'},f)];
      })));
      out.appendChild(t);
      var j=card('Response JSON');
      r.calls.forEach(function(x){var d=el('details');d.appendChild(el('summary',null,x.label+' — HTTP '+x.status));d.appendChild(el('pre',null,x.response||''));j.appendChild(d)});
      out.appendChild(j);
    }
  }
  document.getElementById('f').addEventListener('submit',function(e){
    e.preventDefault();go.disabled=true;go.textContent='Asking Kit…';out.textContent='';
    fetch('/dashboard/kit-attribution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value.trim()}),cache:'no-store'})
      .then(function(res){if(res.status===401){location.reload();return null}return res.json().then(function(j){return {status:res.status,j:j}})})
      .then(function(x){if(!x)return;if(x.status!==200){var c=card();c.appendChild(badge('no',x.j.error||('Error '+x.status)));out.appendChild(c)}else render(x.j)})
      .catch(function(){var c=card();c.appendChild(badge('no','Could not reach the server.'));out.appendChild(c)})
      .then(function(){go.disabled=false;go.textContent='Retrieve from Kit'});
  });
})();
</script>
</body>
</html>`;
