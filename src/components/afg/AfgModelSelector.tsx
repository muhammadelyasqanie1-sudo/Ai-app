import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Search, X, Zap } from 'lucide-react';
import type { AfgModelOption, Language } from '../../types/afg';

type Props = {
  models: AfgModelOption[];
  selectedModel: string;
  onSelect: (id: string) => void;
  language: Language;
  loading?: boolean;
};
const brandFor = (provider: string, model: string) => {
  const value = (provider + ' ' + model).toLowerCase();
  if (/anthropic|claude|opus|sonnet|haiku/.test(value)) return { label: 'A', className: 'bg-[#d97757] text-white' };
  if (/openai|gpt|o[134]/.test(value)) return { label: '◎', className: 'bg-[#10a37f] text-white' };
  if (/google|gemini/.test(value)) return { label: '✦', className: 'bg-[#4285f4] text-white' };
  if (/minimax/.test(value)) return { label: 'M', className: 'bg-[#5b63e6] text-white' };
  if (/moonshot|kimi/.test(value)) return { label: 'K', className: 'bg-slate-800 text-white' };
  if (/z-ai|glm/.test(value)) return { label: 'Z', className: 'bg-[#64748b] text-white' };
  if (/qwen|alibaba/.test(value)) return { label: 'Q', className: 'bg-orange-500 text-white' };
  return { label: provider.slice(0, 1).toUpperCase() || 'AI', className: 'bg-slate-700 text-white' };
};
const priceLabel = (model: AfgModelOption) => {
  const p = model.pricing;
  if (p?.inputPerMillion === 0 && p?.outputPerMillion === 0) return '🆓 Free';
  if (p && (p.inputPerMillion != null || p.outputPerMillion != null)) return '💰 Paid';
  if (model.requiresSubscription) return '👑 Premium';
  return 'Pricing unknown';
};
export const AfgModelSelector: React.FC<Props> = ({ models, selectedModel, onSelect, language, loading = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showUpgrade, setShowUpgrade] = useState<AfgModelOption | null>(null);
  const dari = language !== 'english';
  const selected = models.find(m => selectedModel === m.providerId + '::' + m.id);
  const groups = useMemo(() => {
    const filtered = models.filter(m => (m.displayName + ' ' + m.providerId).toLowerCase().includes(query.toLowerCase()));
    return [...new Set(filtered.map(m => m.providerId))].map(provider => ({ provider, items: filtered.filter(m => m.providerId === provider) }));
  }, [models, query]);
  const choose = (model: AfgModelOption) => {
    if (!model.selectable) {
      setShowUpgrade(model);
      return;
    }
    onSelect(model.providerId + '::' + model.id);
    setOpen(false);
  };
  return <>
    <button type="button" disabled={loading} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      className="afg-model-trigger flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-sm">
      {selected ? (() => { const b=brandFor(selected.providerId,selected.id); return <span className={'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold '+b.className}>{b.label}</span>; })() : <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-slate-700">✦</span>}
      <span className="min-w-0 truncate font-semibold">{selected?.displayName || (dari ? 'انتخاب خودکار مدل' : 'Auto model')}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
    </button>
    {open && <div className="afg-model-sheet-root" role="presentation" onMouseDown={e => { if(e.target===e.currentTarget)setOpen(false); }}>
      <section className="afg-model-sheet" role="dialog" aria-modal="true" aria-label={dari ? 'انتخاب مدل' : 'Select model'}>
        <header className="flex items-center justify-between border-b px-4 py-4">
          <div><h2 className="text-base font-semibold">{dari ? 'انتخاب مدل' : 'Select model'}</h2><p className="mt-1 text-xs opacity-60">{models.length} {dari ? 'مدل شناسایی‌شده' : 'discovered models'}</p></div>
          <button className="rounded-full p-2 hover:bg-black/5" onClick={()=>setOpen(false)} aria-label="Close"><X size={19}/></button>
        </header>
        <div className="px-4 pt-3"><label className="afg-model-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={dari?'جستجوی مدل یا ارائه‌دهنده':'Search models or providers'}/></label></div>
        <div className="afg-model-list">
          <button className={'afg-model-row '+(!selected?'is-selected':'')} onClick={()=>{onSelect('auto');setOpen(false);}}>
            <span className="afg-brand-mark bg-slate-800 text-white">✦</span><span className="min-w-0 flex-1"><strong>Auto</strong><small>{dari?'انتخاب خودکار مدل سالم':'Choose the healthiest eligible model'}</small></span><span className="text-xs opacity-60">AUTO</span>{!selected&&<Check size={18}/>}
          </button>
          {groups.map(group=><div key={group.provider}><div className="afg-model-group-title">{group.provider}</div>{group.items.map(model=>{const brand=brandFor(model.providerId,model.id);const active=selectedModel===model.providerId+'::'+model.id;const disabled=!model.selectable;return <button key={model.providerId+'::'+model.id} className={'afg-model-row '+(active?'is-selected ':'')+(disabled?'is-disabled':'')} onClick={()=>choose(model)} aria-disabled={disabled}>
            <span className={'afg-brand-mark '+brand.className}>{brand.label}</span><span className="min-w-0 flex-1 text-start"><strong>{model.displayName}</strong><small>{model.disabledReason || (model.contextWindow ? model.contextWindow.toLocaleString()+' context' : (dari?'مدل گفت‌وگو':'Chat model'))}</small></span>
            <span className="afg-model-cost">{priceLabel(model)}</span>{disabled?<Lock size={16}/>:active?<Check size={18}/>:null}
          </button>;})}</div>)}
          {!groups.length&&<p className="p-6 text-center text-sm opacity-60">{dari?'مدلی پیدا نشد':'No models found'}</p>}
        </div>
        <footer className="border-t px-4 py-3 text-xs opacity-60">{dari?'هزینه‌ها و دسترسی بر اساس اطلاعات تأییدشده ارائه‌دهنده نمایش داده می‌شود.':'Pricing and access are shown only when confirmed by the provider.'}</footer>
      </section>
    </div>}
    {showUpgrade&&<div className="afg-model-sheet-root" onMouseDown={e=>{if(e.target===e.currentTarget)setShowUpgrade(null);}}><section className="afg-model-paywall" role="dialog" aria-modal="true">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-amber-700"><Lock/></div><h3 className="text-lg font-semibold">{dari?'این مدل در دسترس نیست':'Model access restricted'}</h3><p className="mt-2 text-sm opacity-70">{showUpgrade.disabledReason || (dari?'مدیر دسترسی این مدل را غیرفعال کرده است.':'This model is disabled by the administrator or your account has no access.')}</p><button className="afg-model-close mt-5 w-full" onClick={()=>setShowUpgrade(null)}>{dari?'متوجه شدم':'Got it'}</button>
    </section></div>}
  </>;
};
