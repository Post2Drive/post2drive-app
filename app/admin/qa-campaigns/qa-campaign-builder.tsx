"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Variation = { id: string; name: string; description: string; overrides: Record<string, string> };
type Campaign = { id: string; name: string; targetEnvironment: string; countryCode: string; scenario: string; totalCampaignTests: number; testsPerVariation: number; accountCount: number; concurrency: number; suites: string[]; variations: Variation[]; executionMode: string; status: string; createdAt: string };
const countries = [["IN","India"],["GB","United Kingdom"],["US","United States"],["CA","Canada"],["AU","Australia"],["DE","Germany"],["FR","France"],["NL","Netherlands"],["IE","Ireland"],["NZ","New Zealand"],["CH","Switzerland"],["TR","Türkiye"]];
const suiteOptions = [["provisioning","Synthetic account provisioning"],["api","API load"],["workflow","Workflow E2E"],["regression","Regression"],["localization","Country localization"],["failure","Failure handling"]];
const panel: React.CSSProperties = { border: "1px solid #dfe5eb", borderRadius: 12, padding: 18, marginTop: 16, background: "#fff" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 10px", background: "#fff", color: "#101828" };
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 650, marginBottom: 6 };
const button: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 12px", cursor: "pointer", background: "#fff", color: "#101828", fontWeight: 600 };
function defaultVariation(i: number): Variation { return { id: "variation-" + (i + 1) + "-" + Math.random().toString(36).slice(2, 7), name: "Variation " + (i + 1), description: "", overrides: {} }; }
function date(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }

export default function QaCampaignBuilder() {
  const [name,setName] = useState("India demand stress test");
  const [countryCode,setCountryCode] = useState("IN");
  const [scenario,setScenario] = useState("Demand stress test");
  const [totalCampaignTests,setTotalCampaignTests] = useState(10000);
  const [testsPerVariation,setTestsPerVariation] = useState(1000);
  const [accountCount,setAccountCount] = useState(10000);
  const [concurrency,setConcurrency] = useState(100);
  const [suites,setSuites] = useState<string[]>(["provisioning","api","workflow","regression","localization","failure"]);
  const [variations,setVariations] = useState<Variation[]>([defaultVariation(0),defaultVariation(1),defaultVariation(2)]);
  const [campaigns,setCampaigns] = useState<Campaign[]>([]);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const allocated = variations.length * testsPerVariation;
  const remaining = totalCampaignTests - allocated;
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/qa-campaigns",{cache:"no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load campaign history.");
      setCampaigns(payload.campaigns || []);
      setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load campaign history."); }
  },[]);
  useEffect(()=>{ void load(); },[load]);
  const valid = useMemo(()=>name.trim() && scenario.trim() && suites.length>0 && variations.length>0 && allocated<=totalCampaignTests && totalCampaignTests<=25000 && testsPerVariation>=1 && accountCount>=1 && concurrency>=1,[name,scenario,suites,variations,allocated,totalCampaignTests,testsPerVariation,accountCount,concurrency]);
  function updateVariation(index: number, patch: Partial<Variation>) { setVariations(old=>old.map((v,i)=>i===index?{...v,...patch}:v)); }
  function toggleSuite(key: string) { setSuites(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key]); }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/qa-campaigns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,countryCode,scenario,totalCampaignTests,testsPerVariation,accountCount,concurrency,suites,variations})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save campaign draft.");
      setNotice("Campaign draft saved ("+payload.id+"). Execution remains disabled; no QA run was queued.");
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not save campaign draft."); }
    finally { setBusy(false); }
  }
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
      <p style={{fontSize:13,color:"#667085",lineHeight:1.5,marginTop:0}}>These are separate planning values, not claims about concurrent users. Current campaign saving is preview-only; runner execution has not been enabled for these controls.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
        <div><label style={label}>Total campaign tests</label><input type="number" min="1" max="25000" style={field} value={totalCampaignTests} onChange={e=>setTotalCampaignTests(Number(e.target.value))}/></div>
        <div><label style={label}>Tests per variation</label><input type="number" min="1" max="25000" style={field} value={testsPerVariation} onChange={e=>setTestsPerVariation(Number(e.target.value))}/></div>
        <div><label style={label}>Synthetic account count</label><input type="number" min="1" max="10000" style={field} value={accountCount} onChange={e=>setAccountCount(Number(e.target.value))}/></div>
        <div><label style={label}>Concurrency target</label><input type="number" min="1" max="100" style={field} value={concurrency} onChange={e=>setConcurrency(Number(e.target.value))}/></div>
      </div>
      <div style={{marginTop:14,padding:12,borderRadius:8,background:remaining<0?"#fff1f2":"#f8fafc",fontSize:14}}>
        <strong>Plan allocation:</strong> {variations.length} variations × {testsPerVariation.toLocaleString()} tests = {allocated.toLocaleString()} allocated; {Math.max(0,remaining).toLocaleString()} unallocated of {totalCampaignTests.toLocaleString()} total.
        {remaining<0?<p style={{color:"#b42318",marginBottom:0}}>Reduce tests per variation or increase total campaign tests.</p>:null}
      </div>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 12px",fontSize:20}}>3 · Test suites</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10}}>{suiteOptions.map(([key,title])=><label key={key} style={{display:"flex",alignItems:"center",gap:9,padding:10,border:"1px solid #e4e7ec",borderRadius:8,fontSize:14}}><input type="checkbox" checked={suites.includes(key)} onChange={()=>toggleSuite(key)}/>{title}</label>)}</div>
    </section>
    <section style={panel}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:"0 0 5px",fontSize:20}}>4 · Variations</h2><p style={{margin:0,fontSize:13,color:"#667085"}}>Name each variation and describe its controlled difference. Up to 20 are supported.</p></div><button type="button" style={button} disabled={variations.length>=20} onClick={()=>setVariations(old=>[...old,defaultVariation(old.length)])}>+ Add variation</button></div>
      <div style={{display:"grid",gap:12,marginTop:14}}>{variations.map((v,i)=><div key={v.id} style={{border:"1px solid #dfe5eb",borderRadius:10,padding:14}}>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><strong style={{minWidth:90}}>Variation {i+1}</strong><input aria-label={"Variation "+(i+1)+" name"} style={{...field,flex:"1 1 200px"}} value={v.name} maxLength={80} onChange={e=>updateVariation(i,{name:e.target.value})}/><button type="button" style={button} disabled={variations.length<=1} onClick={()=>setVariations(old=>old.filter((_,j)=>i!==j))}>Remove</button></div>
        <textarea aria-label={"Variation "+(i+1)+" description"} style={{...field,marginTop:10,minHeight:68,resize:"vertical"}} placeholder="What changes in this variation?" value={v.description} maxLength={240} onChange={e=>updateVariation(i,{description:e.target.value})}/>
      </div>)}</div>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 8px",fontSize:20}}>5 · Review & save</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>{[["Market",countryCode],["Total tests",totalCampaignTests.toLocaleString()],["Per variation",testsPerVariation.toLocaleString()],["Accounts",accountCount.toLocaleString()],["Concurrency",String(concurrency)],["Suites",String(suites.length)]].map(([k,v])=><div key={k} style={{padding:12,border:"1px solid #e4e7ec",borderRadius:8}}><div style={{fontSize:12,color:"#667085"}}>{k}</div><strong>{v}</strong></div>)}</div>
      <p style={{fontSize:13,color:"#667085",lineHeight:1.6}}>Mode: <strong>preview_only</strong>. Save stores a durable draft only. Run queueing, account creation, and load generation are intentionally disabled until runner configuration and safety limits are implemented and reviewed.</p>
      {error?<p role="alert" style={{color:"#b42318"}}>{error}</p>:null}{notice?<p role="status" style={{color:"#067647"}}>{notice}</p>:null}
      <button type="button" style={{...button,background:"#175cd3",borderColor:"#175cd3",color:"#fff",opacity:(!valid||busy)?0.55:1}} disabled={!valid||busy} onClick={()=>void save()}>{busy?"Saving…":"Save campaign draft"}</button>
    </section>
    <section style={panel}>
      <h2 style={{margin:"0 0 12px",fontSize:20}}>Campaign history</h2>
      <p style={{fontSize:13,color:"#667085"}}>Saved plans only. Execution results and run-level performance will appear here after campaign-to-run orchestration is implemented; historical QA run/event rows remain untouched.</p>
      {campaigns.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Created","Campaign","Market","Scenario","Total tests","Tests / variation","Accounts","Concurrency","Status"].map(x=><th key={x} style={{padding:"9px",borderBottom:"1px solid #dfe5eb",whiteSpace:"nowrap"}}>{x}</th>)}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id}>{[date(c.createdAt),c.name,c.countryCode,c.scenario,Number(c.totalCampaignTests).toLocaleString(),Number(c.testsPerVariation).toLocaleString(),Number(c.accountCount).toLocaleString(),c.concurrency,c.status].map((v,i)=><td key={i} style={{padding:"9px",borderBottom:"1px solid #e4e7ec"}}>{String(v)}</td>)}</tr>)}</tbody></table></div>:<p style={{fontSize:13,color:"#667085"}}>No saved campaign plans yet.</p>}
    </section>
  </div>;
}
