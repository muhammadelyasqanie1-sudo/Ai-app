import type { PackManifest } from './packManifest';
import type { BrowserPackVerification } from './browserPackVerifier';

const DB_NAME='afg-ai-offline-learning';
const DB_VERSION=1;
const STORE_NAMES=['packs','lessons_local','lesson_progress','quiz_attempts','offline_sessions'] as const;
type StoreName=typeof STORE_NAMES[number];
type PackRecord={key:string;id:string;version:string;manifest:PackManifest;model:Blob;installedAt:string};
type LessonRecord={key:string;packKey:string;lessonId:string;language:string;content:string;sha256:string};
export type LessonProgress={packKey:string;lessonId:string;status:'not_started'|'in_progress'|'completed';score:number|null;updatedAt:string};

function openDb():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined') return Promise.reject(new Error('IndexedDB is not available in this runtime.'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('packs'))db.createObjectStore('packs',{keyPath:'key'});
      if(!db.objectStoreNames.contains('lessons_local'))db.createObjectStore('lessons_local',{keyPath:'key'});
      if(!db.objectStoreNames.contains('lesson_progress'))db.createObjectStore('lesson_progress',{keyPath:'key'});
      if(!db.objectStoreNames.contains('quiz_attempts'))db.createObjectStore('quiz_attempts',{keyPath:'id'});
      if(!db.objectStoreNames.contains('offline_sessions'))db.createObjectStore('offline_sessions',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open offline database.'));
  });
}
function requestValue<T>(request:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Offline database operation failed.'));});
}
function transactionDone(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Offline transaction aborted.'));});
}
const packKey=(id:string,version:string)=>id+'@'+version;

export async function installVerifiedPack(
  verification:Extract<BrowserPackVerification,{ok:true}>,
  modelBytes:ArrayBuffer,
  lessonFiles:Record<string,{content:string;language:string}>
):Promise<void>{
  const manifest=verification.manifest;
  if(modelBytes.byteLength!==manifest.model.size_bytes)throw new Error('Model size changed after verification.');
  const expected=new Map(manifest.lessons.map(item=>[item.file,item.sha256.toLowerCase()]));
  const lessonRecords:LessonRecord[]=[];
  for(const [file,lesson] of Object.entries(lessonFiles)){
    const expectedHash=expected.get(file);
    if(!expectedHash)throw new Error('Lesson file is not declared in the signed manifest.');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(lesson.content));
    const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(actual!==expectedHash)throw new Error('Lesson SHA-256 does not match the signed manifest.');
    const lessonId=manifest.lessons.find(item=>item.file===file)!.id;
    lessonRecords.push({key:packKey(manifest.id,manifest.version)+'::'+lessonId,packKey:packKey(manifest.id,manifest.version),lessonId,language:lesson.language,content:lesson.content,sha256:actual});
  }
  if(lessonRecords.length!==manifest.lessons.length)throw new Error('Every signed lesson file must be supplied before installation.');
  const db=await openDb();
  try{
    const tx=db.transaction(['packs','lessons_local'],'readwrite');
    tx.objectStore('packs').put({key:packKey(manifest.id,manifest.version),id:manifest.id,version:manifest.version,manifest,model:new Blob([modelBytes]),installedAt:new Date().toISOString()} satisfies PackRecord);
    for(const lesson of lessonRecords)tx.objectStore('lessons_local').put(lesson);
    await transactionDone(tx);
  }finally{db.close();}
}

export async function listInstalledPacks():Promise<Array<{id:string;version:string;installedAt:string;manifest:PackManifest}>>{
  const db=await openDb();
  try{const tx=db.transaction('packs','readonly');const records=await requestValue(tx.objectStore('packs').getAll() as IDBRequest<PackRecord[]>);return records.map(({id,version,installedAt,manifest})=>({id,version,installedAt,manifest}));}
  finally{db.close();}
}

export async function getLocalLesson(packId:string,version:string,lessonId:string):Promise<LessonRecord|null>{
  const db=await openDb();
  try{const tx=db.transaction('lessons_local','readonly');return await requestValue(tx.objectStore('lessons_local').get(packKey(packId,version)+'::'+lessonId) as IDBRequest<LessonRecord|null>);}
  finally{db.close();}
}

export async function saveLessonProgress(progress:LessonProgress):Promise<void>{
  const db=await openDb();
  try{const tx=db.transaction('lesson_progress','readwrite');tx.objectStore('lesson_progress').put({...progress,key:progress.packKey+'::'+progress.lessonId});await transactionDone(tx);}
  finally{db.close();}
}

export async function listLessonProgress(packKeyValue?:string):Promise<LessonProgress[]>{
  const db=await openDb();
  try{const tx=db.transaction('lesson_progress','readonly');const rows=await requestValue(tx.objectStore('lesson_progress').getAll() as IDBRequest<Array<LessonProgress & {key:string}>>);return rows.filter(row=>!packKeyValue||row.packKey===packKeyValue).map(({packKey,lessonId,status,score,updatedAt})=>({packKey,lessonId,status,score,updatedAt}));}
  finally{db.close();}
}

export async function uninstallLocalPack(packId:string,version:string,deleteProgress=true):Promise<void>{
  const key=packKey(packId,version);
  const db=await openDb();
  try{
    const tx=db.transaction(deleteProgress?['packs','lessons_local','lesson_progress']:['packs','lessons_local'],'readwrite');
    tx.objectStore('packs').delete(key);
    const lessons=tx.objectStore('lessons_local');
    const lessonRows=await requestValue(lessons.getAll() as IDBRequest<LessonRecord[]>);
    for(const row of lessonRows)if(row.packKey===key)lessons.delete(row.key);
    if(deleteProgress){
      const progress=tx.objectStore('lesson_progress');
      const progressRows=await requestValue(progress.getAll() as IDBRequest<Array<LessonProgress & {key:string}>>);
      for(const row of progressRows)if(row.packKey===key)progress.delete(row.key);
    }
    await transactionDone(tx);
  }finally{db.close();}
}

export async function exportLocalLearningData():Promise<string>{
  const db=await openDb();
  try{
    const tx=db.transaction(['packs','lessons_local','lesson_progress','quiz_attempts','offline_sessions'],'readonly');
    const [packs,lessons,progress,quizzes,sessions]=await Promise.all([
      requestValue(tx.objectStore('packs').getAll() as IDBRequest<PackRecord[]>),
      requestValue(tx.objectStore('lessons_local').getAll()),
      requestValue(tx.objectStore('lesson_progress').getAll()),
      requestValue(tx.objectStore('quiz_attempts').getAll()),
      requestValue(tx.objectStore('offline_sessions').getAll())
    ]);
    return JSON.stringify({exportedAt:new Date().toISOString(),packs:packs.map(({id,version,manifest,installedAt})=>({id,version,manifest,installedAt})),lessons,progress,quizzes,sessions},null,2);
  }finally{db.close();}
}
