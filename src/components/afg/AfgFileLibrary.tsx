import React,{useCallback,useEffect,useRef,useState} from 'react';
import {FileText,Image,Trash2,UploadCloud,ShieldCheck,RefreshCw,AlertTriangle} from 'lucide-react';
import type {Language} from '../../types/afg';

type StoredFile={id:string;name:string;kind:string;mime:string;sizeBytes:number;status:string;createdAt:string};
const API=((import.meta as any).env?.VITE_API_BASE_URL||'').replace(/\/$/,'');
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('afg_csrf='))?.slice(9)||'');
const formatSize=(n:number)=>n<1024? n+' B':n<1024*1024?(n/1024).toFixed(1)+' KB':(n/1024/1024).toFixed(1)+' MB';

export const AfgFileLibrary:React.FC<{language:Language}>=({language})=>{
  const fa=language==='dari';
  const [files,setFiles]=useState<StoredFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [storageReady,setStorageReady]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const picker=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
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
      if(file.size>15*1024*1024)throw new Error(fa?'حداکثر اندازه فایل ۱۵ مگابایت است.':'Maximum file size is 15 MB.');
      const allowed=/\.(pdf|png|jpe?g|gif|webp|txt|csv)$/i;
      if(!allowed.test(file.name))throw new Error(fa?'فقط PDF، تصویر، TXT و CSV پشتیبانی می‌شود.':'Only PDF, images, TXT and CSV are supported.');
      const buffer=await file.arrayBuffer();
      const bytes=new Uint8Array(buffer);
      let binary='';
      const chunk=0x8000;
      for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
      const response=await fetch(API+'/api/files',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify({name:file.name,dataBase64:btoa(binary)})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Upload failed.');
      setMessage(fa?'فایل به‌صورت خصوصی ذخیره شد و در قرنطینه امنیتی قرار گرفت.':'File stored privately and placed in security quarantine.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}
    finally{setBusy(false);if(picker.current)picker.current.value='';}
  };
  const remove=async(id:string)=>{
    if(!window.confirm(fa?'این فایل برای همیشه حذف شود؟':'Permanently delete this file?'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch(API+'/api/files/'+encodeURIComponent(id),{method:'DELETE',credentials:'include',headers:{'X-CSRF-Token':csrf()}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Delete failed.');
      setFiles(current=>current.filter(file=>file.id!==id));
      setMessage(fa?'فایل حذف شد.':'File deleted.');
    }catch(e){setError(e instanceof Error?e.message:'Delete failed.');}
    finally{setBusy(false);}
  };
  return <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-4 space-y-2">
      <div className="flex items-center gap-2 text-cyan-200"><ShieldCheck className="h-5 w-5"/><strong>{fa?'کتابخانه خصوصی فایل‌ها':'Private file library'}</strong></div>
      <p className="text-xs leading-5 text-slate-300">{fa?'فایل‌ها خارج از پوشه عمومی و با نام تصادفی ذخیره می‌شوند. تا زمان اتصال اسکنر امنیتی، فایل‌ها در قرنطینه می‌مانند و هوش مصنوعی نمی‌تواند محتوای آن‌ها را بخواند.':'Files are stored outside the public web root under generated names. Until a security scanner is connected, uploads remain quarantined and cannot be read by AI.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy||!storageReady} onClick={()=>picker.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><UploadCloud className="h-4 w-4"/>{busy?(fa?'در حال انجام…':'Working…'):(fa?'بارگذاری فایل':'Upload file')}</button>
        <button type="button" disabled={loading||busy} onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300"><RefreshCw className="h-4 w-4"/>{fa?'تازه‌سازی':'Refresh'}</button>
        <input ref={picker} type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv" className="hidden" onChange={e=>void upload(e.target.files?.[0])}/>
      </div>
      <p className="text-[11px] text-slate-500">{fa?'حداکثر ۱۵ مگابایت · PDF، PNG، JPG، GIF، WebP، TXT و CSV':'15 MB max · PDF, PNG, JPG, GIF, WebP, TXT and CSV'}</p>
      {!storageReady&&<p className="text-xs text-amber-200">{fa?'ذخیره‌سازی خصوصی روی سرور تنظیم نشده است؛ مدیر باید دیسک پایدار و مسیر AFG_UPLOAD_QUARANTINE_DIR را پیکربندی کند.':'Private storage is not configured. An administrator must mount a persistent disk and set AFG_UPLOAD_QUARANTINE_DIR.'}</p>}
    </div>
    {error&&<p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle className="mr-1 inline h-4 w-4"/>{error}</p>}
    {message&&<p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">{message}</p>}
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><strong className="text-sm text-white">{fa?'فایل‌های شما':'Your files'}</strong><span className="text-xs text-slate-500">{files.length}/100</span></div>
      {loading?<p className="p-5 text-center text-xs text-slate-400">{fa?'در حال بارگذاری…':'Loading files…'}</p>:files.length===0?<p className="p-6 text-center text-xs text-slate-500">{fa?'هنوز فایلی بارگذاری نشده است.':'No files uploaded yet.'}</p>:files.map(file=><div key={file.id} className="flex items-center gap-3 border-b border-slate-800/70 p-3 last:border-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">{file.mime.startsWith('image/')?<Image className="h-5 w-5"/>:<FileText className="h-5 w-5"/>}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-100">{file.name}</p><p className="mt-1 text-[10px] text-slate-500">{formatSize(Number(file.sizeBytes)||0)} · {new Date(file.createdAt).toLocaleDateString()}</p><span className="mt-1 inline-block rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-200">{fa?'قرنطینه امنیتی':'Security quarantine'}</span></div>
        <button type="button" disabled={busy} onClick={()=>void remove(file.id)} aria-label={fa?'حذف فایل':'Delete file'} className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-4 w-4"/></button>
      </div>)}
    </div>
  </div>;
};
