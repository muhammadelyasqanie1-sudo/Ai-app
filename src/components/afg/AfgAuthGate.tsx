import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { apiUrl } from '../../lib/apiClient';
import { Mail, Chrome, ArrowLeft, Sparkles, UserRound, Eye, EyeOff } from 'lucide-react';
import type { Language } from '../../types/afg';

type Mode = 'welcome' | 'login' | 'register' | 'verify';
interface Props { language: Language; onContinueGuest: () => void; onAuthenticated: () => void; }

const copy = {
  dari: {
    title:'به AFG AI خوش آمدید', subtitle:'برای ادامه، روش ورود خود را انتخاب کنید',
    google:'ادامه با Google', email:'ادامه با ایمیل', guest:'ادامه به‌عنوان مهمان',
    login:'ورود به حساب', register:'ایجاد حساب جدید', name:'نام نمایشی', emailLabel:'آدرس ایمیل',
    password:'رمز عبور', submitLogin:'ورود', submitRegister:'ایجاد حساب',
    verifyTitle:'تأیید ایمیل', verifyText:'کد شش‌رقمی ارسال‌شده به ایمیل خود را وارد کنید',
    code:'کد تأیید', verify:'تأیید و ادامه', back:'بازگشت', switchLogin:'حساب دارید؟ ورود',
    switchRegister:'حساب ندارید؟ ثبت‌نام', loading:'لطفاً صبر کنید…', error:'درخواست انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.',
    passwordHint:'حداقل ۱۲ کاراکتر', brand:'یک هوش مصنوعی، توانایی‌های بی‌پایان'
  },
  english: {
    title:'Welcome to AFG AI', subtitle:'Choose how you want to continue',
    google:'Continue with Google', email:'Continue with email', guest:'Continue as guest',
    login:'Sign in to your account', register:'Create your account', name:'Display name', emailLabel:'Email address',
    password:'Password', submitLogin:'Sign in', submitRegister:'Create account',
    verifyTitle:'Verify your email', verifyText:'Enter the six-digit code sent to your email',
    code:'Verification code', verify:'Verify and continue', back:'Back', switchLogin:'Already have an account? Sign in',
    switchRegister:'New here? Create an account', loading:'Please wait…', error:'Request failed. Check your details and try again.',
    passwordHint:'At least 12 characters', brand:'One AI. Many capabilities.'
  }
};

export const AfgAuthGate: React.FC<Props> = ({ language, onContinueGuest, onAuthenticated }) => {
  const t = language === 'dari' ? copy.dari : copy.english;
  const [mode,setMode] = useState<Mode>(() => {
    const requested = sessionStorage.getItem('afg_auth_mode_after_signout');
    sessionStorage.removeItem('afg_auth_mode_after_signout');
    return requested === 'register' ? 'register' : 'welcome';
  });
  const [name,setName] = useState('');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [code,setCode] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [showPassword,setShowPassword] = useState(false);
  useEffect(() => {
    let active = true;
    const completeMobileSignIn = async (rawUrl: string) => {
      let deepLink: URL;
      try { deepLink = new URL(rawUrl); } catch { return; }
      if (deepLink.protocol !== 'afgai:' || deepLink.hostname !== 'auth' || deepLink.pathname !== '/callback') return;
      const ticket = deepLink.searchParams.get('ticket');
      if (!ticket) { if (active) setError(t.error); return; }
      try {
        await Browser.close().catch(() => undefined);
        const response = await fetch(apiUrl('/api/auth/google/mobile-exchange'), {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(typeof payload.error === 'string' ? payload.error : t.error);
        }
        if (active) onAuthenticated();
      } catch (e) { if (active) setError(e instanceof Error ? e.message : t.error); }
    };
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => { void completeMobileSignIn(url); });
    void CapacitorApp.getLaunchUrl().then((launch) => { if (launch?.url) void completeMobileSignIn(launch.url); }).catch(() => undefined);
    return () => { active = false; void listener.then((handle) => handle.remove()); };
  }, [onAuthenticated, t.error]);
  const beginGoogleSignIn = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const url = apiUrl('/api/auth/google/start' + (Capacitor.isNativePlatform() ? '?client=android' : ''));
    try { if (Capacitor.isNativePlatform()) await Browser.open({ url }); else window.location.assign(url); }
    catch { setError(t.error); }
  };
  const csrf = () => decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('afg_csrf='))?.slice(9) || '');
  const post = async (path:string, body:Record<string,string>) => {
    await fetch('/api/auth/providers',{credentials:'include'});
    const token=csrf();
    const response=await fetch(path,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(token?{'X-CSRF-Token':token}:{})},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(typeof payload.error==='string'?payload.error:t.error);
    return payload;
  };
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if(mode==='register'){
        await post('/api/auth/register',{email:email.trim(),password,displayName:name.trim()});
        setMode('verify');
      } else if(mode==='verify'){
        await post('/api/auth/verify-email',{email:email.trim(),code:code.trim()});
        onAuthenticated();
      } else {
        await post('/api/auth/login',{email:email.trim(),password});
        onAuthenticated();
      }
    } catch(e) { setError(e instanceof Error?e.message:t.error); }
    finally { setBusy(false); }
  };
  const rtl=language==='dari';
  return <main className="afg-auth-screen" dir={rtl?'rtl':'ltr'} lang={rtl?'fa-AF':'en'}>
    <div className="afg-auth-aurora" aria-hidden="true"><i/><i/><i/></div>
    <div className="afg-auth-grid" aria-hidden="true"/>
    <section className="afg-auth-card">
      <div className="afg-auth-mark"><Sparkles size={25}/></div>
      <div className="afg-auth-brand">AFG AI</div>
      <p className="afg-auth-tagline">{t.brand}</p>
      {mode==='welcome' ? <>
        <h1>{t.title}</h1><p className="afg-auth-subtitle">{t.subtitle}</p>
        <a className="afg-auth-action primary" href={apiUrl('/api/auth/google/start')} onClick={beginGoogleSignIn}><Chrome size={19}/>{t.google}</a>
        <button className="afg-auth-action secondary" onClick={()=>setMode('login')}><Mail size={19}/>{t.email}</button>
        <div className="afg-auth-divider"><span>OR</span></div>
        <button className="afg-auth-guest" onClick={onContinueGuest}><UserRound size={18}/>{t.guest}</button>
      </> : <>
        <button className="afg-auth-back" onClick={()=>{setMode('welcome');setError('');}}><ArrowLeft size={16}/>{t.back}</button>
        <h1>{mode==='verify'?t.verifyTitle:mode==='register'?t.register:t.login}</h1>
        {mode==='verify'&&<p className="afg-auth-subtitle">{t.verifyText}</p>}
        <form onSubmit={submit} className="afg-auth-form">
          {mode==='register'&&<label>{t.name}<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label>}
          {mode!=='verify'&&<label>{t.emailLabel}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
          {mode!=='verify'&&<label>{t.password}<span className="afg-auth-password"><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?8:12} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label="Toggle password visibility">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>{mode==='register'&&<small>{t.passwordHint}</small>}</label>}
          {mode==='verify'&&<label>{t.code}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)}/></label>}
          {error&&<p className="afg-auth-error" role="alert">{error}</p>}
          <button className="afg-auth-action primary" disabled={busy}>{busy?t.loading:mode==='verify'?t.verify:mode==='register'?t.submitRegister:t.submitLogin}</button>
        </form>
        {mode!=='verify'&&<button className="afg-auth-switch" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?t.switchRegister:t.switchLogin}</button>}
      </>}
      <div className="afg-auth-footer">AFG AI · SECURE ACCESS</div>
    </section>
  </main>;
};
