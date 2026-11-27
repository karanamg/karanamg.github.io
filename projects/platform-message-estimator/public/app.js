/* ============================================================
   CONFIG: defaults, conversion rates, section schemas
   ============================================================ */
const STORAGE_KEY = 'boomi-pm-estimator-v1';

const DEFAULT_RATES = {
  doc:        {label:'Integration document (in or out, incl. response docs)', unit:'document', mode:'per', value:1,  src:'Boomi definition: 1 document = 1 message'},
  edi:        {label:'B2B / EDI document',                                    unit:'document', mode:'per', value:1,  src:'Counted as Integration documents'},
  api:        {label:'API Management call',                                   unit:'API call', mode:'per', value:1,  src:'Boomi published equivalent: 1 API call = 1 message'},
  flow:       {label:'Flow app launch',                                       unit:'launches', mode:'every', value:100, src:'Boomi published equivalent: 100 launches = 1 message'},
  event:      {label:'Event Streams event (published or consumed)',           unit:'events',   mode:'every', value:100, src:'Boomi published equivalent: 100 events = 1 message'},
  hub:        {label:'Data Hub golden record (per year)',                     unit:'golden record / yr', mode:'per', value:12, src:'Boomi published equivalent: 1 golden record = 12 messages'},
  bdu:        {label:'Data Integration (Rivery) BDU',                         unit:'BDU',      mode:'per', value:50, src:'Boomi published equivalent: 1 BDU = 50 messages'},
  ai:         {label:'AI agent prompt',                                       unit:'prompt',   mode:'per', value:100, src:'Boomi published equivalent: 1 AI prompt = 100 messages'},
};

const DEFAULT_BANDS = [
  {name:'Band A (example)', upTo:1000000},
  {name:'Band B (example)', upTo:5000000},
  {name:'Band C (example)', upTo:20000000},
  {name:'Band D (example)', upTo:100000000},
  {name:'Band E (example)', upTo:null},
];

const DEFAULT_SETTINGS = {daysPerMonth:30.4, nonProdPct:15, growthPct:20, headroomPct:20, years:3};

const EDITIONS = ['Standard','Professional','Professional Plus','Enterprise','Enterprise Plus'];

/* capability → minimum edition (index into EDITIONS) or platform service */
const FIT_RULES = [
  {k:'prodOnly',     label:'Production deployment only is acceptable', lvl:0, note:'Standard'},
  {k:'nonProdEnv',   label:'Needs test / dev environments', lvl:1, note:'Professional+'},
  {k:'cloudRuntime', label:'Boomi-hosted public cloud runtime', lvl:1, note:'Professional+'},
  {k:'orchestration',label:'Advanced integrations / process orchestration', lvl:1, note:'Professional+'},
  {k:'entConnectors',label:'Enterprise connectors (SAP, Oracle EBS, Workday…)', lvl:1, note:'Professional+ · extra cost'},
  {k:'apiEnable',    label:'Expose integrations as APIs / web services', lvl:2, note:'Professional Plus+'},
  {k:'moreConns',    label:'High number of connections', lvl:2, note:'Professional Plus+'},
  {k:'ha',           label:'High availability / clustered runtime', lvl:3, note:'Enterprise+'},
  {k:'parallel',     label:'Parallel processing / large data loads', lvl:3, note:'Enterprise+'},
  {k:'customRoles',  label:'Custom-role user management', lvl:3, note:'Enterprise+'},
  {k:'queuing',      label:'Message queuing (advanced architectures)', lvl:4, note:'Enterprise Plus'},
  {k:'apim',         label:'API gateway, developer portal, API governance', svc:'API Management', note:'Adds API Management'},
  {k:'b2b',          label:'Trading partners / EDI (X12, EDIFACT, AS2)', svc:'B2B / EDI', note:'Adds B2B/EDI'},
  {k:'mdm',          label:'Master data / golden records', svc:'Data Hub', note:'Adds Data Hub'},
  {k:'elt',          label:'ELT / CDC into a data warehouse or lake', svc:'Data Integration', note:'Adds Data Integration'},
  {k:'events',       label:'Event-driven pub/sub messaging', svc:'Event Streams', note:'Adds Event Streams'},
  {k:'apps',         label:'Human workflow / low-code apps', svc:'Flow', note:'Adds Flow'},
  {k:'agents',       label:'AI agents (Agentstudio)', svc:'Agentstudio (AI)', note:'Adds Agentstudio'},
];

const PERIOD_OPTS = {hour:'per hour', day:'per day', week:'per week', month:'per month', year:'per year'};

/* Section schema: fields render as input columns; calc(row) returns {units, msgs, cols:[...]} */
const SECTIONS = [
  {
    key:'integrations', title:'Integration processes', service:'Integration', rate:'doc', fit:null,
    help:'Each inbound and outbound document counts as 1 message, including response documents from request/response calls. Calls between components in the same account (for example Integration → Flow) are not counted. Messages per document = <code>source reads + target writes × (2 if req/resp, else 1) + lookups × 2</code>.',
    fields:[
      {k:'name', label:'Interface', type:'text', def:'New interface'},
      {k:'trigger', label:'Trigger', type:'select', opts:{sched:'Scheduled batch', rt:'Real-time / listener', api:'API-triggered', evt:'Event-driven'}, def:'sched'},
      {k:'records', label:'Records / run', type:'num', def:1000, tip:'Records (orders, rows, files…) handled each time the process runs'},
      {k:'runs', label:'Runs', type:'num', def:1},
      {k:'per', label:'Per', type:'period', def:'day'},
      {k:'batch', label:'Records / doc', type:'num', def:1, tip:'1 = each record is its own document. 500 = records batched 500 per document (fewer messages).'},
      {k:'reads', label:'Source reads', type:'num', def:1, tip:'Inbound documents received per document (usually 1)'},
      {k:'writes', label:'Target writes', type:'num', def:1, tip:'Number of target systems or endpoints each document is sent to'},
      {k:'resp', label:'Req/resp', type:'check', def:true, tip:'Target returns a response document (REST, SOAP, DB upsert…) that also counts'},
      {k:'lookups', label:'Lookups', type:'num', def:0, tip:'Enrichment or lookup calls per document. Each = 1 request + 1 response'},
      {k:'retry', label:'Retry %', type:'num', def:2, tip:'Share of documents re-sent because of errors or retries'},
    ],
    cols:['Docs / mo','Messages / mo'],
    calc(r){
      const docs = Math.ceil(n(r.records)/Math.max(1,n(r.batch))) * perMonth(n(r.runs), r.per);
      const per = n(r.reads) + n(r.writes)*(r.resp?2:1) + n(r.lookups)*2;
      const units = docs*per*(1+n(r.retry)/100);
      return {units, msgs:units*rateMul('doc'), cols:[docs, units*rateMul('doc')]};
    },
    sample:[
      {name:'Sales orders: Shopify → SAP S/4', trigger:'rt', records:1, runs:120, per:'hour', batch:1, reads:1, writes:1, resp:true, lookups:2, retry:2},
      {name:'Product master: SAP → Shopify', trigger:'sched', records:25000, runs:1, per:'day', batch:100, reads:1, writes:1, resp:true, lookups:0, retry:1},
      {name:'Inventory levels: WMS → eCom + POS', trigger:'sched', records:8000, runs:24, per:'day', batch:200, reads:1, writes:2, resp:true, lookups:0, retry:1},
      {name:'Invoices: SAP → Salesforce', trigger:'sched', records:3000, runs:1, per:'day', batch:1, reads:1, writes:1, resp:true, lookups:1, retry:2},
      {name:'HR employees: Workday → AD', trigger:'sched', records:400, runs:1, per:'day', batch:1, reads:1, writes:1, resp:false, lookups:0, retry:0},
    ]
  },
  {
    key:'edi', title:'B2B / EDI trading partners', service:'B2B / EDI', rate:'edi', fit:'b2b',
    help:'Each EDI document received or sent counts as a document. A typical inbound 850 purchase order produces 3 documents: the inbound 850, the 997 acknowledgement, and the ERP write. Add 1 more if the ERP returns a response.',
    fields:[
      {k:'name', label:'Partner group / transaction', type:'text', def:'Retail partners · 850 PO'},
      {k:'partners', label:'Partners', type:'num', def:10},
      {k:'txns', label:'Transactions / partner', type:'num', def:100},
      {k:'per', label:'Per', type:'period', def:'month'},
      {k:'docsPer', label:'Docs / transaction', type:'num', def:3, tip:'Inbound/outbound EDI doc + acknowledgement (997/CONTRL) + back-end write/response'},
    ],
    cols:['Docs / mo','Messages / mo'],
    calc(r){
      const docs = n(r.partners)*perMonth(n(r.txns), r.per)*n(r.docsPer);
      return {units:docs, msgs:docs*rateMul('edi'), cols:[docs, docs*rateMul('edi')]};
    },
    sample:[
      {name:'Retailers · 850 PO in', partners:12, txns:300, per:'month', docsPer:3},
      {name:'Retailers · 856 ASN out', partners:12, txns:300, per:'month', docsPer:2},
      {name:'Retailers · 810 Invoice out', partners:12, txns:300, per:'month', docsPer:2},
    ]
  },
  {
    key:'apis', title:'API Management', service:'API Management', rate:'api', fit:'apim',
    help:'Each API call through the Boomi gateway counts. If the API also runs a Boomi integration process, model that process under <b>Integration processes</b> as well.',
    fields:[
      {k:'name', label:'API / product', type:'text', def:'New API'},
      {k:'consumers', label:'Consumers / apps', type:'num', def:1},
      {k:'calls', label:'Calls / consumer', type:'num', def:1000},
      {k:'per', label:'Per', type:'period', def:'day'},
    ],
    cols:['Calls / mo','Messages / mo'],
    calc(r){
      const calls = n(r.consumers)*perMonth(n(r.calls), r.per);
      return {units:calls, msgs:calls*rateMul('api'), cols:[calls, calls*rateMul('api')]};
    },
    sample:[
      {name:'Order status API (mobile app)', consumers:1, calls:6000, per:'day'},
      {name:'Partner catalogue API', consumers:8, calls:500, per:'day'},
    ]
  },
  {
    key:'events', title:'Event Streams', service:'Event Streams', rate:'event', fit:'events',
    help:'Publishing an event and each consumption of it both count. Events counted = <code>published × (1 + subscribers)</code>, then converted at the event rate.',
    fields:[
      {k:'name', label:'Topic', type:'text', def:'new-topic'},
      {k:'published', label:'Events published', type:'num', def:10000},
      {k:'per', label:'Per', type:'period', def:'day'},
      {k:'subs', label:'Subscribers', type:'num', def:2},
    ],
    cols:['Events / mo','Messages / mo'],
    calc(r){
      const ev = perMonth(n(r.published), r.per)*(1+n(r.subs));
      return {units:ev, msgs:ev*rateMul('event'), cols:[ev, ev*rateMul('event')]};
    },
    sample:[{name:'order-events', published:3000, per:'day', subs:3}]
  },
  {
    key:'flow', title:'Flow (apps & workflows)', service:'Flow', rate:'flow', fit:'apps',
    help:'Each launch of a Flow app or workflow counts and is converted at the launch rate.',
    fields:[
      {k:'name', label:'App / workflow', type:'text', def:'New app'},
      {k:'users', label:'Users', type:'num', def:50},
      {k:'launches', label:'Launches / user', type:'num', def:20},
      {k:'per', label:'Per', type:'period', def:'month'},
    ],
    cols:['Launches / mo','Messages / mo'],
    calc(r){
      const l = n(r.users)*perMonth(n(r.launches), r.per);
      return {units:l, msgs:l*rateMul('flow'), cols:[l, l*rateMul('flow')]};
    },
    sample:[{name:'Returns approval workflow', users:60, launches:40, per:'month'}]
  },
  {
    key:'hub', title:'Data Hub (MDM)', service:'Data Hub', rate:'hub', fit:'mdm',
    help:'Sized by the number of golden records under management. The yearly per-record rate is spread evenly across 12 months. Record sync traffic from Integration processes is modelled separately.',
    fields:[
      {k:'name', label:'Domain / model', type:'text', def:'Customer'},
      {k:'records', label:'Golden records', type:'num', def:100000},
    ],
    cols:['Records','Messages / mo'],
    calc(r){
      const m = n(r.records)*rateMul('hub')/12;
      return {units:n(r.records), msgs:m, cols:[n(r.records), m]};
    },
    sample:[{name:'Customer', records:150000},{name:'Product', records:25000}]
  },
  {
    key:'bdi', title:'Data Integration (ELT / CDC)', service:'Data Integration', rate:'bdu', fit:'elt',
    help:'Boomi Data Integration (formerly Rivery) usage is measured in BDUs. Enter the expected BDUs per month from the BDI sizing.',
    fields:[
      {k:'name', label:'Pipeline / river', type:'text', def:'ERP → Snowflake'},
      {k:'bdus', label:'BDUs', type:'num', def:20},
      {k:'per', label:'Per', type:'period', def:'month'},
    ],
    cols:['BDUs / mo','Messages / mo'],
    calc(r){
      const b = perMonth(n(r.bdus), r.per);
      return {units:b, msgs:b*rateMul('bdu'), cols:[b, b*rateMul('bdu')]};
    },
    sample:[{name:'SAP + Shopify → Snowflake (CDC)', bdus:30, per:'month'}]
  },
  {
    key:'ai', title:'AI agents (Agentstudio)', service:'Agentstudio (AI)', rate:'ai', fit:'agents',
    help:'Each prompt sent to an agent counts. Prompts per month = <code>conversations × prompts per conversation</code>. Tools the agent calls through Integration processes are modelled under Integration.',
    fields:[
      {k:'name', label:'Agent', type:'text', def:'New agent'},
      {k:'convs', label:'Conversations', type:'num', def:50},
      {k:'per', label:'Per', type:'period', def:'day'},
      {k:'prompts', label:'Prompts / conv.', type:'num', def:4},
    ],
    cols:['Prompts / mo','Messages / mo'],
    calc(r){
      const p = perMonth(n(r.convs), r.per)*n(r.prompts);
      return {units:p, msgs:p*rateMul('ai'), cols:[p, p*rateMul('ai')]};
    },
    sample:[{name:'Order-status assistant', convs:40, per:'day', prompts:3}]
  },
];

/* ============================================================
   STATE
   ============================================================ */
let S = blankState();

function blankState(){
  const s = {
    meta:{date:new Date().toISOString().slice(0,10)},
    settings:{...DEFAULT_SETTINGS},
    rates:Object.fromEntries(Object.entries(DEFAULT_RATES).map(([k,v])=>[k,v.value])),
    bands:DEFAULT_BANDS.map(b=>({...b})),
    fit:{},
    collapsed:{'card-rates':true},
  };
  SECTIONS.forEach(sec=>{ s[sec.key]=[]; });
  return s;
}

function sampleState(){
  const s = blankState();
  s.meta = {customer:'Acme Retail (sample)', opportunity:'Order-to-cash & omnichannel modernisation', preparedBy:'Presales', ae:'', date:new Date().toISOString().slice(0,10), region:'APAC · Boomi cloud runtime', notes:'Sample scenario. Volumes are illustrative.'};
  SECTIONS.forEach(sec=>{ s[sec.key]=sec.sample.map(r=>({...defaultsFor(sec), ...r, id:uid()})); });
  s.fit = {nonProdEnv:true, cloudRuntime:true, orchestration:true, entConnectors:true, apiEnable:true, apim:true, b2b:true, mdm:true, elt:true, events:true, apps:true, agents:true};
  return s;
}

function defaultsFor(sec){ const o={}; sec.fields.forEach(f=>o[f.k]=f.def); return o; }
function uid(){ return Math.random().toString(36).slice(2,10); }
const n = v => { const x = parseFloat(v); return isFinite(x) && x>0 ? x : 0; };

function perMonth(v, per){
  const d = n(S.settings.daysPerMonth) || 30.4;
  switch(per){
    case 'hour': return v*24*d;
    case 'day': return v*d;
    case 'week': return v*d/7;
    case 'year': return v/12;
    default: return v;
  }
}
/* messages per unit */
function rateMul(key){
  const def = DEFAULT_RATES[key]; const v = n(S.rates[key]);
  if(!v) return 0;
  return def.mode==='every' ? 1/v : v;
}

/* ---------- formatting ---------- */
const NF0 = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const NFc = new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
const fmt = v => NF0.format(Math.round(v));
const fmtc = v => v<10000 ? NF0.format(Math.round(v)) : NFc.format(v);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ============================================================
   COMPUTE
   ============================================================ */
function compute(){
  const svc = SECTIONS.map(sec=>{
    const rows = S[sec.key].map(r=>({id:r.id, ...sec.calc(r)}));
    const msgs = rows.reduce((a,r)=>a+r.msgs,0);
    const units = rows.reduce((a,r)=>a+r.units,0);
    return {sec, rows, msgs, units};
  });
  const prod = svc.reduce((a,s)=>a+s.msgs,0);
  const nonProd = prod*n(S.settings.nonProdPct)/100;
  const monthly = prod+nonProd;
  const years = Math.min(5,Math.max(1,Math.round(n(S.settings.years)||1)));
  const g = n(S.settings.growthPct)/100, h = n(S.settings.headroomPct)/100;
  const proj = Array.from({length:years},(_,i)=>{ const base = monthly*12*Math.pow(1+g,i); return {year:i+1, base, withH:base*(1+h)}; });
  return {svc, prod, nonProd, monthly, proj};
}

function recommend(R){
  let lvl = 0; const reasons = [];
  FIT_RULES.forEach(rule=>{
    if(S.fit[rule.k] && rule.lvl!==undefined && rule.lvl>0){
      if(rule.lvl>lvl) lvl = rule.lvl;
      reasons.push({lvl:rule.lvl, text:`${rule.label} → ${EDITIONS[rule.lvl]}+`});
    }
  });
  reasons.sort((a,b)=>b.lvl-a.lvl);
  if(!reasons.length) reasons.push({lvl:0, text:'No advanced capabilities ticked yet. Standard is the starting point.'});
  // services in scope: from fit ticks or non-zero usage
  const services = new Map([['Integration', R.svc[0].msgs>0 || true]]);
  SECTIONS.slice(1).forEach(sec=>{
    const used = R.svc.find(s=>s.sec.key===sec.key).msgs>0;
    const ticked = sec.fit && S.fit[sec.fit];
    services.set(sec.service, !!(used||ticked));
  });
  // band
  const y1 = R.proj[0]?.withH||0;
  const bands = S.bands.filter(b=>b.name);
  let band = null;
  for(const b of bands){ if(b.upTo===null || b.upTo==='' || y1<=n(b.upTo)){ band=b; break; } }
  if(!band && bands.length) band = bands[bands.length-1];
  return {lvl, reasons, services, band, y1};
}

/* ============================================================
   RENDER: input sections (built once per structural change)
   ============================================================ */
function renderSections(){
  const host = document.getElementById('sections');
  host.innerHTML = SECTIONS.map(sec=>{
    const head = sec.fields.map(f=>`<th${f.type==='num'?' class="r"':''}>${f.tip?`<span class="tip" title="${esc(f.tip)}">${esc(f.label)}</span>`:esc(f.label)}</th>`).join('')
      + sec.cols.map(c=>`<th class="r">${esc(c)}</th>`).join('') + '<th></th>';
    const body = S[sec.key].map(r=>rowHtml(sec,r)).join('');
    const collapsed = S.collapsed['card-'+sec.key] ?? (S[sec.key].length===0 && sec.key!=='integrations');
    return `<div class="card${collapsed?' collapsed':''}${S[sec.key].length?'':' empty'}" id="card-${sec.key}">
      <div class="card-h" data-toggle><span class="chev">▾</span><h2>${esc(sec.title)}</h2>
        <span class="badge">${esc(rateText(sec.rate))}</span>
        <span class="total" id="tot-${sec.key}"></span></div>
      <div class="card-b">
        <p class="help">${sec.help}</p>
        <div class="tbl-wrap"><table class="rows" data-sec="${sec.key}">
          <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <button class="add-btn" data-add="${sec.key}">+ Add ${esc(sec.fields[0].label.toLowerCase())}</button>
      </div></div>`;
  }).join('');
}

function rowHtml(sec, r){
  const cells = sec.fields.map(f=>{
    const v = r[f.k];
    let inp;
    if(f.type==='text') inp = `<input class="in txt" data-f="${f.k}" value="${esc(v)}">`;
    else if(f.type==='num') inp = `<input class="in" type="number" min="0" step="any" data-f="${f.k}" value="${esc(v)}">`;
    else if(f.type==='check') inp = `<input type="checkbox" data-f="${f.k}"${v?' checked':''}>`;
    else { const opts = f.type==='period'?PERIOD_OPTS:f.opts;
      inp = `<select class="in" data-f="${f.k}">${Object.entries(opts).map(([k,l])=>`<option value="${k}"${k===v?' selected':''}>${esc(l)}</option>`).join('')}</select>`; }
    return `<td${f.type==='check'?' style="text-align:center"':''}>${inp}</td>`;
  }).join('');
  const calc = sec.cols.map((c,i)=>`<td class="calc${i===sec.cols.length-1?' msgs':''}" data-c="${i}"></td>`).join('');
  return `<tr data-id="${r.id}">${cells}${calc}<td><button class="icon-btn" data-del="${r.id}" title="Remove row">×</button></td></tr>`;
}

function rateText(key){
  const d = DEFAULT_RATES[key]; const v = S.rates[key];
  return d.mode==='every' ? `${fmt(n(v))} ${d.unit} = 1 message` : `1 ${d.unit} = ${n(v)} message${n(v)===1?'':'s'}`;
}

function renderRates(){
  const t = document.getElementById('ratesTbl');
  t.innerHTML = `<thead><tr><th>Usage unit</th><th>Mode</th><th class="r">Value</th><th>Reads as</th><th>Default source</th></tr></thead><tbody>` +
    Object.entries(DEFAULT_RATES).map(([k,d])=>`<tr>
      <td>${esc(d.label)}</td>
      <td style="white-space:nowrap;color:var(--text-secondary)">${d.mode==='every'?'units per message':'messages per unit'}</td>
      <td style="width:110px"><input class="in" type="number" min="0" step="any" data-rate="${k}" value="${esc(S.rates[k])}"></td>
      <td style="white-space:nowrap" data-ratetext="${k}">${esc(rateText(k))}</td>
      <td style="color:var(--text-muted);font-size:12px">${esc(d.src)}</td></tr>`).join('') + '</tbody>';
}

function renderBands(){
  const t = document.getElementById('bandsTbl');
  t.innerHTML = `<thead><tr><th>Band name</th><th class="r">Up to (annual messages)</th><th></th></tr></thead><tbody>` +
    S.bands.map((b,i)=>`<tr><td><input class="in txt" data-band="${i}" data-bf="name" value="${esc(b.name)}"></td>
      <td style="width:220px"><input class="in" type="number" min="0" step="any" placeholder="no upper limit" data-band="${i}" data-bf="upTo" value="${b.upTo===null?'':esc(b.upTo)}"></td>
      <td><button class="icon-btn" data-delband="${i}" title="Remove band">×</button></td></tr>`).join('') +
    `</tbody><tfoot><tr><td colspan="3"><button class="add-btn" id="btnAddBand" style="margin-top:6px">+ Add band</button></td></tr></tfoot>`;
}

function renderFit(){
  document.getElementById('fitChecks').innerHTML = FIT_RULES.map(r=>
    `<label><input type="checkbox" data-fit="${r.k}"${S.fit[r.k]?' checked':''}><span>${esc(r.label)}<span class="lvl">${esc(r.note)}</span></span></label>`).join('');
}

function renderStatic(){
  document.querySelectorAll('[data-meta]').forEach(el=>el.value = S.meta[el.dataset.meta]??'');
  document.querySelectorAll('[data-set]').forEach(el=>el.value = S.settings[el.dataset.set]??'');
  ['card-meta','card-settings','card-fit','card-rates'].forEach(id=>{
    const c=document.getElementById(id); if(S.collapsed[id]!==undefined) c.classList.toggle('collapsed',!!S.collapsed[id]);
  });
  renderSections(); renderRates(); renderBands(); renderFit();
}

/* ============================================================
   RENDER: outputs (cheap, runs on every input)
   ============================================================ */
function update(){
  const R = compute();
  // per-row calc cells + section totals
  R.svc.forEach(s=>{
    const tbl = document.querySelector(`table[data-sec="${s.sec.key}"]`);
    s.rows.forEach(r=>{
      const tr = tbl.querySelector(`tr[data-id="${r.id}"]`); if(!tr) return;
      r.cols.forEach((v,i)=>{ tr.querySelector(`td[data-c="${i}"]`).textContent = fmt(v); });
    });
    const tot = document.getElementById('tot-'+s.sec.key);
    tot.innerHTML = s.rows.length ? `${fmt(s.msgs)} <small>msg / mo</small>` : '<small>not in scope</small>';
    document.getElementById('card-'+s.sec.key).classList.toggle('empty', !s.rows.length);
  });
  document.querySelectorAll('[data-ratetext]').forEach(el=>el.textContent = rateText(el.dataset.ratetext));
  document.querySelectorAll('#sections .card-h .badge').forEach((b,i)=>b.textContent = rateText(SECTIONS[i].rate));

  // hero
  setText('sumMonthly', fmt(R.monthly));
  setText('kProd', fmtc(R.prod));
  setText('kNonProd', fmtc(R.nonProd));
  setText('kAnnual', fmtc(R.proj[0]?.base||0));
  setText('kAnnualH', fmtc(R.proj[0]?.withH||0));
  setText('sumMonthlySub', `production + ${n(S.settings.nonProdPct)}% non-prod, before ${n(S.settings.headroomPct)}% headroom`);

  // service bars (single series → single hue, sorted by magnitude)
  const sorted = [...R.svc].sort((a,b)=>b.msgs-a.msgs);
  const max = Math.max(1, ...sorted.map(s=>s.msgs));
  document.getElementById('svcBars').innerHTML = sorted.map(s=>{
    const pct = R.prod? s.msgs/R.prod*100 : 0;
    return `<div class="bar-row${s.msgs?'':' zero'}" data-tip="<b>${esc(s.sec.service)}</b><br>${fmt(s.msgs)} messages / month<br>${pct.toFixed(1)}% of production<br>${fmt(s.units)} ${esc(DEFAULT_RATES[s.sec.rate].unit)}${DEFAULT_RATES[s.sec.rate].mode==='every'?'':'s'} / mo">
      <div class="name">${esc(s.sec.service)}</div>
      <div class="track">${s.msgs?`<div class="fill" style="width:${(s.msgs/max*100).toFixed(2)}%"></div>`:''}</div>
      <div class="val">${s.msgs?fmtc(s.msgs):'n/a'}</div></div>`;
  }).join('');

  // projection bars
  const pmax = Math.max(1, ...R.proj.map(p=>p.withH));
  setText('projTitle', `Annual messages over ${R.proj.length}-year term (incl. non-prod + headroom)`);
  document.getElementById('projBars').innerHTML = R.proj.map(p=>
    `<div class="vbar" data-tip="<b>Year ${p.year}</b><br>${fmt(p.base)} messages (before headroom)<br>${fmt(p.withH)} with ${n(S.settings.headroomPct)}% headroom">
      <div class="cap">${fmtc(p.withH)}</div><div class="col" style="height:${(p.withH/pmax*82).toFixed(2)}%"></div></div>`).join('');
  document.getElementById('projLabels').innerHTML = R.proj.map(p=>`<div>Year ${p.year}</div>`).join('');

  // breakdown table (also the accessible table view of the charts)
  const rowsHtml = R.svc.filter(s=>s.rows.length).map(s=>`<tr><td>${esc(s.sec.service)}</td><td class="r">${fmt(s.msgs)}</td><td class="r">${fmt(s.msgs*12)}</td><td class="r">${R.prod?(s.msgs/R.prod*100).toFixed(1):'0.0'}%</td></tr>`).join('');
  document.getElementById('sumTbl').innerHTML = `<thead><tr><th>Service</th><th class="r">/ month</th><th class="r">/ year</th><th class="r">Share</th></tr></thead><tbody>
    ${rowsHtml || '<tr><td colspan="4" style="color:var(--text-muted)">Add workloads on the left to see the breakdown.</td></tr>'}
    <tr class="tot"><td>Production</td><td class="r">${fmt(R.prod)}</td><td class="r">${fmt(R.prod*12)}</td><td class="r">100%</td></tr>
    <tr><td>Non-prod (${n(S.settings.nonProdPct)}%)</td><td class="r">${fmt(R.nonProd)}</td><td class="r">${fmt(R.nonProd*12)}</td><td></td></tr>
    ${R.proj.map(p=>`<tr${p.year===1?' class="tot"':''}><td>Year ${p.year} + headroom</td><td class="r">${fmt(p.withH/12)}</td><td class="r">${fmt(p.withH)}</td><td></td></tr>`).join('')}
    </tbody>`;

  // recommendation
  const rec = recommend(R);
  document.getElementById('edBar').innerHTML = EDITIONS.map((e,i)=>`<div class="${i===rec.lvl?'rec':i>rec.lvl?'':'on'}">${esc(e)}</div>`).join('');
  document.getElementById('edReasons').innerHTML = rec.reasons.map(r=>`<li>${esc(r.text)}</li>`).join('');
  document.getElementById('svcChips').innerHTML = [...rec.services].map(([name,on])=>`<span class="chip${on?' on':''}">${on?'✓ ':''}${esc(name)}</span>`).join('');
  document.getElementById('bandOut').textContent = rec.band ? `${rec.band.name}: ${fmt(rec.y1)} msgs / yr` : 'No bands defined';

  // print header
  const m = S.meta;
  document.getElementById('printMeta').innerHTML = `<b>${esc(m.customer||'Customer')}</b> · ${esc(m.opportunity||'')}<br><span style="color:#666">Prepared by ${esc(m.preparedBy||'')}${m.ae?' for AE '+esc(m.ae):''} · ${esc(m.date||'')} · ${esc(m.region||'')}</span>`;
  document.title = `${m.customer?m.customer+' · ':''}Boomi Platform Message Estimator`;
  save();
  return R;
}
const setText = (id,t)=>{ document.getElementById(id).textContent = t; };

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('input', e=>{
  const el = e.target;
  if(el.dataset.meta){ S.meta[el.dataset.meta] = el.value; return update(); }
  if(el.dataset.set){ S.settings[el.dataset.set] = el.value; return update(); }
  if(el.dataset.rate){ S.rates[el.dataset.rate] = el.value; return update(); }
  if(el.dataset.band!==undefined){ const b=S.bands[+el.dataset.band]; b[el.dataset.bf] = el.dataset.bf==='upTo' ? (el.value===''?null:el.value) : el.value; return update(); }
  if(el.dataset.fit){ S.fit[el.dataset.fit] = el.checked; return update(); }
  if(el.dataset.f){
    const tr = el.closest('tr'); const key = el.closest('table').dataset.sec;
    const row = S[key].find(r=>r.id===tr.dataset.id); if(!row) return;
    row[el.dataset.f] = el.type==='checkbox' ? el.checked : el.value;
    update();
  }
});
document.addEventListener('change', e=>{ if(e.target.type==='checkbox' || e.target.tagName==='SELECT') e.target.dispatchEvent(new Event('input',{bubbles:true})); });

document.addEventListener('click', e=>{
  const t = e.target;
  const h = t.closest('[data-toggle]');
  if(h){ const card = h.closest('.card'); card.classList.toggle('collapsed'); S.collapsed[card.id] = card.classList.contains('collapsed'); save(); return; }
  if(t.dataset.add){
    const sec = SECTIONS.find(s=>s.key===t.dataset.add);
    const row = {...defaultsFor(sec), id:uid()}; S[sec.key].push(row);
    const tbody = document.querySelector(`table[data-sec="${sec.key}"] tbody`);
    tbody.insertAdjacentHTML('beforeend', rowHtml(sec,row));
    tbody.lastElementChild.querySelector('input')?.select();
    return update();
  }
  if(t.dataset.del){
    const tr = t.closest('tr'); const key = t.closest('table').dataset.sec;
    S[key] = S[key].filter(r=>r.id!==t.dataset.del); tr.remove(); return update();
  }
  if(t.dataset.delband!==undefined){ S.bands.splice(+t.dataset.delband,1); renderBands(); return update(); }
  if(t.id==='btnAddBand'){ S.bands.push({name:'New band', upTo:null}); renderBands(); return update(); }
});

const on = (id,fn)=>document.getElementById(id).addEventListener('click',fn);
on('btnSample', ()=>{ if(hasData() && !confirm('Replace the current inputs with the sample scenario?')) return; S = sampleState(); renderStatic(); update(); toast('Sample scenario loaded'); });
on('btnNew', ()=>{ if(hasData() && !confirm('Clear all inputs and start a new estimate?')) return; S = blankState(); S[SECTIONS[0].key].push({...defaultsFor(SECTIONS[0]), id:uid()}); renderStatic(); update(); toast('New estimate'); });
on('btnPrint', ()=>window.print());
on('btnTheme', ()=>{ const r=document.documentElement; const d = r.dataset.theme==='dark'?'light':'dark'; r.dataset.theme=d; localStorage.setItem(STORAGE_KEY+'-theme',d); });
on('btnResetRates', ()=>{ S.rates = blankState().rates; renderRates(); update(); toast('Rates reset to defaults'); });
on('btnResetBands', ()=>{ S.bands = DEFAULT_BANDS.map(b=>({...b})); renderBands(); update(); });
on('btnExport', ()=>{
  const name = (S.meta.customer||'estimate').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
  download(`${name}-platform-messages.json`, JSON.stringify({app:'boomi-pm-estimator', version:1, savedAt:new Date().toISOString(), state:S},null,2), 'application/json');
});
on('btnImport', ()=>document.getElementById('fileIn').click());
document.getElementById('fileIn').addEventListener('change', async e=>{
  const f = e.target.files[0]; if(!f) return;
  try{
    const j = JSON.parse(await f.text());
    S = normalize(j.state||j); renderStatic(); update(); toast(`Opened ${f.name}`);
  }catch(err){ alert('Could not open file: '+err.message); }
  e.target.value='';
});
on('btnCsv', ()=>{
  const R = compute(); const lines = [['Section','Item','Usage / month','Usage unit','Messages / month','Messages / year']];
  R.svc.forEach(s=>s.rows.forEach(r=>{
    const row = S[s.sec.key].find(x=>x.id===r.id);
    lines.push([s.sec.service, row.name, Math.round(r.units), DEFAULT_RATES[s.sec.rate].unit, Math.round(r.msgs), Math.round(r.msgs*12)]);
  }));
  lines.push([]); lines.push(['Total','Production','','',Math.round(R.prod),Math.round(R.prod*12)]);
  lines.push(['Total',`Non-prod (${n(S.settings.nonProdPct)}%)`,'','',Math.round(R.nonProd),Math.round(R.nonProd*12)]);
  R.proj.forEach(p=>lines.push(['Projection',`Year ${p.year} + ${n(S.settings.headroomPct)}% headroom`,'','',Math.round(p.withH/12),Math.round(p.withH)]));
  const csv = lines.map(l=>l.map(v=>{ v=String(v??''); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; }).join(',')).join('\n');
  const name = (S.meta.customer||'estimate').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  download(`${name}-platform-messages.csv`, csv, 'text/csv');
});

function hasData(){ return SECTIONS.some(s=>S[s.key].length) || S.meta.customer; }
function download(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text],{type})); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1800); }

/* tooltips */
const tip = document.getElementById('tip');
document.addEventListener('mousemove', e=>{
  const el = e.target.closest('[data-tip]');
  if(!el){ tip.style.display='none'; return; }
  tip.innerHTML = el.dataset.tip; tip.style.display='block';
  const w = tip.offsetWidth, hh = tip.offsetHeight;
  let x = e.clientX+14, y = e.clientY+14;
  if(x+w > innerWidth-8) x = e.clientX-w-14;
  if(y+hh > innerHeight-8) y = e.clientY-hh-14;
  tip.style.left = x+'px'; tip.style.top = y+'px';
});

/* ============================================================
   PERSISTENCE
   ============================================================ */
let saveT;
function save(){ clearTimeout(saveT); saveT = setTimeout(()=>{ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }catch(e){} }, 250); }
function normalize(s){
  const b = blankState();
  const out = {...b, ...s, meta:{...b.meta,...(s.meta||{})}, settings:{...b.settings,...(s.settings||{})}, rates:{...b.rates,...(s.rates||{})}, fit:{...(s.fit||{})}, collapsed:{...b.collapsed,...(s.collapsed||{})}};
  out.bands = Array.isArray(s.bands)&&s.bands.length ? s.bands : b.bands;
  SECTIONS.forEach(sec=>{ out[sec.key] = (s[sec.key]||[]).map(r=>({...defaultsFor(sec), ...r, id:r.id||uid()})); });
  return out;
}

/* boot */
(function init(){
  const th = localStorage.getItem(STORAGE_KEY+'-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.dataset.theme = th;
  try{ const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if(saved) S = normalize(saved); else S = sampleState(); }
  catch(e){ S = sampleState(); }
  renderStatic(); update();
})();
