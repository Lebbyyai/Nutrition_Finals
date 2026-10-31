import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, Plus, LogOut, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AdminWorkspace({user,api,Brand,Modal,onLogout}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[adding,setAdding]=useState(false),[message,setMessage]=useState(''),[tab,setTab]=useState('dietitians');
  async function refresh(){try{setData(await api('/admin/accounts'));setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{refresh();},[]);
  return <div className="admin-workspace">
    <header className="admin-topbar"><Brand/><span className="pill"><ShieldCheck size={14}/> ADMIN WORKSPACE</span><div className="admin-user"><span>{user.name}</span><button className="button secondary" onClick={async()=>{try{await onLogout();}catch(e){setError(e.message);}}}><LogOut size={15}/>Sign out</button></div></header>
    <main className="admin-content">
      <div className="page-heading"><div><div className="eyebrow">THE PEOPLE BEHIND THE CARE</div><h1>A thoughtful team, connected.</h1><p>Create dietitian accounts and help patients find their care team.</p></div><button className="button primary" onClick={()=>{setAdding(true);setMessage('');}}><Plus size={17}/>Add a dietitian</button></div>
      {error&&<div className="error-banner" role="alert">{error}<button onClick={refresh}>Try again</button></div>}
      {message&&<p className="account-success" role="status"><CheckCircle2 size={17}/>{message}</p>}
      <div className="admin-summary"><section className="card"><span className="stat-icon green"><Users size={20}/></span><div><strong>{data?.dietitians.length??'—'}</strong><p>Dietitians in your workspace</p></div></section><section className="card"><span className="stat-icon orange"><Users size={20}/></span><div><strong>{data?.patients.length??'—'}</strong><p>Registered patients</p></div></section><section className="card"><span className="stat-icon purple"><ShieldCheck size={20}/></span><div><strong>{data?(data.recoveryEnabled?'Available':'Unavailable'):'—'}</strong><p>Email password recovery</p></div></section></div>
      <div className="tabs" role="tablist" aria-label="Account management"><button role="tab" aria-selected={tab==='dietitians'} className={tab==='dietitians'?'active':''} onClick={()=>setTab('dietitians')}>Dietitians</button><button role="tab" aria-selected={tab==='patients'} className={tab==='patients'?'active':''} onClick={()=>setTab('patients')}>Patient assignments</button></div>
      {!data?<p className="muted">Loading your care team…</p>:tab==='dietitians'?<div className="dietitian-grid">{data.dietitians.map(d=><article className="card dietitian-card" key={d.id}><span className="avatar">{d.name.split(' ').slice(0,2).map(n=>n[0]).join('')}</span><h2>{d.name}</h2><p>{d.email}</p><span className="pill">{d.patientCount} assigned patients</span></article>)}{!data.dietitians.length&&<p className="muted">Add your first dietitian to open patient registration.</p>}</div>:<section className="card assignment-list"><div className="assignment-intro"><h2>Connect each patient with a dietitian.</h2><p>Finish or cancel scheduled visits before changing a patient’s assignment. Existing appointments and clinical notes stay with their original provider.</p></div>{data.patients.map(p=><Assignment key={p.id} patient={p} dietitians={data.dietitians} api={api} onSaved={async()=>{await refresh();setMessage('The patient’s dietitian has been updated.');}}/>)}{!data.patients.length&&<p className="muted">Patient accounts will appear here after registration.</p>}</section>}
      <footer><span><ShieldCheck size={14}/> Savor Care administration</span><span>Account management · Clinical notes remain in the dietitian workspace</span></footer>
    </main>
    {adding&&<Modal title="Welcome someone to the team." subtitle="Create a dietitian account. Share the initial password privately with its owner." onClose={()=>setAdding(false)}><DietitianForm api={api} onSaved={async()=>{setAdding(false);await refresh();setMessage('Dietitian account created. They can now sign in.');}}/></Modal>}
  </div>;
}

function DietitianForm({api,onSaved}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');try{await api('/admin/dietitians',{method:'POST',body:Object.fromEntries(new FormData(form))});form.reset();await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <form onSubmit={submit}><label>Dietitian’s full name<input name="name" required minLength="2" maxLength="80" autoComplete="off"/></label><label>Dietitian’s email<input name="email" type="email" required maxLength="254" autoComplete="off"/></label><label>Initial password<input name="password" type="password" required minLength="12" maxLength="256" autoComplete="new-password" placeholder="At least 12 characters"/></label><div className="field-divider">CONFIRM YOUR ADMINISTRATOR IDENTITY</div><label>Your administrator password<input name="adminPassword" type="password" required maxLength="256" autoComplete="current-password"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy?'Creating account…':'Create dietitian account'}<ArrowRight size={16}/></button></form>;
}

function Assignment({patient,dietitians,api,onSaved}){
  const [providerId,setProviderId]=useState(patient.providerId||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>setProviderId(patient.providerId||''),[patient.providerId]);
  return <form className="assignment-row" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/admin/assignments',{method:'PATCH',body:{patientId:patient.id,providerId}});await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}}><div><h3>{patient.name}</h3><p>{patient.email}</p></div><label>Assigned dietitian<select value={providerId} onChange={e=>setProviderId(e.target.value)} required><option value="" disabled>Choose a dietitian</option>{dietitians.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label><button className="button secondary" disabled={busy||providerId===patient.providerId}>{busy?'Saving…':'Save assignment'}</button>{error&&<p className="form-error" role="alert">{error}</p>}</form>;
}
