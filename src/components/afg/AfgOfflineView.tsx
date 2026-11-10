import React, {useCallback,useEffect,useMemo,useState} from 'react';
import type {Language} from '../../types/afg';
import {listInstalledPacks,listLessonProgress,getLocalLesson,saveLessonProgress,uninstallLocalPack,exportLocalLearningData,verifyBrowserPack,installVerifiedPack} from '../../../packages/offline/src/index';
const TRUSTED_PACK_KEY=String((import.meta as any).env?.VITE_OFFLINE_PACK_PUBLIC_KEY||'');
type Pack=Awaited<ReturnType<typeof listInstalledPacks>>[number];
type Progress=Awaited<ReturnType<typeof listLessonProgress>>[number];
export function AfgOfflineView({language}:{language:Language}){
 const locale=language==='dari'||language==='pashto'||language==='arabic'?language:'english';
 const rtl=['dari','pashto','persian','arabic','urdu'].includes(language);
 const dari=locale==='dari';
 const [packs,setPacks]=useState<Pack[]>([]),[progress,setProgress]=useState<Progress[]>([]);
 const [lesson,setLesson]=useState<{pack:Pack;id:string;title:string;body:string}|null>(null);
 const [error,setError]=useState('');
 const [selectedFiles,setSelectedFiles]=useState<File[]>([]);
 const [installing,setInstalling]=useState(false);
 const [message,setMessage]=useState('');
 const refresh=useCallback(async()=>{const [p,r]=await Promise.all([listInstalledPacks(),listLessonProgress()]);setPacks(p);setProgress(r);},[]);
 useEffect(()=>{void refresh().catch(()=>setError(t.localError));},[refresh,dari]);
 const done=useMemo(()=>progress.filter(x=>x.status==='completed').length,[progress]);
 async function installPack(){
  if(!selectedFiles.length||installing)return;
  setInstalling(true);setError('');setMessage('');
  try{
   if(!TRUSTED_PACK_KEY)throw new Error('Trusted publisher key is not configured.');
   const find=(name:string)=>selectedFiles.find(file=>file.name===name||file.webkitRelativePath===name||file.webkitRelativePath.endsWith('/'+name));
   const manifestFile=find('manifest.json'),signatureFile=find('manifest.sig');
   if(!manifestFile||!signatureFile)throw new Error('Pack must include manifest.json and manifest.sig.');
   const manifestBytes=await manifestFile.arrayBuffer();
   const raw=JSON.parse(await manifestFile.text());
   const modelFile=find(String(raw?.model?.file||''));
   if(!modelFile)throw new Error('The model artifact declared in the manifest is missing.');
   const modelBytes=await modelFile.arrayBuffer();
   const verification=await verifyBrowserPack({manifestBytes,signatureBase64:(await signatureFile.text()).trim(),modelBytes,trustedPublicKeyBase64:TRUSTED_PACK_KEY});
   if(!verification.ok)throw new Error(verification.reason);
   const lessonFiles:Record<string,{content:string;language:string}>={};
   for(const item of verification.manifest.lessons){
    const file=find(item.file);if(!file)throw new Error('Missing signed lesson: '+item.file);
    const rawText=await file.text();const parsed=JSON.parse(rawText);
    if(!parsed||typeof parsed.language!=='string'||typeof parsed.content!=='string')throw new Error('Lesson JSON requires language and content fields: '+item.file);
    lessonFiles[item.file]={content:rawText,language:parsed.language};
   }
   await installVerifiedPack(verification,modelBytes,lessonFiles);
   setSelectedFiles([]);await refresh();setMessage(t.installed);
  }catch(e:any){setError(e?.message||'Pack installation failed.');}
  finally{setInstalling(false);}
 }
 async function open(pack:Pack,id:string){try{const item=await getLocalLesson(pack.id,pack.version,id);if(!item)throw new Error('Lesson file not found.');let title=id,body=item.content;try{const j=JSON.parse(item.content);title=typeof j.title==='string'?j.title:id;body=typeof j.body==='string'?j.body:item.content;}catch{}setLesson({pack,id,title,body});await saveLessonProgress({packKey:pack.id+'@'+pack.version,lessonId:id,status:'in_progress',score:null,updatedAt:new Date().toISOString()});await refresh();}catch(e:any){setError(e?.message||'Could not open lesson.');}}
 async function complete(){if(!lesson)return;await saveLessonProgress({packKey:lesson.pack.id+'@'+lesson.pack.version,lessonId:lesson.id,status:'completed',score:null,updatedAt:new Date().toISOString()});await refresh();}
 async function remove(pack:Pack){if(!window.confirm(t.uninstallConfirm))return;try{await uninstallLocalPack(pack.id,pack.version,true);setLesson(null);await refresh();}catch(e:any){setError(e?.message||'Uninstall failed.');}}
 async function backup(){const value=await exportLocalLearningData();const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='afg-ai-learning-backup.json';a.click();URL.revokeObjectURL(url);}
 const t={
  dari:{title:'آموزش آفلاین',sub:'مدیریت بسته‌های نصب‌شده، مطالعه درس‌ها و ذخیره پیشرفت در همین دستگاه.',runtime:'گفت‌وگوی هوش مصنوعی آفلاین هنوز فعال نیست. این بخش درس‌های محلی را باز می‌کند و هیچ درخواست ابری نمی‌فرستد.',packs:'بسته‌های نصب‌شده',empty:'بسته‌ای نصب نشده است.',done:'درس تکمیل‌شده',backup:'پشتیبان‌گیری',remove:'حذف',back:'بازگشت',complete:'تکمیل درس',install:'نصب بسته آموزشی امضاشده',instructions:'تمام فایل‌های بسته را یک‌جا انتخاب کنید؛ manifest.json، manifest.sig، فایل مدل و همه درس‌ها لازم است.',key:'کلید عمومی ناشر در تنظیمات استقرار تعیین نشده است.',verifying:'در حال تأیید…',verify:'تأیید و نصب محلی',installed:'بسته با موفقیت تأیید و نصب شد.',uninstallConfirm:'بسته و پیشرفت آن حذف شود؟',localError:'ذخیره‌سازی محلی در دسترس نیست.'},
  english:{title:'Offline Learning',sub:'Manage installed packs, read lessons and save progress on this device.',runtime:'Offline AI chat is not enabled yet. This area opens local lessons and never sends cloud requests.',packs:'Installed packs',empty:'No packs installed.',done:'Completed lessons',backup:'Export backup',remove:'Uninstall',back:'Back',complete:'Mark complete',install:'Install a signed learning pack',instructions:'Select all pack files together: manifest.json, manifest.sig, model artifact and every declared lesson.',key:'Configure VITE_OFFLINE_PACK_PUBLIC_KEY to enable installation.',verifying:'Verifying…',verify:'Verify and install locally',installed:'Pack signature and hashes verified. Installed locally.',uninstallConfirm:'Uninstall pack and delete its progress?',localError:'Local storage is unavailable.'},
  pashto:{title:'نالیکي زده‌کړه',sub:'نصب شوي تعلیمي بنډلونه اداره کړئ، درسونه ولولئ او پرمختګ په همدې وسیله وساتئ.',runtime:'نالیکي AI خبرې لا فعالې نه دي. دا برخه ځایي درسونه پرانیزي او کلاوډ ته غوښتنه نه لېږي.',packs:'نصب شوي بنډلونه',empty:'تر اوسه بنډل نه دی نصب شوی.',done:'بشپړ شوي درسونه',backup:'شاتړ صادرول',remove:'لرې کول',back:'شاته',complete:'درس بشپړول',install:'لاسلیک شوی تعلیمي بنډل نصب کړئ',instructions:'د بنډل ټول فایلونه یوځای وټاکئ: manifest.json، manifest.sig، د ماډل فایل او ټول اعلان شوي درسونه.',key:'د نصب لپاره VITE_OFFLINE_PACK_PUBLIC_KEY تنظیم کړئ.',verifying:'تایید کېږي…',verify:'تایید او ځایي نصب',installed:'د بنډل لاسلیک او هشونه تایید او په وسیله کې نصب شول.',uninstallConfirm:'بنډل او د هغه پرمختګ ړنګ شي؟',localError:'ځایي زېرمه شتون نه لري.'},
  arabic:{title:'التعلّم دون اتصال',sub:'أدر الحزم المثبتة واقرأ الدروس واحفظ تقدمك على هذا الجهاز.',runtime:'محادثة الذكاء الاصطناعي دون اتصال غير مفعّلة بعد. يفتح هذا القسم الدروس المحلية ولا يرسل طلبات سحابية.',packs:'الحزم المثبتة',empty:'لم يتم تثبيت أي حزمة.',done:'الدروس المكتملة',backup:'تصدير نسخة احتياطية',remove:'إزالة',back:'رجوع',complete:'إكمال الدرس',install:'تثبيت حزمة تعليمية موقّعة',instructions:'حدد جميع ملفات الحزمة معاً: manifest.json وmanifest.sig وملف النموذج وكل درس معلن.',key:'اضبط VITE_OFFLINE_PACK_PUBLIC_KEY لتمكين التثبيت.',verifying:'جارٍ التحقق…',verify:'تحقق وثبّت محلياً',installed:'تم التحقق من توقيع الحزمة وبصماتها وتثبيتها محلياً.',uninstallConfirm:'هل تريد إزالة الحزمة وحذف تقدمها؟',localError:'التخزين المحلي غير متاح.'}
 }[locale];
 return <section className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6" dir={rtl?'rtl':'ltr'}>
 <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-sm opacity-70">{t.sub}</p></div><button onClick={()=>void backup()} className="rounded-xl border px-4 py-2 text-sm">{t.backup}</button></header>
 <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{t.runtime}</p>
 <div className="space-y-3 rounded-2xl border p-4">
  <h2 className="font-semibold">{t.install}</h2>
  <input type="file" multiple onChange={e=>setSelectedFiles(Array.from(e.target.files||[]))} className="block w-full text-sm"/>
  <p className="text-xs opacity-65">{t.instructions}</p>
  {!TRUSTED_PACK_KEY&&<p className="text-xs text-amber-700">{t.key}</p>}
  <button type="button" disabled={!selectedFiles.length||installing||!TRUSTED_PACK_KEY} onClick={()=>void installPack()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">{installing?(t.verifying):(t.verify)}</button>
 </div>
 {message&&<p role="status" className="rounded-xl border border-emerald-500/40 p-3 text-sm">{message}</p>}
 {error&&<p role="alert" className="rounded-xl border border-red-500/40 p-3 text-sm">{error}</p>}
 <div className="flex justify-between"><h2 className="font-semibold">{t.packs}</h2><span className="text-sm opacity-70">{t.done}: {done}</span></div>
 {!packs.length&&<p className="rounded-xl border p-4 text-sm opacity-70">{t.empty}</p>}
 <div className="grid gap-4 md:grid-cols-2">{packs.map(pack=><article key={pack.id+'@'+pack.version} className="space-y-3 rounded-2xl border p-4">
 <div className="flex justify-between gap-2"><div><h3 className="font-semibold">{pack.id}</h3><p className="text-xs opacity-60">v{pack.version} · {pack.manifest.publisher}</p></div><button onClick={()=>void remove(pack)} className="text-xs text-red-600 underline">{t.remove}</button></div>
 <p className="text-xs opacity-70">{pack.manifest.model.id} · {pack.manifest.model.license} · {pack.manifest.runtime}</p>
 <ul className="space-y-2">{pack.manifest.lessons.map(item=>{const p=progress.find(x=>x.packKey===pack.id+'@'+pack.version&&x.lessonId===item.id);return <li key={item.id} className="flex justify-between gap-2 text-sm"><button className="underline" onClick={()=>void open(pack,item.id)}>{item.id}</button><span className="opacity-60">{p?.status==='completed'?'✓':p?.status==='in_progress'?'…':'○'}</span></li>;})}</ul>
 </article>)}</div>
 {lesson&&<article className="space-y-4 rounded-2xl border p-5"><button className="text-sm underline" onClick={()=>setLesson(null)}>{t.back}</button><h2 className="text-xl font-semibold">{lesson.title}</h2><div className="whitespace-pre-wrap text-sm leading-8">{lesson.body}</div><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white" onClick={()=>void complete()}>{t.complete}</button></article>}
 </section>;
}
