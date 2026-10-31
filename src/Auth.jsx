import React, { useEffect, useState } from 'react';
import { Leaf, ArrowRight, ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function Auth({onLogin,serverError,api,Brand,Plate,resetToken,onResetDone}) {
  const [mode,setMode]=useState(resetToken?'reset':'login'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[options,setOptions]=useState(null);
  useEffect(()=>{if(resetToken){setMode('reset');setError('');setMessage('');setPassword('');}},[resetToken]);
  useEffect(()=>{api('/auth/options').then(setOptions).catch(()=>setOptions({google:false,recovery:false}));const params=new URLSearchParams(location.search);if(params.has('auth_error')){setError('Google sign-in could not be completed. Try again or sign in with your password.');history.replaceState(null,'',location.pathname);}},[]);
  function change(next){setMode(next);setError('');setMessage('');setPassword('');}
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    const form=new FormData(e.currentTarget);
    try{
      if(mode==='forgot'){
        const data=await api('/auth/forgot-password',{method:'POST',body:{email}});
        setMessage(data.message);
      }else if(mode==='reset'){
        if(password!==form.get('confirmPassword'))throw new Error('The passwords do not match.');
        const data=await api('/auth/reset-password',{method:'POST',body:{token:resetToken,password}});
        setPassword('');setMode('login');setMessage(data.message);onResetDone?.();
      }else{
        const data=await api(mode==='register'?'/auth/register':'/auth/login',{method:'POST',body:{email,password,...(mode==='register'?{name:form.get('name')}:{})}});
        onLogin(data.user);
      }
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const titles={login:'Welcome to your table.',register:'Let’s begin your story.',forgot:'A little help getting back.',reset:'A fresh start, securely.'};
  const descriptions={login:'A little care for your everyday. Sign in to continue.',register:'Create your personal nutrition workspace.',forgot:'Enter your account email to request a password-reset link.',reset:'Choose a new password with at least 12 characters.'};
  const buttons={login:'Step into your workspace',register:'Create my account',forgot:'Send recovery link',reset:'Save new password'};
  return <div className="auth-layout"><div className="auth-story"><Brand light/><div className="auth-editorial"><span className="eyebrow">A SEAT AT THE TABLE, JUST FOR YOU</span><h1>Better nourishment.<br/><em>Closer connections.</em></h1><p>Good care starts with your story.<br/>Bring your everyday meals, your questions,<br/>and your wonderfully human self.</p><Plate/></div><span className="auth-footer">YOUR FOOD. YOUR PACE. YOUR PEOPLE.</span></div>
    <div className="auth-panel"><div className="auth-form"><span className="pill"><Leaf size={14}/> YOUR WELLNESS SPACE</span><h2>{titles[mode]}</h2><p className="muted">{descriptions[mode]}</p>
      {['login','register'].includes(mode)&&<><a className={'button google-button full'+(!options?.google?' unavailable':'')} href={options?.google?'/api/auth/google/start':undefined} aria-disabled={!options?.google}><span className="google-letter" aria-hidden="true">G</span>Continue with Google</a>{options&&!options.google&&<p className="auth-service-note">Google sign-in is currently unavailable.</p>}<div className="auth-divider"><span>or use your email</span></div></>}
      <form onSubmit={submit}>
        {mode==='register'&&<label>Your name<input name="name" autoComplete="name" required minLength="2" maxLength="80" placeholder="What should we call you?"/></label>}
        {mode!=='reset'&&<label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength="254" placeholder="you@example.com"/></label>}
        {mode!=='forgot'&&<label>{mode==='reset'?'New password':'Password'}<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='login'?1:12} maxLength="256" placeholder={mode==='login'?'Enter your password':'At least 12 characters'}/></label>}
        {mode==='reset'&&<label>Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" required minLength="12" maxLength="256"/></label>}
        {mode==='login'&&<div className="forgot-link"><button className="text-button" type="button" onClick={()=>change('forgot')}>Forgot password?</button></div>}
        {(error||serverError)&&<p className="form-error" role="alert">{error||serverError}</p>}
        {message&&<p className="account-success" role="status"><CheckCircle2 size={17}/>{message}</p>}
        <button className="button primary full" disabled={busy}>{busy?'One moment…':buttons[mode]}<ArrowRight size={17}/></button>
      </form>
      {['login','register'].includes(mode)?<p className="auth-toggle">{mode==='register'?'Already have an account?':'New around here?'} <button className="text-button" onClick={()=>change(mode==='register'?'login':'register')}>{mode==='register'?'Sign in':'Create an account'}</button></p>:<p className="auth-toggle"><button className="text-button" onClick={()=>{change('login');onResetDone?.();}}><ArrowLeft size={14}/>Back to sign in</button></p>}
      <p className="auth-disclaimer"><ShieldCheck size={15}/> Student demonstration · Use fictional information only</p>
    </div></div>
  </div>;
}
