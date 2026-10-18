import http from "node:http";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const dashboardDatabaseUrl = process.env.OPS_DASHBOARD_DATABASE_URL;
if (!dashboardDatabaseUrl) {
  console.error("OPS_DASHBOARD_DATABASE_URL is required; refusing to use the application database credentials.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: dashboardDatabaseUrl } }, log: ["error"] });
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
  GB: [{name:"Road freight statistics · DfT",url:"https://www.gov.uk/government/collections/road-freight-domestic-and-international-statistics"},{name:"Road traffic data downloads · DfT",url:"https://roadtraffic.dft.gov.uk/downloads"},{name:"Live road traffic & incidents · National Highways",url:"https://trafficengland.com/"},{name:"Severe weather warnings · Met Office",url:"https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings"},{name:"Road Haulage Association",url:"https://www.rha.uk.net/"}],
  IN: [{name:"Road transport & highways · MoRTH",url:"https://morth.nic.in/"},{name:"Logistics Ease Across Different States · PIB",url:"https://www.pib.gov.in/PressReleasePage.aspx?PRID=2090056&lang=2&noshow=1&reg=48"},{name:"Retail diesel & petrol prices · PPAC",url:"https://ppac.gov.in/index.php/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/price-build-up-of-petrol-and-diesel"},{name:"Weather forecasts & warnings · IMD",url:"https://mausam.imd.gov.in/"}],
  US: [{name:"Freight transportation statistics · BTS",url:"https://www.bts.gov/freight-transportation-services-index"},{name:"Retail diesel prices · EIA",url:"https://www.eia.gov/petroleum/gasdiesel/"},{name:"Weather alerts · National Weather Service",url:"https://www.weather.gov/alerts"},{name:"US Department of Transportation",url:"https://www.transportation.gov/"}],
  CA: [{name:"Statistics Canada · transportation",url:"https://www.statcan.gc.ca/en/subjects-start/transport"},{name:"Transport Canada",url:"https://tc.canada.ca/"},{name:"Weather warnings · Environment Canada",url:"https://weather.gc.ca/warnings/index_e.html"}],
  AU: [{name:"Transport statistics · BITRE",url:"https://www.bitre.gov.au/"},{name:"Australian Bureau of Statistics",url:"https://www.abs.gov.au/"},{name:"Weather warnings · Bureau of Meteorology",url:"https://www.bom.gov.au/weather-services/warnings/"}],
  NZ: [{name:"Stats NZ",url:"https://www.stats.govt.nz/"},{name:"New Zealand Ministry of Transport",url:"https://www.transport.govt.nz/"}],
  CH: [{name:"Swiss Federal Statistical Office",url:"https://www.bfs.admin.ch/bfs/en/home.html"},{name:"Federal Office of Transport",url:"https://www.bav.admin.ch/bav/en/home.html"}],
  TR: [{name:"Republic of Türkiye Ministry of Transport and Infrastructure",url:"https://www.uab.gov.tr/"},{name:"Turkish Statistical Institute",url:"https://data.tuik.gov.tr/"}],
  EU: [{name:"Goods transport by road · Eurostat dataset",url:"https://ec.europa.eu/eurostat/databrowser/product/page/TTR00005"},{name:"European Commission Mobility and Transport",url:"https://transport.ec.europa.eu/"},{name:"European severe-weather alerts · Meteoalarm",url:"https://www.meteoalarm.org/en/live/"}]
};
const market = (code) => markets.find(m => m.code === code);
const READINESS_GATES = [
  ["localization","Localization review"],["vehicleRules","Vehicle/document rules"],["payments","Payments capability"],
  ["timezones","Time-zone handling"],["legalReview","Local legal review"],["stagingE2E","Authenticated staging E2E"],
  ["operationalRecovery","Monitoring & recovery"]
];
function bridgeReady() {
  if (!process.env.OPS_DASHBOARD_BRIDGE_SECRET || process.env.OPS_DASHBOARD_BRIDGE_SECRET.length < 32) return false;
  try {
    const target = new URL(process.env.POST2DRIVE_APP_URL || "");
    return Boolean(target.hostname && !target.username && !target.password && (!IS_PRODUCTION || target.protocol === "https:"));
  } catch { return false; }
}
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
      const reviewedAt = typeof supplied.reviewedAt==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(supplied.reviewedAt) && !Number.isNaN(Date.parse(supplied.reviewedAt)) ? supplied.reviewedAt : null;
      const evidenceRef = typeof supplied.evidenceRef==="string" && supplied.evidenceRef.trim() ? supplied.evidenceRef.trim().slice(0,500) : null;
      return {key,label,status,reviewedAt,evidenceRef};
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
  *{box-sizing:border-box}body{margin:0;background:#FFFFFF;color:#171717;font:16px system-ui;min-height:100vh;display:grid;place-items:center}.box{width:min(420px,92vw);background:#FFFFFF;border:1px solid #D7DCE4;border-top:4px solid #2457D6;border-radius:18px;padding:28px;box-shadow:0 18px 48px rgba(34,55,104,.12)}h1{margin:0 0 8px;font-size:25px}p{color:#454B55;line-height:1.5}label{display:block;margin:18px 0 6px;font-size:13px}input{width:100%;padding:13px;border:1px solid #AEB6C2;border-radius:9px;background:#FFFFFF;color:#171717}button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:9px;background:#2457D6;color:#FFFFFF;font-weight:750;cursor:pointer}.err{color:#D62828;font-size:13px;background:#FFFFFF;border:1px solid #D62828;border-left:4px solid #D62828;border-radius:8px;padding:10px 12px}</style><main class="box"><div style="color:#315CFF;font-weight:800;letter-spacing:.12em;font-size:12px">POST2DRIVE · ADMIN</div><h1>Analytics & Logistics Dashboard</h1><p>Administrator access is separate from customer accounts. This account can access operational analytics only.</p>${error ? `<p class="err">${html(error)}</p>` : ""}<form method="post" action="/login"><label for="username">Admin username</label><input id="username" name="username" type="text" autocomplete="username" minlength="3" required autofocus><label for="password">Admin password</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="16" required><button type="submit">Open dashboard</button></form></main></html>`;
}
const dashboard = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Post2Drive · Analytics & Logistics Intelligence</title><style>
:root{color-scheme:light;--bg:#FFFFFF;--panel:#FFFFFF;--border:#D7DCE4;--muted:#454B55;--text:#171717;--blue:#2457D6;--teal:#18864B;--red:#D62828;--amber:#F2C300;--violet:#6D28D9;--cyan:#0096C7;--magenta:#C0268D;--orange:#E87500;--green:#18864B;--yellow:#F2C300;--black:#171717}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.97);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:14px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.brand{font-size:12px;letter-spacing:.12em;color:var(--blue);font-weight:800}.sub{color:var(--muted);font-size:12px}select,button,input[type=number]{background:#FFFFFF;color:#171717;border:1px solid #B9C1CE;border-radius:8px;padding:9px 11px;font:inherit;max-width:100%;width:100%}label{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:12px;margin-bottom:10px}button{cursor:pointer}button.primary{background:var(--blue);color:#FFFFFF;font-weight:750;border-color:var(--blue)}main{max-width:1600px;margin:auto;padding:22px}.section-nav{display:flex;gap:7px;flex-wrap:wrap;padding:10px 22px;border-bottom:1px solid var(--border);background:#FFFFFF;position:sticky;top:65px;z-index:4}.section-nav a{color:var(--muted);text-decoration:none;border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px}.section-nav a:hover,.section-nav a:focus{color:var(--text);border-color:var(--blue)}section[id]{scroll-margin-top:130px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.grid{display:grid;gap:13px}.kpis{grid-template-columns:repeat(auto-fit,minmax(155px,1fr));margin:18px 0}.two{grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))}.three{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}.panel,.kpi{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:17px;min-width:0}.kpi label{color:var(--muted);font-size:12px}.kpi strong{display:block;font-size:29px;letter-spacing:-.03em;margin:7px 0 2px;font-variant-numeric:tabular-nums}.kpi small{color:var(--muted)}h1{font-size:25px;margin:4px 0 3px}h2{font-size:16px;margin:0 0 4px}h3{font-size:13px;color:var(--muted);margin:15px 0 8px}.muted{color:var(--muted)}.section{margin:22px 0 10px;display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}.section p{margin:3px 0 0;color:var(--muted);font-size:12px}.barlist{display:grid;gap:11px;margin-top:14px}.barrow{display:grid;grid-template-columns:minmax(90px,150px) minmax(40px,1fr) 65px;gap:9px;align-items:center;font-size:12px}.bartrack{height:8px;background:#E7EAF0;border-radius:20px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#4d8ff0,#56d6c2);border-radius:20px}.chart{width:100%;height:220px;display:block}.chart text{fill:var(--muted);font-size:10px}.chart .line{fill:none;stroke:var(--blue);stroke-width:2.5}.chart .area{fill:#70aaff18}.chart .gridline{stroke:#D7DCE4;stroke-width:1}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:10px 9px;border-bottom:1px solid var(--border);white-space:nowrap}th{color:var(--muted);font-weight:600}td.bad{color:var(--red)}.pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:3px 8px;font-size:11px}.pill.good{color:var(--teal)}.pill.warn{color:var(--amber)}.pill.bad{color:var(--red)}.notice{border:1px solid #6d5426;background:#2b2417;color:#ffe0a2;padding:12px;border-radius:10px;font-size:12px}.source{display:inline-block;color:var(--blue);margin:4px 10px 4px 0}.status{color:var(--muted);font-size:12px}.empty{color:var(--muted);padding:15px 0;font-size:12px}.insight{border-left:4px solid var(--teal);padding:9px 12px;margin:9px 0;background:#EAF7EF;border-radius:0 8px 8px 0}.footer{padding:25px 0;color:var(--muted);font-size:11px}@media(max-width:650px){main{padding:14px}header{padding:12px}h1{font-size:21px}.kpi strong{font-size:24px}.barrow{grid-template-columns:90px minmax(30px,1fr) 45px}}
/* Compact controls: one-line sticky header, filters only when requested. */
header.app-header{min-height:68px;padding:10px 22px;flex-wrap:nowrap;gap:16px}.brand-block{min-width:0;flex:1}
.header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto}
header .header-actions button,header .header-actions select{width:auto;min-width:0}
header .header-actions button{min-height:40px;padding:8px 12px;white-space:nowrap}
.header-signout{margin:0;padding:0;width:auto;display:block}.header-signout button{background:#15243a;color:var(--text);border-color:#354862}
.filter-drawer{position:relative;margin:0}
.filter-drawer>summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:#15243a;color:var(--text);white-space:nowrap;cursor:pointer}
.filter-drawer>summary::-webkit-details-marker{display:none}.filter-drawer>summary:after{content:"⌄";color:var(--muted);font-size:14px}.filter-drawer[open]>summary{border-color:var(--blue)}
.filter-panel{position:absolute;right:0;top:calc(100% + 8px);z-index:20;width:min(520px,calc(100vw - 28px));display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:15px;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 18px 48px #0008}
.filter-panel label{min-width:0;margin:0;gap:6px}.filter-panel label:first-child{grid-column:1/-1}.filter-panel select{width:100%;min-height:40px}.filter-hint{grid-column:1/-1;margin:0;color:var(--muted);font-size:11px}.filter-panel-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;margin-top:2px}.filter-panel-actions button{width:auto;min-height:38px;margin:0}.filter-panel-actions #applyFilters{min-width:126px}#refresh[disabled]{cursor:wait}#refresh.is-loading::before{content:"";display:inline-block;width:12px;height:12px;margin-right:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dashboard-spin .8s linear infinite;vertical-align:-2px}@keyframes dashboard-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#refresh.is-loading::before{animation:none;border-right-color:currentColor}}
.source-tools{display:flex;align-items:center;gap:10px;margin:12px 0}.source-tools input{width:100%;min-width:0;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:#FFFFFF;color:var(--text);font:inherit}.source-tools input:focus{outline:2px solid #70aaff55;border-color:var(--blue)}.source-tools .status{white-space:nowrap}
.source-link-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:8px}.source-card{display:flex;flex-direction:column;gap:5px;min-width:0;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:#FFFFFF}
.source-card a{font-size:12px;font-weight:700;text-decoration:none;line-height:1.4}.source-card a:hover{text-decoration:underline}.source-meta{color:var(--muted);font-size:10px;line-height:1.35}
.watch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px;margin-top:10px}.watch-card{min-width:0;padding:12px;border:1px solid var(--border);border-radius:10px;background:#FFFFFF}.watch-card h3{margin:0 0 6px;color:var(--text);font-size:13px}.watch-card p{margin:0 0 9px;color:var(--muted);font-size:11px;line-height:1.45}.watch-card .watch-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.watch-card a{font-size:11px;font-weight:650}.watch-card .pill{font-size:10px}
#refresh{min-width:126px}#refresh.is-loading{opacity:.85}.section-nav{top:68px}
@media(max-width:900px){header.app-header{align-items:flex-start;flex-wrap:wrap}.brand-block{flex:1 1 100%}.header-actions{width:100%;justify-content:flex-start;flex-wrap:wrap}.filter-panel{left:0;right:auto}.section-nav{top:118px}}
@media(max-width:650px){header.app-header{padding:10px 12px;gap:8px}.header-actions{gap:6px}.header-actions button{font-size:12px;padding:8px}.filter-panel{grid-template-columns:1fr}.filter-panel label:first-child,.filter-hint{grid-column:auto}.filter-drawer>summary{font-size:12px;padding:8px 9px}.source-tools{align-items:stretch;flex-direction:column}.source-tools .status{white-space:normal}.section-nav{top:118px;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap}.section-nav a{flex:0 0 auto}}

/* Vibrant operations palette: bright surfaces and workflow-specific accents. */
body{background:radial-gradient(900px circle at 0% 0%,rgba(49,92,255,.07),transparent 42%),radial-gradient(760px circle at 100% 8%,rgba(0,139,120,.05),transparent 42%),var(--bg);color:var(--text)}
header.app-header{background:rgba(255,255,255,.94);border-bottom:1px solid var(--border);box-shadow:0 7px 24px rgba(34,55,104,.07);backdrop-filter:blur(14px)}
.section-nav{background:#F8FAFF;border-color:var(--border);box-shadow:0 4px 14px rgba(34,55,104,.035)}
.section-nav a{background:#FFFFFF;border-color:#DCE5F2;color:#576783;font-weight:650}
.section-nav a:hover,.section-nav a:focus{background:#EDF1FF;color:#274CE2;border-color:#AEBFFF}
select,button,input[type=number]{background:#FFFFFF;color:var(--text);border-color:#B9C8DF;box-shadow:0 1px 2px rgba(23,37,67,.025)}
select:focus,button:focus-visible,input:focus-visible{outline:3px solid rgba(49,92,255,.22);outline-offset:2px}
button.primary{background:var(--blue);color:#FFFFFF;border-color:var(--blue);box-shadow:0 4px 12px rgba(49,92,255,.14)}
button.primary:hover{background:#2449E8;border-color:#2449E8}
header .header-actions .header-signout button{background:#F0F3FF;color:#3049B5;border-color:#D4DFFF}
.filter-drawer>summary{background:#FFFFFF;color:var(--text);border-color:#D4DFF0}
.filter-drawer[open]>summary{background:#EDF1FF;border-color:var(--blue);color:#274CE2}
.filter-panel{background:#FFFFFF;border-color:#DCE5F2;box-shadow:0 18px 48px rgba(29,47,92,.16)}
.filter-panel label{color:#465875}
.filter-panel-actions button{background:#F7F9FF;color:#40516F;border-color:#DCE5F2}
.filter-panel-actions button.primary{background:var(--blue);color:#FFF;border-color:var(--blue)}
.panel{background:#FFFFFF;border-color:var(--border);box-shadow:0 6px 22px rgba(34,55,104,.055)}
.kpi{--kpi-accent:var(--blue);--kpi-soft:#EDF1FF;background:linear-gradient(145deg,var(--kpi-soft),#FFFFFF 77%);border-color:var(--border);border-top:4px solid var(--kpi-accent);box-shadow:0 5px 16px rgba(34,55,104,.045)}
.kpis .kpi:nth-child(6n+1){--kpi-accent:#315CFF;--kpi-soft:#EDF1FF}
.kpis .kpi:nth-child(6n+2){--kpi-accent:#008B78;--kpi-soft:#E3F8F2}
.kpis .kpi:nth-child(6n+3){--kpi-accent:#7850D4;--kpi-soft:#F0EBFF}
.kpis .kpi:nth-child(6n+4){--kpi-accent:#D75F1A;--kpi-soft:#FFF0E4}
.kpis .kpi:nth-child(6n+5){--kpi-accent:#087EA4;--kpi-soft:#E5F7FC}
.kpis .kpi:nth-child(6n+6){--kpi-accent:#BC367B;--kpi-soft:#FCEAF4}
.kpi label{color:var(--kpi-accent);font-weight:800;letter-spacing:.02em}
.kpi strong{color:var(--kpi-accent)}
.kpi small{color:var(--muted)}
.grid.two>.panel{border-top:4px solid var(--panel-accent,#315CFF);background:linear-gradient(150deg,var(--panel-tint,#F4F6FF),#FFFFFF 65%);padding-top:16px}
.grid.two>.panel:nth-child(4n+1){--panel-accent:#315CFF;--panel-tint:#EDF1FF}
.grid.two>.panel:nth-child(4n+2){--panel-accent:#008B78;--panel-tint:#E3F8F2}
.grid.two>.panel:nth-child(4n+3){--panel-accent:#7850D4;--panel-tint:#F0EBFF}
.grid.two>.panel:nth-child(4n+4){--panel-accent:#D75F1A;--panel-tint:#FFF0E4}
.panel h2{color:var(--panel-accent,#243E8D)}
.panel h3{color:#536580}
.bartrack{background:#E8EDF6}
.bar{background:linear-gradient(90deg,#315CFF 0%,#08A4A0 58%,#42B883 100%)}
.chart text{fill:#65758D}
.chart .line{stroke:#315CFF}
.chart .area{fill:#315CFF18}
.chart .gridline{stroke:#DCE5F2}
th{background:#EDF1FF;color:#40538D;font-weight:750}
td,th{border-bottom-color:var(--border)}
tbody tr:nth-child(even) td{background:#FAFBFF}
tbody tr:hover td{background:#EFF4FF}
td.bad{color:#B4233C;background:#FFF0F2}
.pill{background:#F8FAFF;border-color:#DCE5F2;color:#475A74;font-weight:700}
.pill.good{color:#08705F;background:#E3F8F2;border-color:#B8EBDD}
.pill.warn{color:#925300;background:#FFF3D9;border-color:#F2D8A2}
.pill.bad{color:#B4233C;background:#FFE9ED;border-color:#F3C0CA}
.notice{border-color:#F0D49C;background:#FFF5DE;color:#865000}
.insight{border-left-color:#008B78;background:#E6F8F3;color:#24594F}
.source{color:#315CFF;font-weight:700}
.source-tools input{background:#FFFFFF;color:var(--text);border-color:#C8D5E8}
.source-tools input:focus{outline:3px solid rgba(49,92,255,.18);border-color:var(--blue)}
.source-card{background:#FFFFFF;border-color:#DCE5F2;box-shadow:0 3px 12px rgba(34,55,104,.035)}
.source-card a{color:#315CFF}
.watch-card{background:#FFFFFF;border-color:#DCE5F2;box-shadow:0 3px 12px rgba(34,55,104,.035)}
.watch-card h3{color:#172543}
.empty,.status,.muted,.footer,.sub{color:#65758D}
#warning .notice{border-left:4px solid #D98B11}
.section{border-radius:12px}
.section h2{letter-spacing:-.015em}
#overview{padding:14px 16px;border:1px solid #DCE5F2;border-left:5px solid #315CFF;border-radius:14px;background:linear-gradient(100deg,#EDF1FF,#E5F8F3 55%,#FFF1E4)}
#overview h1{color:#172543}
#overview .status{padding:7px 10px;background:#FFFFFF;border:1px solid #DCE5F2;border-radius:999px}
#marketplace h2{color:#315CFF}
#reliability h2{color:#087EA4}
#quality h2{color:#7850D4}
#people h2{color:#008B78}
#countries h2{color:#D75F1A}
#audit h2{color:#BC367B}
@media(max-width:650px){.panel{padding:13px}.kpi{padding:14px}.section-nav a{background:#FFFFFF}}


/* Solid metallic spectrum: white-first, bold colour, dark readable labels. */
:root{--ops-blue:#0057D9;--ops-red:#D71920;--ops-green:#008A45;--ops-black:#171717;--ops-yellow:#FFC400;--ops-purple:#6F2DBD;--ops-orange:#F06A00;--ops-bg:#FFFFFF;--bg:#FFFFFF;--ops-panel:#FFFFFF;--ops-text:#171717;--ops-muted:#30343B;--ops-border:#D5D9E0}
html,body{background:#FFFFFF!important;color:#171717!important}
body{background:#FFFFFF!important}
header,main,section,article,.panel,.card,.chart-card,.metric-card,.filter-panel,.table-wrap,.login-card{background-color:#FFFFFF!important;color:#171717}
h1,h2,h3,h4,label,strong,th{color:#171717}
p,small,.muted,.subtitle,.description{color:#30343B}
button,.btn,input[type=submit]{background:linear-gradient(180deg,#1768E8,#0048BD);color:#FFFFFF;border:1px solid #003FA8;font-weight:800}
button:hover,.btn:hover,input[type=submit]:hover{background:linear-gradient(180deg,#004FC8,#00358C)}
input,select,textarea{background:#FFFFFF;color:#171717;border:1px solid #9299A5}
input::placeholder,textarea::placeholder{color:#555D68}
th{background:#E4EEFF!important;color:#171717!important}
tr:nth-child(even) td{background:#F7F9FC}
tr:hover td{background:#EAF2FF}
.metric-card:nth-child(7n+1),.kpi-card:nth-child(7n+1){border-top:4px solid #0057D9!important}
.metric-card:nth-child(7n+2),.kpi-card:nth-child(7n+2){border-top:4px solid #D71920!important}
.metric-card:nth-child(7n+3),.kpi-card:nth-child(7n+3){border-top:4px solid #008A45!important}
.metric-card:nth-child(7n+4),.kpi-card:nth-child(7n+4){border-top:4px solid #6F2DBD!important}
.metric-card:nth-child(7n+5),.kpi-card:nth-child(7n+5){border-top:4px solid #FFC400!important}
.metric-card:nth-child(7n+6),.kpi-card:nth-child(7n+6){border-top:4px solid #F06A00!important}
.metric-card:nth-child(7n+7),.kpi-card:nth-child(7n+7){border-top:4px solid #171717!important}
.badge,.status-pill{font-weight:800}
.badge-success,.status-completed,.status-delivered{background:#008A45!important;color:#FFFFFF!important}
.badge-danger,.status-cancelled,.status-failed{background:#D71920!important;color:#FFFFFF!important}
.badge-warning,.status-review,.status-pending{background:#FFC400!important;color:#171717!important}
:focus-visible{outline:3px solid #F06A00!important;outline-offset:2px}

/* Solid seven-colour corporate refresh: white panels, black copy, saturated accents. */
body{background:#FFFFFF;color:#171717}
header.app-header{background:#FFFFFF!important;border-bottom:2px solid #2457D6;box-shadow:0 4px 16px rgba(23,23,23,.06)}
.brand,.brand-block{color:#2457D6}
.panel,.kpi,.source-card,.watch-card,.filter-panel{background:#FFFFFF!important;color:#171717;border-color:#D7DCE4}
.panel:nth-of-type(7n+1),.watch-card:nth-child(7n+1){border-top:4px solid #2457D6}
.panel:nth-of-type(7n+2),.watch-card:nth-child(7n+2){border-top:4px solid #D62828}
.panel:nth-of-type(7n+3),.watch-card:nth-child(7n+3){border-top:4px solid #18864B}
.panel:nth-of-type(7n+4),.watch-card:nth-child(7n+4){border-top:4px solid #6D28D9}
.panel:nth-of-type(7n+5),.watch-card:nth-child(7n+5){border-top:4px solid #E87500}
.panel:nth-of-type(7n+6),.watch-card:nth-child(7n+6){border-top:4px solid #F2C300}
.panel:nth-of-type(7n),.watch-card:nth-child(7n){border-top:4px solid #171717}
.kpi{background:#FFFFFF;border-top:4px solid #2457D6;box-shadow:0 3px 12px rgba(23,23,23,.06)}
.kpis .kpi:nth-child(7n+1){border-top-color:#2457D6}.kpis .kpi:nth-child(7n+2){border-top-color:#D62828}.kpis .kpi:nth-child(7n+3){border-top-color:#18864B}.kpis .kpi:nth-child(7n+4){border-top-color:#6D28D9}.kpis .kpi:nth-child(7n+5){border-top-color:#E87500}.kpis .kpi:nth-child(7n+6){border-top-color:#F2C300}.kpis .kpi:nth-child(7n){border-top-color:#171717}
.kpi strong{color:#171717}
.bar{background:linear-gradient(90deg,#2457D6 0%,#6D28D9 25%,#E87500 50%,#18864B 75%,#D62828 100%)}
.chart .line{stroke:#2457D6}.chart .area{fill:#2457D618}.chart .gridline{stroke:#D7DCE4}.chart text{fill:#454B55}
.section-nav{background:#FFFFFF}.section-nav a{background:#FFFFFF;color:#171717;border-color:#D7DCE4}.section-nav a:hover,.section-nav a:focus{background:#F2C300;color:#171717;border-color:#171717}
select,button,input[type=number],.filter-drawer>summary{background:#FFFFFF;color:#171717;border-color:#B9C1CE}
button.primary{background:#2457D6;color:#FFFFFF;border-color:#2457D6}
button.primary:hover{background:#173FA8;color:#FFFFFF}
.pill.good{background:#FFFFFF!important;color:#18864B;border-color:#18864B}.pill.warn{background:#FFFFFF!important;color:#171717;border-color:#F2C300}.pill.bad{background:#FFFFFF!important;color:#D62828;border-color:#D62828}
.notice{background:#FFFFFF!important;color:#171717;border:1px solid #F2C300;border-left:4px solid #F2C300}
.insight{background:#FFFFFF!important;border-left-color:#18864B;color:#171717}
.source-tools input{background:#FFFFFF;color:#171717}

/* Flat, solid chart colours (no gradient fills); keep each series unmistakable. */
.bar{background:#2457D6}
.chart .area{fill:#2457D61A}
.kpi,.panel,.watch-card,.source-card{background:#FFFFFF!important}

/* Nine distinct solid categories for dense charts: core palette plus cyan and magenta. */
.kpis .kpi:nth-child(9n+8){border-top-color:#0096C7}
.kpis .kpi:nth-child(9n){border-top-color:#C0268D}

/* Use the same solid colour roles on the admin UI in every market. */
.panel,.kpi,.source-card,.watch-card,.filter-panel{background:#FFFFFF!important;color:#171717}
.panel{border-top:4px solid #2457D6}
.grid.two>.panel:nth-child(9n+1){border-top-color:#2457D6}
.grid.two>.panel:nth-child(9n+2){border-top-color:#D62828}
.grid.two>.panel:nth-child(9n+3){border-top-color:#18864B}
.grid.two>.panel:nth-child(9n+4){border-top-color:#171717}
.grid.two>.panel:nth-child(9n+5){border-top-color:#F2C300}
.grid.two>.panel:nth-child(9n+6){border-top-color:#6D28D9}
.grid.two>.panel:nth-child(9n+7){border-top-color:#E87500}
.grid.two>.panel:nth-child(9n+8){border-top-color:#0096C7}
.grid.two>.panel:nth-child(9n){border-top-color:#C0268D}


/* Corporate status chips remain white with bold, legible semantic labels. */
.pill{background:#FFFFFF!important;color:#171717;border:1px solid #D7DCE4;font-weight:700}
.pill.good{background:#FFFFFF!important;color:#18864B!important;border-color:#18864B}
.pill.warn{background:#FFFFFF!important;color:#171717!important;border-color:#F2C300}
.pill.bad{background:#FFFFFF!important;color:#D62828!important;border-color:#D62828}


/* Contrast audit: labels and controls must never inherit the same colour as their surface. */
body,header,main,.panel,.kpi,.source-card,.watch-card,.filter-panel{background:#FFFFFF!important;color:#171717}
h1,h2,h3,h4,h5,h6,label,strong,th,td,.barrow>span,.barrow>strong,.kpi strong,.kpi label{color:#171717}
p,.muted,.empty,.status,.footer,.sub,.source-meta,.section p,.watch-card p,.filter-hint{color:#30343B}
.brand,.source,.source-card a{color:#2457D6}
header .header-signout button,.header-signout button{
 background:#FFFFFF!important;color:#2457D6!important;border:1px solid #2457D6!important;
}
.filter-drawer>summary,.filter-drawer>summary:after{
 background:#FFFFFF!important;color:#171717!important;border-color:#2457D6;
}
.filter-drawer[open]>summary{background:#FFFFFF!important;color:#2457D6!important;border-color:#2457D6}
.filter-panel{background:#FFFFFF!important;color:#171717}
.filter-panel label{color:#30343B}
.filter-panel-actions button:not(.primary){background:#FFFFFF!important;color:#2457D6!important;border:1px solid #2457D6}
button.primary,#refresh.primary,.filter-panel-actions button.primary{
 background:#2457D6!important;color:#FFFFFF!important;border:1px solid #2457D6!important;
}
button.primary:hover{background:#173FA8!important;color:#FFFFFF!important}
th{background:#F2C300!important;color:#171717!important;border-bottom:2px solid #171717}
tr:nth-child(even) td,tr:hover td{background:#FFFFFF}
td.bad{background:#FFFFFF!important;color:#D62828!important}
.pill,.pill.good,.pill.warn,.pill.bad{
 background:#FFFFFF!important;border:1px solid #D7DCE4;color:#171717;
}
.pill.good{color:#18864B!important;border-color:#18864B!important}
.pill.warn{color:#171717!important;border-color:#F2C300!important}
.pill.bad{color:#D62828!important;border-color:#D62828!important}
.notice,#warning .notice{background:#FFFFFF!important;color:#171717!important;border:1px solid #F2C300;border-left:4px solid #F2C300}
.insight{background:#FFFFFF!important;color:#171717!important;border-left:4px solid #18864B}
.bartrack{background:#E7EAF0}
.bar{background:#2457D6}
.chart text{fill:#30343B!important}
.chart .line{stroke:#2457D6}
.chart .gridline{stroke:#D7DCE4}
.source-tools input{background:#FFFFFF!important;color:#171717!important;border-color:#AEB6C2}
.source-tools input::placeholder{color:#555D69!important}
</style>
<header class='app-header'><div class='brand-block'><div class='brand'>POST2DRIVE / ADMIN DASHBOARD</div><div class='sub'>Operations · marketplace analytics · country logistics signals</div></div><div class='header-actions'><details id='filterDrawer' class='filter-drawer'><summary id='filterSummary'>Filters · Global · 7 days</summary><div class='filter-panel'><label for='country'>Market<select id='country'><option value='ALL'>🌐 Global · all markets</option>${markets.map(m=>`<option value='${m.code}'>${m.name} · ${m.currency}</option>`).join('')}</select></label><label for='compare'>Compare market<select id='compare'><option value=''>No comparison</option>${markets.map(m=>`<option value='${m.code}'>${m.name}</option>`).join('')}</select></label><label for='days'>Time window<select id='days'><option value='1'>24 hours</option><option value='7' selected>7 days</option><option value='30'>30 days</option><option value='90'>90 days</option></select></label><p class='filter-hint'>Filters only change reporting. Nothing in the marketplace is modified.</p><div class='filter-panel-actions'><button id='resetFilters' type='button'>Reset &amp; apply</button><button id='applyFilters' class='primary' type='button'>Apply filters</button></div></div></details><button id='refresh' class='primary' type='button'>↻ Refresh data</button><form method="post" action="/logout" class="header-signout"><button type='submit'>Sign out</button></form></div></header><nav class="section-nav" aria-label="Admin sections"><a href="#overview">Command Centre</a><a href="#marketplace">Marketplace</a><a href="#people">Trust & Operations</a><a href="#quality">QA & Engineering</a><a href="#countries">Countries & Research</a><a href="#audit">Admin & Audit</a><a href="#catalogue-section">Data Catalogue</a></nav><main><div id="overview" class="section"><div><h1 id="title">Global operations overview</h1><p id="subtitle">Loading country-aware metrics…</p></div><div class="status" id="updated">Connecting to reporting database…</div></div><div id="warning"></div>
<div class="grid kpis" id="kpis"></div><div class="section"><div><h2>Needs attention</h2><p>Prioritized operational exceptions; recommendations are advisory and do not perform changes.</p></div><div class="status" id="attentionCount">Building queue…</div></div><section class="panel"><div class="scroll" id="attentionQueue"></div></section>
<div id="marketplace" class="section"><div><h2>Marketplace health & demand</h2><p>First-party Post2Drive data, filtered by account market. Synthetic QA accounts excluded from business totals.</p></div></div>
<div class="grid two"><section class="panel"><h2>Account growth</h2><p class="muted">New account profiles by day</p><div id="growth"></div></section><section class="panel"><h2>Job lifecycle mix</h2><p class="muted">Current job status distribution</p><div id="jobs"></div></section><section class="panel"><h2>Supply vs demand</h2><p class="muted">Poster/driver accounts, jobs, bids and conversion where available</p><div id="supply"></div></section><section class="panel"><h2>Account & verification status</h2><p class="muted">Account type and verification distribution</p><div id="accounts"></div></section></div>
<div id="reliability" class="section"><div><h2>API & technical reliability</h2><p>Telemetry starts only after instrumentation is deployed; missing telemetry is not zero traffic. API routes currently lack reliable market attribution, so these technical-health metrics are global.</p></div></div>
<div class="grid two"><section class="panel"><h2>API requests and errors</h2><p class="muted">Hourly requests, 5xx counts and observed route latency</p><div id="apiTrend"></div></section><section class="panel"><h2>Slowest API routes</h2><p class="muted">Sorted by P95 latency over the selected period</p><div class="scroll" id="routes"></div></section><section class="panel"><h2>Recent server errors</h2><div class="scroll" id="errors"></div></section><section class="panel"><h2>Vehicle compliance signals</h2><p class="muted">Recorded vehicle/document states, not independent authenticity verification</p><div id="vehicles"></div></section></div>
<div id="quality" class="section"><div><h2>Tests, incidents & quality</h2><p>Keep failures and their evidence; QA data remains separate from real marketplace activity.</p></div></div>
<section class="panel"><div class="section"><div><h2>QA campaigns</h2><p class="muted">Create a staging test plan. Save a draft first. A test runs only after you confirm it.</p></div><span id="qaCampaignStatus" class="status" role="status">Loading campaign history…</span></div>
<form id="qaCampaignForm"><div class="grid two">
<label>Campaign name<input id="qaCampaignName" name="name" maxlength="120" required placeholder="India workflow check"></label>
<label>Market<select id="qaCampaignMarket" name="countryCode" required>${markets.map(m=>`<option value="${m.code}">${m.name} · ${m.code}</option>`).join("")}</select></label>
<label>Test plan<select id="qaCampaignScenario" name="scenario"><option>API load</option><option>Workflow test</option><option>Regression test</option><option>Country rules test</option><option>Failure handling test</option></select></label>
<label>Total tests<input id="qaCampaignTests" name="totalTests" type="number" min="1" max="25000" value="1000" required></label>
<label>Test accounts<input id="qaCampaignAccounts" name="accountCount" type="number" min="500" max="10000" value="1000" required></label>
<label>Parallel requests<input id="qaCampaignConcurrency" name="concurrency" type="number" min="1" max="100" value="10" required></label>
</div><fieldset><legend>Test suites</legend><label><input type="checkbox" name="suites" value="provisioning"> Set up test accounts</label> <label><input type="checkbox" name="suites" value="api" checked> API load</label> <label><input type="checkbox" name="suites" value="workflow"> Workflow test</label> <label><input type="checkbox" name="suites" value="regression"> Regression test</label> <label><input type="checkbox" name="suites" value="localization"> Country rules test</label> <label><input type="checkbox" name="suites" value="failure"> Failure handling test</label></fieldset>
<p class="muted">Workflow, regression, country rules and failure handling tests need 10,000 accounts. Account setup creates synthetic accounts. API tests can use a smaller pool. The system keeps test data and reports.</p>
<button class="primary" type="submit" id="qaCampaignSave">Save draft</button><span id="qaCampaignFormMessage" class="muted" role="status"></span></form>
<h3>Saved plans</h3><div class="scroll" id="qaCampaignsTable">Loading…</div>
<h3>Campaign steps and measured results</h3><div class="scroll" id="qaCampaignSteps">Loading…</div></section>
<div class="grid two"><section class="panel"><h2>Latest QA runs</h2><div class="scroll" id="qa"></div></section><section class="panel"><h2>Latest failed QA scenarios</h2><div class="scroll" id="qaFailures"></div></section><section class="panel"><h2>Operational exceptions</h2><p class="muted">Recent API 5xx errors and failed QA scenarios. Incident and notification feeds are marked when not wired.</p><div id="exceptions"></div></section><section class="panel"><h2>Commercial activity</h2><p class="muted">Recorded subscription payment statuses; not provider-reconciled revenue.</p><div id="payments"></div></section></div>
<div id="people" class="section"><div><h2>Tester operations & access codes</h2><p>Pending applications and aggregate code-redemption history.</p></div></div><div class="grid two"><section class="panel"><h2>Pending tester applications</h2><div class="scroll" id="testerApplications"></div></section><section class="panel"><div class="section"><h2>Tester access-code history</h2><button id="generateTesterCode" class="primary" type="button">Generate code</button></div><div class="scroll" id="testerCodes"></div><p id="actionBridgeStatus" class="muted"></p></section></div><div id="incident-workbench" class="section"><div><h2>Incident review queue</h2><p>Read-only oversight; incident decisions require the secured application-side action bridge.</p></div></div><section class="panel"><div class="scroll" id="incidentQueue"></div><p class="muted">No decisions are written from this reporting service. Resolution actions must use the application workflow so lifecycle constraints, audit history and notifications remain enforced.</p></section><div id="research" class="section"><div><h2>Market research</h2><p>Aggregated optional responses by market, question and answer; individual response records are not exposed here.</p></div></div><section class="panel"><div class="scroll" id="researchResults"></div></section><div id="countries" class="section"><div><h2>Countries & research</h2><p>Country readiness requires dated evidence for every launch gate. Missing evidence is never treated as passed.</p></div></div><div class="grid two"><section class="panel"><h2>Launch readiness by market</h2><p class="muted">Status is evidence-based and defaults to Not assessed.</p><div class="scroll" id="readinessSummary"></div></section><section class="panel"><h2>Selected market launch gates</h2><p class="muted">A gate is verified only with status, review date and evidence reference.</p><div class="scroll" id="readinessDetail"></div></section></div><div id="intelligence" class="section"><div><h2>Logistics intelligence</h2><p>Industry context is separate from platform metrics.</p></div></div>
<div class="grid two"><section class="panel"><h2>Country snapshot & data coverage</h2><div id="marketSnapshot"></div></section><section class="panel"><h2>Industry sources to monitor</h2><p class="muted">Selected-market official data and operational notices. These are reference links, not ingested live metrics.</p><div class="source-tools"><input id="sourceSearch" type="search" placeholder="Search this market’s sources…" aria-label="Search industry sources"><span id="sourceCount" class="status" aria-live="polite"></span></div><div id="sources"></div></section><section class="panel"><h2>Emerging platform patterns</h2><p class="muted">Computed only from available first-party observations; low-volume signals are labelled.</p><div id="patterns"></div></section><section class="panel"><h2>Cross-country comparison</h2><p class="muted">Side-by-side metrics from the same time window.</p><div class="scroll" id="comparison"></div></section></div>
<div class="section"><div><h2>Seasonality & risk intelligence</h2><p>Planning signals for recurring demand peaks and logistics disruptions. External data feeds are not connected; the calendar is a planning guide, not a live alert or forecast.</p></div></div>
<div class="grid two">
<section class="panel"><h2>Seasonal demand calendar</h2><p class="muted">Recurring planning windows for the selected market. Validate dates locally each year, especially lunar-calendar events.</p><div id="seasonalCalendar"></div></section>
<section class="panel"><h2>Disruption watchlist</h2><p class="muted">Risk categories to monitor manually. No event is being represented as active unless independently verified.</p><div id="riskWatchlist"></div></section>
<section class="panel"><h2>Demand & capacity scenario simulator</h2><p class="muted">Illustrative what-if model only. Enter a hypothetical weekly baseline; these values are not observed Post2Drive metrics.</p>
<div class="grid two">
<label>Baseline jobs / week<input id="scenarioJobs" type="number" min="0" max="10000000" step="1" value="100"></label>
<label>Baseline available drivers<input id="scenarioDrivers" type="number" min="1" max="10000000" step="1" value="80"></label>
<label>Demand change (%)<input id="scenarioDemand" type="number" min="-100" max="500" step="5" value="30"></label>
<label>Driver supply change (%)<input id="scenarioSupply" type="number" min="-100" max="500" step="5" value="-10"></label>
<label>Disruption duration (days)<input id="scenarioDays" type="number" min="0" max="365" step="1" value="14"></label>
</div><div id="scenarioResult" class="insight" aria-live="polite"></div><p class="muted">Model: adjusted jobs = baseline × (1 + demand change); adjusted drivers = baseline × (1 + supply change). Pressure is jobs per 100 available drivers. It does not estimate actual market demand, pricing, route impact or probability.</p></section>
<section class="panel"><h2>Risk-monitoring websites</h2><p class="muted">Search by topic or source. Open the publication and note its date, geography and update cadence before acting.</p><div class="source-tools"><input id="riskSearch" type="search" placeholder="Search risk, fuel, weather, freight…" aria-label="Search risk-monitoring websites"><span id="riskSourceCount" class="status" aria-live="polite"></span></div><div id="riskSources"></div><p class="muted">These links are not live alerts or automatic data feeds. External series have not been ingested into Post2Drive.</p></section>
</div>
<div id="audit" class="section"><div><h2>Admin & audit</h2><p>Durable signed-bridge action history, incident workflow events and notification records.</p></div><button id="exportAudit" type="button">Export audit CSV</button></div><div class="grid two"><section class="panel"><h2>Notification activity</h2><p class="muted">Created notifications, unread count and latest activity by type; not proof of external delivery.</p><div class="scroll" id="notificationHealth"></div></section><section class="panel"><h2>Recent incident audit events</h2><div class="scroll" id="auditEvents"></div></section><section class="panel"><h2>Administrative action audit log</h2><p class="muted">Latest 100 recorded actions; full records remain in the database.</p><div class="scroll" id="adminAuditEvents"></div></section></div><div id="catalogue-section" class="section"><div><h2>Data catalogue & limitations</h2><p>Definitions, source freshness and instrumentation gaps.</p></div></div><section class="panel"><div id="catalogue"></div></section>
<div class="footer">Post2Drive Ops · Separate admin service · Times use browser locale unless noted · Market selection filters supported platform records; it does not change account country/currency. External logistics data remains pending source integration.</div></main>
<script>
window.addEventListener("error",event=>{console.error("Ops dashboard browser error:",event.message);const warning=document.getElementById("warning");if(warning){warning.className="notice";warning.textContent="Dashboard script error: "+String(event.message||"Unknown browser error");}});
window.addEventListener("unhandledrejection",event=>{console.error("Ops dashboard unhandled promise:",event.reason);const warning=document.getElementById("warning");if(warning){warning.className="notice";warning.textContent="Dashboard error: "+String(event.reason?.message||event.reason||"Unknown error");}});
const $=id=>document.getElementById(id);let current=null;const fmt=n=>Number(n||0).toLocaleString("en-GB");const pct=(n,d)=>d?((n/d)*100).toFixed(1)+"%":"—";const dur=n=>Number(n||0)>=1000?(Number(n)/1000).toFixed(2)+" s":Math.round(Number(n||0))+" ms";const safe=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const codeName=c=>c==="ALL"?"Global":((markets.find(x=>x.code===c)||{}).name||c);function table(rows,cols){if(!rows||!rows.length)return '<div class="empty">No records available for this window.</div>';return '<table><thead><tr>'+cols.map(c=>'<th>'+safe(c[1])+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td class="'+(c[2]&&c[2](r[c[0]],r)?"bad":"")+'">'+safe(c[3]?c[3](r[c[0]],r):r[c[0]])+'</td>').join("")+'</tr>').join("")+'</tbody></table>'}function barColour(label,index){const s=String(label||"").toLowerCase().replaceAll("_"," ");if(/cancel|fail|error|blocked|reject|critical|overdue/.test(s))return "#D62828";if(/complete|deliver|verified|success|paid|ready|healthy/.test(s))return "#18864B";if(/warn|review|pending|attention|not assessed|grace/.test(s))return "#F2C300";if(/accept|analytics|insight|research/.test(s))return "#6D28D9";if(/transit|active|promotion|operation/.test(s))return "#E87500";if(/open|new|request/.test(s))return "#2457D6";const colours=["#2457D6","#D62828","#18864B","#6D28D9","#E87500","#F2C300","#171717","#0096C7","#C0268D"];return colours[index%colours.length]}function bars(rows,label="label",value="count"){if(!rows||!rows.length)return '<div class="empty">No data yet.</div>';let max=Math.max(1,...rows.map(r=>Number(r[value]||0)));return '<div class="barlist">'+rows.map((r,index)=>{const rowLabel=String(r[label]||"Unknown").replaceAll("_"," ");const colour=barColour(rowLabel,index);return '<div class="barrow"><span>'+safe(rowLabel)+'</span><div class="bartrack"><div class="bar" style="width:'+Math.max(0,Math.min(100,Number(r[value]||0)/max*100))+'%;background:'+colour+'"></div></div><strong>'+fmt(r[value])+'</strong></div>'}).join("")+'</div>'}function kpi(label,value,hint){return '<div class="kpi"><label>'+safe(label)+'</label><strong>'+safe(value)+'</strong><small>'+safe(hint||"")+'</small></div>'}function lineChart(rows,label,value){if(!rows||rows.length<2)return '<div class="empty">Not enough observations yet to draw a trend.</div>';let w=700,h=200,p=28,vals=rows.map(r=>Number(r[value]||0)),max=Math.max(1,...vals),min=Math.min(0,...vals),pts=vals.map((v,i)=>(p+i*(w-p*2)/(vals.length-1))+','+(h-p-(v-min)/(max-min||1)*(h-p*2)));let grid=[0.25,0.5,0.75].map(q=>'<line class="gridline" x1="'+p+'" x2="'+(w-p)+'" y1="'+(p+(h-p*2)*q)+'" y2="'+(p+(h-p*2)*q)+'"/>').join("");return '<svg class="chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+safe(label)+'">'+grid+'<polygon class="area" points="'+p+','+(h-p)+' '+pts.join(" ")+' '+(w-p)+','+(h-p)+'"/><polyline class="line" points="'+pts.join(" ")+'"/><text x="'+p+'" y="'+(h-5)+'">'+safe(String(rows[0][label]).slice(0,10))+'</text><text x="'+(w-p)+'" y="'+(h-5)+'" text-anchor="end">'+safe(String(rows[rows.length-1][label]).slice(0,10))+'</text><text x="'+p+'" y="15">'+fmt(max)+'</text></svg>'}async function getData(country,days,forceRefresh=false,signal){
  const params={country,days:String(days)};
  if(forceRefresh){params.refresh="1";params._ts=String(Date.now())}
  const q=new URLSearchParams(params);
  const r=await fetch('/admin-access/api/metrics?'+q,{cache:'no-store',signal,headers:{"cache-control":"no-cache","pragma":"no-cache"}});
  const j=await r.json().catch(()=>({error:"Invalid reporting response"}));
  if(!r.ok)throw Error(j.error||("Metrics request failed ("+r.status+")"));
  return j;
}function sourceDomain(url){try{return new URL(url).hostname.replace(/^www\\./,"")}catch{return "External website"}}
function sourceCategory(source){const text=(String(source.name||"")+" "+String(source.url||"")).toLowerCase();if(/weather|met office|meteor|flood|bom\\.|imd\\.|wmo\\.|weather alerts/.test(text))return "Weather & disruption";if(/diesel|petrol|fuel|energy|commodity|price build-up/.test(text))return "Fuel & energy";if(/freight|haulage|goods transport|logistics|transportation|transport statistics/.test(text))return "Freight & logistics";if(/traffic|incident|road|highway|morth|dft|dot|mobility/.test(text))return "Roads & transport policy";return "Official data & notices"}
function renderSeasonality(market) {
  const code = market?.code || "ALL";
  const calendars = {
    IN: [
      ["Jan","Pongal / Makar Sankranti","Regional retail, food and agricultural movement may shift; confirm state-specific dates.","Regional"],
      ["Sep–Nov","Dussehra & Diwali","Potential retail replenishment and parcel/last-mile peaks; timing changes yearly.","Planning window"],
      ["Varies","Eid al-Fitr / Eid al-Adha","Lunar dates vary; check official local calendars and local operating patterns.","Date-sensitive"]
    ],
    GB: [
      ["Jul–Aug","Summer holiday period","Tourism and seasonal retail can shift local delivery and driver availability.","Planning window"],
      ["Nov","Black Friday","Retail promotions can increase parcel fulfilment and returns.","Planning window"],
      ["Dec","Christmas & Boxing Day","Peak retail fulfilment, returns and public-holiday operating constraints.","Planning window"]
    ],
    US: [
      ["Aug","Back-to-school","Retail and parcel demand may shift by state and school calendar.","Planning window"],
      ["Nov","Thanksgiving / Black Friday","Retail promotion and holiday freight planning window.","Planning window"],
      ["Nov–Dec","Year-end holidays","Parcel, retail and returns activity may rise; confirm carrier calendars.","Planning window"]
    ],
    EU: [
      ["Jun–Aug","Summer holiday period","Tourism and annual leave can affect regional demand and driver availability.","Planning window"],
      ["Nov","Black Friday","Retail promotions and cross-border parcel activity may rise.","Planning window"],
      ["Dec","Christmas / year-end","Retail fulfilment, returns, public holidays and cross-border schedules.","Planning window"]
    ],
    DEFAULT: [
      ["Quarterly","Quarter-end / financial-year peaks","Check local retailer, manufacturing and public-sector calendars before planning capacity.","Validate locally"],
      ["Local dates","Public holidays & major events","Add country, state and city events after validating dates and operating impact.","Validate locally"]
    ]
  };
  const events = calendars[code] || (["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IS","IT","LT","LU","LV","MC","ME","MT","NL","NO","PL","PT","RO","SE","SI","SK","CH","TR","AD","SM","VA","XK"].includes(code) ? calendars.EU : calendars.DEFAULT);
  const month = new Date().getMonth();
  const currentMonth = new Intl.DateTimeFormat("en",{month:"long"}).format(new Date());
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  $("seasonalCalendar").innerHTML = '<p class="muted">Selected market: <b>'+safe(market?.name||"Global")+'</b> · Current month: '+safe(currentMonth)+'</p>' +
    events.map(e => '<div class="insight"><b>'+safe(e[0]+' · '+e[1])+'</b><br>'+safe(e[2])+'<p class="muted">'+safe(e[3])+'</p></div>').join("");
  const europeCodes = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IS","IT","LT","LU","MC","ME","MT","NL","NO","PL","PT","RO","SE","SI","SK","CH","TR","AD","SM","VA","XK"];
  const sourceCatalog = [
    {market:"GB",topic:"Freight volumes",cadence:"Quarterly / annual",name:"Road freight statistics · UK DfT",url:"https://www.gov.uk/government/collections/road-freight-domestic-and-international-statistics"},
    {market:"GB",topic:"Road traffic & closures",cadence:"Live notices",name:"Traffic England · National Highways",url:"https://trafficengland.com/"},
    {market:"GB",topic:"Weather & flooding",cadence:"Warnings as issued",name:"UK weather warnings · Met Office",url:"https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings"},
    {market:"GB",topic:"Seasonality & holidays",cadence:"Annual calendar",name:"UK bank holidays · GOV.UK",url:"https://www.gov.uk/bank-holidays"},
    {market:"IN",topic:"Logistics benchmarks",cadence:"Publication-based",name:"LEADS logistics benchmarking · PIB",url:"https://www.pib.gov.in/PressReleasePage.aspx?PRID=2090056&lang=2&noshow=1&reg=48"},
    {market:"IN",topic:"Fuel & energy",cadence:"Updated periodically",name:"Petrol & diesel price series · PPAC",url:"https://ppac.gov.in/index.php/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/price-build-up-of-petrol-and-diesel"},
    {market:"IN",topic:"Weather & flooding",cadence:"Warnings as issued",name:"Weather forecasts & warnings · IMD",url:"https://mausam.imd.gov.in/"},
    {market:"IN",topic:"Seasonality & holidays",cadence:"Validate each year",name:"India holiday reference · verify state dates",url:"https://www.india.gov.in/calendar"},
    {market:"EU",topic:"Freight volumes",cadence:"Annual dataset",name:"Goods transport by road · Eurostat",url:"https://ec.europa.eu/eurostat/databrowser/product/page/TTR00005"},
    {market:"EU",topic:"Weather & flooding",cadence:"Warnings as issued",name:"European weather alerts · Meteoalarm",url:"https://www.meteoalarm.org/en/live/"},
    {market:"EU",topic:"Seasonality & holidays",cadence:"Context; verify nationally",name:"Working-time rules · European Commission",url:"https://employment-social-affairs.ec.europa.eu/policies-and-activities/moving-working-europe/working-abroad/working-conditions/working-time_en"},
    {market:"US",topic:"Fuel & energy",cadence:"Weekly series",name:"Retail diesel prices · US EIA",url:"https://www.eia.gov/petroleum/gasdiesel/"},
    {market:"US",topic:"Weather & flooding",cadence:"Warnings as issued",name:"Weather alerts · US National Weather Service",url:"https://www.weather.gov/alerts"},
    {market:"CA",topic:"Weather & flooding",cadence:"Warnings as issued",name:"Weather warnings · Environment Canada",url:"https://weather.gc.ca/warnings/index_e.html"},
    {market:"AU",topic:"Weather & flooding",cadence:"Warnings as issued",name:"Weather warnings · Australian Bureau of Meteorology",url:"https://www.bom.gov.au/weather-services/warnings/"},
    {market:"ALL",topic:"Weather & flooding",cadence:"Weather context; not route alerts",name:"World Meteorological Organization",url:"https://wmo.int/"},
    {market:"ALL",topic:"Fuel & energy",cadence:"Monthly / publication-based",name:"Commodity markets outlook · World Bank",url:"https://www.worldbank.org/en/research/commodity-markets"},
    {market:"ALL",topic:"Trade routes & maritime",cadence:"Reports and advisories",name:"Transport & trade logistics · UNCTAD",url:"https://unctad.org/topic/transport-and-trade-logistics"},
    {market:"ALL",topic:"Seasonality & holidays",cadence:"Planning reference only",name:"International holiday calendar · validate with local authorities",url:"https://www.timeanddate.com/holidays/"}
  ];
  const sourceApplies = x => x.market==="ALL" || x.market===code || (x.market==="EU" && europeCodes.includes(code));
  const risks = [
    {topic:"Fuel & energy",title:"Fuel / energy price shock",signal:"Check published diesel/petrol prices and energy benchmarks; recalculate lane costs before assuming the change is passed through.",cadence:"Review each published update"},
    {topic:"Weather & flooding",title:"Extreme weather / flooding / heat",signal:"Review official warnings and affected regions before dispatch. A national warning is not a route-level closure confirmation.",cadence:"Check before dispatch during alerts"},
    {topic:"Trade routes & maritime",title:"Border, sanctions or maritime disruption",signal:"Verify official advisories, affected corridors, effective dates and exemptions; separate confirmed restrictions from media reports.",cadence:"Event-triggered review"},
    {topic:"Road traffic & closures",title:"Road closures, strikes or congestion",signal:"Check the relevant national road authority, port and carrier notices; record the time window and affected corridor.",cadence:"Event-triggered review"},
    {topic:"Seasonality & holidays",title:"Festival / holiday capacity",signal:"Compare the local calendar with driver availability, fulfilment demand and public-holiday operating hours.",cadence:"Plan 4–8 weeks ahead"}
  ];
  const riskSourceFor = topic => sourceCatalog.find(x=>sourceApplies(x)&&x.topic===topic) || sourceCatalog.find(x=>x.market==="ALL"&&x.topic===topic) || null;
  $("riskWatchlist").innerHTML = '<div class="watch-grid">'+risks.map(x=>{const source=riskSourceFor(x.topic);return '<article class="watch-card"><h3>'+safe(x.title)+'</h3><p>'+safe(x.signal)+'</p><div class="watch-footer"><span class="pill warn">'+safe(x.cadence)+'</span>'+(source?'<a target="_blank" rel="noopener noreferrer" href="'+safe(source.url)+'">'+safe(source.name)+' ↗</a>':'<span class="source-meta">Use the selected-market source directory above</span>')+'</div><div class="source-meta">Manual monitoring only · no live incident detection</div></article>'}).join("")+'</div>';
  const drawRiskSources = () => {
    const q = $("riskSearch").value.trim().toLowerCase();
    const list = sourceCatalog.filter(x=>sourceApplies(x)&&(x.name+" "+x.url+" "+x.topic+" "+x.cadence+" "+sourceDomain(x.url)).toLowerCase().includes(q)).sort((a,b)=>Number(b.market===code)-Number(a.market===code)||a.topic.localeCompare(b.topic)||a.name.localeCompare(b.name));
    $("riskSourceCount").textContent = list.length+" reference link"+(list.length===1?"":"s");
    $("riskSources").innerHTML = list.length ? '<div class=\"source-link-list\">'+list.map(x=>'<article class=\"source-card\"><a target=\"_blank\" rel=\"noopener noreferrer\" href=\"'+safe(x.url)+'\">'+safe(x.name)+' ↗</a><div class=\"source-meta\">'+safe(sourceDomain(x.url))+' · '+safe(x.topic)+'</div><div class=\"source-meta\">Review cadence: '+safe(x.cadence)+'</div></article>').join("")+'</div>' : '<div class=\"empty\">No matching reference links. Try a broader topic or select another market.</div>';
  };
  $("riskSearch").oninput = drawRiskSources;
  drawRiskSources();
  const calculate = () => {
    const jobs = Math.max(0, Number($("scenarioJobs").value)||0);
    const drivers = Math.max(1, Number($("scenarioDrivers").value)||1);
    const demand = Math.max(-100,Math.min(500,Number($("scenarioDemand").value)||0));
    const supply = Math.max(-100,Math.min(500,Number($("scenarioSupply").value)||0));
    const days = Math.max(0,Math.min(365,Number($("scenarioDays").value)||0));
    const adjustedJobs = jobs*(1+demand/100);
    const adjustedDrivers = drivers*(1+supply/100);
    const baselinePressure = jobs/drivers*100;
    const adjustedPressure = adjustedDrivers>0 ? adjustedJobs/adjustedDrivers*100 : null;
    const fmtN = n => new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(n);
    const delta = baselinePressure>0 && adjustedPressure!==null ? (adjustedPressure/baselinePressure-1)*100 : null;
    $("scenarioResult").innerHTML = '<b>Illustrative scenario · '+fmtN(days)+'-day disruption window</b><br>Jobs/week: '+fmtN(jobs)+' → <b>'+fmtN(adjustedJobs)+'</b><br>Available drivers: '+fmtN(drivers)+' → <b>'+fmtN(adjustedDrivers)+'</b><br>Jobs per 100 drivers: '+fmtN(baselinePressure)+' → <b>'+ (adjustedPressure===null?"capacity unavailable":fmtN(adjustedPressure)) +'</b><br>Capacity pressure change: <b>'+(delta===null?"not defined":(delta>0?"+":"")+fmtN(delta)+"%")+'</b>';
  };
  ["scenarioJobs","scenarioDrivers","scenarioDemand","scenarioSupply","scenarioDays"].forEach(id=>$(id).oninput=calculate);
  calculate();
}
function render(d){current=d;const m=d.market||{code:"ALL",name:"Global",currency:"mixed"};const o=d.overview||{};$("title").textContent=m.code==="ALL"?"Global operations overview":m.name+" logistics & operations";$("subtitle").textContent=(m.code==="ALL"?"All supported markets":m.name+" · "+m.currency)+" · "+d.windowDays+" day window · country filter is reporting-only";$("updated").textContent="Updated "+new Date(d.generatedAt).toLocaleString()+" · "+(d.dataCoverage||"Coverage varies")+(d.cache?(d.cache.ageSeconds===0?" · fresh DB read":" · cached "+d.cache.ageSeconds+"s"):"");$("filterSummary").textContent="Filters · "+(m.code==="ALL"?"Global":m.name)+" · "+(d.windowDays===1?"24 hours":d.windowDays+" days");$("warning").innerHTML=d.warnings?.length?'<div class="notice">'+d.warnings.map(safe).join("<br>")+'</div>':"";$("kpis").innerHTML=[kpi("Total accounts",fmt(o.totalAccounts),"Synthetic QA accounts excluded"),kpi("User profiles",fmt(o.totalUsers),"Login profiles; may exceed account count"),kpi("New accounts",fmt(o.newAccounts),"Selected period"),kpi("Active accounts",fmt(o.activeAccounts),"Last 7 days"),kpi("Driver-capable accounts",fmt(o.drivers),"Driver or mixed account type"),kpi("Jobs posted",fmt(o.jobs),"Created in selected window"),kpi("Open jobs",fmt(o.openJobs),"Current open state"),kpi("Bids",fmt(o.bids),"Recorded bid submissions"),kpi("Bid coverage",pct(o.jobsWithBids,o.jobs),"Jobs with ≥1 bid / jobs posted"),kpi("Completed jobs",fmt(o.completedJobs),"Current completed state"),kpi("API requests",fmt(o.apiRequests),"Observed, non-QA telemetry"),kpi("API 5xx errors",fmt(o.api5xx),"Observed server errors")].join("");$("growth").innerHTML=lineChart(d.growth||[],"day","count");$("jobs").innerHTML=bars(d.jobStatuses||[]);$("supply").innerHTML=bars([{label:"Poster-capable accounts",count:o.posters},{label:"Driver-capable accounts",count:o.drivers},{label:"Jobs posted in window",count:o.jobs},{label:"Bids in window",count:o.bids},{label:"Jobs with bids",count:o.jobsWithBids}]);$("accounts").innerHTML=bars(d.accountTypes||[])+ '<h3>Verification status</h3>'+bars(d.verificationStatuses||[]);$("apiTrend").innerHTML=lineChart(d.apiHourly||[],"hour","requests")+'<h3>Errors by hour</h3>'+bars((d.apiHourly||[]).map(x=>({label:x.hour,count:x.errors})));$("routes").innerHTML=table(d.routes,[["route","Route"],["method","Method"],["count","Requests"],["p95Ms","P95",null,d=>dur(d)],["serverErrors","5xx",r=>Number(r)>0]]);$("errors").innerHTML=table(d.recentErrors,[["createdAt","Time",null,v=>new Date(v).toLocaleString()],["method","Method"],["route","Route"],["statusCode","Status",v=>Number(v)>=500]]);$("vehicles").innerHTML=bars([{label:"Vehicle records",count:o.vehicles},{label:"Verified",count:o.vehiclesVerified},{label:"MOT expired",count:o.motExpired},{label:"Insurance expired",count:o.insuranceExpired},{label:"MOT expires in 30d",count:o.motExpiring30d},{label:"Insurance expires in 30d",count:o.insuranceExpiring30d}]);$("qa").innerHTML=table(d.qaRuns,[["startedAt","Started",null,v=>v?new Date(v).toLocaleString():"—"],["status","Status",v=>String(v).toLowerCase().includes("fail")],["targetAccounts","Target accounts"],["createdAccounts","Created"],["successfulChecks","Passed"],["failedChecks","Failed",v=>Number(v)>0],["durationMs","Duration",null,v=>dur(v)]]);$("qaFailures").innerHTML=table(d.qaFailures,[["scenario","Scenario"],["action","Action"],["path","Path"],["expected","Expected"],["actual","Actual"],["count","Count",v=>Number(v)>0]]);$("exceptions").innerHTML=(d.recentErrors?.length?'<div class="insight">Observed '+fmt(d.recentErrors.length)+' recent server-error events in this reporting window. Review endpoint and deployment logs before assigning cause.</div>':'<div class="insight">No recent instrumented 5xx events in the returned sample. This is not an uptime guarantee.</div>')+(d.qaFailures?.length?'<div class="insight">'+fmt(d.qaFailures.length)+' failed QA scenario groups are retained in the latest run.</div>':'<div class="empty">No failed scenario rows returned; QA table coverage must be confirmed.</div>')+'<div class="notice">Notification rows show in-app creation/read status, not confirmed email/SMS delivery. Railway health and external delivery receipts are not yet integrated.</div>';$("payments").innerHTML=bars(d.paymentStatuses||[]);$("testerApplications").innerHTML='<table><thead><tr><th>Submitted</th><th>Company</th><th>Market</th><th>Plan</th><th>Vehicles</th><th>Verification</th><th>Email verified</th><th>Review actions</th></tr></thead><tbody>'+(d.testerApplications||[]).map(x=>'<tr><td>'+safe(x.createdAt?new Date(x.createdAt).toLocaleString():"—")+'</td><td>'+safe(x.companyName)+'</td><td>'+safe(x.country)+'</td><td>'+safe(x.planType)+'</td><td>'+safe(x.vehicleCount)+'</td><td>'+safe(x.verificationStatus)+'</td><td>'+safe(x.allEmailsVerified===true?"Yes":"No / unavailable")+'</td><td><button type="button" data-admin-action="tester-approve" data-account-id="'+safe(x.id)+'" '+(d.adminActionsEnabled?"":"disabled")+'>Approve</button> <button type="button" data-admin-action="tester-reject" data-account-id="'+safe(x.id)+'" '+(d.adminActionsEnabled?"":"disabled")+'>Reject</button></td></tr>').join("")+'</tbody></table>'+(d.adminActionsEnabled?"":'<p class="notice">Actions disabled until the signed application bridge and its secrets are configured.</p>');;$("generateTesterCode").disabled=!d.adminActionsEnabled;$("actionBridgeStatus").textContent=d.adminActionsEnabled?"Secure application action bridge configured.":"Read-only mode: set POST2DRIVE_APP_URL and OPS_DASHBOARD_BRIDGE_SECRET on this service to enable protected actions.";$("testerCodes").innerHTML=table(d.testerCodes,[["status","Code status"],["count","Codes"],["redeemed","Redeemed"],["oldestCreatedAt","Oldest created",null,v=>v?new Date(v).toLocaleDateString():"—"],["latestCreatedAt","Latest created",null,v=>v?new Date(v).toLocaleDateString():"—"]]);$("incidentQueue").innerHTML='<table><thead><tr><th>Reported</th><th>Incident</th><th>Job</th><th>Job status</th><th>Route</th><th>Review status</th><th>Outcome</th><th>Resolution notes</th><th>Action</th></tr></thead><tbody>'+(d.incidentQueue||[]).map(x=>'<tr><td>'+safe(x.createdAt?new Date(x.createdAt).toLocaleString():"—")+'</td><td>'+safe(x.metadata?.reason||x.description||"Incident")+'</td><td>'+safe(x.jobId)+'</td><td>'+safe(x.jobStatus)+'</td><td>'+safe(x.pickup)+' → '+safe(x.dropoff)+'</td><td>'+safe(x.hasResolution?"Decision recorded":"Needs review")+'</td><td><select data-outcome-for="'+safe(x.incidentId)+'"><option value="no_further_action">No further action</option><option value="resume">Resume</option><option value="reassign">Reassign</option><option value="return_goods">Return goods</option><option value="delivery_dispute">Delivery dispute</option><option value="payment_dispute">Payment dispute</option><option value="terminate_with_incident">Terminate with incident</option></select></td><td><textarea data-notes-for="'+safe(x.incidentId)+'" rows="2" maxlength="4000" placeholder="Required decision notes" '+(d.adminActionsEnabled&&!x.hasResolution?"":"disabled")+ '></textarea></td><td><button type="button" data-resolve-incident="1" data-incident-id="'+safe(x.incidentId)+'" data-job-id="'+safe(x.jobId)+'" '+(d.adminActionsEnabled&&!x.hasResolution?"":"disabled")+'>Record decision</button></td></tr>').join("")+'</tbody></table>'+(d.adminActionsEnabled?"":'<p class="notice">Incident actions disabled until the signed application bridge and its secrets are configured.</p>');;$("researchResults").innerHTML=table(d.researchResults,[["market","Market"],["question","Question / field"],["answer","Answer"],["responses","Responses"]]);$("marketSnapshot").innerHTML='<p><b>'+safe(m.name)+'</b> · currency '+safe(m.currency||"mixed")+'</p><p class="muted">First-party platform data is filtered by account country. External freight-market numeric series are not connected yet.</p><div class="insight">Observed accounts: '+fmt(o.totalAccounts)+' · jobs in window: '+fmt(o.jobs)+' · bids: '+fmt(o.bids)+'. '+(o.totalAccounts<30?"Low platform sample: avoid treating conversion or growth as a national industry trend.":"Use platform behaviour as a product signal only; it does not represent the whole country's logistics sector.")+'</div><p class="muted">Source coverage: '+safe(d.externalCoverage||"Official source links only; live industry data pending.")+'</p>';const drawIndustrySources=()=>{
  const q=$("sourceSearch").value.trim().toLowerCase();
  const list=(d.sources||[]).filter(x=>[x.name,x.url,sourceDomain(x.url),sourceCategory(x)].some(v=>String(v||"").toLowerCase().includes(q))).sort((a,b)=>sourceCategory(a).localeCompare(sourceCategory(b))||String(a.name).localeCompare(String(b.name)));
  $("sourceCount").textContent=list.length+" source"+(list.length===1?"":"s");
  $("sources").innerHTML=list.length?'<div class=\"source-link-list\">'+list.map(x=>'<article class=\"source-card\"><a target=\"_blank\" rel=\"noopener noreferrer\" href=\"'+safe(x.url)+'\">'+safe(x.name)+' ↗</a><div class=\"source-meta\">'+safe(sourceCategory(x))+' · '+safe(sourceDomain(x.url))+'</div><div class=\"source-meta\">External reference · check its latest publication date before relying on it</div></article>').join("")+'</div>':'<div class=\"empty\">No matching sources for this market. Try a shorter search term or choose Global.</div>'
};
$("sourceSearch").oninput=drawIndustrySources;drawIndustrySources();$("patterns").innerHTML=(d.patterns||[]).map(x=>'<div class="insight"><b>'+safe(x.title)+'</b><br>'+safe(x.detail)+'</div>').join("")||'<div class="empty">Collect more dated observations to detect patterns. No trend is inferred from missing data.</div>';$("comparison").innerHTML=d.comparison?table(d.comparison,[["market","Market"],["accounts","Accounts"],["jobs","Jobs"],["bids","Bids"],["completed","Completed"],["api5xx","API 5xx"]]):'<div class="empty">Choose a comparison market above.</div>';$("catalogue").innerHTML=table(d.catalogue,[["metric","Metric"],["source","Source"],["coverage","Coverage / caveat"]]);
renderSeasonality(m,d.sources||[]);

const queue=[];
(d.recentErrors||[]).forEach(x=>queue.push({priority:"Critical",category:"API reliability",market:m.code==="ALL"?"Global":m.code,issue:String(x.statusCode)+" on "+x.method+" "+x.route,next:"Inspect route logs and compare against deploy/telemetry windows.",when:x.createdAt}));
(d.incidentQueue||[]).filter(x=>!x.hasResolution).forEach(x=>queue.push({priority:"High",category:"Incident",market:x.market||"Unknown",issue:(x.metadata?.reason||"Reported incident")+" · job "+x.jobId,next:"Review evidence and resolve through the protected application workflow.",when:x.createdAt}));
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
const readinessStatus=v=>({ready:"Ready",blocked:"Blocked",in_progress:"In progress",not_assessed:"Not assessed"}[v]||v);$("readinessSummary").innerHTML=table(readiness,[["name","Market"],["code","Code"],["currency","Currency"],["status","Readiness",v=>v==="blocked",v=>readinessStatus(v)],["verifiedGates","Verified gates",null,(v,row)=>v+" / "+row.totalGates]]);
const selectedReadiness=readiness.find(x=>x.code===m.code);
$("readinessDetail").innerHTML=m.code==="ALL"?'<div class="empty">Choose a country in the top selector to inspect its seven launch gates.</div>':selectedReadiness?table(selectedReadiness.gates.map(g=>({...g,status:readinessStatus(g.status),reviewedAt:g.reviewedAt||"—",evidenceRef:g.evidenceRef||"No evidence reference"})),[["label","Gate"],["status","Status",v=>v==="Blocked"],["reviewedAt","Reviewed"],["evidenceRef","Evidence reference"]]):'<div class="empty">No readiness record available.</div>';
$("notificationHealth").innerHTML=table(d.notificationSummary,[["label","Notification type"],["count","Created"],["unread","Unread"],["latestAt","Latest record",null,v=>v?new Date(v).toLocaleString():"—"]]);
$("auditEvents").innerHTML=table((d.auditEvents||[]).map(x=>({...x,market:x.market||"Unknown"})),[["createdAt","Time",null,v=>v?new Date(v).toLocaleString():"—"],["action","Event"],["market","Actor market"],["jobId","Job"],["description","Description"]]);$("adminAuditEvents").innerHTML=table((d.adminAuditEvents||[]).map(x=>({...x,market:x.market||"Global",entity:String(x.entityType||"")+" · "+String(x.entityId||"—"),details:x.details?JSON.stringify(x.details):"—"})),[["createdAt","Time",null,v=>v?new Date(v).toLocaleString():"—"],["actor","Admin"],["action","Action"],["entity","Affected record"],["market","Market"],["details","Audit details"]]);
}
let loadSequence = 0;
let activeLoadController = null;
async function load(forceRefresh=false){
  const requestId=++loadSequence;
  if(activeLoadController)activeLoadController.abort();
  const controller=new AbortController();
  activeLoadController=controller;
  const country=$("country").value||"ALL",days=Number($("days").value||7),compare=$("compare").value;
  const button=$("refresh"),applyButton=$("applyFilters"),resetButton=$("resetFilters");
  button.disabled=true;button.setAttribute("aria-busy","true");button.classList.add("is-loading");button.textContent=forceRefresh?"Refreshing…":"Loading…";
  if(applyButton)applyButton.disabled=true;if(resetButton)resetButton.disabled=true;
  $("warning").innerHTML="";
  $("updated").textContent=forceRefresh?"Refreshing current reporting data…":"Loading selected-market metrics…";
  try{
    const [d,c]=await Promise.all([
      getData(country,days,forceRefresh,controller.signal),
      compare&&compare!==country?getData(compare,days,forceRefresh,controller.signal):Promise.resolve(null)
    ]);
    if(requestId!==loadSequence)return;
    if(c)d.comparison=[
      {market:d.market.name,accounts:d.overview.totalAccounts,jobs:d.overview.jobs,bids:d.overview.bids,completed:d.overview.completedJobs,api5xx:d.overview.api5xx},
      {market:c.market.name,accounts:c.overview.totalAccounts,jobs:c.overview.jobs,bids:c.overview.bids,completed:c.overview.completedJobs,api5xx:c.overview.api5xx}
    ];
    render(d);
  }catch(e){
    if(requestId!==loadSequence||e?.name==="AbortError")return;
    $("warning").innerHTML='<div class="notice" role="alert">Could not '+(forceRefresh?'refresh':'load')+' current metrics: '+safe(e.message)+'. Try again in a moment.</div>';
    $("updated").textContent=forceRefresh?"Refresh failed · no fresh result returned":"Metrics unavailable";
  }finally{
    if(requestId===loadSequence){
      activeLoadController=null;
      button.disabled=false;button.removeAttribute("aria-busy");button.classList.remove("is-loading");button.textContent="↻ Refresh data";
      if(applyButton)applyButton.disabled=false;if(resetButton)resetButton.disabled=false;
    }
  }
}

function qaEsc(value){return String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
async function loadQaCampaigns(){
  const status=$("qaCampaignStatus");
  try{
    const response=await fetch("/api/qa-campaigns",{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Could not load campaign history.");
    const campaigns=data.campaigns||[],steps=data.steps||[];
    status.textContent=campaigns.length+" saved plans";
    $("qaCampaignsTable").innerHTML=campaigns.length?'<table><thead><tr><th>Created</th><th>Campaign</th><th>Market</th><th>Plan</th><th>Tests</th><th>Accounts</th><th>Parallel</th><th>Status</th><th>Action</th></tr></thead><tbody>'+campaigns.map(c=>'<tr><td>'+qaEsc(c.createdAt?new Date(c.createdAt).toLocaleString():"—")+'</td><td>'+qaEsc(c.name)+'</td><td>'+qaEsc(c.countryCode)+'</td><td>'+qaEsc(c.scenario)+'</td><td>'+qaEsc(c.totalTests)+'</td><td>'+qaEsc(c.accountCount)+'</td><td>'+qaEsc(c.concurrency)+'</td><td>'+qaEsc(c.status)+'</td><td>'+(c.status==="draft"?'<button type="button" data-qa-action="start" data-campaign-id="'+qaEsc(c.id)+'">Review and run</button> <button type="button" data-qa-action="delete" data-campaign-id="'+qaEsc(c.id)+'">Delete draft</button>':qaEsc(c.executionMode||"Running or complete"))+'</td></tr>').join("")+'</tbody></table>':'<p class="empty">No saved plans. Create a plan above.</p>';
    $("qaCampaignSteps").innerHTML=steps.length?'<table><thead><tr><th>Campaign</th><th>Suite</th><th>Status</th><th>Tests</th><th>Accounts</th><th>Parallel</th><th>Passed</th><th>Failed</th><th>P50</th><th>P95</th><th>Duration</th><th>Run ID</th></tr></thead><tbody>'+steps.map(s=>'<tr><td>'+qaEsc(s.campaignName||s.campaignId)+'</td><td>'+qaEsc(s.suite)+'</td><td>'+qaEsc(s.status)+'</td><td>'+qaEsc(s.testIterations)+'</td><td>'+qaEsc(s.accountCount)+'</td><td>'+qaEsc(s.concurrency)+'</td><td>'+qaEsc(s.passed==null?"—":s.passed)+'</td><td>'+qaEsc(s.failed==null?"—":s.failed)+'</td><td>'+qaEsc(s.p50Ms==null?"—":s.p50Ms+" ms")+'</td><td>'+qaEsc(s.p95Ms==null?"—":s.p95Ms+" ms")+'</td><td>'+qaEsc(s.durationMs==null?"—":s.durationMs+" ms")+'</td><td>'+qaEsc(s.runId||"—")+'</td></tr>').join("")+'</tbody></table>':'<p class="empty">No campaign steps yet. Saved drafts do not run tests.</p>';
  }catch(e){status.textContent="Campaign history unavailable";$("qaCampaignsTable").innerHTML='<div class="notice" role="alert">'+qaEsc(e.message)+'</div>';}
}
document.addEventListener("submit",async event=>{
  if(event.target?.id!=="qaCampaignForm")return;
  event.preventDefault();
  const form=event.target,button=$("qaCampaignSave"),message=$("qaCampaignFormMessage");
  const suites=Array.from(form.querySelectorAll('input[name="suites"]:checked')).map(x=>x.value);
  const payload={action:"qa-campaign-create",name:$("qaCampaignName").value,countryCode:$("qaCampaignMarket").value,scenario:$("qaCampaignScenario").value,totalTests:Number($("qaCampaignTests").value),accountCount:Number($("qaCampaignAccounts").value),concurrency:Number($("qaCampaignConcurrency").value),suites};
  button.disabled=true;message.textContent="Saving draft…";
  try{const result=await adminAction(payload);message.textContent="Draft saved. No test has started. ID: "+result.id;await loadQaCampaigns();}
  catch(e){message.textContent="Draft not saved: "+e.message;}
  finally{button.disabled=false;}
});
async function adminAction(payload) {
  const response = await fetch("/api/admin-action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
  const data = await response.json().catch(()=>({error:"Invalid action response"}));
  if(!response.ok) throw new Error(data.error||"Admin action failed");
  return data;
}
document.addEventListener("click",async event=>{
  const button=event.target.closest("button[data-admin-action],button[data-resolve-incident],button[data-qa-action],#generateTesterCode");
  if(!button||button.disabled)return;
  try {
    if(button.dataset.qaAction) {
      const campaignId=button.dataset.campaignId,kind=button.dataset.qaAction;
      if(kind==="delete") {
        if(!confirm("Delete this unstarted draft? No QA runs, steps, accounts, events, or reports will be deleted."))return;
        button.disabled=true;await adminAction({action:"qa-campaign-delete",campaignId});$("qaCampaignFormMessage").textContent="Draft deleted. QA history was kept.";await loadQaCampaigns();return;
      }
      if(kind==="start") {
        if(!confirm("Run this campaign on staging? It can create synthetic data. The system will keep the data and reports."))return;
        button.disabled=true;const result=await adminAction({action:"qa-campaign-start",campaignId});$("qaCampaignFormMessage").textContent="Campaign queued. Run ID: "+result.runId;await loadQaCampaigns();return;
      }
    }
    if(button.id==="generateTesterCode") {
      if(!confirm("Generate a new one-time tester access code? The raw code is shown only once."))return;
      button.disabled=true;
      const result=await adminAction({action:"tester-generate-code"});
      await load();
      alert("New tester access code (shown once):\\n\\n"+result.code+"\\n\\nCopy it now; the raw code is not stored.");
      return;
    }
    if(button.dataset.adminAction) {
      const action=button.dataset.adminAction;
      const accountId=button.dataset.accountId;
      if(!confirm((action==="tester-approve"?"Approve":"Reject")+" this pending tester application?"))return;
      const reason=prompt("Enter the review reason for the permanent audit log:");
      if(reason===null||!reason.trim()){alert("A review reason is required; no action was taken.");return;}
      button.disabled=true;
      await adminAction({action,accountId,reason:reason.trim()});
      alert("Tester application "+(action==="tester-approve"?"approved.":"rejected."));
      await load();
      return;
    }
    if(button.dataset.resolveIncident) {
      const incidentId=button.dataset.incidentId,jobId=button.dataset.jobId;
      const outcome=Array.from(document.querySelectorAll("[data-outcome-for]")).find(el=>el.dataset.outcomeFor===incidentId)?.value;
      const notes=Array.from(document.querySelectorAll("[data-notes-for]")).find(el=>el.dataset.notesFor===incidentId)?.value||"";
      if(!notes.trim()){alert("Enter resolution notes before recording a decision.");return;}
      if(!confirm("Record this incident decision? Lifecycle-changing termination is restricted by the application workflow."))return;
      button.disabled=true;
      await adminAction({action:"incident-resolve",incidentId,jobId,outcome,notes});
      alert("Incident decision recorded and affected parties notified in-app where applicable.");
      await load();
    }
  } catch(error) {
    alert(error.message||"Admin action failed. No success was confirmed.");
    await load();
  }
});
function csvCell(value) {
  let text=String(value??"");
  if(/^[=+@-]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
$("exportAudit").addEventListener("click",()=>{
  if(!current){alert("Load dashboard data before exporting.");return;}
  const rows=[
    ["time","actor","action","entityType","entityId","market","details"],
    ...(current.adminAuditEvents||[]).map(x=>[x.createdAt,x.actor,x.action,x.entityType,x.entityId,x.market,JSON.stringify(x.details??{})]),
    ...(current.auditEvents||[]).map(x=>[x.createdAt,"application workflow",x.action,"incident",x.jobId,x.market,x.description])
  ];
  const csv=rows.map(row=>row.map(csvCell).join(",")).join("\\r\\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const href=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=href;link.download="post2drive-admin-audit-"+new Date().toISOString().slice(0,10)+".csv";
  link.click();URL.revokeObjectURL(href);
});
try {
  $("updated").textContent="Dashboard script started; requesting metrics…";
  $("refresh").addEventListener("click",()=>void load(true));
  $("applyFilters").addEventListener("click",()=>{$("filterDrawer").open=false;void load(false)});
  $("resetFilters").addEventListener("click",()=>{$("country").value="ALL";$("compare").value="";$("days").value="7";$("filterDrawer").open=false;void load(false)});
  console.info("Post2Drive Ops dashboard script initialized");void load();
} catch(error) {
  console.error("Ops dashboard initialisation failed:",error);
  const warning=document.getElementById("warning");if(warning){warning.className="notice";warning.textContent="Dashboard initialisation failed: "+String(error?.message||error);}
  const updated=document.getElementById("updated");if(updated)updated.textContent="Dashboard failed to initialise";
}
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
  const [testerApplications, testerCodes, incidentQueue, researchResults, notificationSummary, auditEvents, adminAuditEvents] = await Promise.all([
    safeQuery("Pending tester applications", `SELECT a.id, a."companyName", a.country, a."planType" AS "planType", a."createdAt" AS "createdAt", a."verificationStatus" AS "verificationStatus", count(DISTINCT v.id)::int AS "vehicleCount", bool_and(u."emailVerifiedAt" IS NOT NULL) AS "allEmailsVerified" FROM "Account" a LEFT JOIN "Vehicle" v ON v."accountId"=a.id LEFT JOIN "User" u ON u."accountId"=a.id WHERE a."testerApprovalStatus"='pending' AND ($1::text IS NULL OR a.country=$1) GROUP BY a.id ORDER BY a."createdAt" ASC LIMIT 100`, country),
    safeQuery("Tester access-code history", `SELECT CASE WHEN c."claimedAt" IS NULL THEN 'Unused' ELSE 'Redeemed' END AS status, count(*)::int AS count, count(*) FILTER (WHERE c."claimedAt" IS NOT NULL)::int AS redeemed, min(c."createdAt") AS "oldestCreatedAt", max(c."createdAt") AS "latestCreatedAt" FROM "TesterAccessCode" c GROUP BY 1 ORDER BY 1`),
    safeQuery("Incident review queue", `SELECT ja.id AS "incidentId", ja."jobId", ja.description, ja.metadata, ja."createdAt" AS "createdAt", j.status::text AS "jobStatus", j.pickup, j.dropoff, a."companyName" AS "reportedBy", poster.country AS market, EXISTS(SELECT 1 FROM "JobActivity" r WHERE r.action='INCIDENT_RESOLUTION_RECORDED' AND r."jobId"=ja."jobId" AND r.metadata->>'parentIncidentId'=ja.id) AS "hasResolution" FROM "JobActivity" ja JOIN "Job" j ON j.id=ja."jobId" LEFT JOIN "Account" a ON a.id=ja."actorId" JOIN "Account" poster ON poster.id=j."posterId" WHERE ja.action='INCIDENT_REPORTED' AND ($1::text IS NULL OR poster.country=$1) ORDER BY ja."createdAt" DESC LIMIT 100`, country),
    safeQuery("Aggregated market research", `SELECT a.country AS market, e.key AS question, e.value AS answer, count(*)::int AS responses FROM "Account" a CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(a."marketResearch"::jsonb)='object' THEN a."marketResearch"::jsonb ELSE '{}'::jsonb END) e WHERE a."marketResearch" IS NOT NULL AND ($1::text IS NULL OR a.country=$1) GROUP BY a.country,e.key,e.value HAVING count(*) >= 3 ORDER BY a.country,e.key,responses DESC LIMIT 250`, country),
    safeQuery("Notification activity signals", `SELECT n.type AS label,count(*)::int AS count,count(*) FILTER (WHERE n."readAt" IS NULL)::int AS unread,max(n."createdAt") AS "latestAt" FROM "Notification" n JOIN "Account" a ON a.id=n."accountId" WHERE n."createdAt">=now()-($2::int*interval '1 day') AND ($1::text IS NULL OR a.country=$1) GROUP BY n.type ORDER BY count DESC LIMIT 25`, country, days),
    safeQuery("Incident audit events", `SELECT ja.id,ja.action,ja."jobId",ja.description,ja.metadata,ja."createdAt" AS "createdAt",poster.country AS market FROM "JobActivity" ja JOIN "Job" j ON j.id=ja."jobId" JOIN "Account" poster ON poster.id=j."posterId" WHERE ja.action IN ('INCIDENT_REPORTED','INCIDENT_RESOLUTION_RECORDED','JOB_TERMINATED_WITH_INCIDENT') AND ($1::text IS NULL OR poster.country=$1) ORDER BY ja."createdAt" DESC LIMIT 100`, country),
    safeQuery("Admin action audit", `SELECT id,actor,action,"entityType","entityId",market,details,"createdAt" AS "createdAt" FROM "AdminAuditEvent" WHERE ($1::text IS NULL OR market=$1) ORDER BY "createdAt" DESC LIMIT 100`, country)
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
    {metric:"Incidents",source:"JobActivity incident reports and resolution audit rows",coverage:"Read-only queue; action bridge still required for decisions and notifications"},{metric:"Tester operations",source:"Account + User + Vehicle + TesterAccessCode",coverage:"Pending application queue and aggregated code history; approval/code-generation actions are not enabled in this read-only service"},{metric:"Market research",source:"Account.marketResearch JSON",coverage:"Aggregated by market/question/answer; first-party dataset"},{metric:"Admin action audit",source:"AdminAuditEvent",coverage:"Durable signed-bridge actions; requires the staging migration and SELECT grant"},{metric:"Railway health",source:"Railway service health feeds",coverage:"Not yet ingested into this dashboard"}
  ];
  return {
    generatedAt:new Date().toISOString(),windowDays:days,market:countryMarket||{code:"ALL",name:"Global",currency:"mixed"},
    overview,accountTypes:normalise(accountTypes),verificationStatuses:normalise(verificationStatuses),jobStatuses:normalise(jobStatuses),
    growth:normalise(growth).map(r=>({day:r.day,count:Number(r.count||0)})),
    apiHourly:normalise(apiHourly).map(r=>({hour:r.hour,requests:Number(r.requests||0),errors:Number(r.errors||0)})),
    routes:normalise(routes),recentErrors:normalise(recentErrors),qaRuns:normalise(qaRuns),qaFailures:normalise(qaFailures),
    paymentStatuses:normalise(paymentStatuses),activity:normalise(activityRows),bidSummary:normalise(bidRows),
    testerApplications:normalise(testerApplications),testerCodes:normalise(testerCodes),incidentQueue:normalise(incidentQueue),researchResults:normalise(researchResults),notificationSummary:normalise(notificationSummary),auditEvents:normalise(auditEvents),adminAuditEvents:normalise(adminAuditEvents),countryReadiness:countryReadiness(),adminActionsEnabled:bridgeReady() && !warnings.some(w=>w.startsWith("Admin action audit")),
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
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (forceRefresh) metricsCache.delete(key);
  const now = Date.now();
  const cached = metricsCache.get(key);
  if (!forceRefresh && cached && now - cached.createdAt < METRICS_CACHE_TTL_MS) {
    return {...cached.data, cache:{ageSeconds:Math.floor((now-cached.createdAt)/1000),ttlSeconds:Math.ceil((METRICS_CACHE_TTL_MS-(now-cached.createdAt))/1000)}};
  }
  if (!forceRefresh && metricsInflight.has(key)) return metricsInflight.get(key);
  const pending = metricsUncached(url).then(data => {
    // A superseded request may finish after a forced refresh. Only the current
    // in-flight owner may publish into the cache or remove its ownership token.
    if (metricsInflight.get(key) === pending) {
      metricsCache.set(key,{createdAt:Date.now(),data});
      while (metricsCache.size > 20) metricsCache.delete(metricsCache.keys().next().value);
    }
    return {...data,cache:{ageSeconds:0,ttlSeconds:Math.ceil(METRICS_CACHE_TTL_MS/1000)}};
  }).finally(() => {
    if (metricsInflight.get(key) === pending) metricsInflight.delete(key);
  });
  metricsInflight.set(key,pending);
  return pending;
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const basePath = "/admin-access";
  if (url.pathname === basePath) url.pathname = "/";
  else if (url.pathname.startsWith(basePath + "/")) url.pathname = url.pathname.slice(basePath.length);
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res,200,JSON.stringify({ok:true,service:"post2drive-ops-dashboard"}),"application/json");
    if (req.method === "POST" && url.pathname === "/login") {
      const forwardedIp = process.env.TRUST_PROXY_HEADERS === "true" ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
      const ip = forwardedIp || String(req.socket.remoteAddress || "unknown");
      const now = Date.now();
      const attempt = loginAttempts.get(ip);
      if (attempt && now - attempt.startedAt < LOGIN_WINDOW_MS && attempt.count >= LOGIN_MAX_ATTEMPTS) {
        return send(res,429,pageLogin("Too many sign-in attempts. Wait 15 minutes and try again.").replaceAll('action="/login"', 'action="/admin-access/login"'),"text/html; charset=utf-8",{"retry-after":"900"});
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
        return send(res,401,pageLogin("Access denied. Check the admin credentials.").replaceAll('action="/login"', 'action="/admin-access/login"'));
      }
      loginAttempts.delete(ip);
      const stamp = String(Date.now());
      const cookie = `ops_session=${stamp}.${sign(stamp)}; Path=/admin-access; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS/1000}${IS_PRODUCTION ? "; Secure" : ""}`;
      res.writeHead(303,{Location:"/admin-access", "Set-Cookie":cookie,"Cache-Control":"no-store"}); return res.end();
    }
    if (req.method === "POST" && url.pathname === "/logout") {
      res.writeHead(303,{Location:"/admin-access","Set-Cookie":`ops_session=; Path=/admin-access; HttpOnly; SameSite=Strict; Max-Age=0`,"Cache-Control":"no-store"});return res.end();
    }
    if (!validSession(req)) {
      if (url.pathname.startsWith("/api/")) return send(res,401,JSON.stringify({error:"Operations access required"}),"application/json");
      return send(res,200,pageLogin().replaceAll('action="/login"', 'action="/admin-access/login"'));
    }
    if (req.method === "POST" && url.pathname === "/api/admin-action") {
      let origin;
      try { origin = new URL(req.headers.origin || ""); } catch { return send(res,403,JSON.stringify({error:"Same-origin admin request required"}),"application/json"); }
      if (!req.headers.host || origin.host !== req.headers.host || (IS_PRODUCTION && origin.protocol !== "https:")) {
        return send(res,403,JSON.stringify({error:"Same-origin admin request required"}),"application/json");
      }
      const raw = await body(req);
      let actionBody;
      try { actionBody = JSON.parse(raw); } catch { return send(res,400,JSON.stringify({error:"Request body must be valid JSON"}),"application/json"); }
      const allowed = new Set(["tester-approve","tester-reject","tester-generate-code","incident-resolve","qa-campaign-create","qa-campaign-delete","qa-campaign-start"]);
      if (!allowed.has(actionBody?.action)) return send(res,400,JSON.stringify({error:"Unsupported admin action"}),"application/json");
      const base = process.env.POST2DRIVE_APP_URL;
      const bridgeSecret = process.env.OPS_DASHBOARD_BRIDGE_SECRET;
      if (!base || !bridgeSecret || bridgeSecret.length < 32) return send(res,503,JSON.stringify({error:"Secure application action bridge is not configured"}),"application/json");
      let target;
      try { target = new URL("/api/internal/admin-bridge",base); } catch { return send(res,503,JSON.stringify({error:"Application bridge URL is invalid"}),"application/json"); }
      if (IS_PRODUCTION && target.protocol !== "https:") return send(res,503,JSON.stringify({error:"Application bridge must use HTTPS"}),"application/json");
      actionBody.actor = USERNAME;
      const payload = JSON.stringify(actionBody);
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(16).toString("hex");
      const signature = crypto.createHmac("sha256",bridgeSecret).update(timestamp+"."+nonce+"."+payload).digest("hex");
      const response = await fetch(target,{method:"POST",headers:{"content-type":"application/json","x-p2d-admin-timestamp":timestamp,"x-p2d-admin-nonce":nonce,"x-p2d-admin-signature":signature},body:payload,signal:AbortSignal.timeout(10_000)});
      const responseText = await response.text();
      let responseBody;
      try { responseBody = JSON.parse(responseText); } catch { responseBody = {error:"Application bridge returned an invalid response"}; }
      return send(res,response.status,JSON.stringify(responseBody),"application/json");
    }
    if (req.method === "GET" && url.pathname === "/") return send(res,200,dashboard.replaceAll('action="/logout"', 'action="/admin-access/logout"').replaceAll("fetch('/api/", "fetch('/admin-access/api/").replaceAll('fetch("/api/', 'fetch("/admin-access/api/'));
    if (req.method === "GET" && url.pathname === "/api/qa-campaigns") {
      const [campaigns, steps] = await Promise.all([
        prisma.$queryRawUnsafe('SELECT id,name,country_code AS "countryCode",scenario,total_campaign_tests AS "totalTests",account_count AS "accountCount",concurrency,suites,execution_mode AS "executionMode",status,created_at AS "createdAt" FROM qa_test_campaigns ORDER BY created_at DESC LIMIT 100'),
        prisma.$queryRawUnsafe('SELECT s.id,s.campaign_id AS "campaignId",c.name AS "campaignName",s.suite,s.status,s.test_iterations AS "testIterations",s.account_count AS "accountCount",s.concurrency,s.run_id AS "runId",r.successful_checks AS passed,r.failed_checks AS failed,r.duration_ms AS "durationMs",r.summary->>\'p50Ms\' AS "p50Ms",r.summary->>\'p95Ms\' AS "p95Ms" FROM qa_test_campaign_steps s JOIN qa_test_campaigns c ON c.id=s.campaign_id LEFT JOIN qa_test_runs r ON r.id=s.run_id ORDER BY s.campaign_id,s.ordinal LIMIT 1000')
      ]);
      return send(res,200,JSON.stringify({campaigns,steps},(_k,v)=>typeof v==="bigint"?Number(v):v),"application/json");
    }
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
