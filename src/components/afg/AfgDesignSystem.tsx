import React, { Component, useEffect, useRef, useState } from 'react';
import { Check, FileUp, Image as ImageIcon, X } from 'lucide-react';

export function CapabilityBadge({label,enabled}:{label:string;enabled:boolean}) {
 return <span className={`afg-capability-badge ${enabled?'is-enabled':'is-disabled'}`} role="status"><i aria-hidden="true"/>{label}</span>;
}
export function ToolCard({title,description,onClick,icon}:{title:string;description:string;onClick?:()=>void;icon?:React.ReactNode}) {
 return <button type="button" className="afg-tool-card" onClick={onClick} disabled={!onClick}><span aria-hidden="true">{icon||<ImageIcon/>}</span><strong>{title}</strong><small>{description}</small></button>;
}
export function SettingsSection({title,description,children}:{title:string;description?:string;children:React.ReactNode}) {
 return <section className="afg-settings-section"><header><h2>{title}</h2>{description&&<p>{description}</p>}</header>{children}</section>;
}
export function ModelPicker({value,options,onChange,label}:{value:string;options:{value:string;label:string;disabled?:boolean}[];onChange:(v:string)=>void;label:string}) {
 return <label className="afg-field-label">{label}<select className="afg-control" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></label>;
}
export function Composer({value,onChange,onSubmit,placeholder,disabled=false}:{value:string;onChange:(v:string)=>void;onSubmit:()=>void;placeholder:string;disabled?:boolean}) {
 return <form className="afg-composer" onSubmit={e=>{e.preventDefault();if(!disabled&&value.trim())onSubmit();}}><textarea dir="auto" aria-label={placeholder} placeholder={placeholder} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!disabled&&value.trim())onSubmit();}}}/><button type="submit" disabled={disabled||!value.trim()}>Send</button></form>;
}
export function ChatMessage({role,label,children}:{role:'user'|'assistant';label:string;children:React.ReactNode}) {
 return <article className={`afg-message-card is-${role}`} aria-label={label}><strong>{label}</strong><div dir="auto">{children}</div></article>;
}
export function FileDropzone({onFiles,accept,multiple=true}:{onFiles:(files:File[])=>void;accept?:string;multiple?:boolean}) {
 const ref=useRef<HTMLInputElement>(null);const [drag,setDrag]=useState(false);
 const take=(f:FileList|null)=>{if(f?.length)onFiles(Array.from(f));};
 return <div className={`afg-file-dropzone ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);take(e.dataTransfer.files);}}><input ref={ref} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={e=>{take(e.target.files);e.currentTarget.value='';}}/><FileUp/><strong>Drop files here or browse</strong><button type="button" onClick={()=>ref.current?.click()}>Browse files</button></div>;
}
export function ImageGrid({images,onSelect}:{images:{src:string;alt:string}[];onSelect?:(v:{src:string;alt:string})=>void}) {
 return <div className="afg-image-grid">{images.map((v,i)=><button type="button" key={v.src||i} aria-label={v.alt} onClick={()=>onSelect?.(v)}><img src={v.src} alt={v.alt} loading="lazy"/></button>)}</div>;
}
export function SettingsSectionPlaceholder(){}
export function ConfirmDialog({open,title,description,onConfirm,onCancel}:{open:boolean;title:string;description:string;onConfirm:()=>void;onCancel:()=>void}) {
 const ref=useRef<HTMLButtonElement>(null);useEffect(()=>{if(open)ref.current?.focus();},[open]);useEffect(()=>{if(!open)return;const f=(e:KeyboardEvent)=>{if(e.key==='Escape')onCancel();};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[open,onCancel]);
 if(!open)return null;return <div className="afg-dialog-backdrop"><section className="afg-dialog" role="alertdialog" aria-modal="true" aria-labelledby="afg-dialog-title"><h2 id="afg-dialog-title">{title}</h2><p>{description}</p><button type="button" onClick={onCancel}>Cancel</button><button ref={ref} type="button" onClick={onConfirm}>Confirm</button></section></div>;
}
export function Toast({message,kind='info',onDismiss}:{message:string;kind?:'info'|'success'|'error';onDismiss?:()=>void}) {
 return <div className={`afg-toast is-${kind}`} role={kind==='error'?'alert':'status'} aria-live={kind==='error'?'assertive':'polite'}>{kind==='success'&&<Check/>}<span>{message}</span>{onDismiss&&<button type="button" aria-label="Dismiss" onClick={onDismiss}><X/></button>}</div>;
}
export class ErrorBoundary extends Component<{children:React.ReactNode;fallback?:React.ReactNode},{failed:boolean}> {
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){console.error('AFG_UI_RENDER_ERROR',{name:error.name,message:error.message});}
 render(){return this.state.failed?(this.props.fallback||<EmptyState title="Something went wrong"/>):this.props.children;}
}
export function EmptyState({title,description}:{title:string;description?:string}){return <div className="afg-empty-state" role="status"><strong>{title}</strong>{description&&<p>{description}</p>}</div>;}
export function Skeleton({lines=3}:{lines?:number}){return <div className="afg-skeleton-stack" role="status" aria-label="Loading">{Array.from({length:Math.max(1,Math.min(10,lines))},(_,i)=><span key={i} className="afg-skeleton-line"/>)}</div>;}
