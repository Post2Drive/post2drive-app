"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Campaign = { id: string; name: string; targetEnvironment: string; countryCode: string; scenario: string; totalCampaignTests: number; accountCount: number; concurrency: number; suites: string[]; executionMode: string; status: string; createdAt: string };
type QaRun = { id: string; status: string; targetAccounts: number; createdAccounts: number; successfulChecks: number; failedChecks: number; durationMs: number | null; startedAt: string; finishedAt: string | null; countryCode: string | null; testType: string | null; loadRequestCount: number | null };
type QaStep = { id: string; campaignId: string; ordinal: number; variationId: string | null; variationName: string | null; suite: string; testType: string; testIterations: number; accountCount: number; concurrency: number; status: string; runId: string | null; startedAt: string | null; finishedAt: string | null; successfulChecks: number | null; failedChecks: number | null; durationMs: number | null; loadRequestCount: string | number | null; routeMatrixExecuted: string | number | null; p50Ms: string | number | null; p95Ms: string | number | null; eventCount: string | number | null };
const countries = [["IN","India"],["GB","United Kingdom"],["US","United States"],["CA","Canada"],["AU","Australia"],["DE","Germany"],["FR","France"],["NL","Netherlands"],["IE","Ireland"],["NZ","New Zealand"],["CH","Switzerland"],["TR","Türkiye"]];
const suiteOptions = [["provisioning","Synthetic account provisioning"],["api","API load"],["workflow","Workflow E2E"],["regression","Regression"],["localization","Country localization"],["failure","Failure handling"]];
const panel: CSSProperties = { border: "1px solid #dfe5eb", borderRadius: 12, padding: 18, marginTop: 16, background: "#fff" };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 10px", background: "#fff", color: "#101828" };
const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 650, marginBottom: 6 };
const button: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 12px", cursor: "pointer", background: "#fff", color: "#101828", fontWeight: 600 };
function date(value: string | null) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function num(value: string | number | null | undefined) { return value === null || value === undefined || value === "" ? null : Number(value); }
function fmtMs(value: string | number | null | undefined) { const n = num(value); return n === null || !Number.isFinite(n) ? "—" : n >= 1000 ? (n / 1000).toFixed(2) + " s" : n + " ms"; }

export default function QaCampaignBuilder() {
  const [name,setName] = useState("India API load check");
  const [countryCode,setCountryCode] = useState("IN");
  const [scenario,setScenario] = useState("Authenticated API load");
  const [totalCampaignTests,setTotalCampaignTests] = useState(1000);
  const [accountCount,setAccountCount] = useState(1000);
  const [concurrency,setConcurrency] = useState(10);
  const [suites,setSuites] = useState<string[]>(["api"]);
  const [campaigns,setCampaigns] = useState<Campaign[]>([]);
  const [runs,setRuns] = useState<QaRun[]>([]);
  const [steps,setSteps] = useState<QaStep[]>([]);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [reviewStartId,setReviewStartId] = useState<string | null>(null);
  const [startConfirmed,setStartConfirmed] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/qa-campaigns",{cache:"no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load campaign history.");
      setCampaigns(payload.campaigns || []);
      setRuns(payload.runs || []);
      setSteps(payload.steps || []);
      setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load campaign history."); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  const valid = useMemo(()=>Boolean(name.trim() && scenario.trim() && suites.length>0 && Number.isInteger(totalCampaignTests) && totalCampaignTests>=1 && totalCampaignTests<=25000 && Number.isInteger(accountCount) && accountCount>=500 && accountCount<=10000 && Number.isInteger(concurrency) && concurrency>=1 && concurrency<=100),[name,scenario,suites,totalCampaignTests,accountCount,concurrency]);
  function toggleSuite(key: string) { setSuites(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key]); }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/qa-campaigns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,countryCode,scenario,totalCampaignTests,testsPerVariation:totalCampaignTests,accountCount,concurrency,suites,variations:[{id:"variation-1",name:"Standard run",description:"",overrides:{}}]})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save campaign draft.");
      setNotice("Campaign draft saved ("+payload.id+"). Saving does not queue a QA run.");
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not save campaign draft."); }
    finally { setBusy(false); }
  }
  async function start(campaignId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/qa-campaigns/"+encodeURIComponent(campaignId)+"/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({target:"staging",confirm:"RUN_QA_CAMPAIGN_ON_STAGING"})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not queue campaign.");
      setNotice("Campaign queued for staging. First run: "+payload.runId+". Planned sequential steps: "+payload.plannedSteps+".");
      setReviewStartId(null); setStartConfirmed(false);
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not start campaign."); }
    finally { setBusy(false); }
  }
  const campaignById = new Map(campaigns.map(c=>[c.id,c]));
  return <div>
    <section style={panel}>
      <h2 style={{margin:"0 0 14px",fontSize:20}}>1 · Scenario profile</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
        <div><label style={label}>Campaign name</label><input style={field} value={name} maxLength={120} onChange={e=>setName(e.target.value)} /></div>
        <div><label style={label}>Target environment</label><input style={{...field,background:"#f8fafc"}} value="Staging only" readOnly /></div>
        <div><label style={label}>Country / market</label><select style={field} value={countryCode} onChange={e=>setCountryCode(e.target.value)}>{countries.map(([code,title])=><option key={code} value={code}>{title} ({code})</option>)}</select></div>
        <div><label style={label}>Scenario</label><select style={field} value={scenario} onChange={e=>setScenario(e.target.value)}>{["Demand stress test","Signup / provisioning","Authenticated API load","Workflow E2E","Regression","Country localization","Failure recovery"].map(x=><option key={x}>{x}</option>)}</select></div>
      </div>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 8px",fontSize:20}}>2 · Execution volume</h2>
      <p style={{fontSize:13,color:"#667085",lineHeight:1.5,marginTop:0}}>Choose how much to test. The selected test count runs once with these settings. More suites can mean more requests. Use 10,000 accounts for Workflow E2E, Regression, Country localization or Failure handling. Runs are queued one at a time.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
        <div><label style={label}>Total test count</label><input type="number" min="1" max="25000" style={field} value={totalCampaignTests} onChange={e=>setTotalCampaignTests(Number(e.target.value))}/></div>
        <div><label style={label}>Test accounts</label><input type="number" min="500" max="10000" style={field} value={accountCount} onChange={e=>setAccountCount(Number(e.target.value))}/></div>
        <div><label style={label}>Parallel requests (concurrency)</label><input type="number" min="1" max="100" style={field} value={concurrency} onChange={e=>setConcurrency(Number(e.target.value))}/></div>
      </div>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 12px",fontSize:20}}>3 · Test suites</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10}}>{suiteOptions.map(([key,title])=><label key={key} style={{display:"flex",alignItems:"center",gap:9,padding:10,border:"1px solid #e4e7ec",borderRadius:8,fontSize:14}}><input type="checkbox" checked={suites.includes(key)} onChange={()=>toggleSuite(key)}/>{title}</label>)}</div>
      {suites.includes("provisioning")?<p style={{fontSize:13,color:"#667085"}}>Provisioning creates one shared synthetic account pool for the campaign. Other suites then reuse that pool; provisioning runs once per campaign.</p>:null}
      {suites.some(s=>["regression","localization","failure"].includes(s))?<p style={{fontSize:13,color:"#8a4b08"}}>Coverage note: regression, localization and failure profiles currently dispatch the existing broad Workflow E2E runner. Their labels are retained in reports, but they are not yet isolated test-only suites.</p>:null}
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 8px",fontSize:20}}>4 · Review & save</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>{[["Market",countryCode],["Total tests",totalCampaignTests.toLocaleString()],["Accounts",accountCount.toLocaleString()],["Concurrency",String(concurrency)],["Suites",String(suites.length)]].map(([k,v])=><div key={k} style={{padding:12,border:"1px solid #e4e7ec",borderRadius:8}}><div style={{fontSize:12,color:"#667085"}}>{k}</div><strong>{v}</strong></div>)}</div>
      <p style={{fontSize:13,color:"#667085",lineHeight:1.6}}>Saving only stores this plan. It does not start tests or create accounts. Starting it is a separate action that asks you to confirm staging; results are added to QA history and synthetic data is not automatically deleted.</p>
      {error?<p role="alert" style={{color:"#b42318"}}>{error}</p>:null}{notice?<p role="status" style={{color:"#067647"}}>{notice}</p>:null}
      <button type="button" style={{...button,background:"#175cd3",borderColor:"#175cd3",color:"#fff",opacity:(!valid||busy)?0.55:1}} disabled={!valid||busy} onClick={()=>void save()}>{busy?"Saving…":"Save campaign draft"}</button>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 12px",fontSize:20}}>Campaign history & execution</h2>
      {campaigns.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Created","Campaign","Market","Scenario","Total tests","Accounts","Concurrency","Status","Action"].map(x=><th key={x} style={{padding:"9px",borderBottom:"1px solid #dfe5eb",whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id}>{[date(c.createdAt),c.name,c.countryCode,c.scenario,Number(c.totalCampaignTests).toLocaleString(),Number(c.accountCount).toLocaleString(),c.concurrency,c.status].map((v,i)=><td key={i} style={{padding:"9px",borderBottom:"1px solid #e4e7ec"}}>{String(v)}</td>)}<td style={{padding:"9px",borderBottom:"1px solid #e4e7ec",whiteSpace:"nowrap"}}>{c.status==="draft"?<button type="button" style={button} disabled={busy} onClick={()=>{setReviewStartId(c.id);setStartConfirmed(false);setError("");setNotice("");}}>Review start</button>:<span>{c.executionMode==="staging_sequential"?"Sequential run":"—"}</span>}</td></tr>)}</tbody></table></div>:<p style={{fontSize:13,color:"#667085"}}>No saved campaign plans yet.</p>}
      {reviewStartId && campaignById.has(reviewStartId)?<div style={{border:"1px solid #fdb022",borderRadius:10,padding:14,marginTop:14,background:"#fffaeb"}}>
        <h3 style={{margin:"0 0 8px",fontSize:17}}>Confirm staging execution</h3>
        <p style={{fontSize:13,lineHeight:1.6}}>You are about to queue <strong>{campaignById.get(reviewStartId)?.name}</strong> on staging. It will run sequentially, can create synthetic accounts and synthetic marketplace records, and will retain its QA history. This action does not clean up data automatically.</p>
        <label style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:13,marginBottom:12}}><input type="checkbox" checked={startConfirmed} onChange={e=>setStartConfirmed(e.target.checked)}/>I confirm this campaign should execute against staging and its synthetic data may be retained for review.</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" style={{...button,background:"#b42318",borderColor:"#b42318",color:"#fff"}} disabled={!startConfirmed||busy} onClick={()=>void start(reviewStartId)}>{busy?"Queueing…":"Confirm & queue campaign"}</button><button type="button" style={button} onClick={()=>{setReviewStartId(null);setStartConfirmed(false);}}>Cancel</button></div>
      </div>:null}
      <h3 style={{margin:"22px 0 8px",fontSize:17}}>Measured execution results</h3>
      <p style={{fontSize:13,color:"#667085"}}>Latency and check counts below come from persisted worker results. Empty fields mean no run evidence is available yet; configured targets are shown separately.</p>
      {steps.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Campaign","Suite","Status","Iterations","Concurrency","Load requests","Route checks","Checks passed","Checks failed","P50","P95","Duration","Run ID"].map(x=><th key={x} style={{padding:"9px",borderBottom:"1px solid #dfe5eb",whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead><tbody>{steps.map(s=><tr key={s.id}>{[campaignById.get(s.campaignId)?.name||s.campaignId,s.suite,s.status,s.testIterations,s.concurrency,num(s.loadRequestCount)??"—",num(s.routeMatrixExecuted)??"—",s.successfulChecks??"—",s.failedChecks??"—",fmtMs(s.p50Ms),fmtMs(s.p95Ms),s.durationMs==null?"—":fmtMs(s.durationMs),s.runId||"—"].map((v,i)=><td key={i} style={{padding:"9px",borderBottom:"1px solid #e4e7ec",color:i===8&&Number(s.failedChecks)>0?"#b42318":"inherit",whiteSpace:"nowrap"}}>{String(v)}</td>)}</tr>)}</tbody></table></div>:<p style={{fontSize:13,color:"#667085"}}>No campaign execution steps have been recorded.</p>}
      <h3 style={{margin:"22px 0 8px",fontSize:17}}>Recent QA runs (existing execution evidence)</h3>
      <p style={{fontSize:13,color:"#667085"}}>Legacy runs are shown separately and are not attributed to a campaign. Existing QA event and account records are retained.</p>
      {runs.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Started","Run ID","Market","Test type","Status","Target accounts","Created","Checks passed","Checks failed","Load requests","Duration"].map(x=><th key={x} style={{padding:"9px",borderBottom:"1px solid #dfe5eb",whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead><tbody>{runs.map(r=><tr key={r.id}>{[date(r.startedAt),r.id,r.countryCode||"—",r.testType||"—",r.status,Number(r.targetAccounts).toLocaleString(),Number(r.createdAccounts).toLocaleString(),Number(r.successfulChecks).toLocaleString(),Number(r.failedChecks).toLocaleString(),r.loadRequestCount==null?"—":Number(r.loadRequestCount).toLocaleString(),r.durationMs==null?"—":fmtMs(r.durationMs)].map((v,i)=><td key={i} style={{padding:"9px",borderBottom:"1px solid #e4e7ec",color:i===8&&Number(r.failedChecks)>0?"#b42318":"inherit",whiteSpace:"nowrap"}}>{String(v)}</td>)}</tr>)}</tbody></table></div>:<p style={{fontSize:13,color:"#667085"}}>No QA runs have been recorded.</p>}
    </section>
  </div>;
}
