import React,{useMemo,useState} from 'react';
import {Braces,CalendarClock,Code2,Copy,FileJson,KeyRound,RefreshCw,ShieldCheck,TerminalSquare,WandSparkles} from 'lucide-react';
import type {Language} from '../../types/afg';

type ToolId='json'|'timestamp'|'schema'|'types'|'jwt'|'uuid'|'base64'|'curl'|'cron'|'http'|'ai-tool';
const TOOL_IDS:ToolId[]=['json','timestamp','schema','types','jwt','uuid','base64','curl','cron','http','ai-tool'];
const STATUS:Record<number,string>={
 100:'Continue',101:'Switching Protocols',200:'OK',201:'Created',202:'Accepted',204:'No Content',
 301:'Moved Permanently',302:'Found',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',
 400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',
 408:'Request Timeout',409:'Conflict',410:'Gone',413:'Content Too Large',415:'Unsupported Media Type',
 422:'Unprocessable Content',429:'Too Many Requests',500:'Internal Server Error',501:'Not Implemented',
 502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'
};
function schemaOf(value:any):any{
 if(value===null)return {type:'null'};
 if(Array.isArray(value))return {type:'array',items:value.length?schemaOf(value[0]):{}};
 if(typeof value==='object'){
  const properties:Record<string,any>={};for(const [key,item] of Object.entries(value))properties[key]=schemaOf(item);
  return {type:'object',properties,required:Object.keys(value),additionalProperties:false};
 }
 return {type:typeof value};
}
function tsOf(value:any,name='Root'):string{
 const type=(v:any):string=>{
  if(v===null)return 'null';if(Array.isArray(v))return v.length?type(v[0])+'[]':'unknown[]';
  if(typeof v==='object')return '{ '+Object.entries(v).map(([k,x])=>JSON.stringify(k)+(x===null?'?':'')+': '+type(x)).join('; ')+' }';
  return typeof v;
 };
 return 'export type '+name+' = '+type(value)+';\n';
}
function zodOf(value:any):string{
 if(value===null)return 'z.null()';if(Array.isArray(value))return value.length?'z.array('+zodOf(value[0])+')':'z.array(z.unknown())';
 if(typeof value==='object')return 'z.object({\n'+Object.entries(value).map(([k,v])=>'  '+JSON.stringify(k)+': '+zodOf(v)+',').join('\n')+'\n})';
 if(typeof value==='string')return 'z.string()';if(typeof value==='number')return Number.isInteger(value)?'z.number().int()':'z.number()';
 if(typeof value==='boolean')return 'z.boolean()';return 'z.unknown()';
}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function b64ToBytes(value:string):Uint8Array{const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function tokenizeShell(input:string):string[]{
 const result:string[]=[];let token='',quote='',escaped=false,active=false;
 for(const ch of input){
  if(escaped){token+=ch;escaped=false;active=true;continue;}
  if(ch==='\\'&&quote!="'"){escaped=true;active=true;continue;}
  if(quote){if(ch===quote)quote='';else token+=ch;active=true;continue;}
  if(ch==='"'||ch==="'"){quote=ch;active=true;continue;}
  if(/\s/.test(ch)){if(active){result.push(token);token='';active=false;}continue;}
  token+=ch;active=true;
 }
 if(escaped)token+='\\';if(quote)throw new Error('Unclosed quote in cURL command.');
 if(active)result.push(token);return result;
}
function curlToCode(input:string):{js:string;python:string}{
 const args=tokenizeShell(input.trim().replace(/^curl\s+/i,''));let method='',url='',body:string|undefined;const headers:string[]=[];
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='-X'||arg==='--request')method=args[++i]||'';
  else if(arg==='-H'||arg==='--header')headers.push(args[++i]||'');
  else if(['-d','--data','--data-raw','--data-binary'].includes(arg))body=args[++i]||'';
  else if(arg.startsWith('http://')||arg.startsWith('https://'))url=arg;
  else if(arg==='-u'||arg==='--user')throw new Error('Basic auth needs to be converted to a secure server-side credential before using this connector.');
  else if(arg==='-F'||arg==='--form')throw new Error('Multipart -F cURL conversion is not supported in this compact converter yet.');
 }
 if(!url)throw new Error('No HTTP(S) URL was found in the cURL command.');
 const verb=method||(body?'POST':'GET');
 const headerObj=Object.fromEntries(headers.map(h=>{const i=h.indexOf(':');return i<0?[h,'']:[h.slice(0,i).trim(),h.slice(i+1).trim()];}));
 const js='const response = await fetch('+JSON.stringify(url)+', {\n  method: '+JSON.stringify(verb)+',\n  headers: '+JSON.stringify(headerObj,null,2).split('\n').join('\n  ')+','+(body?'\n  body: '+JSON.stringify(body)+',':'')+'\n});\nconst data = await response.json();\nif (!response.ok) throw new Error("HTTP " + response.status);\nconsole.log(data);';
 const py='import requests\n\nresponse = requests.request(\n    '+JSON.stringify(verb)+',\n    '+JSON.stringify(url)+',\n    headers='+JSON.stringify(headerObj)+','+(body?'\n    data='+JSON.stringify(body)+',':'')+'\n    timeout=20,\n)\nresponse.raise_for_status()\nprint(response.json())';
 return {js,python:py};
}
function cronField(field:string,min:number,max:number):Set<number>{
 const values=new Set<number>();
 for(const segment of field.split(',')){
  const [range,stepText]=segment.split('/');const step=stepText===undefined?1:Number(stepText);
  if(!Number.isInteger(step)||step<1)throw new Error('Invalid cron step.');
  let start=min,end=max;
  if(range!=='*'){
   const pair=range.split('-');start=Number(pair[0]);end=pair.length>1?Number(pair[1]):start;
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<min||end>max||start>end)throw new Error('Invalid cron field range.');
  }
  for(let v=start;v<=end;v+=step)values.add(v);
 }
 return values;
}
function nextCron(expression:string,count=5):string[]{
 const fields=expression.trim().split(/\s+/);if(fields.length!==5)throw new Error('Use the standard five-field cron format: minute hour day month weekday.');
 const minutes=cronField(fields[0],0,59),hours=cronField(fields[1],0,23),days=cronField(fields[2],1,31),months=cronField(fields[3],1,12),weekdays=cronField(fields[4],0,7);
 const dayWildcard=fields[2]==='*',weekWildcard=fields[4]==='*';
 const results:string[]=[];const cursor=new Date();cursor.setSeconds(0,0);cursor.setMinutes(cursor.getMinutes()+1);
 for(let i=0;i<366*24*60&&results.length<count;i++,cursor.setMinutes(cursor.getMinutes()+1)){
  const dayMatch=days.has(cursor.getDate()),weekMatch=weekdays.has(cursor.getDay())||cursor.getDay()===0&&weekdays.has(7);
  const calendarMatch=dayWildcard?weekMatch:weekWildcard?dayMatch:dayMatch||weekMatch;
  if(minutes.has(cursor.getMinutes())&&hours.has(cursor.getHours())&&months.has(cursor.getMonth()+1)&&calendarMatch)results.push(cursor.toLocaleString());
 }
 if(!results.length)throw new Error('No matching run found within the next year.');
 return results;
}
function uuidV4():string{
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function uuidV7():string{
 const bytes=crypto.getRandomValues(new Uint8Array(16));let ms=Date.now();
 for(let i=5;i>=0;i--){bytes[i]=ms&255;ms=Math.floor(ms/256);}
 bytes[6]=(bytes[6]&0x0f)|0x70;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export const AfgPublicApiDeveloperTools:React.FC<{language:Language}>=({language})=>{
 const dari=language==='dari'||language==='persian',t=(en:string,fa:string)=>dari?fa:en;
 const [active,setActive]=useState<ToolId>('json');
 const [input,setInput]=useState('{"name":"AFG AI","active":true,"models":["chat","image"]}');
 const [output,setOutput]=useState('');
 const [message,setMessage]=useState('');
 const [timestamp,setTimestamp]=useState(String(Math.floor(Date.now()/1000)));
 const [timestampDate,setTimestampDate]=useState(new Date().toISOString().slice(0,16));
 const [timestampZone,setTimestampZone]=useState('local');
 const [uuidVersion,setUuidVersion]=useState<'v4'|'v7'>('v7');
 const [file,setFile]=useState<File|null>(null);
 const [jwtKey,setJwtKey]=useState('');
 const [jwt,setJwt]=useState('');
 const [uuidCount,setUuidCount]=useState(5);
 const [curl,setCurl]=useState('curl -X POST https://api.example.com/v1/items -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d \'{"name":"AFG AI"}\'');
 const [cron,setCron]=useState('*/15 * * * *');
 const [toolName,setToolName]=useState('lookup_item');
 const [toolDescription,setToolDescription]=useState('Look up an item using the configured API.');
 const [toolMethod,setToolMethod]=useState('GET');
 const [toolUrl,setToolUrl]=useState('https://api.example.com/items/{id}');
 const [toolSchema,setToolSchema]=useState('{"type":"object","properties":{"id":{"type":"string","description":"Item ID"}},"required":["id"],"additionalProperties":false}');
 const [languageOut,setLanguageOut]=useState('javascript');
 const ids:ToolId[]=['json','timestamp','schema','types','jwt','uuid','base64','curl','cron','http','ai-tool'];
 const titles:Record<ToolId,string>={json:'JSON formatter',timestamp:'Unix timestamp',schema:'JSON Schema',types:'TypeScript & Zod',jwt:'JWT decoder',uuid:'UUID generator',base64:'Base64',curl:'cURL converter',cron:'Cron explainer',http:'HTTP status codes','ai-tool':'AI tool / MCP generator'};
 const run=(fn:()=>string)=>{setMessage('');try{setOutput(fn());}catch(e){setOutput('');setMessage(e instanceof Error?e.message:'Could not process input.');}};
 const format=()=>run(()=>{const data=JSON.parse(input);return JSON.stringify(data,null,2);});
 const minify=()=>run(()=>JSON.stringify(JSON.parse(input)));
 const makeSchema=()=>run(()=>JSON.stringify(schemaOf(JSON.parse(input)),null,2));
 const makeTypes=()=>run(()=>{const value=JSON.parse(input);return '/* TypeScript */\n'+tsOf(value)+'\n/* Zod */\nimport { z } from "zod";\nexport const RootSchema = '+zodOf(value)+';\nexport type Root = z.infer<typeof RootSchema>;'});
 const convertTimestamp=()=>run(()=>{
  const raw=timestamp.trim();if(!/^-?\\d{1,24}$/.test(raw))throw new Error('Enter an integer Unix timestamp.');
  const value=BigInt(raw),digits=raw.replace('-','').length;
  const unit=digits<=10?'seconds':digits<=13?'milliseconds':digits<=16?'microseconds':'nanoseconds';
  const milliseconds=unit==='seconds'?value*1000n:unit==='milliseconds'?value:unit==='microseconds'?value/1000n:value/1000000n;
  const ms=Number(milliseconds);if(!Number.isFinite(ms)||Math.abs(ms)>8.64e15)throw new Error('Timestamp is outside the supported JavaScript Date range.');
  const date=new Date(ms);const iso=date.toISOString();
  const local=date.toLocaleString();const utc=date.toUTCString();
  return JSON.stringify({detectedUnit:unit,iso,utc,local,unixSeconds:String(BigInt(Math.trunc(ms/1000))),unixMilliseconds:String(Math.trunc(ms)),unixMicroseconds:String(BigInt(Math.trunc(ms))*1000n),unixNanoseconds:String(BigInt(Math.trunc(ms))*1000000n)},null,2);
 });
 const dateToTimestamp=()=>run(()=>{
  const date=new Date(timestampDate);if(!Number.isFinite(date.getTime()))throw new Error('Choose a valid date and time.');
  const ms=date.getTime();return JSON.stringify({iso:date.toISOString(),unixSeconds:Math.floor(ms/1000),unixMilliseconds:ms,unixMicroseconds:String(BigInt(ms)*1000n),unixNanoseconds:String(BigInt(ms)*1000000n),selectedTimezone:timestampZone==='utc'?'UTC':'Device local timezone'},null,2);
 });
 const encodeFile=async()=>{setMessage('');setOutput('');if(!file){setMessage('Choose a file first.');return;}if(file.size>10*1024*1024){setMessage('File must be 10 MB or smaller.');return;}try{const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read the file.'));reader.readAsDataURL(file);});setOutput(JSON.stringify({name:file.name,type:file.type||'application/octet-stream',sizeBytes:file.size,dataUrl},null,2));}catch(e){setMessage(e instanceof Error?e.message:'Could not encode file.');}};
 const decodeJwt=()=>run(()=>{
  const parts=jwt.trim().split('.');if(parts.length!==3)throw new Error('A JWT must have three dot-separated segments.');
  const parse=(v:string)=>JSON.parse(new TextDecoder().decode(b64ToBytes(v)));
  const header=parse(parts[0]),payload=parse(parts[1]);
  return JSON.stringify({header,payload,signaturePresent:Boolean(parts[2]),signatureVerified:false,note:'This tool only decodes header and payload. It does not verify the signature.'},null,2);
 });
 const makeUuids=()=>run(()=>Array.from({length:Math.max(1,Math.min(100,uuidCount))},()=>uuidVersion==='v4'?uuidV4():uuidV7()).join('\n'));
 const verifyJwt=async()=>{
  setOutput('');setMessage('');
  try{
   const parts=jwt.trim().split('.');if(parts.length!==3)throw new Error('A JWT must contain three segments.');
   const decodePart=(part:string)=>JSON.parse(new TextDecoder().decode(b64ToBytes(part)));
   const header=decodePart(parts[0]),payload=decodePart(parts[1]),algorithm=String(header.alg||'');
   if(!jwtKey.trim())throw new Error('Enter the HMAC secret or public key.');
   const input=new TextEncoder().encode(parts[0]+'.'+parts[1]),signature=b64ToBytes(parts[2]);
   const hashName=algorithm.endsWith('256')?'SHA-256':algorithm.endsWith('384')?'SHA-384':algorithm.endsWith('512')?'SHA-512':'';
   if(!hashName)throw new Error('Only HS, RS, PS and ES JWT algorithms with SHA-256/384/512 are supported.');
   let key:CryptoKey,verifyAlgorithm:AlgorithmIdentifier|RsaPssParams|EcdsaParams;
   if(algorithm.startsWith('HS')){
    key=await crypto.subtle.importKey('raw',new TextEncoder().encode(jwtKey),{name:'HMAC',hash:hashName},false,['verify']);
    verifyAlgorithm={name:'HMAC'};
   }else{
    if(jwtKey.includes('PRIVATE KEY'))throw new Error('Only a public key can be used for JWT verification.');
    const pem=jwtKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,'');
    const binary=atob(pem),der=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(algorithm.startsWith('RS')||algorithm.startsWith('PS')){
     const name=algorithm.startsWith('PS')?'RSA-PSS':'RSASSA-PKCS1-v1_5';
     key=await crypto.subtle.importKey('spki',der,{name,modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:hashName},false,['verify']);
     verifyAlgorithm=algorithm.startsWith('PS')?{name:'RSA-PSS',saltLength:Number(hashName.slice(5))/8}:{name:'RSASSA-PKCS1-v1_5'};
    }else if(algorithm.startsWith('ES')){
     const namedCurve=algorithm==='ES256'?'P-256':algorithm==='ES384'?'P-384':algorithm==='ES512'?'P-521':'';
     if(!namedCurve)throw new Error('Unsupported ECDSA curve.');
     key=await crypto.subtle.importKey('spki',der,{name:'ECDSA',namedCurve},false,['verify']);
     verifyAlgorithm={name:'ECDSA',hash:hashName};
    }else throw new Error('Unsupported JWT algorithm.');
   }
   const verified=await crypto.subtle.verify(verifyAlgorithm,key,signature,input);
   const now=Math.floor(Date.now()/1000);
   const exp=typeof payload.exp==='number'?payload.exp:null,nbf=typeof payload.nbf==='number'?payload.nbf:null;
   setOutput(JSON.stringify({header,payload,algorithm,signatureVerified:verified,claims:{expired:exp===null?null:now>=exp,notYetValid:nbf===null?null:now<nbf,expiresAt:exp===null?null:new Date(exp*1000).toISOString(),notBefore:nbf===null?null:new Date(nbf*1000).toISOString()},verificationKeyWasSentToServer:false},null,2));
  }catch(e){setMessage(e instanceof Error?e.message:'JWT verification failed.');}
 };

 const base64=()=>run(()=>{if(active==='base64'){try{return new TextDecoder().decode(b64ToBytes(input));}catch{throw new Error('Invalid Base64/Base64URL text.');}}return bytesToB64(new TextEncoder().encode(input));});
 const convertCurl=()=>run(()=>{const result=curlToCode(curl);return result.js+'\n\n--- Python requests ---\n'+result.python;});
 const explainCron=()=>run(()=>{const parts=cron.trim().split(/\s+/);if(parts.length!==5)throw new Error('Use five fields: minute hour day month weekday.');const next=nextCron(cron);return 'Minute: '+parts[0]+'\nHour: '+parts[1]+'\nDay of month: '+parts[2]+'\nMonth: '+parts[3]+'\nDay of week: '+parts[4]+'\n\nNext matching local runs:\n'+next.map((v,i)=>(i+1)+'. '+v).join('\n');});
 const generateTool=()=>run(()=>{const schema=JSON.parse(toolSchema);if(schema.type!=='object'||!schema.properties)throw new Error('Tool schema needs type object and properties.');const properties={type:'object',properties:schema.properties,required:schema.required||[],additionalProperties:false};const fn={type:'function',function:{name:toolName,description:toolDescription,parameters:properties}};const mcp={name:toolName,description:toolDescription,inputSchema:properties};return JSON.stringify({openaiTool:fn,mcpTool:mcp,httpRequestTemplate:{method:toolMethod,url:toolUrl,security:'Keep credentials in server-side secret storage.'}},null,2);});
 const statusList=Object.entries(STATUS).map(([code,description])=>code+' '+description).join('\n');
 const panelLabel=(id:ToolId)=>titles[id];
 return <div className="space-y-4 rounded-2xl border border-violet-500/20 bg-slate-950/70 p-4 sm:p-5">
  <div className="flex items-start gap-3"><div className="rounded-xl border border-violet-400/30 bg-slate-900 p-2"><Code2 className="h-5 w-5 text-violet-300"/></div><div><h2 className="text-lg font-black text-white">{t('Developer utility studio','استودیوی ابزارهای توسعه‌دهنده')}</h2><p className="mt-1 text-xs leading-5 text-slate-400">{t('Browser-local utilities inspired by the Public APIs developer tools. Pasted data stays in this page and is not sent to AFG AI servers.','ابزارهای محلی مرورگر بر اساس ابزارهای توسعه‌دهنده Public APIs. متن واردشده در همین صفحه پردازش می‌شود و به سرور AFG AI فرستاده نمی‌شود.')}</p></div></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{ids.map(id=><button key={id} onClick={()=>{setActive(id);setOutput('');setMessage('');}} className={'rounded-xl border px-2 py-2 text-[11px] '+(active===id?'border-violet-400/50 bg-violet-400/10 text-violet-200':'border-slate-800 bg-slate-900 text-slate-400')}>{panelLabel(id)}</button>)}</div>
  <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
   {active==='json'&&<><h3 className="font-bold text-white">JSON Formatter & Validator</h3><textarea rows={7} value={input} onChange={e=>setInput(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><div className="flex flex-wrap gap-2"><button onClick={format} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Beautify / validate</button><button onClick={minify} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Minify</button></div></>}
   {active==='timestamp'&&<><h3 className="font-bold text-white">Unix Timestamp Converter</h3><div className="space-y-2"><input value={timestamp} onChange={e=>setTimestamp(e.target.value)} placeholder="Seconds / milliseconds / microseconds / nanoseconds" className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={convertTimestamp} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Timestamp → date</button></div><div className="grid gap-2 sm:grid-cols-3"><input type="datetime-local" value={timestampDate} onChange={e=>setTimestampDate(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white sm:col-span-2"/><select value={timestampZone} onChange={e=>setTimestampZone(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="local">Device local</option><option value="utc">UTC</option></select></div><button onClick={dateToTimestamp} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Date → Unix timestamps</button><p className="text-[10px] text-slate-500">Seconds, milliseconds, microseconds and nanoseconds are detected by digit length; output is local-only.</p></>}
   {active==='schema'&&<><h3 className="font-bold text-white">JSON Schema Generator</h3><textarea rows={7} value={input} onChange={e=>setInput(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={makeSchema} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Generate JSON Schema</button></>}
   {active==='types'&&<><h3 className="font-bold text-white">JSON → TypeScript & Zod</h3><textarea rows={7} value={input} onChange={e=>setInput(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={makeTypes} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Generate TS + Zod</button></>}
   {active==='jwt'&&<><h3 className="font-bold text-white">JWT Decoder & Signature Verifier</h3><textarea rows={4} value={jwt} onChange={e=>setJwt(e.target.value)} placeholder="eyJhbGciOi..." className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><div className="flex flex-wrap gap-2"><button onClick={decodeJwt} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Decode only</button></div><textarea rows={3} value={jwtKey} onChange={e=>setJwtKey(e.target.value)} placeholder="HMAC secret or PEM public key (local only)" className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={()=>void verifyJwt()} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Verify signature locally</button><p className="text-[10px] text-amber-300">Supports HS/RS/PS/ES SHA-256/384/512. The secret/public key never leaves this browser page; signature verification does not replace issuer/audience policy checks.</p></>}
   {active==='uuid'&&<><h3 className="font-bold text-white">UUID v4 / v7 Generator</h3><select value={uuidVersion} onChange={e=>setUuidVersion(e.target.value as 'v4'|'v7')} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"><option value="v4">UUID v4 · random</option><option value="v7">UUID v7 · time-ordered</option></select><label className="text-xs text-slate-400">Count (1–100)<input type="number" min={1} max={100} value={uuidCount} onChange={e=>setUuidCount(Math.max(1,Math.min(100,Number(e.target.value)||1)))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"/></label><button onClick={makeUuids} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Generate UUIDs</button></>}
   {active==='base64'&&<><h3 className="font-bold text-white">Base64 / Base64URL</h3><textarea rows={6} value={input} onChange={e=>setInput(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><div className="flex flex-wrap gap-2"><button onClick={()=>{setOutput('');run(()=>bytesToB64(new TextEncoder().encode(input)));}} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Encode UTF-8</button><button onClick={()=>run(()=>new TextDecoder().decode(b64ToBytes(input)))} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Decode</button></div><div className="border-t border-slate-800 pt-3"><label className="text-xs text-slate-400">Encode a file or image (max 10 MB)<input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} className="mt-2 block w-full text-xs text-slate-300"/></label><button onClick={()=>void encodeFile()} disabled={!file} className="mt-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Encode file as Data URL</button></div></>}
   {active==='curl'&&<><h3 className="font-bold text-white">cURL Converter</h3><textarea rows={7} value={curl} onChange={e=>setCurl(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={convertCurl} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Convert to JavaScript + Python</button></>}
   {active==='cron'&&<><h3 className="font-bold text-white">Cron Expression Explainer</h3><input value={cron} onChange={e=>setCron(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white"/><p className="text-[10px] text-slate-500">Standard 5-field cron · current device local timezone</p><button onClick={explainCron} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Explain & next runs</button></>}
   {active==='http'&&<><h3 className="font-bold text-white">HTTP Status Codes</h3><pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{statusList}</pre></>}
   {active==='ai-tool'&&<><h3 className="font-bold text-white">AI Tool & MCP Generator</h3><div className="grid gap-2 sm:grid-cols-2"><input value={toolName} onChange={e=>setToolName(e.target.value)} placeholder="tool_name" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white"/><select value={toolMethod} onChange={e=>setToolMethod(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white">{['GET','POST','PUT','PATCH','DELETE'].map(x=><option key={x}>{x}</option>)}</select><input value={toolUrl} onChange={e=>setToolUrl(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white sm:col-span-2"/><input value={toolDescription} onChange={e=>setToolDescription(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white sm:col-span-2"/></div><textarea rows={6} value={toolSchema} onChange={e=>setToolSchema(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"/><button onClick={generateTool} className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950">Generate OpenAI + MCP definitions</button></>}
   {message&&<p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{message}</p>}
   {output&&<div className="space-y-2"><div className="flex items-center justify-between"><b className="text-xs text-slate-300">Output</b><button onClick={()=>void navigator.clipboard.writeText(output)} className="inline-flex items-center gap-1 text-xs text-cyan-300"><Copy className="h-3 w-3"/>Copy</button></div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[11px] text-emerald-200">{output}</pre></div>}
  </section>
 </div>;
};
