import React,{useCallback,useEffect,useRef,useState} from 'react';
import {FileText,Image,Trash2,UploadCloud,ShieldCheck,RefreshCw,AlertTriangle} from 'lucide-react';
import type {Language} from '../../types/afg';
import { formatLocalizedDate, formatFileSize } from '../../utils/i18n';

type StoredFile={id:string;name:string;kind:string;mime:string;sizeBytes:number;status:string;createdAt:string};
const API=((import.meta as any).env?.VITE_API_BASE_URL||'').replace(/\/$/,'');
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('afg_csrf='))?.slice(9)||'');
const COPY = {
  dari:{max:'حداکثر اندازه فایل ۱۵ مگابایت است.',formats:'فقط PDF، تصویر، TXT و CSV پشتیبانی می‌شود.',stored:'فایل به‌صورت خصوصی ذخیره شد و در قرنطینه امنیتی قرار گرفت.',confirm:'این فایل برای همیشه حذف شود؟',deleted:'فایل حذف شد.',title:'کتابخانه خصوصی فایل‌ها',privacy:'فایل‌ها خارج از پوشه عمومی و با نام تصادفی ذخیره می‌شوند. تا زمان اتصال اسکنر امنیتی، فایل‌ها در قرنطینه می‌مانند و هوش مصنوعی نمی‌تواند محتوای آن‌ها را بخواند.',working:'در حال انجام…',upload:'بارگذاری فایل',refresh:'تازه‌سازی',limit:'حداکثر ۱۵ مگابایت · PDF، PNG، JPG، GIF، WebP، TXT و CSV',storage:'ذخیره‌سازی خصوصی روی سرور تنظیم نشده است؛ مدیر باید دیسک پایدار و مسیر AFG_UPLOAD_QUARANTINE_DIR را پیکربندی کند.',files:'فایل‌های شما',loading:'در حال بارگذاری…',empty:'هنوز فایلی بارگذاری نشده است.',quarantine:'قرنطینه امنیتی',delete:'حذف فایل'},
  english:{max:'Maximum file size is 15 MB.',formats:'Only PDF, images, TXT and CSV are supported.',stored:'File stored privately and placed in security quarantine.',confirm:'Permanently delete this file?',deleted:'File deleted.',title:'Private file library',privacy:'Files are stored outside the public web root under generated names. Until a security scanner is connected, uploads remain quarantined and cannot be read by AI.',working:'Working…',upload:'Upload file',refresh:'Refresh',limit:'15 MB max · PDF, PNG, JPG, GIF, WebP, TXT and CSV',storage:'Private storage is not configured. An administrator must mount a persistent disk and set AFG_UPLOAD_QUARANTINE_DIR.',files:'Your files',loading:'Loading files…',empty:'No files uploaded yet.',quarantine:'Security quarantine',delete:'Delete file'},
  pashto:{max:'د فایل اعظمي اندازه ۱۵ مېګابایټه ده.',formats:'یوازې PDF، انځورونه، TXT او CSV ملاتړ کېږي.',stored:'فایل په شخصي ډول خوندي او امنیتي قرنطین ته واچول شو.',confirm:'دا فایل د تل لپاره ړنګ کړئ؟',deleted:'فایل ړنګ شو.',title:'د شخصي فایلونو کتابتون',privacy:'فایلونه له عامې ویبپاڼې بهر په تصادفي نومونو ساتل کېږي. تر امنیتي پلټونکي پورې فایلونه قرنطین وي او AI یې نه شي لوستلای.',working:'کار روان دی…',upload:'فایل پورته کول',refresh:'تازه کول',limit:'تر ۱۵ مېګابایټه · PDF، PNG، JPG، GIF، WebP، TXT او CSV',storage:'شخصي زېرمه نه ده تنظیم شوې. مدیر باید دایمي ډیسک او AFG_UPLOAD_QUARANTINE_DIR برابر کړي.',files:'ستاسو فایلونه',loading:'فایلونه بارېږي…',empty:'تر اوسه فایل نه دی پورته شوی.',quarantine:'امنیتي قرنطین',delete:'فایل ړنګول'},
  arabic:{max:'الحد الأقصى لحجم الملف 15 ميغابايت.',formats:'يدعم فقط PDF والصور وTXT وCSV.',stored:'تم حفظ الملف بشكل خاص ووضعه في العزل الأمني.',confirm:'هل تريد حذف هذا الملف نهائياً؟',deleted:'تم حذف الملف.',title:'مكتبة الملفات الخاصة',privacy:'تُحفظ الملفات خارج مجلد الويب العام بأسماء عشوائية. تبقى الملفات معزولة حتى ربط ماسح أمني ولا يستطيع الذكاء الاصطناعي قراءتها.',working:'جارٍ العمل…',upload:'رفع ملف',refresh:'تحديث',limit:'الحد 15 ميغابايت · PDF وPNG وJPG وGIF وWebP وTXT وCSV',storage:'لم يتم إعداد التخزين الخاص. يجب على المسؤول تركيب قرص دائم وضبط AFG_UPLOAD_QUARANTINE_DIR.',files:'ملفاتك',loading:'جارٍ تحميل الملفات…',empty:'لم يتم رفع أي ملفات بعد.',quarantine:'العزل الأمني',delete:'حذف الملف'}
} as const;

export const AfgFileLibrary:React.FC<{language:Language}>=({language})=>{
  const c=COPY[language==='dari'||language==='pashto'||language==='arabic'?language:'english'];
  const [files,setFiles]=useState<StoredFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [storageReady,setStorageReady]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const picker=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');setStorageReady(false);
    try{
      const [response,statusResponse]=await Promise.all([
        fetch(API+'/api/files',{credentials:'include',cache:'no-store'}),
        fetch(API+'/api/files/status',{credentials:'include',cache:'no-store'}),
      ]);
      const data=await response.json().catch(()=>({}));
      const status=await statusResponse.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not load private files.');
      setFiles(Array.isArray(data.files)?data.files:[]);
      setStorageReady(statusResponse.ok&&status.privateStorageConfigured===true);
    }catch(e){setError(e instanceof Error?e.message:'Could not load files.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const upload=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(file.size>15*1024*1024)throw new Error(c.max);
      const allowed=/\.(pdf|png|jpe?g|gif|webp|txt|csv)$/i;
      if(!allowed.test(file.name))throw new Error(c.formats);
      const buffer=await file.arrayBuffer();
      const bytes=new Uint8Array(buffer);
      let binary='';
      const chunk=0x8000;
      for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
      const response=await fetch(API+'/api/files',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify({name:file.name,dataBase64:btoa(binary)})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Upload failed.');
      setMessage(c.stored);
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}
    finally{setBusy(false);if(picker.current)picker.current.value='';}
  };
  const remove=async(id:string)=>{
    if(!window.confirm(c.confirm))return;
    setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch(API+'/api/files/'+encodeURIComponent(id),{method:'DELETE',credentials:'include',headers:{'X-CSRF-Token':csrf()}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Delete failed.');
      setFiles(current=>current.filter(file=>file.id!==id));
      setMessage(c.deleted);
    }catch(e){setError(e instanceof Error?e.message:'Delete failed.');}
    finally{setBusy(false);}
  };
  return <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-4 space-y-2">
      <div className="flex items-center gap-2 text-cyan-200"><ShieldCheck className="h-5 w-5"/><strong>{c.title}</strong></div>
      <p className="text-xs leading-5 text-slate-300">{c.privacy}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy||!storageReady} onClick={()=>picker.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><UploadCloud className="h-4 w-4"/>{busy?(c.working):(c.upload)}</button>
        <button type="button" disabled={loading||busy} onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300"><RefreshCw className="h-4 w-4"/>{c.refresh}</button>
        <input ref={picker} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv" className="hidden" onChange={e=>void upload(e.target.files?.[0])}/>
      </div>
      <p className="text-[11px] text-slate-500">{c.limit}</p>
      {!storageReady&&<p className="text-xs text-amber-200">{c.storage}</p>}
    </div>
    {error&&<p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle className="mr-1 inline h-4 w-4"/>{error}</p>}
    {message&&<p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">{message}</p>}
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><strong className="text-sm text-white">{c.files}</strong><span className="text-xs text-slate-500">{files.length}/100</span></div>
      {loading?<p className="p-5 text-center text-xs text-slate-400">{c.loading}</p>:files.length===0?<p className="p-6 text-center text-xs text-slate-500">{c.empty}</p>:files.map(file=><div key={file.id} className="flex items-center gap-3 border-b border-slate-800/70 p-3 last:border-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">{file.mime.startsWith('image/')?<Image className="h-5 w-5"/>:<FileText className="h-5 w-5"/>}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-100">{file.name}</p><p className="mt-1 text-[10px] text-slate-500">{formatFileSize(Number(file.sizeBytes)||0, language)} · {formatLocalizedDate(new Date(file.createdAt), language)}</p><span className="mt-1 inline-block rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-200">{c.quarantine}</span></div>
        <button type="button" disabled={busy} onClick={()=>void remove(file.id)} aria-label={c.delete} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-4 w-4"/></button>
      </div>)}
    </div>
  </div>;
};
