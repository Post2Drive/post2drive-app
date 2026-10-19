"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type Row = Record<string, any>;
type Data = {
  generatedAt: string; windowDays: number; overview: Record<string, number>;
  accountTypes: Row[]; verificationStatuses: Row[]; subscriptionStatuses: Row[];
  jobStatuses: Row[]; jobPriceModes: Row[]; usageEvents: Row[]; jobActivity: Row[];
  vehicleSummary: Row; ratingSummary: Row; jobPaymentSummary: Row; subscriptionPayments: Row[];
  endpointPerformance: Row[]; recentFailures: Row[]; accountGrowth: Row[]; apiHourly: Row[];
  qaRuns: Row[]; latestQaFailures: Row[]; busiestAccounts: Row[];
};
const palette = { border: "var(--color-border, #dfe5eb)", muted: "var(--color-muted, #667085)", surface: "var(--color-surface, #fff)" };
const card: CSSProperties = { border: "1px solid "+palette.border, borderRadius: 12, padding: 16, minWidth: 0, background: palette.surface };
const numberFormat = new Intl.NumberFormat("en-GB");
function num(value: unknown) { return numberFormat.format(Number(value ?? 0)); }
function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-GB", { dateStyle:"medium", timeStyle:"short" });
}
function duration(value: unknown) { const n=Number(value ?? 0); return n>=1000?(n/1000).toFixed(2)+" s":Math.round(n)+" ms"; }
function Section({ title, subtitle, children, collapsible=false, defaultOpen=true }: { title:string; subtitle?:string; children:ReactNode; collapsible?:boolean; defaultOpen?:boolean }) {
  if (collapsible) {
    return <details open={defaultOpen} style={{ ...card, marginBottom:16 }}>
      <summary style={{ fontSize:18, fontWeight:700, cursor:"pointer", marginBottom:subtitle?4:12 }}>{title}</summary>
      {subtitle?<p style={{ color:palette.muted, fontSize:13, margin:"0 0 12px" }}>{subtitle}</p>:null}
      {children}
    </details>;
  }
  return <section style={{ ...card, marginBottom:16 }}><h2 style={{ fontSize:18, margin:"0 0 4px" }}>{title}</h2>{subtitle?<p style={{ color:palette.muted, fontSize:13, margin:"0 0 12px" }}>{subtitle}</p>:null}{children}</section>;
}
function Table({ rows, columns, empty="No data collected yet." }: { rows:Row[]; columns:{key:string;label:string;render?:(v:any,row:Row)=>React.ReactNode}[]; empty?:string }) {
  if (!rows?.length) return <p style={{ color:palette.muted, fontSize:13 }}>{empty}</p>;
  return <div style={{ overflowX:"auto", width:"100%" }}><table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, textAlign:"left" }}><thead><tr>{columns.map(c=><th key={c.key} style={{ padding:"9px 10px", borderBottom:"1px solid "+palette.border, whiteSpace:"nowrap" }}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id ?? row.route ?? row.label ?? row.hour ?? row.day ?? row.action ?? i)}>{columns.map(c=><td key={c.key} style={{ padding:"9px 10px", borderBottom:"1px solid "+palette.border, verticalAlign:"top" }}>{c.render?c.render(row[c.key],row):String(row[c.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
function Distribution({ rows }: { rows:Row[] }) {
  const total=rows.reduce((n,r)=>n+Number(r.count||0),0);
  if (!rows.length) return <p style={{ color:palette.muted,fontSize:13 }}>No records yet.</p>;
  return <div style={{ display:"grid", gap:12 }}>{rows.map((r,i)=>{
    const pct=total?Math.round(Number(r.count||0)/total*100):0;
    return <div key={String(r.label??i)}><div style={{ display:"flex", justifyContent:"space-between", gap:12, fontSize:13, marginBottom:5 }}><span>{String(r.label??"Unknown").replaceAll("_"," ")}</span><strong>{num(r.count)} <span style={{ color:palette.muted,fontWeight:400 }}>({pct}%)</span></strong></div><div style={{ height:7, background:"var(--ops-border)", borderRadius:99, overflow:"hidden" }}><div style={{ width:pct+"%", height:"100%", background:"var(--ops-blue)", borderRadius:99 }} /></div></div>;
  })}</div>;
}
function PieChart({ rows, title }: { rows:Row[]; title:string }) {
  const colors=["#3778c2","#16a34a","#f59e0b","#9333ea","#0891b2","#dc2626","#64748b","#db2777"];
  const total=rows.reduce((n,r)=>n+Number(r.count||0),0);
  let cursor=0;
  const stops=rows.map((r,i)=>{const value=total?Number(r.count||0)/total*100:0;const start=cursor;cursor+=value;return colors[i%colors.length]+" "+start+"% "+cursor+"%";});
  if(!rows.length||total===0)return <p style={{color:palette.muted,fontSize:13}}>No distribution data available.</p>;
  return <div style={{display:"grid",gridTemplateColumns:"minmax(110px,0.8fr) minmax(130px,1.2fr)",gap:14,alignItems:"center"}}>
    <div role="img" aria-label={title+" distribution"} style={{width:"100%",maxWidth:170,aspectRatio:"1",borderRadius:"50%",background:"conic-gradient("+stops.join(",")+")",position:"relative",margin:"auto"}}>
      <div style={{position:"absolute",inset:"25%",borderRadius:"50%",background:palette.surface,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",textAlign:"center"}}>
        <strong style={{fontSize:18,fontVariantNumeric:"tabular-nums"}}>{num(total)}</strong><span style={{fontSize:10,color:palette.muted}}>total</span>
      </div>
    </div>
    <div style={{display:"grid",gap:8}}>{rows.map((r,i)=>{const count=Number(r.count||0);return <div key={String(r.label??i)} style={{display:"grid",gridTemplateColumns:"10px minmax(0,1fr) auto",gap:7,alignItems:"center",fontSize:12}}>
      <span style={{width:9,height:9,borderRadius:2,background:colors[i%colors.length]}}/><span style={{overflowWrap:"anywhere"}}>{String(r.label??"Unknown").replaceAll("_"," ")}</span><strong>{num(count)} <span style={{fontWeight:400,color:palette.muted}}>({Math.round(count/total*100)}%)</span></strong>
    </div>})}</div>
  </div>;
}
function TrendBars({ rows, labelKey, valueKey, valueLabel }: { rows:Row[]; labelKey:string; valueKey:string; valueLabel:string }) {
  const values=rows.map(r=>Number(r[valueKey]||0));
  const max=Math.max(1,...values);
  if(!rows.length)return <p style={{color:palette.muted,fontSize:13}}>No trend data collected yet.</p>;
  return <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(rows.length,12)+",minmax(0,1fr))",gap:5,alignItems:"end",minHeight:130}}>
    {rows.map((r,i)=>{const v=Number(r[valueKey]||0);const height=Math.max(v>0?4:1,Math.round(v/max*88));return <div key={String(r[labelKey]??i)} title={String(r[labelKey]??"")+": "+num(v)+" "+valueLabel} style={{display:"flex",height:130,flexDirection:"column",justifyContent:"end",alignItems:"stretch",gap:5,minWidth:0}}>
      <span style={{fontSize:10,textAlign:"center",color:palette.muted,overflow:"hidden"}}>{v?num(v):""}</span><div style={{height:height+"px",background:"var(--ops-blue)",borderRadius:"4px 4px 0 0",minHeight:1}}/><span style={{fontSize:10,textAlign:"center",color:palette.muted,overflow:"hidden",whiteSpace:"nowrap"}}>{String(r[labelKey]??"").slice(5,10)||String(i+1)}</span>
    </div>})}
  </div>;
}
function qaSummary(run:Row|undefined):Row {
  const raw=run?.summary;
  if(raw&&typeof raw==="object")return raw as Row;
  if(typeof raw==="string"){try{return JSON.parse(raw) as Row;}catch{return {};}}
  return {};
}
function MetricCard({ label, value, hint }: {label:string;value:unknown;hint?:string}) {
  const display=typeof value==="string" && value.trim()!=="" && !Number.isFinite(Number(value)) ? value : num(value);
  return <div style={{ ...card, padding:15 }}><div style={{ color:palette.muted, fontSize:12, marginBottom:8 }}>{label}</div><div style={{ fontSize:typeof display==="string" && display.length>14?18:27, lineHeight:1.15, fontWeight:750, fontVariantNumeric:"tabular-nums",overflowWrap:"anywhere" }}>{display}</div>{hint?<div style={{ color:palette.muted,fontSize:12,marginTop:6 }}>{hint}</div>:null}</div>;
}
export default function PerformanceDashboard() {
  const [days,setDays]=useState(7);
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [showAllQaRuns,setShowAllQaRuns]=useState(false);
  const [showAllQaFailures,setShowAllQaFailures]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/admin/performance?days="+days,{cache:"no-store"});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error||"Could not load dashboard.");
      setData(payload);
    } catch(e) {setError(e instanceof Error?e.message:"Could not load dashboard.");}
    finally {setLoading(false);}
  },[days]);
  useEffect(()=>{void load();},[load]);
  if(loading&&!data)return <p role="status">Loading performance metrics…</p>;
  if(error&&!data)return <div role="alert" style={{ ...card,borderColor:"var(--ops-amber)" }}><strong>Dashboard unavailable</strong><p>{error}</p><button onClick={()=>void load()}>Try again</button></div>;
  if(!data)return null;
  const o=data.overview||{};
  const latestRun=data.qaRuns?.[0];
  const qaStatusRows=Object.entries((data.qaRuns||[]).reduce<Record<string,number>>((counts,run)=>{
    const status=String(run.status||"unknown").toLowerCase();
    counts[status]=(counts[status]||0)+1;
    return counts;
  },{})).map(([label,count])=>({label,count}));
  const endpointColumns=[
    {key:"route",label:"API route"},
    {key:"method",label:"Method"},
    {key:"count",label:"Requests",render:(v:any)=>num(v)},
    {key:"avgMs",label:"Average",render:(v:any)=>duration(v)},
    {key:"p50Ms",label:"P50",render:(v:any)=>duration(v)},
    {key:"p95Ms",label:"P95",render:(v:any)=>duration(v)},
    {key:"maxMs",label:"Max",render:(v:any)=>duration(v)},
    {key:"serverErrors",label:"5xx",render:(v:any,row:Row)=><span style={{color:Number(v)>0?"var(--ops-red)":"inherit",fontWeight:Number(v)>0?700:400}}>{num(v)}</span>},
    {key:"clientErrors",label:"4xx",render:(v:any)=>num(v)},
  ];
  return <div>
    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",margin:"16px 0" }}>
      <div style={{ color:palette.muted,fontSize:12 }}>Last updated {date(data.generatedAt)} · {loading?"Refreshing…":"Live database snapshot"}</div>
      <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
        {[1,7,30].map(d=><button key={d} onClick={()=>setDays(d)} aria-pressed={days===d} style={{ border:"1px solid "+palette.border,borderRadius:8,padding:"8px 12px",background:days===d?"var(--ops-blue-soft)":"var(--ops-surface-raised)",color:"var(--ops-text)",fontWeight:days===d?700:500,cursor:"pointer" }}>{d===1?"24 hours":d+" days"}</button>)}
        <button onClick={()=>void load()} style={{ border:"1px solid "+palette.border,borderRadius:8,padding:"8px 12px",background:"var(--ops-surface-raised)",color:"var(--ops-text)",cursor:"pointer" }}>Refresh</button>
      </div>
    </div>
    {error?<p role="alert" style={{ color:"var(--ops-red)" }}>{error} — showing the last successfully loaded data.</p>:null}
    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:16 }}>
      <MetricCard label="Total accounts" value={o.totalAccounts} hint="Synthetic QA accounts excluded"/>
      <MetricCard label="Login users" value={o.totalUsers} hint="Registered user profiles"/>
      <MetricCard label="Active · 24 hours" value={o.active24h}/>
      <MetricCard label="Active · 7 days" value={o.active7d}/>
      <MetricCard label="New · 24 hours" value={o.new24h}/>
      <MetricCard label="New · 7 days" value={o.new7d}/>
      <MetricCard label="New · 30 days" value={o.new30d}/>
      <MetricCard label="Jobs posted · 7 days" value={o.jobs7d}/>
    </div>
    <Section title="Metric definitions and data quality" subtitle="Missing instrumentation is not equivalent to zero activity. Interpret each measure within its stated source and exclusions.">
      <Table rows={[
        {metric:"Real accounts / user activity",source:"Account and usage tables",rule:"QA accounts excluded by qa_test_accounts membership"},
        {metric:"API reliability and latency",source:"ApiRequestMetric",rule:"Only non-QA telemetry; route templates, status and duration, no request payloads"},
        {metric:"Payment records",source:"SubscriptionPayment / Job declarations",rule:"Recorded statuses and user declarations; not proof of provider-settled revenue"},
        {metric:"Vehicle compliance",source:"Vehicle document status and expiry dates",rule:"Operational records only; not independent authenticity verification"},
        {metric:"Country contract scenarios",source:"CI-generated country-matrix-report.json",rule:"Not yet ingested into dashboard history; contract suite remains a separate CI result"},
        {metric:"Route-matrix QA",source:"qa_test_runs and qa_test_events",rule:"Actual staging HTTP run results; verify completed status before treating as pass"}
      ]} columns={[{key:"metric",label:"Metric"},{key:"source",label:"Source"},{key:"rule",label:"Interpretation / limitation"}]}/>
    </Section>
    <Section title="API health and bottlenecks" subtitle="Backend response times recorded by this app release. P95 is the response time within which 95% of requests finished. Routes without data have not yet been instrumented or exercised.">
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10,marginBottom:16 }}>
        <MetricCard label="Instrumented routes" value={data.endpointPerformance.length}/>
        <MetricCard label="5xx errors · selected window" value={data.endpointPerformance.reduce((n,r)=>n+Number(r.serverErrors||0),0)}/>
        <MetricCard label="Requests · selected window" value={data.endpointPerformance.reduce((n,r)=>n+Number(r.count||0),0)}/>
      </div>
      <Table rows={data.endpointPerformance} columns={endpointColumns} empty="No API timings yet. Deploy the telemetry release and exercise the app."/>
    </Section>
    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:14 }}>
      <Section title="Account types"><Distribution rows={data.accountTypes}/></Section>
      <Section title="Verification status"><Distribution rows={data.verificationStatuses}/></Section>
      <Section title="Subscription status"><Distribution rows={data.subscriptionStatuses}/></Section>
      <Section title="Job status"><Distribution rows={data.jobStatuses}/></Section>
      <Section title="Fixed-price vs bidding jobs"><Distribution rows={data.jobPriceModes}/></Section>
      <Section title="Product activity events" subtitle={"Application-level usage events over the last " + days + " day(s)."}><Distribution rows={data.usageEvents}/></Section>
    </div>
    <Section title="Job activity and lifecycle" subtitle={"Action counts from the past "+days+" day(s). This helps show where loads are moving, cancelled or getting stuck."}>
      <Table rows={data.jobActivity} columns={[{key:"label",label:"Activity action",render:(v:any)=>String(v).replaceAll("_"," ")},{key:"count",label:"Events",render:(v:any)=>num(v)}]}/>
    </Section>
    <Section title="Live users with recorded job activity" subtitle={"Accounts with the most job activity in the past "+days+" day(s), excluding QA accounts."}>
      <Table rows={data.busiestAccounts} columns={[
        {key:"companyName",label:"Company / account"},
        {key:"type",label:"Account type"},
        {key:"activityCount",label:"Job actions",render:(v:any)=>num(v)},
        {key:"lastActivityAt",label:"Last activity",render:(v:any)=>date(v)},
        {key:"createdAt",label:"Registered",render:(v:any)=>date(v)}
      ]}/>
    </Section>
    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:14 }}>
      <Section title="Vehicle compliance snapshot" subtitle="Document-status counts are records, not an independent verification of document authenticity.">
        <Table rows={[data.vehicleSummary||{}]} columns={[
          {key:"total",label:"Vehicles",render:(v:any)=>num(v)},
          {key:"verified",label:"Verified",render:(v:any)=>num(v)},
          {key:"motExpired",label:"Vehicle inspection expired (all markets)",render:(v:any)=>num(v)},
          {key:"insuranceExpired",label:"Insurance expired",render:(v:any)=>num(v)},
          {key:"motExpiring30d",label:"Vehicle inspection due within 30 days (all markets)",render:(v:any)=>num(v)},
          {key:"insuranceExpiring30d",label:"Insurance ≤30d",render:(v:any)=>num(v)}
        ]}/>
      </Section>
      <Section title="Ratings and feedback">
        <Table rows={[data.ratingSummary||{}]} columns={[
          {key:"total",label:"Ratings",render:(v:any)=>num(v)},
          {key:"averageStars",label:"Average stars",render:(v:any)=>v==null?"—":Number(v).toFixed(2)},
          {key:"windowCount",label:"In selected period",render:(v:any)=>num(v)}
        ]}/>
      </Section>
      <Section title="Job payment declarations" subtitle="These are user-declared payment states only; the platform does not process money in this workflow.">
        <Table rows={[data.jobPaymentSummary||{}]} columns={[
          {key:"markedPaid",label:"Marked paid",render:(v:any)=>num(v)},
          {key:"receiptConfirmed",label:"Receipt confirmed",render:(v:any)=>num(v)},
          {key:"completedUnmarked",label:"Completed, not marked",render:(v:any)=>num(v)},
          {key:"paidAwaitingReceipt",label:"Awaiting receipt confirmation",render:(v:any)=>num(v)}
        ]}/>
      </Section>
      <Section title="Subscription payment records" subtitle="A pending record is not a successful charge.">
        <Table rows={data.subscriptionPayments} columns={[
          {key:"label",label:"Status"},
          {key:"currency",label:"Currency"},
          {key:"count",label:"Records",render:(v:any)=>num(v)},
          {key:"amountPence",label:"Record total",render:(v:any,row:Row)=>String(row.currency||"")+" "+(Number(v||0)/100).toFixed(2)}
        ]}/>
      </Section>
    </div>
    <Section title="Recent server errors" subtitle="Only HTTP 5xx failures are shown here; expected 4xx validation/permission responses are separate in the endpoint table.">
      <Table rows={data.recentFailures} columns={[
        {key:"createdAt",label:"When",render:(v:any)=>date(v)},
        {key:"method",label:"Method"},
        {key:"route",label:"Route"},
        {key:"statusCode",label:"Status"},
        {key:"durationMs",label:"Duration",render:(v:any)=>duration(v)}
      ]}/>
    </Section>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,380px),1fr))",gap:14}}>
      <Section title="Account registrations · daily trend" subtitle="Real accounts only; synthetic QA accounts excluded."><TrendBars rows={data.accountGrowth.slice(-12)} labelKey="day" valueKey="count" valueLabel="new accounts"/></Section>
      <Section title="API traffic · hourly trend" subtitle="Real-user telemetry only; QA-run requests are excluded."><TrendBars rows={data.apiHourly.slice(-12)} labelKey="hour" valueKey="total" valueLabel="requests"/></Section>
    </div>
    <Section title="Account registrations · 30 day trend">
      <Table rows={data.accountGrowth} columns={[
        {key:"day",label:"Day",render:(v:any)=>date(v)},
        {key:"count",label:"New accounts",render:(v:any)=>num(v)}
      ]}/>
    </Section>
    <Section title="API traffic · hourly, last 24 hours">
      <Table rows={data.apiHourly} columns={[
        {key:"hour",label:"Hour",render:(v:any)=>date(v)},
        {key:"total",label:"Requests",render:(v:any)=>num(v)},
        {key:"errors",label:"5xx errors",render:(v:any)=>num(v)}
      ]}/>
    </Section>
    {data.qaRuns?.length ? <Section title="Latest QA run · execution summary" subtitle="QA metrics are intentionally separate from real-user and commercial metrics.">
      {(() => { const run=data.qaRuns[0]; const s=qaSummary(run); return <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:14}}>
          <MetricCard label="Market" value={s.marketLabel||s.country||"Not recorded"} hint={s.currency||"Country contract metadata"}/>
          <MetricCard label="Synthetic accounts target" value={s.accountCount??run.targetAccounts??0} hint="Isolated QA dataset"/>
          <MetricCard label="Live HTTP requests target" value={s.routeMatrixTarget??0} hint="Actual API requests"/>
          <MetricCard label="Live HTTP requests executed" value={s.routeMatrixExecuted??0}/>
          <MetricCard label="P50 response time" value={s.p50Ms==null?"—":duration(s.p50Ms)}/>
          <MetricCard label="P95 response time" value={s.p95Ms==null?"—":duration(s.p95Ms)}/>
        </div>
        <p style={{fontSize:12,color:palette.muted,margin:"0 0 8px"}}>Cleanup: {s.syntheticDataRetained===false?"synthetic records removed":s.syntheticDataRetained===true?"synthetic records retained":"not reported"} · Endpoints exercised: {Array.isArray(s.endpoints)?s.endpoints.length:"not reported"} · Run ID: {String(run.id||"—")}</p>
        {s.persistedDataSummary&&typeof s.persistedDataSummary==="object"?<Table rows={Object.entries(s.persistedDataSummary).map(([label,value])=>({label,value}))} columns={[{key:"label",label:"Persisted data check"},{key:"value",label:"Result",render:(v:any)=>typeof v==="object"?JSON.stringify(v):String(v??"—")}]}/>:null}
      </div>})()}
    </Section> : null}
    <Section title="Synthetic QA runs" subtitle="Latest 100 stored runs, kept separate from business totals. Shows 15 by default; expand the table for up to 100. This section can also be collapsed." collapsible defaultOpen>
      <div style={{ ...card, marginBottom:14 }}>
        <h3 style={{fontSize:15,margin:"0 0 12px"}}>Run outcomes · latest {num(data.qaRuns.length)} runs</h3>
        <PieChart rows={qaStatusRows} title="QA run outcomes"/>
      </div>
      <Table rows={showAllQaRuns?data.qaRuns.slice(0,100):data.qaRuns.slice(0,15)} columns={[
        {key:"id",label:"Run ID",render:(v:any)=><span style={{fontFamily:"monospace",fontSize:11,overflowWrap:"anywhere"}}>{String(v??"—")}</span>},
        {key:"startedAt",label:"Started",render:(v:any)=>date(v)},
        {key:"country",label:"Country",render:(_:any,row:Row)=>{const s=qaSummary(row);return String(s.country||s.marketCode||s.marketLabel||"Not recorded");}},
        {key:"phase",label:"Phase",render:(_:any,row:Row)=>{const s=qaSummary(row);return String(s.phase||s.testStage||s.scenario||"Not recorded");}},
        {key:"status",label:"Run status"},
        {key:"targetAccounts",label:"Target users",render:(v:any)=>num(v)},
        {key:"createdAccounts",label:"Created",render:(v:any)=>num(v)},
        {key:"successfulChecks",label:"Passed",render:(v:any)=>num(v)},
        {key:"failedChecks",label:"Failed",render:(v:any)=><span style={{color:Number(v)>0?"var(--ops-red)":"inherit",fontWeight:700}}>{num(v)}</span>},
        {key:"durationMs",label:"Run time",render:(v:any)=>duration(v)}
      ]}/>
      {data.qaRuns.length>15?<div style={{marginTop:10}}><button type="button" onClick={()=>setShowAllQaRuns(v=>!v)} aria-expanded={showAllQaRuns} style={{border:"1px solid "+palette.border,borderRadius:8,padding:"8px 12px",background:"var(--ops-surface-raised)",color:"var(--ops-text)",cursor:"pointer"}}>{showAllQaRuns?"Show fewer (15)":"Show all "+data.qaRuns.length+" runs"}</button></div>:null}
      <h3 style={{fontSize:15,margin:"18px 0 8px"}}>Failure patterns across recent QA runs</h3>
      <Table rows={showAllQaFailures?data.latestQaFailures.slice(0,100):data.latestQaFailures.slice(0,15)} columns={[
        {key:"runId",label:"Run ID",render:(v:any)=><span style={{fontFamily:"monospace",fontSize:11,overflowWrap:"anywhere"}}>{String(v??"—")}</span>},
        {key:"country",label:"Country",render:(v:any)=>String(v??"Not recorded")},
        {key:"runStatus",label:"Run status"},
        {key:"scenario",label:"Scenario"},
        {key:"action",label:"Action"},
        {key:"path",label:"Route"},
        {key:"expected",label:"Expected",render:(v:any)=>Array.isArray(v)?v.join(", "):String(v??"—")},
        {key:"actual",label:"Actual"},
        {key:"count",label:"Count",render:(v:any)=>num(v)}
      ]}/>
      {data.latestQaFailures.length>15?<div style={{marginTop:10}}><button type="button" onClick={()=>setShowAllQaFailures(v=>!v)} aria-expanded={showAllQaFailures} style={{border:"1px solid "+palette.border,borderRadius:8,padding:"8px 12px",background:"var(--ops-surface-raised)",color:"var(--ops-text)",cursor:"pointer"}}>{showAllQaFailures?"Show fewer (15)":"Show all "+data.latestQaFailures.length+" failure groups"}</button></div>:null}
    </Section>
    <p style={{ color:palette.muted,fontSize:12,lineHeight:1.5 }}>Performance telemetry records method, route template, status and duration only. It intentionally omits emails, account IDs, full URLs, query strings, request bodies and passwords. Dashboard metrics are operational indicators, not a guarantee of production capacity; run controlled load tests before making capacity commitments.</p>
  </div>;
}
