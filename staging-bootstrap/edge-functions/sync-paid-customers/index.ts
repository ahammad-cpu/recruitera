// Edge function: sync-paid-customers (v10)
// v10 (2026-06-02): cold-start refresh to pick up newly-added BUBBLE_API_KEY /
//   BUBBLE_URL secrets. Behavior unchanged from v9 — still inert if either env
//   var is absent.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUBBLE_URL = Deno.env.get('BUBBLE_URL') ?? '';
const BUBBLE_KEY = Deno.env.get('BUBBLE_API_KEY') ?? '';
const DEFAULT_PAID_TYPE = 'Company';

const GENERIC_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','live.com','me.com','msn.com','aol.com','protonmail.com','ymail.com','googlemail.com','yahoo.co.uk','yahoo.com.eg','hotmail.co.uk']);
function extractDomain(email:string|null|undefined):string|null{if(!email||!email.includes('@'))return null;const d=email.split('@')[1]?.toLowerCase().trim();if(!d||GENERIC_DOMAINS.has(d))return null;return d;}
function isPaid(row:any):boolean{const p=String(row['Paid Status']||row.paid_status||row.Paid_Status||'').toLowerCase().trim();const a=String(row.Activation||row.activation||'').toLowerCase().trim();return p==='paid'&&a==='active';}
function parseSource(raw:any):string{if(!raw)return '';try{const p=JSON.parse(raw);if(Array.isArray(p))return p[0]||'';}catch{}return String(raw);}
function safeDate(d:any):string|null{if(!d)return null;try{return new Date(d).toISOString();}catch{return null;}}
function trialEndOf(c:any):string|null{return safeDate(c['Free Trial End Date']||c['--Free Trial End Date']||c.Free_Trial_End_Date||c.free_trial_end_date||c['Free Trial End']||c.FreeTrialEndDate||null);}
function statusFieldsOf(c:any){const paid=String(c['Paid Status']||c.Paid_Status||c.paid_status||'').trim()||null;const activation=String(c.Activation||c.activation||'').trim()||null;const te=trialEndOf(c);let trialStatus:string|null=null;if(te)trialStatus=(new Date(te).getTime()>=Date.now())?'Active':'Expired';return{paid_status:paid,activation_status:activation,trial_end_date:te,trial_status:trialStatus,has_trial:!!te};}
async function fetchAllBubble(type:string):Promise<any[]>{const all:any[]=[];let cursor=0;while(true){const url=`${BUBBLE_URL}/api/1.1/obj/${encodeURIComponent(type)}?cursor=${cursor}&limit=100`;const res=await fetch(url,{headers:{'Authorization':`Bearer ${BUBBLE_KEY}`}});if(!res.ok){const t=await res.text();throw new Error(`Bubble API ${res.status} for type '${type}': ${t.slice(0,300)}`);}const data=await res.json();const results=data.response?.results??[];const remaining=data.response?.remaining??0;all.push(...results);if(remaining===0||results.length===0)break;cursor+=results.length;}return all;}

Deno.serve(async(_req:Request)=>{
  // v10: include diagnostic so we can see which env var (if any) is missing,
  // without exposing values.
  if(!BUBBLE_KEY||!BUBBLE_URL){
    return new Response(JSON.stringify({
      status:'disabled',
      message:'Bubble sync is paused. Set BUBBLE_API_KEY + BUBBLE_URL secrets to re-enable.',
      env_status:{BUBBLE_URL: BUBBLE_URL?'set':'missing', BUBBLE_API_KEY: BUBBLE_KEY?'set':'missing'},
    }),{status:200,headers:{'Content-Type':'application/json'}});
  }
  const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try{
    const{data:cfgRow}=await supabase.from('sync_config').select('config, enabled').eq('source','bubble').single();
    if(cfgRow&&cfgRow.enabled===false){return new Response(JSON.stringify({status:'disabled',message:'sync_config.enabled is false'}),{headers:{'Content-Type':'application/json'}});}
    const paidType:string=cfgRow?.config?.paid_type||DEFAULT_PAID_TYPE;
    const allCompanies=await fetchAllBubble(paidType);
    const paidRows=allCompanies.filter(c=>isPaid(c)).map(c=>{const email=c.Contact_Email||c.contact_email||c.Email||c.email||'';const domain=extractDomain(email)||extractDomain(c.WP_Website||c.website||'')||null;return{bubble_id:c._id||c.id,company_name:c['Company Name']||c.company_name||c.Name||c.name||'Unknown',domain,email:email||null,plan:c.Plan||c.plan||null,activation:c.Activation||c.activation||'Active',status:c['Paid Status']||'Paid',is_active:true,raw_data:c,synced_at:new Date().toISOString(),bubble_created_at:safeDate(c['Created Date']||c.created_at),real_source:parseSource(c.Source||c.source)||null,am_mail:c['AM Mail']||c['AM_Mail']||null};});
    const inactiveRows=allCompanies.filter(c=>!isPaid(c)).map(c=>{const email=c.Contact_Email||c.contact_email||c.Email||c.email||'';const domain=extractDomain(email)||extractDomain(c.WP_Website||c.website||'')||null;return{bubble_id:c._id||c.id,company_name:c['Company Name']||c.company_name||c.Name||c.name||'Unknown',domain,email:email||null,plan:c.Plan||c.plan||null,activation:c.Activation||c.activation||null,status:c['Paid Status']||'Not Paid',is_active:false,raw_data:c,synced_at:new Date().toISOString()};});
    let upserted=0;const allRows=[...paidRows,...inactiveRows];
    for(let i=0;i<allRows.length;i+=100){const batch=allRows.slice(i,i+100);const{error}=await supabase.from('paid_customers').upsert(batch,{onConflict:'bubble_id',ignoreDuplicates:false});if(!error)upserted+=batch.length;}
    await supabase.from('accounts').update({is_paid_customer:false,paid_since:null}).eq('is_paid_customer',true);
    const paidDomains=[...new Set(paidRows.map(r=>r.domain).filter(Boolean))]as string[];
    const paidBubbleIds=new Set(paidRows.map(r=>r.bubble_id).filter(Boolean));
    let marked=0;
    if(paidDomains.length>0){const{data:m}=await supabase.from('accounts').select('id').in('domain',paidDomains);if(m?.length){const ids=m.map(r=>r.id);await supabase.from('accounts').update({is_paid_customer:true,paid_since:new Date().toISOString()}).in('id',ids);marked+=ids.length;}}
    if(paidBubbleIds.size>0){const{data:refMatches}=await supabase.from('accounts').select('id, raw_data').not('raw_data->>Company_Ref','is',null);if(refMatches?.length){const toMark=refMatches.filter(r=>paidBubbleIds.has(r.raw_data?.Company_Ref)).map(r=>r.id);if(toMark.length){await supabase.from('accounts').update({is_paid_customer:true,paid_since:new Date().toISOString()}).in('id',toMark);marked+=toMark.length;}}}
    const byRef:Record<string,ReturnType<typeof statusFieldsOf>>={};const byDomain:Record<string,ReturnType<typeof statusFieldsOf>>={};
    for(const c of allCompanies){const id=c._id||c.id;const f=statusFieldsOf(c);if(id)byRef[id]=f;const email=c.Contact_Email||c.contact_email||c.Email||c.email||'';const domain=extractDomain(email)||extractDomain(c.WP_Website||c.website||'');if(domain&&(!byDomain[domain]||f.trial_end_date||f.paid_status))byDomain[domain]=f;}
    let statusUpdated=0,offset=0;const pageSize=1000;
    while(true){const{data:accs,error:accErr}=await supabase.from('accounts').select('id, domain, raw_data').is('merged_into',null).range(offset,offset+pageSize-1);if(accErr||!accs||accs.length===0)break;for(const a of accs){const ref=a.raw_data?.Company_Ref||null;const f=(ref&&byRef[ref])||(a.domain&&byDomain[a.domain])||null;if(!f)continue;const upd:any={};if(f.trial_end_date!==null)upd.trial_end_date=f.trial_end_date;if(f.activation_status!==null)upd.activation_status=f.activation_status;if(f.paid_status!==null)upd.paid_status=f.paid_status;if(f.trial_status!==null)upd.trial_status=f.trial_status;if(f.has_trial)upd.has_trial=true;if(Object.keys(upd).length===0)continue;const{error:uErr}=await supabase.from('accounts').update(upd).eq('id',a.id);if(!uErr)statusUpdated++;}if(accs.length<pageSize)break;offset+=pageSize;}
    return new Response(JSON.stringify({status:'ok',total_fetched:allCompanies.length,paid_active_found:paidRows.length,upserted,accounts_marked:marked,status_synced:statusUpdated,ran_at:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}});
  }catch(err){return new Response(JSON.stringify({status:'error',message:String(err)}),{status:500,headers:{'Content-Type':'application/json'}});}
});
