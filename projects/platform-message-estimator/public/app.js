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

/* Edition names as in Boomi Help › Integration editions. Personal Edition (30-day trial) is left out
   because it can't deploy or schedule processes. boomi.com/pricing labels the first column
   "Standard features"; that is the feature baseline, not an edition name. */
const EDITIONS = ['Base','Professional','Professional Plus','Enterprise','Enterprise Plus'];

/* capability → minimum edition (index into EDITIONS) or platform service */
const FIT_RULES = [
  {k:'prodOnly',     label:'Production deployment only is acceptable', lvl:0, note:'Base'},
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
    help:'Each inbound and outbound document counts as 1 message, including response documents from request/response calls. Calls between components in the same account (for example Integration → Flow) are not counted. Hover over any <b>Messages / mo</b> value to see its calculation. Messages per document = <code>source reads + target writes × (2 if req/resp, else 1) + lookups × 2</code>.',
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
      const msgs = units*rateMul('doc');
      const docsPerRun = Math.ceil(n(r.records)/Math.max(1,n(r.batch)));
      const ex = [
        `<b>Documents / month</b>`,
        `ceil(${fx(r.records)} records ÷ ${fx(Math.max(1,n(r.batch)))} per doc) = ${fx(docsPerRun)} docs per run`,
        `× ${pmText(n(r.runs), r.per, 'runs')}`,
        `= <b>${fmt(docs)}</b> docs`,
        `<b>Messages / document</b>`,
        `${fx(r.reads)} read + ${fx(r.writes)} write${r.resp?' × 2 (req/resp)':''} + ${fx(r.lookups)} lookup × 2 = <b>${fx(per)}</b>`,
        `<b>Messages / month</b>`,
        `${fx(docs)} docs × ${fx(per)}${n(r.retry)?` × ${fx(1+n(r.retry)/100,2)} (retry ${fx(r.retry)}%)`:''}${rateNote('doc')} = <b>${fmt(msgs)}</b>`,
      ];
      return {units, msgs, cols:[docs, msgs], ex};
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
      const msgs = docs*rateMul('edi');
      const ex = [
        `Per partner: ${pmText(n(r.txns), r.per, 'transactions')}`,
        `× ${fx(r.partners)} partners × ${fx(r.docsPer)} docs per transaction = <b>${fmt(docs)}</b> docs`,
        `${fx(docs)} docs${rateNote('edi')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:docs, msgs, cols:[docs, msgs], ex};
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
      const msgs = calls*rateMul('api');
      const ex = [
        `Per consumer: ${pmText(n(r.calls), r.per, 'calls')}`,
        `× ${fx(r.consumers)} consumers = <b>${fmt(calls)}</b> calls / month`,
        `${fx(calls)} calls${rateNote('api')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:calls, msgs, cols:[calls, msgs], ex};
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
      const pub = perMonth(n(r.published), r.per);
      const ev = pub*(1+n(r.subs));
      const msgs = ev*rateMul('event');
      const ex = [
        `${pmText(n(r.published), r.per, 'events published')}`,
        `× (1 publish + ${fx(r.subs)} subscribers) = <b>${fmt(ev)}</b> events`,
        `${fx(ev)} events${rateNote('event')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:ev, msgs, cols:[ev, msgs], ex};
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
      const msgs = l*rateMul('flow');
      const ex = [
        `Per user: ${pmText(n(r.launches), r.per, 'launches')}`,
        `× ${fx(r.users)} users = <b>${fmt(l)}</b> launches / month`,
        `${fx(l)} launches${rateNote('flow')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:l, msgs, cols:[l, msgs], ex};
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
      const ex = [
        `${fx(r.records)} golden records${rateNote('hub')} per year`,
        `= ${fx(n(r.records)*rateMul('hub'))} messages / year`,
        `÷ 12 months = <b>${fmt(m)}</b> messages / month`,
      ];
      return {units:n(r.records), msgs:m, cols:[n(r.records), m], ex};
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
      const msgs = b*rateMul('bdu');
      const ex = [
        `${pmText(n(r.bdus), r.per, 'BDUs')}`,
        `${fx(b)} BDUs${rateNote('bdu')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:b, msgs, cols:[b, msgs], ex};
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
      const msgs = p*rateMul('ai');
      const ex = [
        `${pmText(n(r.convs), r.per, 'conversations')}`,
        `× ${fx(r.prompts)} prompts per conversation = <b>${fmt(p)}</b> prompts`,
        `${fx(p)} prompts${rateNote('ai')} = <b>${fmt(msgs)}</b> messages`,
      ];
      return {units:p, msgs, cols:[p, msgs], ex};
    },
    sample:[{name:'Order-status assistant', convs:40, per:'day', prompts:3}]
  },
];

/* ============================================================
   CONNECTION-BASED LICENSING (alternative sizing model)
   Rules from Boomi Help › Platform › Licensing and Integration editions:
   - 1 license = 1 unique connection (component ID) per runtime
     (basic runtime, runtime cluster regardless of nodes, or cloud attachment)
   - reusing a connection in many processes/operations costs nothing extra
   - copies of a connection (new component ID) count separately
   - each Trading Partner component = 1 Trading Partner license
   - test and production licenses are separate; Base edition is prod-only
   - Boomi-internal connectors below deploy an unlimited number of times
   ============================================================ */
const CONN_CLASSES = {
  std:{label:'Standard'}, ent:{label:'Enterprise'}, sb:{label:'Small Business'},
  tp:{label:'Trading Partner'}, exempt:{label:'Not licensed (unlimited)'},
};
const CLASS_ORDER = ['std','ent','sb','tp'];

/* v = class named as an example in Boomi docs; otherwise "most connectors are Standard", verify */
const CONN_CATALOG = {
  rest:{label:'REST Client', cls:'std'},
  http:{label:'HTTP Client', cls:'std'},
  openapi:{label:'OpenAPI', cls:'std'},
  db:{label:'Database V2 (JDBC)', cls:'std'},
  sftp:{label:'SFTP / FTP', cls:'std', v:true},
  disk:{label:'Disk v2', cls:'std', v:true},
  mail:{label:'Mail (IMAP)', cls:'std'},
  ldap:{label:'LDAP / Active Directory', cls:'std'},
  salesforce:{label:'Salesforce', cls:'std', v:true},
  netsuite:{label:'NetSuite', cls:'std', v:true},
  servicenow:{label:'ServiceNow', cls:'std'},
  shopify:{label:'Shopify', cls:'std'},
  workday:{label:'Workday', cls:'std'},
  sap:{label:'SAP (BAPI / IDoc / JCo)', cls:'ent', v:true},
  oracleebs:{label:'Oracle E-Business Suite', cls:'ent', v:true},
  quickbooks:{label:'QuickBooks', cls:'sb', v:true},
  sage50:{label:'Sage 50 / Peachtree', cls:'sb', v:true},
  tp:{label:'Trading partner (X12 / EDIFACT / HL7)', cls:'tp', v:true},
  wss:{label:'Web Services Server (listener / API)', cls:'exempt', v:true},
  events:{label:'Event Streams', cls:'exempt', v:true},
  datahub:{label:'Boomi Data Hub', cls:'exempt', v:true},
  fss:{label:'Flow Services Server', cls:'exempt', v:true},
  queue:{label:'Atom Queue', cls:'exempt', v:true},
  platformapi:{label:'AtomSphere / Partner API', cls:'exempt', v:true},
  sap4:{label:'Boomi for SAP', cls:'exempt', v:true},
  mft:{label:'Boomi MFT', cls:'exempt', v:true},
  as2s:{label:'AS2 Shared Server', cls:'exempt', v:true},
  mllp:{label:'MLLP Server / OFTP2 Server', cls:'exempt', v:true},
  other:{label:'Other connector', cls:'std'},
};

/* Included connection licenses per edition [prod, test], from Boomi's Integration editions page.
   Small Business and Trading Partner licenses are not listed as included. */
const DEFAULT_ED_INC = [
  {sp:2,  st:0,  ep:0, et:0, test:false, ent:false},
  {sp:5,  st:5,  ep:0, et:0, test:true,  ent:true},
  {sp:7,  st:7,  ep:0, et:0, test:true,  ent:true},
  {sp:10, st:20, ep:1, et:2, test:true,  ent:true},
  {sp:15, st:30, ep:2, et:4, test:true,  ent:true},
];

const CONN_FIELDS = [
  {k:'name', label:'System / endpoint', type:'text', def:'New connection'},
  {k:'connector', label:'Connector', type:'select', opts:Object.fromEntries(Object.entries(CONN_CATALOG).map(([k,v])=>[k,v.label])), def:'rest'},
  {k:'cls', label:'Class', type:'select', opts:Object.fromEntries(Object.entries(CONN_CLASSES).map(([k,v])=>[k,v.label])), def:'std', tip:'Licence class. Defaults from the connector; change it if the customer\'s order form says otherwise.'},
  {k:'qty', label:'Unique connections', type:'num', def:1, tip:'Distinct connection components (different component IDs). One SAP system used by 40 processes = 1. Separate credentials/instances, or a copied connection, = 2. For trading partners: the number of trading partner components.'},
  {k:'prodRt', label:'Prod runtimes', type:'num', def:1, tip:'Production runtimes this connection is deployed to. A runtime cluster or a cloud attachment counts once, whatever the node count.'},
  {k:'testRt', label:'Test runtimes', type:'num', def:1, tip:'Test runtimes this connection is deployed to (uses Test licences). 0 if it is never deployed to a test environment.'},
  {k:'phase', label:'Live in', type:'select', opts:{1:'Year 1',2:'Year 2',3:'Year 3',4:'Year 4',5:'Year 5'}, def:'1', tip:'Contract year in which this connection goes live'},
];

const CONN_SAMPLE = [
  {name:'Shopify store', connector:'shopify', cls:'std', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'SAP S/4HANA', connector:'sap', cls:'ent', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'WMS database', connector:'db', cls:'std', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'Salesforce CRM', connector:'salesforce', cls:'std', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'Workday HCM', connector:'workday', cls:'std', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'Active Directory', connector:'ldap', cls:'std', qty:1, prodRt:1, testRt:0, phase:'1'},
  {name:'Retail partners (12)', connector:'tp', cls:'tp', qty:12, prodRt:1, testRt:1, phase:'1'},
  {name:'Partner SFTP drop', connector:'sftp', cls:'std', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'Order status API', connector:'wss', cls:'exempt', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'order-events topic', connector:'events', cls:'exempt', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'Customer / product MDM', connector:'datahub', cls:'exempt', qty:1, prodRt:1, testRt:1, phase:'1'},
  {name:'POS platform API', connector:'rest', cls:'std', qty:1, prodRt:1, testRt:1, phase:'2'},
];

function connCalc(r){
  const exempt = r.cls==='exempt';
  const q = n(r.qty), p = exempt?0:q*n(r.prodRt), t = exempt?0:q*n(r.testRt);
  const cl = CONN_CLASSES[r.cls]?.label || r.cls;
  const ex = exempt
    ? [`<b>${esc(CONN_CATALOG[r.connector]?.label||'This connector')}</b> is a Boomi connector you can deploy an unlimited number of times.`, `Licences used: <b>0</b>`]
    : [`<b>${cl} class</b>`,
       `Prod: ${fx(q)} unique × ${fx(r.prodRt)} runtime${n(r.prodRt)===1?'':'s'} = <b>${fmt(p)}</b>`,
       `Test: ${fx(q)} unique × ${fx(r.testRt)} runtime${n(r.testRt)===1?'':'s'} = <b>${fmt(t)}</b>`,
       `Reusing the connection in more processes adds nothing.`];
  return {prod:p, test:t, exempt, ex};
}

function computeConns(){
  const years = Math.min(5,Math.max(1,Math.round(n(S.settings.years)||1)));
  const rows = S.conns.map(r=>({id:r.id, r, ...connCalc(r)}));
  const byYear = y => {
    const o = {}; CLASS_ORDER.forEach(c=>o[c]={prod:0,test:0});
    rows.filter(x=>!x.exempt && (+x.r.phase||1)<=y).forEach(x=>{ const c=o[x.r.cls]; if(c){ c.prod+=x.prod; c.test+=x.test; } });
    o.prod = CLASS_ORDER.reduce((a,c)=>a+o[c].prod,0); o.test = CLASS_ORDER.reduce((a,c)=>a+o[c].test,0);
    return o;
  };
  const proj = Array.from({length:years},(_,i)=>({year:i+1, ...byYear(i+1)}));
  const end = proj[proj.length-1];
  const exemptCount = rows.filter(x=>x.exempt).reduce((a,x)=>a+n(x.r.qty),0);
  return {rows, proj, y1:proj[0], end, exemptCount, years};
}

function connRecommend(C, fitLvl){
  const e = C.end, inc = S.edInc, reasons = [];
  const needTest = e.test>0, needEnt = e.ent.prod+e.ent.test>0;
  let lvl = 0;
  for(; lvl<EDITIONS.length; lvl++){
    const i = inc[lvl], d = DEFAULT_ED_INC[lvl];
    if(needTest && !d.test) continue;
    if(needEnt && !d.ent) continue;
    if(n(i.sp)>=e.std.prod && n(i.st)>=e.std.test) break;
  }
  const covered = lvl<EDITIONS.length;
  if(!covered) lvl = EDITIONS.length-1;
  if(needTest && !DEFAULT_ED_INC[0].test) reasons.push({lvl:1, text:`${fmt(e.test)} test licences needed → test environments start at ${EDITIONS[1]}`});
  if(needEnt) reasons.push({lvl:1, text:`Enterprise-class connectors (${fmt(e.ent.prod)} prod / ${fmt(e.ent.test)} test) → ${EDITIONS[1]}+`});
  reasons.push({lvl, text: covered
    ? `${fmt(e.std.prod)} prod / ${fmt(e.std.test)} test Standard-class connectors fit ${EDITIONS[lvl]} Edition (${fmt(n(inc[lvl].sp))} / ${fmt(n(inc[lvl].st))} included)`
    : `${fmt(e.std.prod)} prod / ${fmt(e.std.test)} test Standard-class connectors exceed every edition's inclusion → ${EDITIONS[lvl]} plus additional licences`});
  if(fitLvl>lvl) reasons.push({lvl:fitLvl, text:`Capability requirements (Platform fit) → ${EDITIONS[fitLvl]}`});
  const final = Math.max(lvl, fitLvl);
  reasons.sort((a,b)=>b.lvl-a.lvl);
  const i = inc[final];
  const cov = [
    ['Standard', 'prod', e.std.prod, n(i.sp)], ['Standard', 'test', e.std.test, n(i.st)],
    ['Enterprise', 'prod', e.ent.prod, n(i.ep)], ['Enterprise', 'test', e.ent.test, n(i.et)],
    ['Small Business', 'prod', e.sb.prod, 0], ['Small Business', 'test', e.sb.test, 0],
    ['Trading Partner', 'prod', e.tp.prod, 0], ['Trading Partner', 'test', e.tp.test, 0],
  ].map(([c,env,req,incl])=>({c, env, req, incl, add:Math.max(0,req-incl)}));
  return {lvl:final, reasons, cov};
}

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
    collapsed:{'card-rates':true,'card-edinc':true},
    mode:'messages',
    conns:[],
    edInc:DEFAULT_ED_INC.map(({sp,st,ep,et})=>({sp,st,ep,et})),
  };
  SECTIONS.forEach(sec=>{ s[sec.key]=[]; });
  return s;
}

function sampleState(){
  const s = blankState();
  s.meta = {customer:'Acme Retail (sample)', opportunity:'Order-to-cash & omnichannel modernisation', preparedBy:'Presales', ae:'', date:new Date().toISOString().slice(0,10), region:'APAC · Boomi cloud runtime', notes:'Sample scenario. Volumes are illustrative.'};
  SECTIONS.forEach(sec=>{ s[sec.key]=sec.sample.map(r=>({...defaultsFor(sec), ...r, id:uid()})); });
  s.conns = CONN_SAMPLE.map(r=>({...defaultsForConn(), ...r, id:uid()}));
  s.fit = {nonProdEnv:true, cloudRuntime:true, orchestration:true, entConnectors:true, apiEnable:true, apim:true, b2b:true, mdm:true, elt:true, events:true, apps:true, agents:true};
  return s;
}

function defaultsForConn(){ const o={}; CONN_FIELDS.forEach(f=>o[f.k]=f.def); return o; }
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
/* "120 per hour × 24 h × 30.4 days = 87,552 runs / month" */
function pmText(v, per, what){
  const d = n(S.settings.daysPerMonth) || 30.4;
  const tot = fx(perMonth(v, per));
  switch(per){
    case 'hour':  return `${fx(v)} ${what} per hour × 24 h × ${fx(d,1)} days = ${tot} ${what} / month`;
    case 'day':   return `${fx(v)} ${what} per day × ${fx(d,1)} days = ${tot} ${what} / month`;
    case 'week':  return `${fx(v)} ${what} per week × ${fx(d/7,2)} weeks = ${tot} ${what} / month`;
    case 'year':  return `${fx(v)} ${what} per year ÷ 12 = ${tot} ${what} / month`;
    default:      return `${fx(v)} ${what} / month`;
  }
}
function rateNote(key){
  const d = DEFAULT_RATES[key], v = n(S.rates[key]);
  if(d.mode==='every') return ` ÷ ${fx(v)}`;
  return v===1 ? '' : ` × ${fx(v,2)} per unit`;
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
const fx = (v, dp=2) => new Intl.NumberFormat('en-US',{maximumFractionDigits:dp}).format(Number(v)||0);
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
  if(!reasons.length) reasons.push({lvl:0, text:'No advanced capabilities ticked yet. Base is the starting point.'});
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
      + sec.cols.map((c,i)=>`<th class="r${i===sec.cols.length-1?' msgs-h':''}">${esc(c)}</th>`).join('') + '<th class="del-h"></th>';
    const body = S[sec.key].map(r=>rowHtml(sec,r)).join('');
    const collapsed = S.collapsed['card-'+sec.key] ?? (S[sec.key].length===0 && sec.key!=='integrations');
    return `<div class="card${collapsed?' collapsed':''}${S[sec.key].length?'':' empty'}" id="card-${sec.key}">
      <div class="card-h" data-toggle><span class="chev">▾</span><h2>${esc(sec.title)}</h2><button class="help-btn" data-guide="${sec.key}" title="How is this calculated? (example)" aria-label="How is ${esc(sec.title)} calculated?">?</button>
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
  return `<tr data-id="${r.id}">${cells}${calc}<td class="del"><button class="icon-btn" data-del="${r.id}" title="Remove row">×</button></td></tr>`;
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
  ['card-meta','card-settings','card-fit','card-rates','card-conns','card-edinc'].forEach(id=>{
    const c=document.getElementById(id); if(S.collapsed[id]!==undefined) c.classList.toggle('collapsed',!!S.collapsed[id]);
  });
  renderSections(); renderRates(); renderBands(); renderFit(); renderConns(); renderEdInc(); setMode(S.mode);
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
      const mc = tr.querySelector('td.calc.msgs');
      if(mc && r.ex){ mc.dataset.tip = `<div class="tip-title">How this is calculated</div>` + r.ex.map(l=>`<div class="tip-line">${l}</div>`).join(''); }
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
  document.getElementById('cPrintMeta').innerHTML = document.getElementById('printMeta').innerHTML;
  document.title = `${m.customer?m.customer+' · ':''}Boomi ${S.mode==='connections'?'Connection':'Platform Message'} Estimator`;
  updateConns(R);
  save();
  return R;
}
const setText = (id,t)=>{ document.getElementById(id).textContent = t; };

/* ============================================================
   RENDER: connection-based mode
   ============================================================ */
function fieldInput(f, v){
  if(f.type==='text') return `<input class="in txt" data-f="${f.k}" value="${esc(v)}">`;
  if(f.type==='num') return `<input class="in" type="number" min="0" step="1" data-f="${f.k}" value="${esc(v)}">`;
  return `<select class="in" data-f="${f.k}">${Object.entries(f.opts).map(([k,l])=>`<option value="${k}"${String(k)===String(v)?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function connRowHtml(r){
  const cells = CONN_FIELDS.map(f=>`<td>${fieldInput(f, r[f.k])}</td>`).join('');
  return `<tr data-id="${r.id}" class="${r.cls==='exempt'?'exempt':''}">${cells}<td class="calc" data-c="0"></td><td class="calc msgs" data-c="1"></td><td class="del"><button class="icon-btn" data-del="${r.id}" title="Remove row">×</button></td></tr>`;
}
function renderConns(){
  const head = CONN_FIELDS.map(f=>`<th${f.type==='num'?' class="r"':''}>${f.tip?`<span class="tip" title="${esc(f.tip)}">${esc(f.label)}</span>`:esc(f.label)}</th>`).join('')
    + `<th class="r">Prod licences</th><th class="r msgs-h">Test licences</th><th class="del-h"></th>`;
  document.getElementById('connTbl').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${S.conns.map(connRowHtml).join('')}</tbody>`;
}
function renderEdInc(){
  document.getElementById('edIncTbl').innerHTML = `<thead><tr><th>Edition</th><th class="r">Standard connectors · prod</th><th class="r">Standard connectors · test</th><th class="r">Enterprise connectors · prod</th><th class="r">Enterprise connectors · test</th></tr></thead><tbody>` +
    EDITIONS.map((e,i)=>`<tr><td>${esc(e)}</td>${['sp','st','ep','et'].map(k=>`<td style="width:130px"><input class="in" type="number" min="0" step="1" data-edinc="${i}" data-ek="${k}" value="${esc(S.edInc[i][k])}"></td>`).join('')}</tr>`).join('') + '</tbody>';
}
function setMode(m){
  S.mode = m;
  document.body.classList.toggle('mode-conn', m==='connections');
  document.querySelectorAll('[data-mode]').forEach(b=>{ b.classList.toggle('on', b.dataset.mode===m); b.setAttribute('aria-pressed', b.dataset.mode===m); });
}

function updateConns(R){
  const C = computeConns();
  const tbl = document.getElementById('connTbl');
  C.rows.forEach(x=>{
    const tr = tbl.querySelector(`tr[data-id="${x.id}"]`); if(!tr) return;
    tr.classList.toggle('exempt', x.exempt);
    tr.querySelector('td[data-c="0"]').textContent = x.exempt ? '0' : fmt(x.prod);
    const mc = tr.querySelector('td[data-c="1"]'); mc.textContent = x.exempt ? '0' : fmt(x.test);
    const tipHtml = `<div class="tip-title">How this is counted</div>` + x.ex.map(l=>`<div class="tip-line">${l}</div>`).join('');
    tr.querySelector('td[data-c="0"]').dataset.tip = tipHtml; mc.dataset.tip = tipHtml;
  });
  const y1 = C.y1, e = C.end;
  document.getElementById('tot-conns').innerHTML = S.conns.length ? `${fmt(y1.prod+y1.test)} <small>licences · Year 1</small>` : '<small>none yet</small>';

  setText('cTotal', fmt(y1.prod+y1.test));
  setText('cSub', `${fmt(y1.prod)} production + ${fmt(y1.test)} test licences`);
  setText('cProd', fmt(y1.prod)); setText('cTest', fmt(y1.test));
  setText('cEnd', fmt(e.prod+e.test)); setText('cExempt', fmt(C.exemptCount));
  setText('cEndK', `End of term (Year ${C.years})`);

  // bars by class (Year 1, prod + test)
  const max = Math.max(1, ...CLASS_ORDER.map(c=>y1[c].prod+y1[c].test));
  document.getElementById('cBars').innerHTML = CLASS_ORDER.map(c=>{
    const v = y1[c].prod+y1[c].test;
    return `<div class="bar-row${v?'':' zero'}" data-tip="<b>${esc(CONN_CLASSES[c].label)}</b><br>${fmt(y1[c].prod)} production<br>${fmt(y1[c].test)} test">
      <div class="name">${esc(CONN_CLASSES[c].label)}</div>
      <div class="track">${v?`<div class="fill" style="width:${(v/max*100).toFixed(2)}%"></div>`:''}</div>
      <div class="val">${v?fmt(v):'n/a'}</div></div>`;
  }).join('');

  // projection
  const pmax = Math.max(1, ...C.proj.map(p=>p.prod+p.test));
  setText('cProjTitle', `Licences over the ${C.years}-year term (cumulative, by go-live year)`);
  document.getElementById('cProjBars').innerHTML = C.proj.map(p=>
    `<div class="vbar" data-tip="<b>Year ${p.year}</b><br>${fmt(p.prod)} production<br>${fmt(p.test)} test"><div class="cap">${fmt(p.prod+p.test)}</div><div class="col" style="height:${((p.prod+p.test)/pmax*82).toFixed(2)}%"></div></div>`).join('');
  document.getElementById('cProjLabels').innerHTML = C.proj.map(p=>`<div>Year ${p.year}</div>`).join('');

  // breakdown
  document.getElementById('cSumTbl').innerHTML = `<thead><tr><th>Connector class</th><th class="r">Prod</th><th class="r">Test</th><th class="r">Total</th></tr></thead><tbody>
    ${CLASS_ORDER.map(c=>`<tr><td>${esc(CONN_CLASSES[c].label)}</td><td class="r">${fmt(y1[c].prod)}</td><td class="r">${fmt(y1[c].test)}</td><td class="r">${fmt(y1[c].prod+y1[c].test)}</td></tr>`).join('')}
    <tr class="tot"><td>Year 1</td><td class="r">${fmt(y1.prod)}</td><td class="r">${fmt(y1.test)}</td><td class="r">${fmt(y1.prod+y1.test)}</td></tr>
    ${C.years>1?`<tr class="tot"><td>Year ${C.years} (end of term)</td><td class="r">${fmt(e.prod)}</td><td class="r">${fmt(e.test)}</td><td class="r">${fmt(e.prod+e.test)}</td></tr>`:''}
    <tr><td colspan="4" style="color:var(--text-muted)">${fmt(C.exemptCount)} Boomi connector${C.exemptCount===1?'':'s'} (Web Services Server, Event Streams, Data Hub…) use no licence</td></tr></tbody>`;

  // recommendation
  const fitLvl = recommend(R).lvl;
  const rec = connRecommend(C, fitLvl);
  document.getElementById('cEdBar').innerHTML = EDITIONS.map((ed,i)=>`<div class="${i===rec.lvl?'rec':i>rec.lvl?'':'on'}">${esc(ed)}</div>`).join('');
  document.getElementById('cEdReasons').innerHTML = rec.reasons.map(r=>`<li>${esc(r.text)}</li>`).join('');
  setText('cCovTitle', `${EDITIONS[rec.lvl]} Edition: connection licences included vs required (end of term)`);
  const covRows = rec.cov.filter(c=>c.req||c.incl);
  document.getElementById('cCovTbl').innerHTML = `<thead><tr><th><span class="tip" title="Connector licence class (Standard / Enterprise / Small Business / Trading Partner), not the edition">Connector class licence</span></th><th class="r">Required</th><th class="r">Included</th><th class="r">Additional</th></tr></thead><tbody>
    ${covRows.length ? covRows.map(c=>`<tr><td>${esc(c.c)} connectors · ${c.env}</td><td class="r">${fmt(c.req)}</td><td class="r">${fmt(c.incl)}</td><td class="r"${c.add?' style="font-weight:700;color:var(--brand-2)"':''}>${c.add?'+'+fmt(c.add):'0'}</td></tr>`).join('') : '<tr><td colspan="4" style="color:var(--text-muted)">Add connections on the left.</td></tr>'}
    <tr class="tot"><td>Additional licences</td><td></td><td></td><td class="r">${fmt(rec.cov.reduce((a,c)=>a+c.add,0))}</td></tr></tbody>`;
  const services = recommend(R).services;
  document.getElementById('cSvcChips').innerHTML = [...services].map(([name,on])=>`<span class="chip${on?' on':''}">${on?'✓ ':''}${esc(name)}</span>`).join('');
  return C;
}

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
  if(el.dataset.edinc!==undefined){ S.edInc[+el.dataset.edinc][el.dataset.ek] = el.value; return update(); }
  if(el.dataset.f){
    const tr = el.closest('tr'); const key = el.closest('table').dataset.sec;
    const row = S[key].find(r=>r.id===tr.dataset.id); if(!row) return;
    row[el.dataset.f] = el.type==='checkbox' ? el.checked : el.value;
    if(key==='conns' && el.dataset.f==='connector'){
      row.cls = CONN_CATALOG[el.value]?.cls || 'std';
      tr.querySelector('select[data-f="cls"]').value = row.cls;
    }
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
  const mb = t.closest('[data-mode]');
  if(mb){ setMode(mb.dataset.mode); update(); toast(mb.dataset.mode==='connections'?'Connection-based sizing':'Platform-message sizing'); return; }
  if(t.id==='btnAddConn'){
    const row = {...defaultsForConn(), id:uid()}; S.conns.push(row);
    const tbody = document.querySelector('#connTbl tbody');
    tbody.insertAdjacentHTML('beforeend', connRowHtml(row));
    tbody.lastElementChild.querySelector('input')?.select();
    return update();
  }
  if(t.id==='btnSampleConns'){
    if(S.conns.length && !confirm('Replace the connection list with the sample connections?')) return;
    S.conns = CONN_SAMPLE.map(r=>({...defaultsForConn(), ...r, id:uid()})); renderConns(); update(); toast('Sample connections loaded'); return;
  }
  if(t.id==='btnResetEdInc'){ S.edInc = blankState().edInc; renderEdInc(); update(); toast('Edition inclusions reset'); return; }
  if(t.dataset.delband!==undefined){ S.bands.splice(+t.dataset.delband,1); renderBands(); return update(); }
  if(t.id==='btnAddBand'){ S.bands.push({name:'New band', upTo:null}); renderBands(); return update(); }
});

const on = (id,fn)=>document.getElementById(id).addEventListener('click',fn);
on('btnSample', ()=>{ if(hasData() && !confirm('Replace the current inputs with the sample scenario?')) return; const md=S.mode; S = sampleState(); S.mode=md; renderStatic(); update(); toast('Sample scenario loaded'); });
on('btnNew', ()=>{ if(hasData() && !confirm('Clear all inputs and start a new estimate?')) return; const md=S.mode; S = blankState(); S.mode=md; S[SECTIONS[0].key].push({...defaultsFor(SECTIONS[0]), id:uid()}); S.conns.push({...defaultsForConn(), id:uid()}); renderStatic(); update(); toast('New estimate'); });
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
  if(S.mode==='connections') return connCsv();
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

function connCsv(){
  const C = computeConns(), R = compute(), rec = connRecommend(C, recommend(R).lvl);
  const lines = [['System / endpoint','Connector','Class','Unique connections','Prod runtimes','Test runtimes','Live in','Prod licences','Test licences']];
  C.rows.forEach(x=>lines.push([x.r.name, CONN_CATALOG[x.r.connector]?.label||x.r.connector, CONN_CLASSES[x.r.cls]?.label||x.r.cls, n(x.r.qty), n(x.r.prodRt), n(x.r.testRt), 'Year '+x.r.phase, x.prod, x.test]));
  lines.push([]);
  C.proj.forEach(p=>lines.push(['Total',`Year ${p.year} (cumulative)`,'','','','','',p.prod,p.test]));
  lines.push([]); lines.push(['Recommended edition', EDITIONS[rec.lvl]]);
  lines.push(['Licence','Environment','Required','Included','Additional']);
  rec.cov.forEach(c=>lines.push([c.c, c.env, c.req, c.incl, c.add]));
  lines.push([]); lines.push(['Estimate only, not an official Boomi document.']);
  const csv = lines.map(l=>l.map(v=>{ v=String(v??''); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; }).join(',')).join('\n');
  const name = (S.meta.customer||'estimate').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  download(`${name}-connection-licences.csv`, csv, 'text/csv');
}
function hasData(){ return SECTIONS.some(s=>S[s.key].length) || S.conns.length || S.meta.customer; }
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
  out.mode = s.mode==='connections' ? 'connections' : 'messages';
  out.conns = (Array.isArray(s.conns) ? s.conns : CONN_SAMPLE).map(r=>({...defaultsForConn(), ...r, id:r.id||uid()}));
  out.edInc = DEFAULT_ED_INC.map((d,i)=>({sp:d.sp,st:d.st,ep:d.ep,et:d.et, ...((s.edInc||[])[i]||{})}));
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

/* ============================================================
   BUSINESS-USER GUIDES ("?" button on each section)
   Worked examples are computed live with the section's own calc,
   so the numbers always match the current assumptions and rates.
   ============================================================ */
const GUIDES = {
  integrations:{
    plain:'An integration process moves business records, such as orders, invoices or employees, from one system to another. Boomi counts <b>one message every time a document enters or leaves Boomi</b>. That includes the reply a system sends back.',
    story:'Online orders flow from <b>Shopify</b> into <b>SAP</b>. About <b>120 orders an hour</b>, around the clock. For each order Boomi looks up the SAP customer number and the product price, then creates the sales order. SAP replies with the new order number.',
    flow:[
      ['Shopify sends the order to Boomi','1'],
      ['Boomi asks SAP for the customer number, and SAP answers','2'],
      ['Boomi asks SAP for the product price, and SAP answers','2'],
      ['Boomi creates the order in SAP, and SAP replies with the order number','2'],
    ],
    flowTotal:'7 messages for every order',
    fields:[
      ['Records / run','How many business records (orders, rows, files) each run handles. Real-time processes handle 1 record per run.'],
      ['Runs · Per','How often the process runs: 120 per hour, once a day, and so on.'],
      ['Records / doc','1 = every record travels on its own. 100 = records are bundled 100 at a time, which divides the messages by 100.'],
      ['Source reads','Documents received from the source for each document, usually 1.'],
      ['Target writes','How many systems each document is sent to.'],
      ['Req/resp','Tick it if the target sends a reply (an order number, a status). The reply counts too, so each write becomes 2.'],
      ['Lookups','Extra questions Boomi asks other systems for each document. Each one is a question and an answer, so it counts as 2.'],
      ['Retry %','Share of documents sent again because of errors.'],
    ],
    tips:[
      '<b>Bundling saves the most.</b> A nightly sync of 25,000 products sent 100 per document needs only about 250 documents a run.',
      '<b>No reply, no extra message.</b> Untick Req/resp for one-way drops such as SFTP files or queues.',
      '<b>Lookups inside Boomi are free.</b> Cross-reference tables and document caches don\'t leave Boomi, so set Lookups to 0.',
      '<b>Subprocesses don\'t count.</b> One Boomi process calling another in the same account is not a message.',
    ],
  },
  edi:{
    plain:'Trading partners such as retailers, suppliers and logistics firms exchange standard business documents called <b>EDI</b>. Each EDI document received or sent counts, plus the <b>acknowledgement</b> (997) and the document passed to or from your ERP.',
    story:'<b>12 retailers</b> each send about <b>300 purchase orders a month</b>. Each purchase order is received, an acknowledgement is sent back, and the order is created in the ERP.',
    flow:[
      ['Retailer sends the 850 purchase order to Boomi','1'],
      ['Boomi sends the 997 acknowledgement back to the retailer','1'],
      ['Boomi creates the order in the ERP','1'],
    ],
    flowTotal:'3 messages for every purchase order',
    fields:[
      ['Partners','Number of trading partners using this document type.'],
      ['Transactions / partner','How many of these documents each partner exchanges.'],
      ['Docs / transaction','Documents per transaction: the EDI document, the acknowledgement, and the ERP write. Add 1 if the ERP sends a reply.'],
    ],
    tips:[
      'Model each document type separately (850 in, 856 out, 810 out), because they have different document counts.',
      'Outbound documents such as invoices (810) usually count 2: read from the ERP, then sent to the partner.',
    ],
  },
  apis:{
    plain:'Apps, websites and partners call your APIs through Boomi\'s API gateway. <b>Each call counts as one message.</b>',
    story:'The <b>mobile app</b> checks order status about <b>6,000 times a day</b>.',
    flow:[['The app calls the Order Status API through the Boomi gateway','1']],
    flowTotal:'1 message for every API call',
    fields:[
      ['Consumers / apps','How many apps or partners call this API.'],
      ['Calls / consumer · Per','How often each one calls it.'],
    ],
    tips:[
      'If the API runs a Boomi integration process behind the scenes, add that process under <b>Integration processes</b> too. Its documents are counted separately.',
      'Use the busiest realistic period, such as peak trading, to set calls per day.',
    ],
  },
  events:{
    plain:'Systems <b>publish</b> events, such as "order created", to a topic, and other systems <b>subscribe</b> to receive them. The publish counts, and each delivery to a subscriber counts. <b>100 events = 1 message.</b>',
    story:'About <b>3,000 order events a day</b> are published. The warehouse, the CRM and analytics each subscribe.',
    flow:[
      ['The order system publishes the event','1 event'],
      ['Delivered to the warehouse, CRM and analytics','3 events'],
    ],
    flowTotal:'4 events per order, so every 25 orders = 1 message',
    fields:[
      ['Events published · Per','How many events are published to the topic.'],
      ['Subscribers','How many systems receive each event.'],
    ],
    tips:['Event volume is converted at 100 events per message, so even high event rates add relatively few messages.'],
  },
  flow:{
    plain:'Flow apps are the screens and workflows people use, such as approvals, forms and portals. <b>Each time someone launches an app counts. 100 launches = 1 message.</b>',
    story:'<b>60 store managers</b> each start the <b>returns-approval workflow</b> about <b>40 times a month</b>.',
    flow:[['A manager opens the returns-approval app','1 launch']],
    flowTotal:'100 launches = 1 message',
    fields:[
      ['Users','People who use the app.'],
      ['Launches / user · Per','How often each person opens or starts it.'],
    ],
    tips:['If the app calls Boomi integration processes, for example to look up an order, model those processes under Integration.'],
  },
  hub:{
    plain:'Data Hub keeps one trusted <b>golden record</b> for each customer, product or supplier. It\'s sized by <b>how many golden records you keep</b>: each one is 12 messages a year, which is 1 a month.',
    story:'The company keeps about <b>150,000 customer</b> golden records.',
    flow:[['One golden record kept for a year','12'],['Spread across 12 months','1 a month']],
    flowTotal:'1 message per golden record per month',
    fields:[['Golden records','How many unique, matched records the hub will hold for this domain.']],
    tips:['Count unique golden records, not the source records: 3 systems holding the same customer is still 1 golden record.','The integrations that sync records to and from the hub are modelled under Integration.'],
  },
  bdi:{
    plain:'Data Integration (formerly Rivery) copies data into a data warehouse or lake. Its usage is measured in <b>BDUs</b> (Boomi Data Units), taken from the data-pipeline sizing. <b>1 BDU = 50 messages.</b>',
    story:'Loading SAP and Shopify data into Snowflake is expected to use about <b>30 BDUs a month</b>.',
    flow:[['One BDU of pipeline usage','50']],
    flowTotal:'50 messages per BDU',
    fields:[['BDUs · Per','Expected BDU usage from the data-pipeline sizing.']],
    tips:['If you don\'t know the BDUs yet, leave this section empty and note it as an open item.'],
  },
  ai:{
    plain:'AI agents answer questions or carry out tasks. <b>Each prompt (one question or turn) sent to an agent counts as 100 messages.</b>',
    story:'An <b>order-status assistant</b> handles about <b>40 conversations a day</b>, with about <b>3 prompts</b> in each.',
    flow:[['A customer asks the agent a question','1 prompt = 100'],['A follow-up question in the same chat','1 prompt = 100']],
    flowTotal:'100 messages per prompt',
    fields:[
      ['Conversations · Per','How many chats or tasks the agent handles.'],
      ['Prompts / conv.','Average number of questions or turns per chat.'],
    ],
    tips:['If the agent calls Boomi processes as tools, for example to look up an order, those documents are counted under Integration too.'],
  },
};

function guideHtml(key){
  if(key==='settings') return settingsGuideHtml();
  if(key==='conns') return connGuideHtml();
  const sec = SECTIONS.find(s=>s.key===key), g = GUIDES[key];
  const row = {...defaultsFor(sec), ...sec.sample[0]};
  const c = sec.calc(row);
  const inputs = sec.fields.filter(f=>f.k!=='name').map(f=>{
    let v=row[f.k]; if(f.type==='period') v=PERIOD_OPTS[v]; else if(f.type==='select') v=f.opts[v]; else if(f.type==='check') v=v?'Yes':'No'; else if(f.type==='num') v=fx(v);
    return `<tr><td>${esc(f.label)}</td><td class="r">${esc(v)}</td></tr>`;
  }).join('');
  return `
    <h2>${esc(sec.title)}: how it's calculated</h2>
    <p class="g-plain">${g.plain}</p>
    <h3>Example: ${esc(row.name)}</h3>
    <p>${g.story}</p>
    <div class="g-flow">${g.flow.map((f,i)=>`<div class="g-step"><span class="g-n">${i+1}</span><span class="g-t">${f[0]}</span><span class="g-c">${f[1]}</span></div>`).join('')}
      <div class="g-step g-total"><span class="g-n">=</span><span class="g-t">${g.flowTotal}</span></div></div>
    <div class="g-cols">
      <div><h3>What you would enter</h3><table class="g-tbl">${inputs}</table></div>
      <div><h3>What the tool calculates</h3><div class="g-calc">${c.ex.map(l=>`<div>${l}</div>`).join('')}</div>
        <div class="g-result">≈ <b>${fmt(c.msgs)}</b> messages per month</div></div>
    </div>
    <h3>What each input means</h3>
    <table class="g-tbl g-fields">${g.fields.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${b}</td></tr>`).join('')}</table>
    <h3>Tips</h3><ul class="g-tips">${g.tips.map(t=>`<li>${t}</li>`).join('')}</ul>
    <p class="g-note">The example uses the current sizing assumptions (${fx(n(S.settings.daysPerMonth),1)} active days per month) and conversion rates. These are estimates, not an official Boomi document.</p>
    <div class="g-actions"><button class="btn" data-addexample="${key}">Add this example to my estimate</button><button class="btn primary-btn" data-closeguide>Got it</button></div>`;
}

function settingsGuideHtml(){
  const R = compute(), st = S.settings;
  const np = n(st.nonProdPct), g = n(st.growthPct), h = n(st.headroomPct);
  const y1 = R.proj[0], y2 = R.proj[1];
  return `
    <h2>Sizing assumptions: how they're applied</h2>
    <p class="g-plain">The workload sections give <b>production messages per month</b>. These settings turn that into the yearly figure the AE takes to the customer.</p>
    <div class="g-flow">
      <div class="g-step"><span class="g-n">1</span><span class="g-t"><b>Production</b>: total of all workload sections</span><span class="g-c">${fmt(R.prod)} / mo</span></div>
      <div class="g-step"><span class="g-n">2</span><span class="g-t"><b>+ Non-prod ${fx(np)}%</b>: test and dev runs, which may count like production</span><span class="g-c">${fmt(R.monthly)} / mo</span></div>
      <div class="g-step"><span class="g-n">3</span><span class="g-t"><b>× 12 months</b> = Year 1</span><span class="g-c">${fmt(y1?.base||0)} / yr</span></div>
      <div class="g-step"><span class="g-n">4</span><span class="g-t"><b>+ Headroom ${fx(h)}%</b>: peaks, retries, new interfaces</span><span class="g-c">${fmt(y1?.withH||0)} / yr</span></div>
      ${y2?`<div class="g-step"><span class="g-n">5</span><span class="g-t"><b>+ Growth ${fx(g)}% per year</b>: Year 2 = Year 1 × ${fx(1+g/100,2)}, and so on</span><span class="g-c">${fmt(y2.withH)} / yr</span></div>`:''}
    </div>
    <h3>What each setting means</h3>
    <table class="g-tbl g-fields">
      <tr><td>Active days per month</td><td>Days the business runs. 30.4 = every day (online shops, 24×7 plants). 21.7 = weekdays only (office back-office processes).</td></tr>
      <tr><td>Non-prod usage %</td><td>Extra volume from testing in test and dev environments. 10–20% is typical while projects are active. Set it to 0 if the customer's contract excludes non-production usage.</td></tr>
      <tr><td>Annual growth %</td><td>Expected growth in business volume (orders, customers, partners) each year.</td></tr>
      <tr><td>Safety headroom %</td><td>A buffer for seasonal peaks, error retries and new interfaces added during the year.</td></tr>
      <tr><td>Contract term</td><td>How many years to project.</td></tr>
    </table>
    <p class="g-note">The numbers above use the current estimate. These are estimates, not an official Boomi document.</p>
    <div class="g-actions"><button class="btn primary-btn" data-closeguide>Got it</button></div>`;
}

function openGuide(key){
  const d = document.getElementById('guide');
  document.getElementById('guideBody').innerHTML = guideHtml(key);
  d.showModal(); d.querySelector('.guide-scroll').scrollTop = 0;
}
document.addEventListener('click', e=>{
  const t = e.target;
  const hb = t.closest('[data-guide]');
  if(hb){ e.stopPropagation(); e.preventDefault(); openGuide(hb.dataset.guide); return; }
  if(t.closest('[data-closeguide]')){ document.getElementById('guide').close(); return; }
  if(t.id==='guide'){ t.close(); return; }  // backdrop click
  if(t.dataset.addexample){
    const sec = SECTIONS.find(s=>s.key===t.dataset.addexample);
    S[sec.key].push({...defaultsFor(sec), ...sec.sample[0], id:uid()});
    S.collapsed['card-'+sec.key] = false;
    renderSections(); update();
    document.getElementById('guide').close();
    document.getElementById('card-'+sec.key).scrollIntoView({behavior:'smooth', block:'start'});
    toast('Example added. Adjust the numbers to fit your customer.');
  }
}, true);

function connGuideHtml(){
  const ex = [
    ['1 process with 2 different connections, deployed to 1 runtime','2'],
    ['2 processes that reuse the same 2 connections, 1 runtime','2'],
    ['50 processes sharing 3 connections, 1 runtime','3'],
    ['1 process with 2 connections, environment with 2 basic runtimes','4'],
    ['1 process with 2 connections, a 3-node runtime cluster','2'],
    ['A copied process whose connections were copied too (new component IDs)','2 more'],
  ];
  return `
    <h2>Connection-based sizing: how it's counted</h2>
    <p class="g-plain">In the connection model the customer buys <b>connection licences</b> instead of messages. <b>One licence = one unique connection per runtime.</b> A connection is the component that holds an endpoint's URL and credentials, such as "SAP production" or "Salesforce org". Volume doesn't matter: 10 orders a day or 10 million use the same licence.</p>
    <h3>The rules</h3>
    <ul class="g-tips">
      <li><b>Unique, not per use.</b> A connection is identified by its component ID. Reusing it across many processes and operations costs nothing extra.</li>
      <li><b>Per runtime.</b> Each basic runtime, runtime cluster or cloud attachment it's deployed to needs its own licence. A cluster counts once, whatever its node count.</li>
      <li><b>Copies count.</b> Two connection components to the same system (different credentials, or a copied connection) are two licences.</li>
      <li><b>Test is separate.</b> Connections in test environments use <b>Test</b> licences. Base Edition is production only.</li>
      <li><b>Classes.</b> Most connectors are <b>Standard</b>. SAP and Oracle E-Business are <b>Enterprise</b>. QuickBooks and Sage 50 are <b>Small Business</b>. Each trading partner component is one <b>Trading Partner</b> licence, however many communication methods it has.</li>
      <li><b>Not licensed.</b> Boomi connectors such as Web Services Server, Event Streams, Data Hub, Flow Services Server, Atom Queue, Boomi MFT, Boomi for SAP and AS2 Shared Server can be deployed an unlimited number of times.</li>
      <li><b>Counted at deployment.</b> Connections in the Build tab don't count until a process using them is deployed.</li>
    </ul>
    <h3>Boomi's worked examples</h3>
    <table class="g-tbl">${ex.map(([a,b])=>`<tr><td>${a}</td><td class="r">${b} licences</td></tr>`).join('')}</table>
    <h3>What each input means</h3>
    <table class="g-tbl g-fields">${CONN_FIELDS.filter(f=>f.tip).map(f=>`<tr><td>${esc(f.label)}</td><td>${esc(f.tip)}</td></tr>`).join('')}</table>
    <h3>Tips</h3>
    <ul class="g-tips">
      <li>List <b>endpoints</b>, not interfaces. Five interfaces into one SAP system is still one SAP connection.</li>
      <li>Count a cloud attachment as one runtime. If the customer runs both a cloud attachment and an on-prem runtime, the same connection deployed to both is 2.</li>
      <li>Platform services such as API Management, Flow, Event Streams, Data Hub and Agentstudio are licensed separately from connections. Tick them under Platform fit.</li>
    </ul>
    <p class="g-note">Source: Boomi Help, Platform › Licensing and Integration editions. Edition inclusions are editable under "Edition inclusions". Estimate only, not an official Boomi document.</p>
    <div class="g-actions"><button class="btn primary-btn" data-closeguide>Got it</button></div>`;
}
