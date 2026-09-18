import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Camera, KeyRound, Trash2, CheckCircle2, LogOut, QrCode, ShieldCheck, Ticket, UserPlus, Users, WalletCards, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAccounts, deleteAccount, listAccounts, resetAccountPassword, setAccountActive, updateOwnUsername } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard | Bole Digital Coupons" },
    { name: "description", content: "Manage weekly Bole meal coupons, QR redemptions, and audit reporting." },
    { property: "og:title", content: "Bole Digital Coupon Dashboard" },
    { property: "og:description", content: "Secure coupon balances, redemptions, and audit reporting." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Dashboard,
});

type Profile = { id:string; username:string; display_name:string; department:string|null; employee_number:string|null; must_change_password:boolean };
type Role = "super_admin"|"employee"|"cashier"|"auditor";
type Allocation = { id:string; week_start:string; approved_amount:number; remaining_balance:number; eligible:boolean; employee_id:string };
const amounts = [40,80,120,160,200];

function Dashboard() {
  const navigate = useNavigate();
  const [profile,setProfile]=useState<Profile|null>(null); const [role,setRole]=useState<Role|null>(null); const [allocation,setAllocation]=useState<Allocation|null>(null);
  const [redemptions,setRedemptions]=useState<any[]>([]); const [allocations,setAllocations]=useState<any[]>([]); const [logs,setLogs]=useState<any[]>([]); const [loading,setLoading]=useState(true);
  async function load(silent?:boolean){ if(!silent)setLoading(true); const {data:{user}}=await supabase.auth.getUser(); if(!user)return; const [{data:p},{data:r}]=await Promise.all([supabase.from("profiles").select("*").eq("id",user.id).single(),supabase.from("user_roles").select("role").eq("user_id",user.id).single()]); setProfile(p); const nextRole=r?.role as Role; setRole(nextRole);
    if(nextRole==="employee"){const {data}=await supabase.from("weekly_allocations").select("*").eq("employee_id",user.id).order("week_start",{ascending:false}).limit(1).maybeSingle();setAllocation(data)}
    if(nextRole==="auditor"||nextRole==="super_admin"){const [{data:a},{data:rd},{data:l}]=await Promise.all([supabase.from("weekly_allocations").select("*, profiles!weekly_allocations_employee_id_fkey(display_name, employee_number)").order("week_start",{ascending:false}).limit(100),supabase.from("redemptions").select("*, profiles!redemptions_employee_id_fkey(display_name)").order("redeemed_at",{ascending:false}).limit(50),supabase.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(50)]);setAllocations(a??[]);setRedemptions(rd??[]);setLogs(l??[])}
    setLoading(false);
  }
  useEffect(()=>{load()},[]);
  async function signOut(){await supabase.auth.signOut();await navigate({to:"/",replace:true})}
  if(loading)return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading your account…</div>;
  if(!profile||!role)return <div className="grid min-h-screen place-items-center">Account setup is incomplete.</div>;
  if(profile.must_change_password)return <PasswordReset profile={profile} onDone={()=>setProfile({...profile,must_change_password:false})}/>;
  return <div className="min-h-screen bg-background"><header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-3 font-extrabold"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><Ticket className="size-5"/></span>Bole Coupons</div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{profile.display_name}</p><p className="text-xs capitalize text-muted-foreground">{role.replace("_"," ")}</p></div><Button variant="outline" size="icon" onClick={signOut} title="Sign out"><LogOut/></Button></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="mb-8"><p className="text-sm font-semibold text-primary">{new Date().toLocaleDateString("en-ET",{weekday:"long",month:"long",day:"numeric"})}</p><h1 className="mt-1 text-3xl font-extrabold">{role==="employee"?"Your meal allowance":role==="cashier"?"Scan a meal coupon":role==="auditor"?"Financial oversight":"System administration"}</h1></div>
    {role==="employee"&&<EmployeeView allocation={allocation} onRefresh={()=>load(true)}/>} {role==="cashier"&&<CashierView/>} {role==="auditor"&&<AuditView allocations={allocations} redemptions={redemptions} logs={logs}/>} {role==="super_admin"&&<AdminView allocations={allocations} redemptions={redemptions} onRefresh={load}/>}</main></div>;
}

function PasswordReset({profile,onDone}:{profile:Profile;onDone:()=>void}){const [current,setCurrent]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");async function submit(e:React.FormEvent){e.preventDefault();setError("");const {error}=await supabase.auth.updateUser({password,current_password:current} as any);if(error){setError(error.message);return}await supabase.from("profiles").update({must_change_password:false}).eq("id",profile.id);onDone()};return <main className="grid min-h-screen place-items-center px-4"><form onSubmit={submit} className="w-full max-w-md border bg-card p-7 shadow-sm"><ShieldCheck className="mb-5 size-10 text-primary"/><h1 className="text-2xl font-extrabold">Secure your account</h1><p className="mt-2 text-sm text-muted-foreground">Change the temporary password before continuing.</p><label className="mt-6 block text-sm font-semibold">Temporary password<Input className="mt-2 h-11" type="password" value={current} onChange={e=>setCurrent(e.target.value)} required/></label><label className="mt-4 block text-sm font-semibold">New password<Input className="mt-2 h-11" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<p className="mt-4 text-sm text-destructive">{error}</p>}<Button className="mt-6 h-11 w-full">Set new password</Button></form></main>}

const isWeekend=()=>{const d=new Date().toLocaleDateString("en-US",{weekday:"short",timeZone:"Africa/Addis_Ababa"});return d==="Sat"||d==="Sun"};
function friendly(msg:string){
  if(/Monday through Friday|weekends/i.test(msg))return "Coupons work Monday to Friday only. Please try again on a working day.";
  if(/Insufficient weekly balance/i.test(msg))return "There isn't enough balance left this week for that amount.";
  if(/expired/i.test(msg))return "This code has expired. Ask the employee to create a new one.";
  if(/already redeemed/i.test(msg))return "This code was already used.";
  if(/not found/i.test(msg))return "This code is not valid.";
  if(/Cashier access required/i.test(msg))return "This account is not allowed to accept coupons.";
  return msg;
}

function EmployeeView({allocation,onRefresh}:{allocation:Allocation|null;onRefresh:()=>void}){
  const [amount,setAmount]=useState(40);
  const [qr,setQr]=useState<{token:string;expires_at:string;deadline:number}|null>(null);
  const [error,setError]=useState("");
  const [secondsLeft,setSecondsLeft]=useState(0);
  useEffect(()=>{
    if(!qr)return;
    const tick=()=>{
      const left=Math.max(0,Math.ceil((qr.deadline-Date.now())/1000));
      setSecondsLeft(left);
      if(left===0)setQr(null);
    };
    tick();
    const id=setInterval(tick,250);
    return ()=>clearInterval(id);
  },[qr]);
  async function generate(){
    setError("");setQr(null);
    const {data,error}=await supabase.rpc("create_coupon_token",{_amount:amount});
    if(error){setError(friendly(error.message));return}
    const row=data?.[0];
    if(!row){setError("The code could not be created. Please try again.");return}
    const serverWindow=new Date(row.expires_at).getTime()-new Date().getTime();
    const seconds=serverWindow>0&&serverWindow<60000?serverWindow:30000;
    setQr({...row,deadline:Date.now()+seconds});
    onRefresh();
  }

  const balance=allocation?.remaining_balance??0;
  const weekend=isWeekend();
  return <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><section className="border bg-card p-6 shadow-sm"><p className="text-sm font-semibold text-muted-foreground">Available this week</p><div className="mt-3 flex items-end gap-2"><span className="text-5xl font-extrabold">{balance}</span><span className="pb-1 text-lg font-semibold text-muted-foreground">Birr</span></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${Math.min(100,balance/2)}%`}}/></div><div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>Monday–Friday</span><span>{allocation?.eligible?"Approved":"Not approved"}</span></div></section><section className="border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><QrCode className="text-primary"/><div><h2 className="font-bold">Generate payment QR</h2><p className="text-sm text-muted-foreground">Valid for 30 seconds.</p></div></div>{weekend&&<p className="mt-4 border bg-muted/50 p-3 text-sm text-muted-foreground">Meal coupons are available Monday to Friday only.</p>}{!allocation&&<p className="mt-4 border bg-muted/50 p-3 text-sm text-muted-foreground">No approved allowance yet for this week.</p>}<div className="mt-6 grid grid-cols-5 gap-2">{amounts.map(v=><Button key={v} variant={amount===v?"default":"outline"} className="h-12 px-1" disabled={v>balance} onClick={()=>setAmount(v)}>{v}</Button>)}</div><Button className="mt-5 h-12 w-full" disabled={weekend||!allocation||amount>balance} onClick={generate}><QrCode/>Generate {amount} Birr QR</Button>{error&&<p className="mt-4 text-sm text-destructive">{error}</p>}{qr&&<div className="mt-6 flex flex-col items-center border-t pt-6"><div className="bg-white p-4"><QRCodeSVG value={qr.token} size={220}/></div><p className="mt-3 font-bold">{amount} Birr</p><p className="text-xs font-semibold text-primary">Expires in {secondsLeft}s</p><p className="mt-2 break-all text-center font-mono text-[10px] text-muted-foreground">{qr.token}</p></div>}</section></div>;
}

function CashierView(){
  const scannerRef=useRef<any>(null);
  const busyRef=useRef(false);
  const [state,setState]=useState<"idle"|"scanning"|"success"|"error">("idle");
  const [message,setMessage]=useState("");
  const [manual,setManual]=useState("");
  const weekend=isWeekend();
  async function stopScanner(){
    const scanner=scannerRef.current;
    scannerRef.current=null;
    if(scanner){try{await scanner.stop()}catch{}try{scanner.clear()}catch{}}
  }
  async function redeem(token:string){
    if(busyRef.current)return;
    busyRef.current=true;
    await stopScanner();
    const {data,error}=await supabase.rpc("redeem_coupon",{_token:token.trim()});
    busyRef.current=false;
    if(error){setState("error");setMessage(friendly(error.message));return}
    const row=data?.[0];
    if(!row){setState("error");setMessage("The coupon could not be verified.");return}
    setState("success");
    setManual("");
    setMessage(`${row.employee_name} • ${row.amount} Birr deducted • ${row.remaining_balance} Birr remaining`);
  }
  async function start(){
    setMessage("");
    busyRef.current=false;
    await stopScanner();
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("no-camera-api");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}});
      stream.getTracks().forEach(t=>t.stop());
      const {Html5Qrcode}=await import("html5-qrcode");
      const scanner=new Html5Qrcode("coupon-reader");
      scannerRef.current=scanner;
      setState("scanning");
      const config={fps:15,qrbox:{width:260,height:260}};
      try{
        await scanner.start({facingMode:"environment"},config,redeem,()=>{});
      }catch{
        const cameras=await Html5Qrcode.getCameras();
        const cam=cameras[cameras.length-1];
        if(!cam)throw new Error("no-camera");
        await scanner.start(cam.id,config,redeem,()=>{});
      }
    }catch(e){
      await stopScanner();
      setState("error");
      setMessage(e instanceof DOMException&&e.name==="NotAllowedError"
        ?"Camera access was blocked. Allow camera for this site in your browser settings, then tap the camera button again."
        :"The camera could not start on this device. You can type the coupon code below instead.");
    }
  }
  useEffect(()=>()=>{scannerRef.current?.stop().catch(()=>{})},[]);
  return <section className="mx-auto max-w-xl"><div className="overflow-hidden border bg-card shadow-sm"><div id="coupon-reader" className="aspect-square w-full bg-foreground/5"/><div className="p-6 text-center">{state==="success"?<CheckCircle2 className="mx-auto size-12 text-primary"/>:state==="error"?<XCircle className="mx-auto size-12 text-destructive"/>:<Camera className="mx-auto size-12 text-primary"/>}<h2 className="mt-3 text-xl font-bold">{state==="scanning"?"Point at the employee QR":state==="success"?"Coupon accepted":state==="error"?"Could not accept":"Ready to scan"}</h2>{message&&<p className={`mt-2 text-sm ${state==="error"?"text-destructive":"text-muted-foreground"}`}>{message}</p>}{weekend&&<p className="mt-3 border bg-muted/50 p-3 text-sm text-muted-foreground">Coupons can only be accepted Monday to Friday.</p>}<Button className="mt-5 h-12 w-full" disabled={weekend} onClick={start}><Camera/>{state==="scanning"?"Restart camera":state==="success"?"Scan next coupon":"Enable camera & scan"}</Button><div className="mt-6 border-t pt-5 text-left"><p className="text-sm font-semibold">Or type the code</p><div className="mt-2 flex gap-2"><Input className="h-11 font-mono" placeholder="Coupon code" value={manual} onChange={e=>setManual(e.target.value)}/><Button className="h-11" disabled={weekend||manual.trim().length<8} onClick={()=>{busyRef.current=false;redeem(manual)}}>Accept</Button></div></div></div></div></section>;
}


function AuditView({allocations,redemptions,logs}:{allocations:any[];redemptions:any[];logs:any[]}){const issued=allocations.reduce((s,a)=>s+a.approved_amount,0),spent=redemptions.reduce((s,r)=>s+r.amount,0);return <><div className="grid gap-4 sm:grid-cols-3"><Stat icon={<WalletCards/>} label="Approved" value={`${issued.toLocaleString()} Birr`}/><Stat icon={<BarChart3/>} label="Redeemed" value={`${spent.toLocaleString()} Birr`}/><Stat icon={<Users/>} label="Active allocations" value={String(allocations.filter(a=>a.eligible).length)}/></div><section className="mt-6 border bg-card p-6"><h2 className="font-bold">Recent redemptions</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-muted-foreground"><tr><th className="py-3">Employee</th><th>Amount</th><th>Time</th></tr></thead><tbody>{redemptions.map(r=><tr className="border-t" key={r.id}><td className="py-3 font-medium">{r.profiles?.display_name??r.employee_id}</td><td>{r.amount} Birr</td><td>{new Date(r.redeemed_at).toLocaleString()}</td></tr>)}</tbody></table></div></section><section className="mt-6 border bg-card p-6"><h2 className="font-bold">Audit trail</h2><div className="mt-4 space-y-3">{logs.map(l=><div key={l.id} className="flex justify-between border-t pt-3 text-sm"><span>{l.action.replaceAll("_"," ")}</span><span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span></div>)}</div></section></>}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="border bg-card p-5 shadow-sm"><div className="text-primary">{icon}</div><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div>}

function AdminView({allocations,redemptions,onRefresh}:{allocations:any[];redemptions:any[];onRefresh:()=>void}){const [text,setText]=useState("");const [status,setStatus]=useState("");const [amount,setAmount]=useState(200);const [employees,setEmployees]=useState<{id:string;display_name:string;employee_number:string|null;department:string|null}[]>([]);const [selected,setSelected]=useState<Set<string>>(new Set());const [search,setSearch]=useState("");const [dept,setDept]=useState("");const departments=Array.from(new Set(employees.map(e=>e.department).filter(Boolean))).sort();useEffect(()=>{(async()=>{const {data:roles}=await supabase.from("user_roles").select("user_id").eq("role","employee");const ids=(roles??[]).map(r=>r.user_id);if(!ids.length)return;const {data:profs}=await supabase.from("profiles").select("id,display_name,employee_number,department").in("id",ids).order("display_name");setEmployees(profs??[]);setSelected(new Set((profs??[]).map(p=>p.id)))})()},[]);const visible=employees.filter(e=>{if(dept&&e.department!==dept)return false;if(!search)return true;const q=search.toLowerCase();return e.display_name.toLowerCase().includes(q)||(e.employee_number??"").toLowerCase().includes(q)||(e.department??"").toLowerCase().includes(q)});function toggle(id:string){setSelected(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n})}async function create(){setStatus("Creating accounts…");try{const accounts=text.split("\n").filter(Boolean).map(line=>{const fields=line.split(",").map(v=>v.trim());const username=fields[0]??"",displayName=fields[1]??"",role=fields[2]??"",temporaryPassword=fields[3]??"";if(!username||!displayName||!temporaryPassword||!["employee","cashier","auditor"].includes(role))throw new Error(`Invalid account row: ${line}`);return{username,displayName,role:role as "employee"|"cashier"|"auditor",temporaryPassword,...(fields[4]?{employeeNumber:fields[4]}:{}),...(fields[5]?{department:fields[5]}:{})}});const result=await createAccounts({data:{accounts}});setStatus(`${result.filter(r=>r.ok).length} of ${result.length} accounts created.`)}catch(e){setStatus(e instanceof Error?e.message:"Unable to create accounts")}}async function approve(){setStatus("Approving employees…");const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));const week=monday.toISOString().slice(0,10);const ids=employees.filter(e=>selected.has(e.id)).map(e=>e.id);if(!ids.length){setStatus("Select at least one employee to approve.");return}const {data:{user}}=await supabase.auth.getUser();if(!user){setStatus("Your session expired. Please sign in again.");return}const rows=ids.map(id=>({employee_id:id,week_start:week,approved_amount:amount,remaining_balance:amount,eligible:true,approved_by:user.id,approved_at:new Date().toISOString()}));const {error}=await supabase.from("weekly_allocations").upsert(rows,{onConflict:"employee_id,week_start"});setStatus(error?error.message:`Approved ${ids.length} employees for ${amount} Birr.`);onRefresh()}return <div className="grid gap-6 lg:grid-cols-2"><section className="border bg-card p-6"><div className="flex items-center gap-3"><UserPlus className="text-primary"/><h2 className="font-bold">Create user accounts</h2></div><p className="mt-2 text-sm text-muted-foreground">One per line: username, full name, role, temporary password, employee number, department</p><textarea className="mt-4 min-h-52 w-full rounded-md border bg-background p-3 text-sm" placeholder="henok,HENOK TESFAYE,employee,Temp@123,EMP-001,Finance" value={text} onChange={e=>setText(e.target.value)}/><Button className="mt-4" onClick={create} disabled={!text.trim()}><UserPlus/>Create accounts</Button></section><section className="border bg-card p-6"><div className="flex items-center gap-3"><WalletCards className="text-primary"/><h2 className="font-bold">Weekly approval</h2></div><p className="mt-2 text-sm text-muted-foreground">Allocate the selected value to every active employee for the current week.</p><div className="mt-6 grid grid-cols-5 gap-2">{amounts.map(v=><Button key={v} variant={amount===v?"default":"outline"} className="px-1" onClick={()=>setAmount(v)}>{v}</Button>)}</div><div className="mt-4"><div className="flex items-center justify-between gap-2"><Input placeholder="Search name, employee no. or department" value={search} onChange={e=>setSearch(e.target.value)} className="h-9"/><select value={dept} onChange={e=>setDept(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">All departments</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>setSelected(new Set(visible.map(e=>e.id)))}>All shown</Button><Button variant="outline" size="sm" onClick={()=>setSelected(s=>{const n=new Set(s);visible.forEach(e=>n.delete(e.id));return n})}>None shown</Button></div></div><p className="mt-2 text-xs font-semibold text-muted-foreground">{selected.size} of {visible.length} shown selected • {employees.length} total employees</p><div className="mt-2 max-h-64 overflow-y-auto rounded-md border">{visible.length===0?<p className="p-3 text-sm text-muted-foreground">No employees found.</p>:visible.map(e=><label key={e.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"><input type="checkbox" className="size-4 accent-primary" checked={selected.has(e.id)} onChange={()=>toggle(e.id)}/><span className="flex-1 font-medium">{e.display_name}</span><span className="text-xs text-muted-foreground">{e.employee_number??""}{e.department?` • ${e.department}`:""}</span></label>)}</div></div><Button className="mt-4 w-full" onClick={approve}><CheckCircle2/>Approve {amount} Birr for {selected.size} employees</Button><div className="mt-6 grid grid-cols-2 gap-3"><Stat icon={<Users/>} label="Approved records" value={String(allocations.length)}/><Stat icon={<Ticket/>} label="Redemptions" value={String(redemptions.length)}/></div></section>{status&&<p className="lg:col-span-2 rounded-md border bg-secondary p-4 text-sm font-semibold">{status}</p>}<MyAccount/><AccountsManager/></div>}

function MyAccount(){
  const [username,setUsername]=useState("");
  const [current,setCurrent]=useState("");
  const [next,setNext]=useState("");
  const [status,setStatus]=useState("");
  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from("profiles").select("username").eq("id",user.id).maybeSingle();setUsername(data?.username??"")})()},[]);
  async function saveUsername(){setStatus("Saving username…");try{const r=await updateOwnUsername({data:{username}});setUsername(r.username);setStatus(`Your username is now ${r.username}. Use it the next time you sign in.`)}catch(e){setStatus(e instanceof Error?e.message:"Could not update the username")}}
  async function savePassword(){setStatus("Updating password…");const {error}=await supabase.auth.updateUser({password:next,current_password:current} as any);setStatus(error?error.message:"Your password has been changed.");if(!error){setCurrent("");setNext("")}}
  return <section className="border bg-card p-6 lg:col-span-2"><div className="flex items-center gap-3"><ShieldCheck className="text-primary"/><h2 className="font-bold">My account</h2></div><div className="mt-4 grid gap-6 md:grid-cols-2"><div><p className="text-sm font-semibold">Username</p><div className="mt-2 flex gap-2"><Input className="h-11" value={username} onChange={e=>setUsername(e.target.value)}/><Button className="h-11" onClick={saveUsername} disabled={username.trim().length<3}>Save</Button></div></div><div><p className="text-sm font-semibold">Change my password</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input className="h-11" type="password" placeholder="Current password" value={current} onChange={e=>setCurrent(e.target.value)}/><Input className="h-11" type="password" placeholder="New password" value={next} onChange={e=>setNext(e.target.value)}/><Button className="h-11" onClick={savePassword} disabled={!current||next.length<8}>Update</Button></div></div></div>{status&&<p className="mt-4 text-sm font-semibold text-muted-foreground">{status}</p>}</section>;
}

function AccountsManager(){
  const [rows,setRows]=useState<any[]>([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  async function load(){try{setRows(await listAccounts())}catch(e){setStatus(e instanceof Error?e.message:"Could not load accounts")}}
  useEffect(()=>{load()},[]);
  const visible=rows.filter(r=>!search||`${r.display_name} ${r.username} ${r.role} ${r.employee_number??""}`.toLowerCase().includes(search.toLowerCase())).slice(0,200);
  async function reset(row:any){
    const temporaryPassword=window.prompt(`New temporary password for ${row.display_name}`,"Temp@123");
    if(!temporaryPassword)return;
    setBusy(row.id);
    try{await resetAccountPassword({data:{userId:row.id,temporaryPassword}});setStatus(`Password reset for ${row.display_name}. They must change it at next sign in.`)}catch(e){setStatus(e instanceof Error?e.message:"Could not reset the password")}
    setBusy(null);load();
  }
  async function remove(row:any){
    if(!window.confirm(`Delete the account of ${row.display_name}? This cannot be undone.`))return;
    setBusy(row.id);
    try{await deleteAccount({data:{userId:row.id}});setStatus(`${row.display_name} was deleted.`)}catch(e){setStatus(e instanceof Error?e.message:"Could not delete the account")}
    setBusy(null);load();
  }
  async function toggleActive(row:any){
    setBusy(row.id);
    try{await setAccountActive({data:{userId:row.id,isActive:!row.is_active}});setStatus(`${row.display_name} is now ${row.is_active?"deactivated":"active"}.`)}catch(e){setStatus(e instanceof Error?e.message:"Could not update the account")}
    setBusy(null);load();
  }
  return <section className="border bg-card p-6 lg:col-span-2"><div className="flex items-center gap-3"><Users className="text-primary"/><h2 className="font-bold">Manage user accounts</h2></div><Input className="mt-4 h-10" placeholder="Search name, username or role" value={search} onChange={e=>setSearch(e.target.value)}/>{status&&<p className="mt-3 text-sm font-semibold text-muted-foreground">{status}</p>}<div className="mt-4 max-h-96 overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-3">Name</th><th>Username</th><th>Role</th><th>Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{visible.length===0?<tr><td colSpan={5} className="p-3 text-muted-foreground">No accounts found.</td></tr>:visible.map(r=><tr key={r.id} className="border-t"><td className="p-3 font-medium">{r.display_name}</td><td className="font-mono text-xs">{r.username}</td><td className="capitalize">{String(r.role).replace("_"," ")}</td><td className="text-xs">{r.is_active?"Active":"Inactive"}</td><td className="p-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy===r.id} onClick={()=>reset(r)}><KeyRound/>Reset password</Button><Button size="sm" variant="outline" disabled={busy===r.id} onClick={()=>toggleActive(r)}>{r.is_active?"Deactivate":"Activate"}</Button><Button size="sm" variant="destructive" disabled={busy===r.id} onClick={()=>remove(r)}><Trash2/></Button></div></td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">Showing up to 200 accounts. Use the search to narrow the list.</p></section>;
}
