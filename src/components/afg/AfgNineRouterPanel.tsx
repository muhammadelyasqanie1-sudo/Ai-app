import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Activity,AudioLines,ChevronRight,Download,ExternalLink,Image as ImageIcon,Mic,Play,RefreshCw,Search,Video,Waveform} from 'lucide-react';
import type {Language} from '../../types/afg';
type Model={id:string;object?:string;owned_by?:string;kind?:string;name?:string;created?:number};
type ModelMap=Record<string,Model[]>;
type Kind='image'|'tts'|'stt'|'embedding'|'web'|'image-to-text';
const KINDS:Kind[]=['image','tts','stt','embedding','web','image-to-text'];
const BASE=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
async function call(path:string,options:RequestInit={}){
 const headers=new Headers(options.headers||{});
 if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
 if(options.method&&options.method!=='GET'){
  const csrf=decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('afg_csrf='))?.slice(9)||'');
  headers.set('X-CSRF-Token',csrf);
 }
 const response=await fetch(BASE+path,{...options,headers,credentials:'include',cache:'no-store'});
 const type=response.headers.get('content-type')||'';
 if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||('HTTP '+response.status));}
 if(type.includes('json'))return {data:await response.json(),response};
 return {data:await response.arrayBuffer(),response};
}
export const AfgNineRouterPanel:React.FC<{language:Language}>=({language})=>{
 const dari=language==='dari'||language==='persian',t=(en:string,fa:string)=>dari?fa:en;
 const [models,setModels]=useState<ModelMap>({});
 const [gateway,setGateway]=useState<{configured:boolean;reachable:boolean;dashboardUrl?:string}|null>(null);
 const [kind,setKind]=useState<Kind>('image');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [prompt,setPrompt]=useState('');
 const [imageSize,setImageSize]=useState('1024x1024');
 const [imageCount,setImageCount]=useState(1);
 const [imageModel,setImageModel]=useState('');
 const [generatedImage,setGeneratedImage]=useState('');
 const [searchModel,setSearchModel]=useState('');
 const [searchQuery,setSearchQuery]=useState('');
 const [searchType,setSearchType]=useState('web');
 const [searchResult,setSearchResult]=useState<any>(null);
 const [fetchModel,setFetchModel]=useState('');
 const [fetchUrl,setFetchUrl]=useState('');
 const [fetchResult,setFetchResult]=useState<any>(null);
 const [embeddingModel,setEmbeddingModel]=useState('');
 const [embeddingInput,setEmbeddingInput]=useState('');
 const [embeddingResult,setEmbeddingResult]=useState<any>(null);
 const [ttsModel,setTtsModel]=useState('');
 const [ttsText,setTtsText]=useState('');
 const [ttsAudio,setTtsAudio]=useState('');
 const [voices,setVoices]=useState<any[]>([]);
 const [voiceProvider,setVoiceProvider]=useState('edge-tts');
 const [voiceLanguage,setVoiceLanguage]=useState('en');
 const [modelInfo,setModelInfo]=useState<any>(null);
 const [sttModel,setSttModel]=useState('');
 const [sttFile,setSttFile]=useState<File|null>(null);
 const [sttText,setSttText]=useState('');
 const [videoModel,setVideoModel]=useState('xai/grok-imagine-video');
 const [videoPrompt,setVideoPrompt]=useState('');
 const [videoMode,setVideoMode]=useState<'generate'|'edit'|'extend'>('generate');
 const [videoDuration,setVideoDuration]=useState('8');
 const [videoAspect,setVideoAspect]=useState('16:9');
 const [videoResolution,setVideoResolution]=useState('720p');
 const [videoImageFile,setVideoImageFile]=useState<File|null>(null);
 const [videoSourceUrl,setVideoSourceUrl]=useState('');
 const [videoJob,setVideoJob]=useState<any>(null);
 const [videoConnection,setVideoConnection]=useState('');
 const [visionModel,setVisionModel]=useState('');
 const [visionFile,setVisionFile]=useState<File|null>(null);
 const [visionQuestion,setVisionQuestion]=useState('Describe this image.');
 const [visionAnswer,setVisionAnswer]=useState('');
 const [busy,setBusy]=useState('');
 const modelFor=(k:Kind)=>models[k]||[];
 const choices=useMemo(()=>modelFor(kind),[models,kind]);
 const loadModels=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const results=await Promise.all(KINDS.map(async k=>{
    const result=await call('/api/9router/models?kind='+k);
    const data=result.data?.data||result.data?.models||[];
    return [k,Array.isArray(data)?data.filter((m:any)=>typeof m?.id==='string'):[]] as const;
   }));
   const map=Object.fromEntries(results) as ModelMap;
   setModels(map);
   const first=(k:Kind)=>map[k]?.[0]?.id||'';
   setImageModel(v=>v||first('image'));
   setTtsModel(v=>v||first('tts'));
   setSttModel(v=>v||first('stt'));
   setEmbeddingModel(v=>v||first('embedding'));
   setSearchModel(v=>v||first('web'));
   setFetchModel(v=>v||first('web'));
   setVideoModel(v=>v||first('image'));
  }catch(e){setError(e instanceof Error?e.message:'Could not load 9Router models.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void loadModels();},[loadModels]);
 useEffect(()=>{call('/api/9router/status').then(r=>setGateway(r.data)).catch(()=>setGateway({configured:false,reachable:false}));},[]);
 const run=async(key:string,fn:()=>Promise<void>)=>{
  setBusy(key);setError('');setNotice('');
  try{await fn();setNotice(t('Request completed.','درخواست انجام شد.'));}
  catch(e){setError(e instanceof Error?e.message:'9Router request failed.');}
  finally{setBusy('');}
 };
 const generateImage=()=>run('image',async()=>{
  if(!imageModel||!prompt.trim())throw new Error('Choose an image model and enter a prompt.');
  const {data}=await call('/api/9router/images/generations',{method:'POST',body:JSON.stringify({model:imageModel,prompt,n:imageCount,size:imageSize})});
  const item=data?.data?.[0];if(!item)throw new Error('The image provider returned no image.');
  if(item.url)setGeneratedImage(item.url);
  else if(item.b64_json)setGeneratedImage('data:image/png;base64,'+item.b64_json);
  else throw new Error('The provider returned an unsupported image format.');
 });
 const search=()=>run('search',async()=>{
  if(!searchModel||!searchQuery.trim())throw new Error('Choose a search model and enter a query.');
  const {data}=await call('/api/9router/search',{method:'POST',body:JSON.stringify({model:searchModel,query:searchQuery,max_results:8,search_type:searchType})});
  setSearchResult(data);
 });
 const fetchPage=()=>run('fetch',async()=>{
  if(!fetchModel||!/^https:\/\//i.test(fetchUrl))throw new Error('Choose a fetch model and enter an HTTPS URL.');
  const {data}=await call('/api/9router/web/fetch',{method:'POST',body:JSON.stringify({model:fetchModel,url:fetchUrl,format:'markdown',max_characters:12000})});
  setFetchResult(data);
 });
 const embed=()=>run('embedding',async()=>{
  if(!embeddingModel||!embeddingInput.trim())throw new Error('Choose an embedding model and enter text.');
  const input=embeddingInput.split('\n').map(v=>v.trim()).filter(Boolean);
  const {data}=await call('/api/9router/embeddings',{method:'POST',body:JSON.stringify({model:embeddingModel,input:input.length>1?input:input[0]})});
  setEmbeddingResult({model:data.model,usage:data.usage,count:data.data?.length,dimensions:data.data?.[0]?.embedding?.length,preview:data.data?.[0]?.embedding?.slice(0,12)});
 });
 const loadVoices=()=>run('voices',async()=>{if(!voiceProvider.trim())throw new Error('Choose a TTS provider.');const {data}=await call('/api/9router/audio/voices?provider='+encodeURIComponent(voiceProvider)+'&lang='+encodeURIComponent(voiceLanguage));const list=Array.isArray(data.data)?data.data:Array.isArray(data.voices)?data.voices:[];setVoices(list);if(!list.length)throw new Error('No voices were returned for this provider and language.');});
 const inspectModel=()=>run('model-info',async()=>{const id=kind==='image'?imageModel:kind==='tts'?ttsModel:kind==='stt'?sttModel:kind==='embedding'?embeddingModel:searchModel;if(!id)throw new Error('Select a model first.');const {data}=await call('/api/9router/models/info?id='+encodeURIComponent(id)+'&kind='+encodeURIComponent(kind));setModelInfo(data);});
 const synthesize=()=>run('tts',async()=>{
  if(!ttsModel||!ttsText.trim())throw new Error('Choose a voice model and enter text.');
  const {data}=await call('/api/9router/audio/speech?response_format=json',{method:'POST',body:JSON.stringify({model:ttsModel,input:ttsText.slice(0,5000)})});
  if(!data.audio)throw new Error('The voice provider returned no audio.');
  setTtsAudio('data:audio/'+String(data.format||'mp3')+';base64,'+data.audio);
 });
 const transcribe=()=>run('stt',async()=>{
  if(!sttModel||!sttFile)throw new Error('Choose a speech model and an audio file.');
  if(sttFile.size>20*1024*1024)throw new Error('Audio file must be 20 MB or smaller.');
  const form=new FormData();form.append('model',sttModel);form.append('file',sttFile);
  const {data}=await call('/api/9router/audio/transcriptions',{method:'POST',body:form});
  setSttText(typeof data==='string'?data:(data.text||JSON.stringify(data,null,2)));
 });
 const vision=()=>run('vision',async()=>{
  if(!visionModel||!visionFile)throw new Error('Choose a vision model and an image.');
  if(visionFile.size>8*1024*1024)throw new Error('Image must be 8 MB or smaller.');
  const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read image.'));reader.readAsDataURL(visionFile);});
  const {data}=await call('/api/9router/chat/completions',{method:'POST',body:JSON.stringify({model:visionModel,temperature:0,messages:[{role:'user',content:[{type:'text',text:visionQuestion},{type:'image_url',image_url:{url:dataUrl}}]}]})});
  setVisionAnswer(data.choices?.[0]?.message?.content||JSON.stringify(data,null,2));
 });
 const createVideo=()=>run('video',async()=>{
  if(!videoModel.trim())throw new Error('Enter the 9Router video model ID.');
  const body:any={model:videoModel.trim()};
  if(videoMode==='generate'){
   if(!videoPrompt.trim()&&!videoImageFile)throw new Error('Enter a prompt or select an image for image-to-video.');
   if(videoPrompt.trim())body.prompt=videoPrompt.trim();
   if(videoImageFile){if(videoImageFile.size>8*1024*1024)throw new Error('Video reference image must be 8 MB or smaller.');body.image={url:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read reference image.'));reader.readAsDataURL(videoImageFile);})};}
  }else{
   if(!/^https:\/\//i.test(videoSourceUrl.trim()))throw new Error('Provide a public HTTPS source video URL.');
   body.video={url:videoSourceUrl.trim()};if(videoPrompt.trim())body.prompt=videoPrompt.trim();
  }
  body.duration=Number(videoDuration);body.aspect_ratio=videoAspect;body.resolution=videoResolution;
  const endpoint=videoMode==='generate'?'generations':videoMode==='edit'?'edits':'extensions';
  const {data,response}=await call('/api/9router/videos/'+endpoint,{method:'POST',body:JSON.stringify(body)});
  const jobId=data.request_id||data.id||data.requestId;
  if(!jobId)throw new Error('9Router did not return a video job identifier.');
  setVideoJob(data);setVideoConnection(response.headers.get('X-9Router-Connection-Id')||'');
 });
 const pollVideo=()=>run('poll',async()=>{
  const jobId=videoJob?.id||videoJob?.request_id||videoJob?.requestId;
  if(!jobId)throw new Error('No video job is available to poll.');
  const headers=new Headers();if(videoConnection)headers.set('X-9Router-Connection-Id',videoConnection);
  const {data}=await call('/api/9router/videos/'+encodeURIComponent(jobId),{headers});
  setVideoJob(data);
 });
 const selectClass='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white';
 const inputClass='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500';
 const kinds=[{id:'image',label:t('Image generation','تولید تصویر'),icon:ImageIcon},{id:'image-to-text',label:t('Vision','درک تصویر'),icon:Activity},{id:'web',label:t('Search & fetch','جستجو و استخراج وب'),icon:Search},{id:'tts',label:t('Text to speech','متن به گفتار'),icon:AudioLines},{id:'stt',label:t('Speech to text','گفتار به متن'),icon:Mic},{id:'embedding',label:t('Embeddings','بردارهای معنایی'),icon:Activity}] as const;
 return <div className="space-y-4 rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 sm:p-5">
  <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-white">9Router · Multimodal AI Gateway</h2><p className="mt-1 text-xs leading-5 text-slate-400">{t('Use one configured gateway for chat models, images, audio, embeddings, web search and web extraction. Providers and models appear only when 9Router reports them.','با یک درگاه تنظیم‌شده از مدل‌های گفتگو، تصویر، صدا، Embedding، جستجوی وب و استخراج محتوا استفاده کنید. فقط مدل‌هایی نمایش داده می‌شوند که 9Router گزارش کند.')}</p></div><button onClick={()=>void loadModels()} disabled={loading} className="rounded-xl border border-slate-700 p-2 text-slate-300"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/></button></header>
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3"><span className={'inline-flex items-center gap-2 text-xs '+(gateway?.reachable?'text-emerald-300':'text-amber-300')}><span className={'h-2 w-2 rounded-full '+(gateway?.reachable?'bg-emerald-400':'bg-amber-400')}/>{gateway?.reachable?t('9Router is reachable','ارتباط با 9Router برقرار است'):gateway?.configured?t('9Router configured but unreachable','9Router تنظیم شده ولی در دسترس نیست'):t('9Router is not configured','9Router تنظیم نشده است')}</span>{gateway?.dashboardUrl&&<a href={gateway.dashboardUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-cyan-300">{t('Open 9Router dashboard','بازکردن داشبورد 9Router')}<ExternalLink className="h-3 w-3"/></a>}</div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">{notice}</div>}
  <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5">{kinds.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setKind(item.id)} className={'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-[11px] '+(kind===item.id?'border-cyan-400/50 bg-cyan-400/10 text-cyan-200':'border-slate-800 bg-slate-900 text-slate-400')}><Icon className="h-4 w-4"/>{item.label}</button>;})}</nav>
  <div className="flex flex-wrap items-center gap-2"><button onClick={()=>void inspectModel()} disabled={busy==='model-info'} className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">{t('Inspect model settings','بررسی مشخصات مدل')}</button>{modelInfo&&<button onClick={()=>setModelInfo(null)} className="text-[11px] text-slate-500">{t('Clear metadata','پاک‌کردن مشخصات')}</button>}</div>{modelInfo&&<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-[10px] text-slate-300">{JSON.stringify(modelInfo,null,2)}</pre>}
  <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
   {kind==='image'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Generate image','تولید تصویر')}</h3><select className={selectClass} value={imageModel} onChange={e=>setImageModel(e.target.value)}><option value="">{t('Select verified image model','مدل تصویر را انتخاب کنید')}</option>{modelFor('image').map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><textarea className={inputClass} rows={4} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={t('Describe the image…','تصویر مورد نظر را توصیف کنید…')}/><div className="grid grid-cols-2 gap-2"><select className={selectClass} value={imageSize} onChange={e=>setImageSize(e.target.value)}>{['1024x1024','1792x1024','1024x1792','512x512'].map(x=><option key={x}>{x}</option>)}</select><select className={selectClass} value={imageCount} onChange={e=>setImageCount(Number(e.target.value))}><option value={1}>1 image</option><option value={2}>2 images</option><option value={3}>3 images</option><option value={4}>4 images</option></select></div><button onClick={()=>void generateImage()} disabled={busy==='image'||!imageModel||!prompt.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{busy==='image'?'…':t('Generate','تولید')}</button>{generatedImage&&<div className="space-y-2"><img src={generatedImage} alt="Generated by 9Router" className="max-h-[520px] w-full rounded-xl object-contain"/><a href={generatedImage} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-cyan-300"><Download className="h-3 w-3"/>{t('Open generated image','بازکردن تصویر تولیدشده')}</a></div>}</div>}
   {kind==='image-to-text'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Vision · image understanding','درک و تحلیل تصویر')}</h3><select className={selectClass} value={visionModel} onChange={e=>setVisionModel(e.target.value)}><option value="">Select vision model</option>{modelFor('image-to-text').map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setVisionFile(e.target.files?.[0]||null)} className="w-full text-xs text-slate-300"/><textarea className={inputClass} rows={2} value={visionQuestion} onChange={e=>setVisionQuestion(e.target.value)} placeholder={t('What should the model inspect?','مدل چه چیزی را بررسی کند؟')}/><button onClick={()=>void vision()} disabled={busy==='vision'||!visionModel||!visionFile||!visionQuestion.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Analyze image','تحلیل تصویر')}</button>{visionAnswer&&<pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{visionAnswer}</pre>}</div>}
   {kind==='web'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Web search & fetch','جستجو و استخراج وب')}</h3><select className={selectClass} value={searchModel} onChange={e=>setSearchModel(e.target.value)}><option value="">{t('Select search model','مدل جستجو')}</option>{modelFor('web').filter(m=>m.kind==='webSearch'||m.id.endsWith('/search')).map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><textarea className={inputClass} rows={2} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder={t('Search the web…','در وب جستجو کنید…')}/><select className={selectClass} value={searchType} onChange={e=>setSearchType(e.target.value)}><option value="web">Web</option><option value="news">News</option><option value="x">X / social posts</option></select><button onClick={()=>void search()} disabled={busy==='search'||!searchModel||!searchQuery.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Search','جستجو')}</button>{searchResult&&<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{JSON.stringify(searchResult,null,2)}</pre>}<div className="border-t border-slate-800 pt-3"><select className={selectClass} value={fetchModel} onChange={e=>setFetchModel(e.target.value)}><option value="">{t('Select web fetch model','مدل استخراج وب')}</option>{modelFor('web').filter(m=>m.kind==='webFetch'||m.id.endsWith('/fetch')).map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><input className={inputClass+' mt-2'} value={fetchUrl} onChange={e=>setFetchUrl(e.target.value)} placeholder="https://example.com/article"/><button onClick={()=>void fetchPage()} disabled={busy==='fetch'||!fetchModel||!fetchUrl.trim()} className="mt-2 rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-200">{t('Extract webpage','استخراج محتوا')}</button>{fetchResult&&<div className="mt-3 space-y-2"><b className="text-sm text-white">{fetchResult.data?.title||fetchResult.title||'Extracted content'}</b><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{fetchResult.data?.content?.text||fetchResult.content?.text||JSON.stringify(fetchResult,null,2)}</pre></div>}</div></div>}
   {kind==='tts'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Text to speech','تبدیل متن به گفتار')}</h3><select className={selectClass} value={ttsModel} onChange={e=>setTtsModel(e.target.value)}><option value="">Select TTS model</option>{modelFor('tts').map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><div className="grid gap-2 sm:grid-cols-3"><select className={selectClass} value={voiceProvider} onChange={e=>setVoiceProvider(e.target.value)}><option value="edge-tts">Edge TTS</option><option value="elevenlabs">ElevenLabs</option><option value="deepgram">Deepgram</option><option value="inworld">Inworld</option><option value="openai">OpenAI</option></select><input className={inputClass} value={voiceLanguage} onChange={e=>setVoiceLanguage(e.target.value)} placeholder="Language: en / fa / ps"/><button onClick={()=>void loadVoices()} disabled={busy==='voices'} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">{t('Load voices','بارگذاری صداها')}</button></div>{voices.length>0&&<select className={selectClass} value={ttsModel} onChange={e=>setTtsModel(e.target.value)}><option value="">Select voice</option>{voices.map((voice:any)=><option key={voice.model||voice.id||voice.name} value={voice.model||voice.id}>{voice.name||voice.model||voice.id}</option>)}</select>}<textarea className={inputClass} rows={4} maxLength={5000} value={ttsText} onChange={e=>setTtsText(e.target.value)} placeholder={t('Text to speak…','متن برای خواندن…')}/><button onClick={()=>void synthesize()} disabled={busy==='tts'||!ttsModel||!ttsText.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Generate speech','تولید صدا')}</button>{ttsAudio&&<audio controls src={ttsAudio} className="w-full"/>}</div>}
   {kind==='stt'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Speech to text','تبدیل گفتار به متن')}</h3><select className={selectClass} value={sttModel} onChange={e=>setSttModel(e.target.value)}><option value="">Select STT model</option>{modelFor('stt').map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><input type="file" accept="audio/*" onChange={e=>setSttFile(e.target.files?.[0]||null)} className="w-full text-xs text-slate-300"/><button onClick={()=>void transcribe()} disabled={busy==='stt'||!sttModel||!sttFile} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Transcribe','پیاده‌سازی متن')}</button>{sttText&&<textarea readOnly rows={6} value={sttText} className={inputClass}/>}</div>}
   {kind==='embedding'&&<div className="space-y-3"><h3 className="font-bold text-white">{t('Create text embeddings','ساخت بردار معنایی متن')}</h3><select className={selectClass} value={embeddingModel} onChange={e=>setEmbeddingModel(e.target.value)}><option value="">Select embedding model</option>{modelFor('embedding').map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><textarea className={inputClass} rows={5} value={embeddingInput} onChange={e=>setEmbeddingInput(e.target.value)} placeholder={t('One text per line…','هر خط یک متن…')}/><button onClick={()=>void embed()} disabled={busy==='embedding'||!embeddingModel||!embeddingInput.trim()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Create embeddings','ساخت Embedding')}</button>{embeddingResult&&<pre className="overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{JSON.stringify(embeddingResult,null,2)}</pre>}</div>}
  </section>
  <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4"><div className="flex items-center gap-2"><Video className="h-4 w-4 text-cyan-300"/><h3 className="font-bold text-white">{t('Video generation jobs','وظایف تولید ویدیو')}</h3></div><p className="mt-1 text-[11px] text-slate-500">{t('Video creation is asynchronous and is not automatically retried, avoiding duplicate paid jobs.','تولید ویدیو غیرهمزمان است و برای جلوگیری از ایجاد درخواست تکراری و هزینه اضافی خودکار تکرار نمی‌شود.')}</p><input className={inputClass+' mt-3'} value={videoModel} onChange={e=>setVideoModel(e.target.value)} placeholder="xai/grok-imagine-video"/><div className="grid gap-2 sm:grid-cols-3"><select className={selectClass} value={videoMode} onChange={e=>setVideoMode(e.target.value as any)}><option value="generate">{t('Generate','تولید')}</option><option value="edit">{t('Edit video','ویرایش ویدیو')}</option><option value="extend">{t('Extend video','ادامه ویدیو')}</option></select><select className={selectClass} value={videoDuration} onChange={e=>setVideoDuration(e.target.value)}>{['5','6','8','10','12','15'].map(v=><option key={v} value={v}>{v}s</option>)}</select><select className={selectClass} value={videoAspect} onChange={e=>setVideoAspect(e.target.value)}>{['16:9','9:16','1:1','4:3','3:4','3:2','2:3'].map(v=><option key={v}>{v}</option>)}</select><select className={selectClass} value={videoResolution} onChange={e=>setVideoResolution(e.target.value)}>{['480p','720p','1080p'].map(v=><option key={v}>{v}</option>)}</select></div>{videoMode==='generate'?<><textarea className={inputClass} rows={2} value={videoPrompt} onChange={e=>setVideoPrompt(e.target.value)} placeholder={t('Describe the video…','ویدیو را توصیف کنید…')}/><label className="block text-[11px] text-slate-400">{t('Optional image-to-video reference','تصویر مرجع اختیاری برای تبدیل تصویر به ویدیو')}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setVideoImageFile(e.target.files?.[0]||null)} className="mt-1 w-full text-xs text-slate-300"/></label></>:<><input className={inputClass} value={videoSourceUrl} onChange={e=>setVideoSourceUrl(e.target.value)} placeholder="https://example.com/source.mp4"/><textarea className={inputClass} rows={2} value={videoPrompt} onChange={e=>setVideoPrompt(e.target.value)} placeholder={t('Describe requested changes (optional)','تغییرات مورد نظر (اختیاری)')}/></>}><div className="mt-2 flex flex-wrap gap-2"><button onClick={()=>void createVideo()} disabled={busy==='video'||!videoModel.trim()||(videoMode==='generate'&&!videoPrompt.trim()&&!videoImageFile)||(videoMode!=='generate'&&!videoSourceUrl.trim())} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950">{t('Start video job','شروع تولید ویدیو')}</button>{videoJob&&<button onClick={()=>void pollVideo()} disabled={busy==='poll'} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-200">{t('Check status','بررسی وضعیت')}</button>}</div>{videoJob&&<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{JSON.stringify(videoJob,null,2)}</pre>}{(videoJob?.video?.url||videoJob?.video_url)&&<a href={videoJob.video?.url||videoJob.video_url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300">{t('Open generated video','بازکردن ویدیوی تولیدشده')}</a>}</section>
  {loading&&<p className="text-[11px] text-slate-500">{t('Discovering live models from the configured 9Router…','در حال شناسایی مدل‌های زنده از 9Router…')}</p>}
  <p className="text-[10px] leading-5 text-slate-500">{t('9Router is a separate gateway. Configure NINEROUTER_BASE_URL and NINEROUTER_API_KEY on the server. Model access, quota, costs and regional availability are controlled by the upstream provider and your account permissions.','9Router یک درگاه مستقل است. متغیرهای NINEROUTER_BASE_URL و NINEROUTER_API_KEY را فقط در سرور تنظیم کنید. دسترسی مدل، سهمیه، هزینه و دسترسی جغرافیایی تابع ارائه‌دهنده و مجوز حساب شما است.')}</p>
 </div>;
};
