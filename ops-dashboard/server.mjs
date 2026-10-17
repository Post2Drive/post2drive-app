import http from "node:http";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });
const PORT = Number(process.env.PORT || 8080);
const USERNAME = process.env.OPS_DASHBOARD_USERNAME;
const PASSWORD = process.env.OPS_DASHBOARD_PASSWORD;
const SESSION_SECRET = process.env.OPS_DASHBOARD_SESSION_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const METRICS_CACHE_TTL_MS = 30_000;
const metricsCache = new Map();
const metricsInflight = new Map();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

if (!USERNAME || USERNAME.length < 3) {
  console.error("OPS_DASHBOARD_USERNAME is required and must be at least 3 characters.");
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 16) {
  console.error("OPS_DASHBOARD_PASSWORD is required and must be at least 16 characters.");
  process.exit(1);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("OPS_DASHBOARD_SESSION_SECRET is required and must be at least 32 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Use a dedicated read-only database role.");
  process.exit(1);
}

const markets = [
  ["GB","United Kingdom","GBP"],["IN","India","INR"],["AT","Austria","EUR"],["BE","Belgium","EUR"],["BG","Bulgaria","BGN"],["HR","Croatia","EUR"],["CY","Cyprus","EUR"],["EE","Estonia","EUR"],["FI","Finland","EUR"],["FR","France","EUR"],["DE","Germany","EUR"],["GR","Greece","EUR"],["IE","Ireland","EUR"],["IT","Italy","EUR"],["LV","Latvia","EUR"],["LT","Lithuania","EUR"],["LU","Luxembourg","EUR"],["MT","Malta","EUR"],["NL","Netherlands","EUR"],["PT","Portugal","EUR"],["SK","Slovakia","EUR"],["SI","Slovenia","EUR"],["ES","Spain","EUR"],["AD","Andorra","EUR"],["MC","Monaco","EUR"],["SM","San Marino","EUR"],["VA","Vatican City","EUR"],["XK","Kosovo","EUR"],["ME","Montenegro","EUR"],["CZ","Czechia","CZK"],["DK","Denmark","DKK"],["HU","Hungary","HUF"],["IS","Iceland","ISK"],["NO","Norway","NOK"],["PL","Poland","PLN"],["RO","Romania","RON"],["SE","Sweden","SEK"],["CH","Switzerland","CHF"],["TR","Türkiye","TRY"],["US","United States","USD"],["CA","Canada","CAD"],["AU","Australia","AUD"],["NZ","New Zealand","NZD"]
].map(([code,name,currency]) => ({ code,name,currency }));

const marketSources = {
  GB: [{name:"UK Department for Transport",url:"https://www.gov.uk/government/organisations/department-for-transport"},{name:"Office for National Statistics",url:"https://www.ons.gov.uk/"},{name:"Road Haulage Association",url:"https://www.rha.uk.net/"}],
  IN: [{name:"Ministry of Road Transport and Highways",url:"https://morth.nic.in/"},{name:"Ministry of Statistics and Programme Implementation",url:"https://www.mospi.gov.in/"},{name:"Reserve Bank of India",url:"https://www.rbi.org.in/"}],
  US: [{name:"Bureau of Transportation Statistics",url:"https://www.bts.gov/"},{name:"US Census Bureau",url:"https://www.census.gov/"},{name:"US Department of Transportation",url:"https://www.transportation.gov/"}],
  CA: [{name:"Statistics Canada",url:"https://www.statcan.gc.ca/"},{name:"Transport Canada",url:"https://tc.canada.ca/"}],
  AU: [{name:"Australian Bureau of Statistics",url:"https://www.abs.gov.au/"},{name:"Bureau of Infrastructure and Transport Research Economics",url:"https://www.bitre.gov.au/"}],
  NZ: [{name:"Stats NZ",url:"https://www.stats.govt.nz/"},{name:"New Zealand Ministry of Transport",url:"https://www.transport.govt.nz/"}],
  CH: [{name:"Swiss Federal Statistical Office",url:"https://www.bfs.admin.ch/bfs/en/home.html"},{name:"Federal Office of Transport",url:"https://www.bav.admin.ch/bav/en/home.html"}],
  TR: [{name:"Republic of Türkiye Ministry of Transport and Infrastructure",url:"https://www.uab.gov.tr/"},{name:"Turkish Statistical Institute",url:"https://data.tuik.gov.tr/"}],
  EU: [{name:"Eurostat transport statistics",url:"https://ec.europa.eu/eurostat/web/transport"},{name:"European Commission Mobility and Transport",url:"https://transport.ec.europa.eu/"}]
};
const market = (code) => markets.find(m => m.code === code);
const READINESS_GATES = [
  ["localization","Localization review"],["vehicleRules","Vehicle/document rules"],["payments","Payments capability"],
  ["timezones","Time-zone handling"],["legalReview","Local legal review"],["stagingE2E","Authenticated staging E2E"],
  ["operationalRecovery","Monitoring & recovery"]
];
function countryReadiness() {
  let configured = {};
  try {
    const parsed = JSON.parse(process.env.COUNTRY_READINESS_JSON || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) configured = parsed;
  } catch { console.error("COUNTRY_READINESS_JSON is invalid JSON; readiness remains not assessed."); }
  return markets.map(m => {
    const raw = configured[m.code] && typeof configured[m.code] === "object" ? configured[m.code] : {};
    const gates = READINESS_GATES.map(([key,label]) => {
      const supplied = raw[key] && typeof raw[key] === "object" ? raw[key] : {};
      const status = ["verified","blocked","in_progress"].includes(supplied.status) ? supplied.status : "not_assessed";
      return {key,label,status,reviewedAt:typeof supplied.reviewedAt==="string"?supplied.reviewedAt:null,evidenceRef:typeof supplied.evidenceRef==="string"?supplied.evidenceRef:null};
    });
    const ready = gates.every(g => g.status === "verified" && g.evidenceRef && g.reviewedAt);
    return {code:m.code,name:m.name,currency:m.currency,gates,verifiedGates:gates.filter(g=>g.status==="verified"&&g.evidenceRef&&g.reviewedAt).length,totalGates:gates.length,status:ready?"ready":gates.some(g=>g.status==="blocked")?"blocked":gates.some(g=>g.status==="in_progress")?"in_progress":"not_assessed"};
  });
}
const sourceList = (code) => code === "ALL"
  ? [...new Map(Object.values(marketSources).flat().map(s => [s.url,s])).values()]
  : marketSources[code] || (["AT","BE","BG","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES","CZ","DK","HU","IS","NO","PL","RO","SE"].includes(code) ? marketSources.EU : []);
const html = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sign = (value) => crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
function validSession(req) {
  const cookie = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("ops_session="))?.slice("ops_session=".length);
  if (!cookie) return false;
  const [stamp, signature] = cookie.split(".");
  if (!stamp || !signature || !/^\d+$/.test(stamp)) return false;
  const issued = Number(stamp);
  if (!Number.isFinite(issued) || Date.now() - issued > SESSION_TTL_MS || issued > Date.now() + 60_000) return false;
  const expected = sign(stamp);
  try { return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
}
function send(res, status, body, type = "text/html; charset=utf-8", extra = {}) {
  res.writeHead(status, { "content-type": type, "x-content-type-options":"nosniff", "x-frame-options":"DENY", "referrer-policy":"no-referrer", "cache-control":"no-store", "content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'", ...extra });
  res.end(body);
}
function pageLogin(error = "") {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Post2Drive Ops · Sign in</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e8eef8;font:16px system-ui;min-height:100vh;display:grid;place-items:center}.box{width:min(420px,92vw);background:#121d30;border:1px solid #2a3951;border-radius:18px;padding:28px}h1{margin:0 0 8px;font-size:25px}p{color:#a8b6ca;line-height:1.5}label{display:block;margin:18px 0 6px;font-size:13px}input{width:100%;padding:13px;border:1px solid #3c4d66;border-radius:9px;background:#0b1220;color:white}button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:9px;background:#69a7ff;color:#061327;font-weight:750;cursor:pointer}.err{color:#ffb4b4;font-size:13px}</style><main class="box"><div style="color:#7fb2ff;font-weight:800;letter-spacing:.12em;font-size:12px">POST2DRIVE · ADMIN</div><h1>Analytics & Logistics Dashboard</h1><p>Administrator access is separate from customer accounts. This account can access operational analytics only.</p>${error ? `<p class="err">${html(error)}</p>` : ""}<form method="post" action="/login"><label for="username">Admin username</label><input id="username" name="username" type="text" autocomplete="username" minlength="3" required autofocus><label for="password">Admin password</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="16" required><button type="submit">Open dashboard</button></form></main></html>`;
}
const dashboard = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Post2Drive · Analytics & Logistics Intelligence</title><style>
:root{color-scheme:dark;--bg:#0b1220;--panel:#121d30;--border:#293a53;--muted:#9bacbf;--text:#eaf1fa;--blue:#70aaff;--teal:#56d6c2;--red:#ff8b91;--amber:#ffc96b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}header{position:sticky;top:0;z-index:5;background:#0b1220ee;backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:14px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.brand{font-size:12px;letter-spacing:.12em;color:var(--blue);font-weight:800}.sub{color:var(--muted);font-size:12px}select,button{background:#15243a;color:var(--text);border:1px solid #354862;border-radius:8px;padding:9px 11px;font:inherit}button{cursor:pointer}button.primary{background:var(--blue);color:#061327;font-weight:750;border-color:var(--blue)}main{max-width:1600px;margin:auto;padding:22px}.section-nav{display:flex;gap:7px;flex-wrap:wrap;padding:10px 22px;border-bottom:1px solid var(--border);background:#0e1727;position:sticky;top:65px;z-index:4}.section-nav a{color:var(--muted);text-decoration:none;border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px}.section-nav a:hover,.section-nav a:focus{color:var(--text);border-color:var(--blue)}section[id]{scroll-margin-top:130px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.grid{display:grid;gap:13px}.kpis{grid-template-columns:repeat(auto-fit,minmax(155px,1fr));margin:18px 0}.two{grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))}.three{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}.panel,.kpi{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:17px;min-width:0}.kpi label{color:var(--muted);font-size:12px}.kpi strong{display:block;font-size:29px;letter-spacing:-.03em;margin:7px 0 2px;font-variant-numeric:tabular-nums}.kpi small{color:var(--muted)}h1{font-size:25px;margin:4px 0 3px}h2{font-size:16px;margin:0 0 4px}h3{font-size:13px;color:var(--muted);margin:15px 0 8px}.muted{color:var(--muted)}.section{margin:22px 0 10px;display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}.section p{margin:3px 0 0;color:var(--muted);font-size:12px}.barlist{display:grid;gap:11px;margin-top:14px}.barrow{display:grid;grid-template-columns:minmax(90px,150px) minmax(40px,1fr) 65px;gap:9px;align-items:center;font-size:12px}.bartrack{height:8px;background:#24344b;border-radius:20px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#4d8ff0,#56d6c2);border-radius:20px}.chart{width:100%;height:220px;display:block}.chart text{fill:var(--muted);font-size:10px}.chart .line{fill:none;stroke:var(--blue);stroke-width:2.5}.chart .area{fill:#70aaff18}.chart .gridline{stroke:#2a3a50;stroke-width:1}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:10px 9px;border-bottom:1px solid var(--border);white-space:nowrap}th{color:var(--muted);font-weight:600}td.bad{color:var(--red)}.pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 8px;font-size:11px}.pill.good{color:var(--teal)}.pill.warn{color:var(--amber)}.pill.bad{color:var(--red)}.notice{border:1px solid #6d5426;background:#2b2417;color:#ffe0a2;padding:12px;border-radius:10px;font-size:12px}.source{display:inline-block;color:var(--blue);margin:4px 10px 4px 0}.status{color:var(--muted);font-size:12px}.empty{color:var(--muted);padding:15px 0;font-size:12px}.insight{border-left:3px solid var(--teal);padding:9px 12px;margin:9px 0;background:#10252a;border-radius:0 8px 8px 0}.footer{padding:25px 0;color:var(--muted);font-size:11px}@media(max-width:650px){main{padding:14px}header{padding:12px}h1{font-size:21px}.kpi strong{font-size:24px}.barrow{grid-template-columns:90px minmax(30px,1fr) 45px}}</style>
<header><div><div class="brand">POST2DRIVE / ADMIN DASHBOARD</div><div class="sub">Operations · marketplace analytics · country logistics signals</div></div><div class="toolbar"><label class="sub" for="country">Market</label><select id="country"><option value="ALL">🌐 Global · all markets</option>${markets.map(m=>`<option value="${m.code}">${m.name} · ${m.currency}</option>`).join("")}</select><label class="sub" for="compare">Compare</label><select id="compare"><option value="">No comparison</option>${markets.map(m=>`<option value="${m.code}">${m.name}</option>`).join("")}</select><select id="days"><option value="1">24 hours</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select><button id="refresh" class="primary">Refresh data</button><form method="post" action="/logout"><button>Sign out</button></form></div></header>
<nav class="section-nav" aria-label="Admin sections"><a href="#overview">Command Centre</a><a href="#marketplace">Marketplace</a><a href="#people">Trust & Operations</a><a href="#quality">QA & Engineering</a><a href="#countries">Countries & Research</a><a href="#audit">Admin & Audit</a><a href="#catalogue-section">Data Catalogue</a></nav><main><div id="overview" class="section"><div><h1 id="title">Global operations overview</h1><p id="subtitle">Loading country-aware metrics…</p></div><div class="status" id="updated">Connecting to reporting database…</div></div><div id="warning"></div>
<div class="grid kpis" id="kpis"></div><div class="section"><div><h2>Needs attention</h2><p>Prioritized operational exceptions; recommendations are advisory and do not perform changes.</p></div><div class="status" id="attentionCount">Building queue…</div></div><section class="panel"><div class="scroll" id="attentionQueue"></div></section>
<div id="marketplace" class="section"><div><h2>Marketplace health & demand</h2><p>First-party Post2Drive data, filtered by account market. Synthetic QA accounts excluded from business totals.</p></div></div>
<div class="grid two"><section class="panel"><h2>Account growth</h2><p class="muted">New account profiles by day</p><div id="growth"></div></section><section class="panel"><h2>Job lifecycle mix</h2><p class="muted">Current job status distribution</p><div id="jobs"></div></section><section class="panel"><h2>Supply vs demand</h2><p class="muted">Poster/driver accounts, jobs, bids and conversion where available</p><div id="supply"></div></section><section class="panel"><h2>Account & verification status</h2><p class="muted">Account type and verification distribution</p><div id="accounts"></div></section></div>
<div id="reliability" class="section"><div><h2>API & technical reliability</h2><p>Telemetry starts only after instrumentation is deployed; missing telemetry is not zero traffic.</p></div></div>
<div class="grid two"><section class="panel"><h2>API requests and errors</h2><p class="muted">Hourly requests, 5xx counts and observed route latency</p><div id="apiTrend"></div></section><section class="panel"><h2>Slowest API routes</h2><p class="muted">Sorted by P95 latency over the selected period</p><div class="scroll" id="routes"></div></section><section class="panel"><h2>Recent server errors</h2><div class="scroll" id="errors"></div></section><section class="panel"><h2>Vehicle compliance signals</h2><p class="muted">Recorded vehicle/document states, not independent authenticity verification</p><div id="vehicles"></div></section></div>
<div id="quality" class="section"><div><h2>Tests, incidents & quality</h2><p>Keep failures and their evidence; QA data remains separate from real marketplace activity.</p></div></div>
<div class="grid two"><section class="panel"><h2>Latest QA runs</h2><div class="scroll" id="qa"></div></section><section class="panel"><h2>Latest failed QA scenarios</h2><div class="scroll" id="qaFailures"></div></section><section class="panel"><h2>Operational exceptions</h2><p class="muted">Recent API 5xx errors and failed QA scenarios. Incident and notification feeds are marked when not wired.</p><div id="exceptions"></div></section><section class="panel"><h2>Commercial activity</h2><p class="muted">Recorded subscription payment statuses; not provider-reconciled revenue.</p><div id="payments"></div></section></div>
<div id="people" class="section"><div><h2>Tester operations & access codes</h2><p>Pending applications and aggregate code-redemption history.</p></div></div><div class="grid two"><section class="panel"><h2>Pending tester applications</h2><div class="scroll" id="testerApplications"></div></section><section class="panel"><h2>Tester access-code history</h2><div class="scroll" id="testerCodes"></div></section></div><div id="incident-workbench" class="section"><div><h2>Incident review queue</h2><p>Read-only oversight; incident decisions require the secured application-side action bridge.</p></div></div><section class="panel"><div class="scroll" id="incidentQueue"></div><p class="muted">No decisions are written from this reporting service. Resolution actions must use the application workflow so lifecycle constraints, audit history and notifications remain enforced.</p></section><div id="research" class="section"><div><h2>Market research</h2><p>Aggregated optional responses by market, question and answer; individual response records are not exposed here.</p></div></div><section class="panel"><div class="scroll" id="researchResults"></div></section><div id="countries" class="section"><div><h2>Countries & research</h2><p>Country readiness requires dated evidence for every launch gate. Missing evidence is never treated as passed.</p></div></div><div class="grid two"><section class="panel"><h2>Launch readiness by market</h2><p class="muted">Status is evidence-based and defaults to Not assessed.</p><div class="scroll" id="readinessSummary"></div></section><section class="panel"><h2>Selected market launch gates</h2><p class="muted">A gate is verified only with status, review date and evidence reference.</p><div class="scroll" id="readinessDetail"></div></section></div><div id="intelligence" class="section"><div><h2>Logistics intelligence</h2><p>Industry context is separate from platform metrics.</p></div></div>
<div class="grid two"><section class="panel"><h2>Country snapshot & data coverage</h2><div id="marketSnapshot"></div></section><section class="panel"><h2>Industry sources to monitor</h2><p class="muted">Official source directory. Numeric industry series are not yet ingested; do not interpret these links as live indicators.</p><div id="sources"></div></section><section class="panel"><h2>Emerging platform patterns</h2><p class="muted">Computed only from available first-party observations; low-volume signals are labelled.</p><div id="patterns"></div></section><section class="panel"><h2>Cross-country comparison</h2><p class="muted">Side-by-side metrics from the same time window.</p><div class="scroll" id="comparison"></div></section></div>
<div id="audit" class="section"><div><h2>Admin & audit</h2><p>Existing incident workflow audit history and notification records. This is not yet a complete log of all admin actions.</p></div></div><div class="grid two"><section class="panel"><h2>Notification activity</h2><p class="muted">Created notifications, unread count and latest activity by type; not proof of external delivery.</p><div class="scroll" id="notificationHealth"></div></section><section class="panel"><h2>Recent incident audit events</h2><div class="scroll" id="auditEvents"></div></section></div><div id="catalogue-section" class="section"><div><h2>Data catalogue & limitations</h2><p>Definitions, source freshness and instrumentation gaps.</p></div></div><section class="panel"><div id="catalogue"></div></section>
<div class="footer">Post2Drive Ops · Read-only reporting · All times UTC unless noted · Market selection filters platform records; it does not change account country/currency. External logistics data remains pending source integration.</div></main>
<script>
const $=id=>document.getElementById(id);let current=null;const fmt=n=>Number(n||0).toLocaleString("en-GB");const pct=(n,d)=>d?((n/d)*100).toFixed(1)+"%":"—";const dur=n=>Number(n||0)>=1000?(Number(n)/1000).toFixed(2)+" s":Math.round(Number(n||0))+" ms";const safe=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const codeName=c=>c==="ALL"?"Global":((markets.find(x=>x.code===c)||{}).name||c);function table(rows,cols){if(!rows||!rows.length)return '<div class="empty">No records available for this window.</div>';return '<table><thead><tr>'+cols.map(c=>'<th>'+safe(c[1])+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td class="'+(c[2]&&c[2](r[c[0]],r)?"bad":"")+'">'+safe(c[3]?c[3](r[c[0]],r):r[c[0]])+'</td>').join("")+'</tr>').join("")+'</tbody></table>'}function bars(rows,label="label",value="count"){if(!rows||!rows.length)return '<div class="empty">No data yet.</div>';let max=Math.max(1,...rows.map(r=>Number(r[value]||0)));return '<div class="barlist">'+rows.map(r=>'<div class="barrow"><span>'+safe(String(r[label]||"Unknown").replaceAll("_"," "))+'</span><div class="bartrack"><div class="bar" style="width:'+Math.max(0,Math.min(100,Number(r[value]||0)/max*100))+'%"></div></div><strong>'+fmt(r[value])+'</strong></div>').join("")+'</div>'}function kpi(label,value,hint){return '<div class="kpi"><label>'+safe(label)+'</label><strong>'+safe(value)+'</strong><small>'+safe(hint||"")+'</small></div>'}function lineChart(rows,label,value){if(!rows||rows.length<2)return '<div class="empty">Not enough observations yet to draw a trend.</div>';let w=700,h=200,p=28,vals=rows.map(r=>Number(r[value]||0)),max=Math.max(1,...vals),min=Math.min(0,...vals),pts=vals.map((v,i)=>(p+i*(w-p*2)/(vals.length-1))+','+(h-p-(v-min)/(max-min||1)*(h-p*2)));let grid=[0.25,0.5,0.75].map(q=>'<line class="gridline" x1="'+p+'" x2="'+(w-p)+'" y1="'+(p+(h-p*2)*q)+'" y2="'+(p+(h-p*2)*q)+'"/>').join("");return '<svg class="chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+safe(label)+'">'+grid+'<polygon class="area" points="'+p+','+(h-p)+' '+pts.join(" ")+' '+(w-p)+','+(h-p)+'"/><polyline class="line" points="'+pts.join(" ")+'"/><text x="'+p+'" y="'+(h-5)+'">'+safe(String(rows[0][label]).slice(0,10))+'</text><text x="'+(w-p)+'" y="'+(h-5)+'" text-anchor="end">'+safe(String(rows[rows.length-1][label]).slice(0,10))+'</text><text x="'+p+'" y="15">'+fmt(max)+'</text></svg>'}async function getData(country,days){const q=new URLSearchParams({country,days:String(days)});const r=await fetch('/api/metrics?'+q,{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Metrics request failed');return j}function render(d){current=d;const m=d.market||{code:"ALL",name:"Global",currency:"mixed"};const o=d.overview||{};$("title").textContent=m.code==="ALL"?"Global operations overview":m.name+" logistics & operations";$("subtitle").textContent=(m.code==="ALL"?"All supported markets":m.name+" · "+m.currency)+" · "+d.windowDays+" day window · country filter is reporting-only";$("updated").textContent="Updated "+new Date(d.generatedAt).toLocaleString()+" · "+(d.dataCoverage||"Coverage varies");$("warning").innerHTML=d.warnings?.length?'<div class="notice">'+d.warnings.map(safe).join("<br>")+'</div>':"";$("kpis").innerHTML=[kpi("Total accounts",fmt(o.totalAccounts),"Synthetic QA accounts excluded"),kpi("User profiles",fmt(o.totalUsers),"Login profiles; may exceed account count"),kpi("New accounts",fmt(o.newAccounts),"Selected period"),kpi("Active accounts",fmt(o.activeAccounts),"Last 7 days"),kpi("Driver-capable accounts",fmt(o.drivers),"Driver or mixed account type"),kpi("Jobs posted",fmt(o.jobs),"Created in selected window"),kpi("Open jobs",fmt(o.openJobs),"Current open state"),kpi("Bids",fmt(o.bids),"Recorded bid submissions"),kpi("Bid coverage",pct(o.jobsWithBids,o.jobs),"Jobs with ≥1 bid / jobs posted"),kpi("Completed jobs",fmt(o.completedJobs),"Current completed state"),kpi("API requests",fmt(o.apiRequests),"Observed, non-QA telemetry"),kpi("API 5xx errors",fmt(o.api5xx),"Observed server errors")].join("");$("growth").innerHTML=lineChart(d.growth||[],"day","count");$("jobs").innerHTML=bars(d.jobStatuses||[]);$("supply").innerHTML=bars([{label:"Poster-capable accounts",count:o.posters},{label:"Driver-capable accounts",count:o.drivers},{label:"Jobs posted in window",count:o.jobs},{label:"Bids in window",count:o.bids},{label:"Jobs with bids",count:o.jobsWithBids}]);$("accounts").innerHTML=bars(d.accountTypes||[])+ '<h3>Verification status</h3>'+bars(d.verificationStatuses||[]);$("apiTrend").innerHTML=lineChart(d.apiHourly||[],"hour","requests")+'<h3>Errors by hour</h3>'+bars((d.apiHourly||[]).map(x=>({label:x.hour,count:x.errors})));$("routes").innerHTML=table(d.routes,[["route","Route"],["method","Method"],["count","Requests"],["p95Ms","P95",null,d=>dur(d)],["serverErrors","5xx",r=>Number(r)>0]]);$("errors").innerHTML=table(d.recentErrors,[["createdAt","Time",null,v=>new Date(v).toLocaleString()],["method","Method"],["route","Route"],["statusCode","Status",v=>Number(v)>=500]]);$("vehicles").innerHTML=bars([{label:"Vehicle records",count:o.vehicles},{label:"Verified",count:o.vehiclesVerified},{label:"MOT expired",count:o.motExpired},{label:"Insurance expired",count:o.insuranceExpired},{label:"MOT expires in 30d",count:o.motExpiring30d},{label:"Insurance expires in 30d",count:o.insuranceExpiring30d}]);$("qa").innerHTML=table(d.qaRuns,[["startedAt","Started",null,v=>v?new Date(v).toLocaleString():"—"],["status","Status",v=>String(v).toLowerCase().includes("fail")],["targetAccounts","Target accounts"],["createdAccounts","Created"],["successfulChecks","Passed"],["failedChecks","Failed",v=>Number(v)>0],["durationMs","Duration",null,v=>dur(v)]]);$("qaFailures").innerHTML=table(d.qaFailures,[["scenario","Scenario"],["action","Action"],["path","Path"],["expected","Expected"],["actual","Actual"],["count","Count",v=>Number(v)>0]]);$("exceptions").innerHTML=(d.recentErrors?.length?'<div class="insight">Observed '+fmt(d.recentErrors.length)+' recent server-error events in this reporting window. Review endpoint and deployment logs before assigning cause.</div>':'<div class="insight">No recent instrumented 5xx events in the returned sample. This is not an uptime guarantee.</div>')+(d.qaFailures?.length?'<div class="insight">'+fmt(d.qaFailures.length)+' failed QA scenario groups are retained in the latest run.</div>':'<div class="empty">No failed scenario rows returned; QA table coverage must be confirmed.</div>')+'<div class="notice">Incident evidence, notification delivery and Railway health are not yet ingested into this service.</div>';$("payments").innerHTML=bars(d.paymentStatuses||[]);$("testerApplications").innerHTML=table(d.testerApplications,[["createdAt","Submitted",null,v=>v?new Date(v).toLocaleString():"—"],["companyName","Company"],["country","Market"],["planType","Plan"],["contactNames","Contact names"],["vehicleCount","Vehicles"],["verificationStatus","Verification"],["allEmailsVerified","Emails verified",null,v=>v===true?"Yes":"No / unavailable"]]);$("testerCodes").innerHTML=table(d.testerCodes,[["status","Code status"],["count","Codes"],["redeemed","Redeemed"],["oldestCreatedAt","Oldest created",null,v=>v?new Date(v).toLocaleDateString():"—"],["latestCreatedAt","Latest created",null,v=>v?new Date(v).toLocaleDateString():"—"]]);$("incidentQueue").innerHTML=table((d.incidentQueue||[]).map(x=>({...x,reason:x.metadata?.reason||"incident",reviewStatus:x.hasResolution?"Decision recorded":"Needs review"})),[["createdAt","Reported",null,v=>v?new Date(v).toLocaleString():"—"],["reason","Reason"],["jobId","Job ID"],["jobStatus","Job status"],["pickup","Pickup"],["dropoff","Drop-off"],["reportedBy","Reported by"],["reviewStatus","Review status"]]);$("researchResults").innerHTML=table(d.researchResults,[["market","Market"],["question","Question / field"],["answer","Answer"],["responses","Responses"]]);$("marketSnapshot").innerHTML='<p><b>'+safe(m.name)+'</b> · currency '+safe(m.currency||"mixed")+'</p><p class="muted">First-party platform data is filtered by account country. External freight-market numeric series are not connected yet.</p><div class="insight">Observed accounts: '+fmt(o.totalAccounts)+' · jobs in window: '+fmt(o.jobs)+' · bids: '+fmt(o.bids)+'. '+(o.totalAccounts<30?"Low platform sample: avoid treating conversion or growth as a national industry trend.":"Use platform behaviour as a product signal only; it does not represent the whole country's logistics sector.")+'</div><p class="muted">Source coverage: '+safe(d.externalCoverage||"Official source links only; live industry data pending.")+'</p>';$("sources").innerHTML=(d.sources||[]).map(s=>'<a class="source" target="_blank" rel="noopener noreferrer" href="'+safe(s.url)+'">'+safe(s.name)+' ↗</a>').join("")||'<div class="empty">No country-specific source list configured yet.</div>';$("patterns").innerHTML=(d.patterns||[]).map(x=>'<div class="insight"><b>'+safe(x.title)+'</b><br>'+safe(x.detail)+'</div>').join("")||'<div class="empty">Collect more dated observations to detect patterns. No trend is inferred from missing data.</div>';$("comparison").innerHTML=d.comparison?table(d.comparison,[["market","Market"],["accounts","Accounts"],["jobs","Jobs"],["bids","Bids"],["completed","Completed"],["api5xx","API 5xx"]]):'<div class="empty">Choose a comparison market above.</div>';$("catalogue").innerHTML=table(d.catalogue,[["metric","Metric"],["source","Source"],["coverage","Coverage / caveat"]]);
const queue=[];
(d.recentErrors||[]).forEach(x=>queue.push({priority:"Critical",category:"API reliability",market:m.code==="ALL"?"Global":m.code,issue:String(x.statusCode)+" on "+x.method+" "+x.route,next:"Inspect route logs and compare against deploy/telemetry windows.",when:x.createdAt}));
(d.incidentQueue||[]).filter(x=>!x.hasResolution).forEach(x=>queue.push({priority:"High",category:"Incident",market:x.reportedBy||"Marketplace",issue:(x.metadata?.reason||"Reported incident")+" · job "+x.jobId,next:"Review evidence and resolve through the protected application workflow.",when:x.createdAt}));
(d.qaFailures||[]).forEach(x=>queue.push({priority:"High",category:"QA regression",market:"Staging",issue:String(x.scenario||"Scenario")+" · "+String(x.count||0)+" failed check(s)",next:"Inspect retained run/event evidence; do not delete QA records.",when:"Latest recorded run"}));
(d.testerApplications||[]).forEach(x=>queue.push({priority:"Normal",category:"Tester review",market:x.country,issue:String(x.companyName||"Application")+" · "+String(x.vehicleCount||0)+" vehicle(s)",next:"Review application, vehicle evidence and email verification in the protected workflow.",when:x.createdAt}));
if(Number(o.motExpired||0)>0||Number(o.insuranceExpired||0)>0)queue.push({priority:"High",category:"Vehicle compliance",market:m.code,issue:fmt(o.motExpired)+" MOT and "+fmt(o.insuranceExpired)+" insurance records expired",next:"Review affected records; stored expiry data is not independent verification.",when:"Current snapshot"});
if(Number(o.motExpiring30d||0)>0||Number(o.insuranceExpiring30d||0)>0)queue.push({priority:"Normal",category:"Vehicle compliance",market:m.code,issue:fmt(o.motExpiring30d)+" MOT and "+fmt(o.insuranceExpiring30d)+" insurance records expire within 30 days",next:"Plan reminders and document review.",when:"Current snapshot"});
if(d.warnings?.length)queue.push({priority:"High",category:"Data coverage",market:m.code,issue:d.warnings.length+" reporting source(s) unavailable",next:"Check read-only DB grants, schema presence and query warning details.",when:"Current refresh"});
if(!(d.recentErrors||[]).length&&!(d.incidentQueue||[]).some(x=>!x.hasResolution)&&!(d.qaFailures||[]).length&&!(d.testerApplications||[]).length&&!(d.warnings||[]).length)queue.push({priority:"Info",category:"No detected exceptions",market:m.code,issue:"No queue items detected in the returned sample",next:"This is not an uptime or compliance guarantee; verify data coverage and freshness.",when:"Current refresh"});
const rank={Critical:0,High:1,Normal:2,Info:3};
queue.sort((a,b)=>(rank[a.priority]??4)-(rank[b.priority]??4));
$("attentionCount").textContent=queue.length+" item(s) · advisory queue";
$("attentionQueue").innerHTML=table(queue.slice(0,100),[["priority","Priority",v=>v==="Critical"||v==="High"],["category","Category"],["market","Market"],["issue","Issue"],["next","Recommended next step"],["when","Detected"]]);
const readiness=d.countryReadiness||[];
$("readinessSummary").innerHTML=table(readiness,[["name","Market"],["code","Code"],["currency","Currency"],["status","Readiness",v=>v==="blocked"],["verifiedGates","Verified gates",null,(v,row)=>v+" / "+row.totalGates]]);
const selectedReadiness=readiness.find(x=>x.code===m.code);
$("readinessDetail").innerHTML=m.code==="ALL"?'<div class="empty">Choose a country in the top selector to inspect its seven launch gates.</div>':selectedReadiness?table(selectedReadiness.gates.map(g=>({...g,reviewedAt:g.reviewedAt||"—",evidenceRef:g.evidenceRef||"No evidence reference"})),[["label","Gate"],["status","Status",v=>v==="blocked"],["reviewedAt","Reviewed"],["evidenceRef","Evidence reference"]]):'<div class="empty">No readiness record available.</div>';
$("notificationHealth").innerHTML=table(d.notificationSummary,[["label","Notification type"],["count","Created"],["unread","Unread"],["latestAt","Latest record",null,v=>v?new Date(v).toLocaleString():"—"]]);
$("auditEvents").innerHTML=table((d.auditEvents||[]).map(x=>({...x,market:x.market||"Unknown"})),[["createdAt","Time",null,v=>v?new Date(v).toLocaleString():"—"],["action","Event"],["market","Actor market"],["jobId","Job"],["description","Description"]]);
}
async function load(){const country=$("country").value,days=Number($("days").value),compare=$("compare").value;$("refresh").disabled=true;$("updated").textContent="Loading metrics…";try{const [d,c]=await Promise.all([getData(country,days),compare&&compare!==country?getData(compare,days):Promise.resolve(null)]);if(c){d.comparison=[{market:d.market.name,accounts:d.overview.totalAccounts,jobs:d.overview.jobs,bids:d.overview.bids,completed:d.overview.completedJobs,api5xx:d.overview.api5xx},{market:c.market.name,accounts:c.overview.totalAccounts,jobs:c.overview.jobs,bids:c.overview.bids,completed:c.overview.completedJobs,api5xx:c.overview.api5xx}]}render(d)}catch(e){$("warning").innerHTML='<div class="notice">Could not load data: '+safe(e.message)+'. Check read-only DB connectivity and schema access.</div>';$("updated").textContent="Metrics unavailable"}finally{$("refresh").disabled=false}}
$("refresh").addEventListener("click",load);$("country").addEventListener("change",load);$("days").addEventListener("change",load);$("compare").addEventListener("change",load);load();
</script></html>`;

async function body(req) {
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); if (Buffer.concat(chunks).length > 16384) throw new Error("Request too large"); }
  return Buffer.concat(chunks).toString("utf8");
}
async function metricsUncached(url) {
  const requested = url.searchParams.get("country") || "ALL";
  const code = requested === "ALL" ? "ALL" : market(requested)?.code;
  if (!code) throw Object.assign(new Error("Unsupported country code"), { status:400 });
  const requestedDays = Number(url.searchParams.get("days") || 7);
  const days = [1,7,30,90].includes(requestedDays) ? requestedDays : 7;
  const country = code === "ALL" ? null : code;
  const countryFilter = `($1::text IS NULL OR a.country = $1)`;
  const qaJoin = `LEFT JOIN qa_test_accounts qa ON qa.account_id = a.id`;
  const businessFilter = `qa.account_id IS NULL AND ${countryFilter}`;
  const warnings = [];
  const safeQuery = async (label, sql, ...args) => {
    try { return await prisma.$queryRawUnsafe(sql, ...args); }
    catch (e) { warnings.push(label + " data unavailable: check migration/table permissions."); console.error("Ops metrics query failed:",label,e?.message); return []; }
  };
  const [overviewRows, accountTypes, verificationStatuses, jobStatuses, growth, apiHourly, routes, recentErrors, qaRuns, qaFailures, paymentStatuses, vehicleRows, activityRows, bidRows] = await Promise.all([
    safeQuery("Overview",`SELECT
      count(*) FILTER (WHERE ${businessFilter})::int AS "totalAccounts",
      count(*) FILTER (WHERE ${businessFilter} AND a."createdAt" >= now()-($2::int*interval '1 day'))::int AS "newAccounts",
      count(*) FILTER (WHERE ${businessFilter} AND a."lastActivityAt" >= now()-interval '7 days')::int AS "activeAccounts",
      count(*) FILTER (WHERE ${businessFilter} AND a.type IN ('driver','both'))::int AS drivers,
      count(*) FILTER (WHERE ${businessFilter} AND a.type IN ('poster','both'))::int AS posters,
      (SELECT count(*)::int FROM "User" u JOIN "Account" ua ON ua.id=u."accountId" LEFT JOIN qa_test_accounts qu ON qu.account_id=ua.id WHERE qu.account_id IS NULL AND ($1::text IS NULL OR ua.country=$1)) AS "totalUsers",
      (SELECT count(*)::int FROM "Job" j JOIN "Account" ja ON ja.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=ja.id WHERE jq.account_id IS NULL AND ($1::text IS NULL OR ja.country=$1) AND j."createdAt">=now()-($2::int*interval '1 day')) AS jobs,
      (SELECT count(*)::int FROM "Job" j JOIN "Account" ja ON ja.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=ja.id WHERE jq.account_id IS NULL AND ($1::text IS NULL OR ja.country=$1) AND j.status='open') AS "openJobs",
      (SELECT count(*)::int FROM "Job" j JOIN "Account" ja ON ja.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=ja.id WHERE jq.account_id IS NULL AND ($1::text IS NULL OR ja.country=$1) AND j.status IN ('completed','delivered')) AS "completedJobs",
      (SELECT count(*)::int FROM "Bid" b JOIN "Job" j ON j.id=b."jobId" JOIN "Account" ja ON ja.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=ja.id WHERE jq.account_id IS NULL AND ($1::text IS NULL OR ja.country=$1) AND b."createdAt">=now()-($2::int*interval '1 day')) AS bids,
      (SELECT count(DISTINCT j.id)::int FROM "Job" j JOIN "Account" ja ON ja.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=ja.id WHERE jq.account_id IS NULL AND ($1::text IS NULL OR ja.country=$1) AND j."createdAt">=now()-($2::int*interval '1 day') AND EXISTS(SELECT 1 FROM "Bid" b WHERE b."jobId"=j.id)) AS "jobsWithBids",
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1)) AS vehicles,
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1) AND v."verificationStatus"='verified') AS "vehiclesVerified",
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1) AND v."motValidUntil"<now()) AS "motExpired",
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1) AND v."insuranceValidUntil"<now()) AS "insuranceExpired",
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1) AND v."motValidUntil">=now() AND v."motValidUntil"<now()+interval '30 days') AS "motExpiring30d",
      (SELECT count(*)::int FROM "Vehicle" v JOIN "Account" va ON va.id=v."accountId" LEFT JOIN qa_test_accounts qv ON qv.account_id=va.id WHERE qv.account_id IS NULL AND ($1::text IS NULL OR va.country=$1) AND v."insuranceValidUntil">=now() AND v."insuranceValidUntil"<now()+interval '30 days') AS "insuranceExpiring30d",
      (SELECT count(*)::int FROM "ApiRequestMetric" m WHERE m."qaRunId" IS NULL AND m."createdAt">=now()-($2::int*interval '1 day')) AS "apiRequests",
      (SELECT count(*)::int FROM "ApiRequestMetric" m WHERE m."qaRunId" IS NULL AND m."statusCode">=500 AND m."createdAt">=now()-($2::int*interval '1 day')) AS "api5xx"
      FROM "Account" a ${qaJoin}`,country,days),
    safeQuery("Account types",`SELECT a.type::text AS label,count(*)::int AS count FROM "Account" a ${qaJoin} WHERE ${businessFilter} GROUP BY a.type ORDER BY count DESC`,country),
    safeQuery("Verification statuses",`SELECT a."verificationStatus"::text AS label,count(*)::int AS count FROM "Account" a ${qaJoin} WHERE ${businessFilter} GROUP BY a."verificationStatus" ORDER BY count DESC`,country),
    safeQuery("Job statuses",`SELECT j.status::text AS label,count(*)::int AS count FROM "Job" j JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id WHERE qa.account_id IS NULL AND ($1::text IS NULL OR a.country=$1) GROUP BY j.status ORDER BY count DESC`,country),
    safeQuery("Account growth",`SELECT date_trunc('day',a."createdAt") AS day,count(*)::int AS count FROM "Account" a ${qaJoin} WHERE ${businessFilter} AND a."createdAt">=now()-interval '90 days' GROUP BY day ORDER BY day`,country),
    safeQuery("Hourly API activity",`SELECT date_trunc('hour',m."createdAt") AS hour,count(*)::int AS requests,count(*) FILTER (WHERE m."statusCode">=500)::int AS errors FROM "ApiRequestMetric" m WHERE m."qaRunId" IS NULL AND m."createdAt">=now()-interval '24 hours' GROUP BY hour ORDER BY hour`),
    safeQuery("API routes",`SELECT route,method,count(*)::int AS count,count(*) FILTER(WHERE "statusCode">=500)::int AS "serverErrors",round(avg("durationMs"))::int AS "avgMs",percentile_disc(.95) WITHIN GROUP(ORDER BY "durationMs")::int AS "p95Ms" FROM "ApiRequestMetric" WHERE "qaRunId" IS NULL AND "createdAt">=now()-($1::int*interval '1 day') GROUP BY route,method ORDER BY "p95Ms" DESC LIMIT 20`,days),
    safeQuery("Recent API errors",`SELECT method,route,"statusCode","createdAt" FROM "ApiRequestMetric" WHERE "qaRunId" IS NULL AND "statusCode">=500 AND "createdAt">=now()-($1::int*interval '1 day') ORDER BY "createdAt" DESC LIMIT 20`,days),
    safeQuery("QA runs",`SELECT id,status,target_accounts AS "targetAccounts",created_accounts AS "createdAccounts",successful_checks AS "successfulChecks",failed_checks AS "failedChecks",duration_ms AS "durationMs",started_at AS "startedAt",finished_at AS "finishedAt" FROM qa_test_runs ORDER BY started_at DESC LIMIT 20`),
    safeQuery("QA failures",`SELECT scenario,action,path,expected_statuses AS expected,actual_status AS actual,count(*)::int AS count FROM qa_test_events WHERE passed=false AND run_id=(SELECT id FROM qa_test_runs ORDER BY started_at DESC LIMIT 1) GROUP BY scenario,action,path,expected_statuses,actual_status ORDER BY count DESC LIMIT 30`),
    safeQuery("Subscription payments",`SELECT sp.status AS label,count(*)::int AS count FROM "SubscriptionPayment" sp JOIN "Account" a ON a.id=sp."accountId" LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id WHERE qa.account_id IS NULL AND ($1::text IS NULL OR a.country=$1) AND sp."createdAt">=now()-($2::int*interval '1 day') GROUP BY sp.status ORDER BY count DESC`,country,days),
    safeQuery("Vehicle summary",`SELECT count(*)::int AS total FROM "Vehicle" v JOIN "Account" a ON a.id=v."accountId" LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id WHERE qa.account_id IS NULL AND ($1::text IS NULL OR a.country=$1)`,country),
    safeQuery("Activity summary",`SELECT action AS label,count(*)::int AS count FROM "JobActivity" ja JOIN "Job" j ON j.id=ja."jobId" JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id WHERE qa.account_id IS NULL AND ($1::text IS NULL OR a.country=$1) AND ja."createdAt">=now()-($2::int*interval '1 day') GROUP BY action ORDER BY count DESC LIMIT 15`,country,days),
    safeQuery("Bid summary",`SELECT count(*)::int AS total FROM "Bid" b JOIN "Job" j ON j.id=b."jobId" JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id WHERE qa.account_id IS NULL AND ($1::text IS NULL OR a.country=$1) AND b."createdAt">=now()-($2::int*interval '1 day')`,country,days)
  ]);
  const [testerApplications, testerCodes, incidentQueue, researchResults, notificationSummary, auditEvents] = await Promise.all([
    safeQuery("Pending tester applications", `SELECT a.id, a."companyName", a.country, a."planType" AS "planType", a."createdAt" AS "createdAt", a."verificationStatus" AS "verificationStatus", count(DISTINCT v.id)::int AS "vehicleCount", string_agg(DISTINCT u.name, ', ' ORDER BY u.name) AS "contactNames", bool_and(u."emailVerifiedAt" IS NOT NULL) AS "allEmailsVerified" FROM "Account" a LEFT JOIN "Vehicle" v ON v."accountId"=a.id LEFT JOIN "User" u ON u."accountId"=a.id WHERE a."testerApprovalStatus"='pending' GROUP BY a.id ORDER BY a."createdAt" ASC LIMIT 100`),
    safeQuery("Tester access-code history", `SELECT CASE WHEN c."claimedAt" IS NULL THEN 'Unused' ELSE 'Redeemed' END AS status, count(*)::int AS count, count(*) FILTER (WHERE c."claimedAt" IS NOT NULL)::int AS redeemed, min(c."createdAt") AS "oldestCreatedAt", max(c."createdAt") AS "latestCreatedAt" FROM "TesterAccessCode" c GROUP BY 1 ORDER BY 1`),
    safeQuery("Incident review queue", `SELECT ja.id AS "incidentId", ja."jobId", ja.description, ja.metadata, ja."createdAt" AS "createdAt", j.status::text AS "jobStatus", j.pickup, j.dropoff, a."companyName" AS "reportedBy", EXISTS(SELECT 1 FROM "JobActivity" r WHERE r.action='INCIDENT_RESOLUTION_RECORDED' AND r."jobId"=ja."jobId" AND r.metadata->>'parentIncidentId'=ja.id) AS "hasResolution" FROM "JobActivity" ja JOIN "Job" j ON j.id=ja."jobId" LEFT JOIN "Account" a ON a.id=ja."actorId" WHERE ja.action='INCIDENT_REPORTED' ORDER BY ja."createdAt" DESC LIMIT 100`),
    safeQuery("Aggregated market research", `SELECT a.country AS market, e.key AS question, e.value AS answer, count(*)::int AS responses FROM "Account" a CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(a."marketResearch"::jsonb)='object' THEN a."marketResearch"::jsonb ELSE '{}'::jsonb END) e WHERE a."marketResearch" IS NOT NULL AND ($1::text IS NULL OR a.country=$1) GROUP BY a.country,e.key,e.value HAVING count(*) >= 3 ORDER BY a.country,e.key,responses DESC LIMIT 250`, country),
    safeQuery("Notification delivery signals", `SELECT type AS label,count(*)::int AS count,count(*) FILTER (WHERE "readAt" IS NULL)::int AS unread,max("createdAt") AS "latestAt" FROM "Notification" WHERE "createdAt">=now()-($1::int*interval '1 day') GROUP BY type ORDER BY count DESC LIMIT 25`, days),
    safeQuery("Incident audit events", `SELECT ja.id,ja.action,ja."jobId",ja.description,ja.metadata,ja."createdAt" AS "createdAt",a.country AS market FROM "JobActivity" ja LEFT JOIN "Account" a ON a.id=ja."actorId" WHERE ja.action IN ('INCIDENT_REPORTED','INCIDENT_RESOLUTION_RECORDED','JOB_TERMINATED_WITH_INCIDENT') ORDER BY ja."createdAt" DESC LIMIT 100`)
  ]);
    const normalise = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, typeof v === "bigint" ? Number(v) : v instanceof Date ? v.toISOString() : v])));
  const o = Object.fromEntries(Object.entries(overviewRows[0] || {}).map(([k,v]) => [k, Number(v || 0)]));
  const patterns = [];
  if (o.totalAccounts < 30) patterns.push({title:"Small platform sample",detail:"Fewer than 30 real accounts in this market; conversion and growth signals are directional only."});
  if (!o.apiRequests) patterns.push({title:"API telemetry gap",detail:"No non-QA API request metrics in this window. Verify deployment and route coverage before interpreting this as zero traffic."});
  if (o.jobs && !o.bids) patterns.push({title:"Demand without recorded bids",detail:"Jobs exist in this window but no bids were recorded. Check supply coverage, discovery friction and whether the window is too short."});
  if (o.jobsWithBids && o.jobsWithBids/o.jobs < .25) patterns.push({title:"Low bid coverage",detail:"Less than one quarter of newly posted jobs received a bid in the selected window. Validate the sample size and compare by route/vehicle type."});
  const countryMarket = market(code);
  const comparison = null;
  const overview = {...o, jobsWithBids:o.jobsWithBids||0};
  const catalogue = [
    {metric:"Accounts/users",source:"Account + User tables",coverage:"First-party data; QA accounts excluded; account country filter"},
    {metric:"Jobs/bids/lifecycle",source:"Job + Bid + JobActivity",coverage:"Job market attributed to poster account country"},
    {metric:"API health",source:"ApiRequestMetric",coverage:"Non-QA requests only; only routes instrumented by this release"},
    {metric:"QA history",source:"qa_test_runs + qa_test_events",coverage:"Read-only; historical failures retained; unavailable if schema permissions/table absent"},
    {metric:"Vehicle compliance",source:"Vehicle",coverage:"Recorded expiry/status only; not independent authenticity checks"},
    {metric:"External logistics industry trends",source:"Official national statistics / transport agencies",coverage:"Source directory only; live numeric series not yet integrated"},
    {metric:"Incidents",source:"JobActivity incident reports and resolution audit rows",coverage:"Read-only queue; action bridge still required for decisions and notifications"},{metric:"Tester operations",source:"Account + User + Vehicle + TesterAccessCode",coverage:"Pending application queue and aggregated code history; approval/code-generation actions are not enabled in this read-only service"},{metric:"Market research",source:"Account.marketResearch JSON",coverage:"Aggregated by market/question/answer; first-party dataset"},{metric:"Railway health",source:"Railway service health feeds",coverage:"Not yet ingested into this dashboard"}
  ];
  return {
    generatedAt:new Date().toISOString(),windowDays:days,market:countryMarket||{code:"ALL",name:"Global",currency:"mixed"},
    overview,accountTypes:normalise(accountTypes),verificationStatuses:normalise(verificationStatuses),jobStatuses:normalise(jobStatuses),
    growth:normalise(growth).map(r=>({day:r.day,count:Number(r.count||0)})),
    apiHourly:normalise(apiHourly).map(r=>({hour:r.hour,requests:Number(r.requests||0),errors:Number(r.errors||0)})),
    routes:normalise(routes),recentErrors:normalise(recentErrors),qaRuns:normalise(qaRuns),qaFailures:normalise(qaFailures),
    paymentStatuses:normalise(paymentStatuses),activity:normalise(activityRows),bidSummary:normalise(bidRows),
    testerApplications:normalise(testerApplications),testerCodes:normalise(testerCodes),incidentQueue:normalise(incidentQueue),researchResults:normalise(researchResults),notificationSummary:normalise(notificationSummary),auditEvents:normalise(auditEvents),countryReadiness:countryReadiness(),
    sources:sourceList(code),patterns,warnings,
    dataCoverage:warnings.length?"Partial · some sources unavailable":"Database query coverage available; external industry feeds pending",
    externalCoverage:"Official source directory only; no live national logistics series yet",
    catalogue,comparison
  };
}

async function metrics(url) {
  const country = url.searchParams.get("country") || "ALL";
  const days = url.searchParams.get("days") || "7";
  const key = country + ":" + days;
  const now = Date.now();
  const cached = metricsCache.get(key);
  if (cached && now - cached.createdAt < METRICS_CACHE_TTL_MS) {
    return {...cached.data, cache:{ageSeconds:Math.floor((now-cached.createdAt)/1000),ttlSeconds:Math.ceil((METRICS_CACHE_TTL_MS-(now-cached.createdAt))/1000)}};
  }
  if (metricsInflight.has(key)) return metricsInflight.get(key);
  const pending = metricsUncached(url).then(data => {
    metricsCache.set(key,{createdAt:Date.now(),data});
    while (metricsCache.size > 20) metricsCache.delete(metricsCache.keys().next().value);
    return {...data,cache:{ageSeconds:0,ttlSeconds:Math.ceil(METRICS_CACHE_TTL_MS/1000)}};
  }).finally(() => metricsInflight.delete(key));
  metricsInflight.set(key,pending);
  return pending;
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res,200,JSON.stringify({ok:true,service:"post2drive-ops-dashboard"}),"application/json");
    if (req.method === "POST" && url.pathname === "/login") {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
      const now = Date.now();
      const attempt = loginAttempts.get(ip);
      if (attempt && now - attempt.startedAt < LOGIN_WINDOW_MS && attempt.count >= LOGIN_MAX_ATTEMPTS) {
        return send(res,429,pageLogin("Too many sign-in attempts. Wait 15 minutes and try again."),"text/html; charset=utf-8",{"retry-after":"900"});
      }
      if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) loginAttempts.set(ip,{startedAt:now,count:0});
      const form = new URLSearchParams(await body(req));
      const submittedUser = Buffer.from(form.get("username") || "");
      const expectedUser = Buffer.from(USERNAME);
      const submitted = Buffer.from(form.get("password") || "");
      const expected = Buffer.from(PASSWORD);
      const usernameValid = submittedUser.length === expectedUser.length && crypto.timingSafeEqual(submittedUser, expectedUser);
      const passwordValid = submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);
      if (!usernameValid || !passwordValid) {
        const entry=loginAttempts.get(ip)||{startedAt:now,count:0};
        entry.count+=1;loginAttempts.set(ip,entry);
        if (loginAttempts.size > 5000) for (const [key,value] of loginAttempts) if (now-value.startedAt>=LOGIN_WINDOW_MS) loginAttempts.delete(key);
        return send(res,401,pageLogin("Access denied. Check the admin credentials."));
      }
      loginAttempts.delete(ip);
      const stamp = String(Date.now());
      const cookie = `ops_session=${stamp}.${sign(stamp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS/1000}${IS_PRODUCTION ? "; Secure" : ""}`;
      res.writeHead(303,{Location:"/", "Set-Cookie":cookie,"Cache-Control":"no-store"}); return res.end();
    }
    if (req.method === "POST" && url.pathname === "/logout") {
      res.writeHead(303,{Location:"/","Set-Cookie":`ops_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,"Cache-Control":"no-store"});return res.end();
    }
    if (!validSession(req)) {
      if (url.pathname.startsWith("/api/")) return send(res,401,JSON.stringify({error:"Operations access required"}),"application/json");
      return send(res,200,pageLogin());
    }
    if (req.method === "GET" && url.pathname === "/") return send(res,200,dashboard);
    if (req.method === "GET" && url.pathname === "/api/metrics") {
      const result = await metrics(url);
      return send(res,200,JSON.stringify(result,(_k,v)=>typeof v==="bigint"?Number(v):v),"application/json");
    }
    return send(res,404,"Not found","text/plain; charset=utf-8");
  } catch (e) {
    const status = e?.status || 500;
    console.error("Ops dashboard request failed:",e);
    return send(res,status,JSON.stringify({error:status===400?e.message:"Internal dashboard error"}),"application/json");
  }
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Post2Drive Ops Dashboard listening on ${PORT}`));
for (const sig of ["SIGTERM","SIGINT"]) process.on(sig,async()=>{server.close();await prisma.$disconnect();process.exit(0);});
