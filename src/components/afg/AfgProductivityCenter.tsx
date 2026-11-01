import React, { useEffect, useState } from 'react';
import { BookOpen, CheckSquare, FileText, Lightbulb, ListTodo, Mail, NotebookPen, Save, Sparkles, Trash2, Users, Library, Pin, Pencil } from 'lucide-react';
import type { Language } from '../../types/afg';

type ToolType = 'note'|'summary'|'idea'|'study'|'task'|'meeting'|'email'|'brainstorm'|'content_plan'|'knowledge';
type Item = { id:string; type:ToolType; title:string; content:string; parameters:Record<string,unknown>; isPinned:boolean; createdAt:string };
const tools: Array<{type:ToolType; icon:React.ElementType; en:string; fa:string; description:string}> = [
 {type:'note',icon:NotebookPen,en:'Notes',fa:'یادداشت‌ها',description:'Capture and organize thoughts'},
 {type:'summary',icon:FileText,en:'Summarizer',fa:'خلاصه‌ساز',description:'Turn long text into key points'},
 {type:'idea',icon:Lightbulb,en:'Idea Generator',fa:'تولید ایده',description:'Explore practical new ideas'},
 {type:'study',icon:BookOpen,en:'Study Assistant',fa:'دستیار آموزشی',description:'Learn topics step by step'},
 {type:'task',icon:CheckSquare,en:'Task Planner',fa:'برنامه‌ریز وظایف',description:'Break goals into clear actions'},
 {type:'meeting',icon:Users,en:'Meeting Summarizer',fa:'خلاصه جلسه',description:'Decisions, owners and follow-ups'},
 {type:'email',icon:Mail,en:'Email Assistant',fa:'دستیار ایمیل',description:'Draft clear, polished emails'},
 {type:'brainstorm',icon:Sparkles,en:'Brainstorm',fa:'بارش فکری',description:'Generate and group possibilities'},
 {type:'content_plan',icon:ListTodo,en:'Content Planner',fa:'برنامه محتوایی',description:'Plan content and publishing cadence'},
 {type:'knowledge',icon:Library,en:'Knowledge Workspace',fa:'فضای دانش',description:'Build a personal knowledge base'},
];
const API=(import.meta.env.VITE_API_BASE_URL||'');
const parameterFields:Record<ToolType,Array<{key:string;en:string;fa:string;placeholderEn:string;placeholderFa:string}>>={
 note:[{key:'format',en:'Format',fa:'قالب',placeholderEn:'Outline, bullets, journal…',placeholderFa:'فهرست، نکته‌ای، روزانه…'},{key:'tags',en:'Tags',fa:'برچسب‌ها',placeholderEn:'Comma-separated tags',placeholderFa:'برچسب‌ها با ویرگول'}],
 summary:[{key:'length',en:'Length',fa:'طول خلاصه',placeholderEn:'Short, medium or detailed',placeholderFa:'کوتاه، متوسط یا مفصل'},{key:'focus',en:'Focus',fa:'تمرکز',placeholderEn:'What matters most?',placeholderFa:'روی چه چیزی تمرکز شود؟'},{key:'audience',en:'Audience',fa:'مخاطب',placeholderEn:'Who will read this?',placeholderFa:'چه کسی می‌خواند؟'}],
 idea:[{key:'domain',en:'Domain',fa:'حوزه',placeholderEn:'Business, education, app…',placeholderFa:'تجارت، آموزش، برنامه…'},{key:'count',en:'Number of ideas',fa:'تعداد ایده',placeholderEn:'e.g. 10',placeholderFa:'مثلاً ۱۰'},{key:'constraints',en:'Constraints',fa:'محدودیت‌ها',placeholderEn:'Budget, time, resources…',placeholderFa:'بودجه، زمان، امکانات…'}],
 study:[{key:'level',en:'Level',fa:'سطح',placeholderEn:'Beginner, intermediate, advanced',placeholderFa:'مبتدی، متوسط، پیشرفته'},{key:'subject',en:'Subject',fa:'موضوع',placeholderEn:'What are you learning?',placeholderFa:'چه چیزی را می‌آموزید؟'},{key:'learningGoal',en:'Learning goal',fa:'هدف یادگیری',placeholderEn:'What should you be able to do?',placeholderFa:'در پایان چه چیزی بلد باشید؟'},{key:'quiz',en:'Quiz',fa:'آزمون',placeholderEn:'Yes/no or number of questions',placeholderFa:'بله/خیر یا تعداد پرسش‌ها'}],
 task:[{key:'priority',en:'Priority',fa:'اولویت',placeholderEn:'Low, normal, high',placeholderFa:'کم، عادی، زیاد'},{key:'dueDate',en:'Due date',fa:'مهلت انجام',placeholderEn:'YYYY-MM-DD',placeholderFa:'سال-ماه-روز'},{key:'status',en:'Status',fa:'وضعیت',placeholderEn:'Not started, in progress…',placeholderFa:'شروع‌نشده، در حال انجام…'}],
 meeting:[{key:'attendees',en:'Attendees',fa:'اشتراک‌کنندگان',placeholderEn:'Names or roles',placeholderFa:'نام‌ها یا مسئولیت‌ها'},{key:'date',en:'Meeting date',fa:'تاریخ جلسه',placeholderEn:'YYYY-MM-DD',placeholderFa:'سال-ماه-روز'},{key:'decisions',en:'Known decisions',fa:'تصمیم‌ها',placeholderEn:'Decisions already made',placeholderFa:'تصمیم‌های گرفته‌شده'},{key:'actionItems',en:'Action items',fa:'کارهای بعدی',placeholderEn:'Tasks or owners if known',placeholderFa:'وظایف یا مسئولان در صورت مشخص بودن'}],
 email:[{key:'recipient',en:'Recipient',fa:'گیرنده',placeholderEn:'Name or role',placeholderFa:'نام یا مسئولیت'},{key:'purpose',en:'Purpose',fa:'هدف ایمیل',placeholderEn:'What should this email achieve?',placeholderFa:'هدف این ایمیل چیست؟'},{key:'tone',en:'Tone',fa:'لحن',placeholderEn:'Friendly, formal, persuasive…',placeholderFa:'دوستانه، رسمی، متقاعدکننده…'},{key:'length',en:'Length',fa:'طول',placeholderEn:'Short, medium, detailed',placeholderFa:'کوتاه، متوسط، مفصل'}],
 brainstorm:[{key:'topic',en:'Topic',fa:'موضوع',placeholderEn:'What are we exploring?',placeholderFa:'چه موضوعی را بررسی می‌کنیم؟'},{key:'divergence',en:'Approach',fa:'روش',placeholderEn:'Wide exploration or focused',placeholderFa:'گسترده یا متمرکز'},{key:'count',en:'Number',fa:'تعداد',placeholderEn:'How many options?',placeholderFa:'چند گزینه؟'},{key:'constraints',en:'Constraints',fa:'محدودیت‌ها',placeholderEn:'Limits or requirements',placeholderFa:'محدودیت‌ها یا نیازمندی‌ها'}],
 content_plan:[{key:'platform',en:'Platform',fa:'پلتفرم',placeholderEn:'Instagram, YouTube, blog…',placeholderFa:'اینستاگرام، یوتیوب، وبلاگ…'},{key:'audience',en:'Audience',fa:'مخاطب',placeholderEn:'Target audience',placeholderFa:'مخاطب هدف'},{key:'frequency',en:'Frequency',fa:'تواتر انتشار',placeholderEn:'Daily, weekly…',placeholderFa:'روزانه، هفتگی…'},{key:'goal',en:'Goal',fa:'هدف',placeholderEn:'Awareness, leads, learning…',placeholderFa:'آگاهی، جذب مخاطب، آموزش…'}],
 knowledge:[{key:'topic',en:'Topic',fa:'موضوع',placeholderEn:'Knowledge area',placeholderFa:'حوزه دانش'},{key:'source',en:'Source',fa:'منبع',placeholderEn:'Where did this information come from?',placeholderFa:'این معلومات از کجا آمده؟'},{key:'tags',en:'Tags',fa:'برچسب‌ها',placeholderEn:'Comma-separated tags',placeholderFa:'برچسب‌ها با ویرگول'},{key:'confidence',en:'Confidence',fa:'میزان اطمینان',placeholderEn:'High, medium, low',placeholderFa:'زیاد، متوسط، کم'}],
};
function csrf(){return decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('afg_csrf='))?.slice(9)||'');}
export const AfgProductivityCenter:React.FC<{language:Language; onRunTool:(prompt:string,options:Record<string,unknown>)=>void}> = ({language,onRunTool})=>{
 const dari=language==='dari';
 const [type,setType]=useState<ToolType>('note');
 const [title,setTitle]=useState('');
 const [content,setContent]=useState('');
 const [parameters,setParameters]=useState<Record<string,string>>({});
 const [items,setItems]=useState<Item[]>([]);
 const [status,setStatus]=useState('');
 const [loading,setLoading]=useState(false);
 const current=tools.find(t=>t.type===type)!;
 const load=async()=>{try{const r=await fetch(API+'/api/productivity/items',{credentials:'include'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Sign in required');setItems(Array.isArray(d.items)?d.items:[]);setStatus('');}catch(e){setStatus(e instanceof Error?e.message:'Could not load workspace.');}};
 useEffect(()=>{void load();},[]);
 const run=()=>{
  if(!content.trim())return;
  const cleanParameters=Object.fromEntries(Object.entries(parameters).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]));
  onRunTool(content.trim(),{productivityType:type,productivityParameters:cleanParameters});
 };
 const save=async()=>{
  if(!title.trim()||!content.trim())return;
  setLoading(true);setStatus('');
  try{const r=await fetch(API+'/api/productivity/items',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify({type,title,content,parameters:Object.fromEntries(Object.entries(parameters).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]))})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Save failed');setItems(prev=>[d.item,...prev]);setTitle('');setContent('');setStatus(dari?'ذخیره شد.':'Saved to your workspace.');}
  catch(e){setStatus(e instanceof Error?e.message:'Could not save item.');}finally{setLoading(false);}
 };
 const updateItem=async(item:Item,patch:Partial<Pick<Item,'title'|'content'|'isPinned'>>)=>{try{const r=await fetch(API+'/api/productivity/items/'+item.id,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify(patch)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Update failed');setItems(prev=>prev.map(x=>x.id===item.id?{...x,...patch}:x));}catch(e){setStatus(e instanceof Error?e.message:'Could not update item.');}};
 const editItem=async(item:Item)=>{const nextTitle=window.prompt(dari?'عنوان جدید':'New title',item.title);if(nextTitle===null)return;const nextContent=window.prompt(dari?'متن جدید':'New content',item.content);if(nextContent===null)return;if(!nextTitle.trim()||!nextContent.trim())return;await updateItem(item,{title:nextTitle.trim(),content:nextContent.trim()});};
 const remove=async(id:string)=>{try{const r=await fetch(API+'/api/productivity/items/'+id,{method:'DELETE',credentials:'include',headers:{'X-CSRF-Token':csrf()}});if(!r.ok)throw new Error('Delete failed');setItems(prev=>prev.filter(x=>x.id!==id));}catch(e){setStatus(e instanceof Error?e.message:'Could not delete item.');}};
 return <div className="space-y-5">
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">{tools.map(tool=>{const Icon=tool.icon;return <button key={tool.type} onClick={()=>{setType(tool.type);setParameters({});}} className={'rounded-2xl border p-3 text-left transition '+(type===tool.type?'border-cyan-400 bg-cyan-500/10':'border-slate-700 bg-slate-900/70 hover:border-cyan-800')}><Icon className="w-5 h-5 text-cyan-300 mb-2"/><span className="block text-xs font-bold text-white">{dari?tool.fa:tool.en}</span><span className="block text-[10px] text-slate-400 mt-1">{dari?'ابزار هوشمند':tool.description}</span></button>;})}</div>
  <div className="rounded-3xl border border-cyan-500/30 bg-[#09122c]/90 p-4 sm:p-6 space-y-3">
   <div className="flex items-center gap-2"><current.icon className="w-5 h-5 text-cyan-300"/><h2 className="font-bold text-white">{dari?current.fa:current.en}</h2></div>
   <input value={title} onChange={e=>setTitle(e.target.value)} placeholder={dari?'عنوان برای ذخیره':'Title for saved item'} className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white"/>
   <textarea value={content} onChange={e=>setContent(e.target.value)} rows={5} placeholder={dari?'هدف، متن یا اطلاعات خود را اینجا بنویسید...':'Enter your goal, text, notes or context here...'} className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white"/>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{parameterFields[type].map(field=><label key={field.key} className="text-[11px] text-slate-400">{dari?field.fa:field.en}<input value={parameters[field.key]||''} onChange={e=>setParameters(prev=>({...prev,[field.key]:e.target.value}))} placeholder={dari?field.placeholderFa:field.placeholderEn} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-white"/></label>)}</div>
   <div className="flex flex-wrap gap-2"><button onClick={run} disabled={!content.trim()} className="flex-1 min-w-36 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 p-3 text-sm font-bold text-white disabled:opacity-40"><Sparkles className="inline w-4 h-4 mr-1"/>{dari?'کمک هوش مصنوعی':'Ask AFG AI'}</button><button onClick={()=>void save()} disabled={loading||!title.trim()||!content.trim()} className="rounded-xl border border-cyan-700 px-4 py-3 text-sm font-bold text-cyan-200 disabled:opacity-40"><Save className="inline w-4 h-4 mr-1"/>{dari?'ذخیره':'Save'}</button></div>
   {status&&<p className="text-xs text-amber-200">{status}</p>}
  </div>
  <section className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
   <div className="flex items-center justify-between"><h3 className="font-bold text-white">{dari?'فضای کاری من':'My Workspace'}</h3><button onClick={()=>void load()} className="text-xs text-cyan-300">{dari?'تازه‌سازی':'Refresh'}</button></div>
   {items.length===0?<p className="text-xs text-slate-400">{dari?'هنوز چیزی ذخیره نشده است. برای استفاده از فضای شخصی وارد حساب شوید.':'No saved items yet. Sign in to use your personal workspace.'}</p>:items.map(item=><article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-white">{item.title}</p><p className="text-[10px] text-cyan-300 mt-1">{tools.find(t=>t.type===item.type)?.[dari?'fa':'en']}</p></div><div className="flex items-center gap-3"><button onClick={()=>void updateItem(item,{isPinned:!item.isPinned})} aria-label={item.isPinned?'Unpin item':'Pin item'} className={item.isPinned?'text-cyan-300':'text-slate-500'}><Pin className="w-4 h-4"/></button><button onClick={()=>void editItem(item)} aria-label="Edit saved item" className="text-slate-500 hover:text-cyan-300"><Pencil className="w-4 h-4"/></button><button onClick={()=>void remove(item.id)} aria-label="Delete saved item" className="text-slate-500 hover:text-rose-300"><Trash2 className="w-4 h-4"/></button></div></div><p className="text-xs text-slate-300 whitespace-pre-wrap mt-2 line-clamp-4">{item.content}</p></article>)}
  </section>
 </div>;
};
