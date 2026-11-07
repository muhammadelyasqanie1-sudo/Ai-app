import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Search, X } from 'lucide-react';
import type { AfgModelOption, Language } from '../../types/afg';
import './AfgModelSelector.css';
import { ProviderIcon } from './ProviderIcon';

type Props = {
  models: AfgModelOption[];
  selectedModel: string;
  onSelect: (id: string) => void;
  language: Language;
  loading?: boolean;
};
const priceLabel = (model: AfgModelOption) => {
  const p = model.pricing;
  if (p?.inputPerMillion === 0 && p?.outputPerMillion === 0) return '🆓 Free';
  if (p && (p.inputPerMillion != null || p.outputPerMillion != null)) return '💰 Paid';
  if (model.requiresSubscription) return 'Premium';
  return 'Pricing unknown';
};
export const AfgModelSelector: React.FC<Props> = ({ models, selectedModel, onSelect, language, loading = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState<AfgModelOption | null>(null);

  useEffect(() => {
    if (!open && !showUpgrade) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      setShowUpgrade(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, showUpgrade]);
  const dari = language !== 'english';
  const selected = models.find(m => selectedModel === m.providerId + '::' + m.id);
  const providerEntries = useMemo(() => {
    const ids = Array.from(new Set(models.map((model) => model.providerId)));
    const known = [
      { label: 'Public APIs', aliases: ['public-apis', 'public_apis', 'publicapis', 'public-api', 'public'] },
      { label: '9Router', aliases: ['9router'] },
      { label: 'APInex', aliases: ['apinex'] },
    ].map((provider) => {
      const id = ids.find((candidate) => provider.aliases.includes(candidate.toLowerCase())) || null;
      return { id: id || provider.aliases[0], label: provider.label, available: Boolean(id), count: id ? models.filter((model) => model.providerId === id).length : 0 };
    });
    const knownIds = known.filter((provider) => provider.available).map((provider) => provider.id);
    const extras = ids.filter((id) => !knownIds.includes(id)).sort().map((id) => ({ id, label: id, available: true, count: models.filter((model) => model.providerId === id).length }));
    return [...known, ...extras];
  }, [models]);
  const providerLabel = (id: string) => {
    const key = id.toLowerCase().replace(/[_\s]/g, '-');
    if (key.startsWith('public')) return 'Public APIs';
    if (key === '9router') return '9Router';
    if (key === 'apinex') return 'APInex';
    return id;
  };
  const groups = useMemo(() => {
    const filtered = models.filter(m => (!selectedProvider || m.providerId === selectedProvider) && (m.displayName + ' ' + m.providerId + ' ' + m.id).toLowerCase().includes(query.toLowerCase()));
    const categoryOf = (model: AfgModelOption) => {
      const id = (model.id + ' ' + model.displayName).toLowerCase();
      const kind = String(model.catalogKind || '').toLowerCase();
      if (kind === 'video' || /video|grok-imagine-video/.test(id)) return 'video';
      if (kind === 'image' || model.capabilities?.imageGen || model.capabilities?.imageEdit) return 'image';
      if (/coder|coding|code-|codegen|deepseek-coder|qwen.*coder|starcoder|code llama/.test(id)) return 'coding';
      if (model.capabilities?.tts || model.capabilities?.stt) return 'audio';
      if (model.capabilities?.vision || model.capabilities?.ocr || kind === 'image-to-text') return 'vision';
      if (model.capabilities?.embedding || kind === 'embedding') return 'embedding';
      if (model.capabilities?.webSearch || model.capabilities?.webFetch || kind === 'web' || kind === 'webSearch' || kind === 'webFetch') return 'web';
      if (model.capabilities?.text && model.capabilities?.streaming) return 'chat';
      return 'other';
    };
    const order = ['chat','coding','image','video','audio','vision','web','embedding','other'];
    const labels: Record<string,string> = dari
      ? {chat:'مدل‌های چت',coding:'مدل‌های کدنویسی',image:'مدل‌های تصویر',video:'مدل‌های ویدیو',audio:'مدل‌های صوتی',vision:'درک تصویر',web:'مدل‌های وب',embedding:'مدل‌های برداری',other:'سایر مدل‌ها'}
      : {chat:'Chat models',coding:'Coding models',image:'Image models',video:'Video models',audio:'Audio models',vision:'Image understanding',web:'Web models',embedding:'Embedding models',other:'Other models'};
    return order.map(category => ({
      category,
      label: labels[category],
      items: filtered.filter(model => categoryOf(model) === category),
    })).filter(group => group.items.length);
  }, [models, query, dari, selectedProvider]);
  const choose = (model: AfgModelOption) => {
    const supportedInChat = Boolean(model.capabilities?.imageGen || (model.capabilities?.text && model.capabilities?.streaming));
    if (!model.selectable || !supportedInChat) {
      setOpen(false);
      setShowUpgrade(model);
      return;
    }
    onSelect(model.providerId + '::' + model.id);
    setOpen(false);
  };
  return <>
    <button type="button" disabled={loading} onClick={() => { setSelectedProvider(null); setQuery(''); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}
      className="afg-model-trigger flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-sm">
      {selected ? <ProviderIcon provider={selected.providerId} model={selected.id} /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-slate-700">✦</span>}
      <span className="min-w-0 truncate font-semibold">{selected?.displayName || (dari ? 'انتخاب خودکار مدل' : 'Auto model')}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
    </button>
    {open && <div className="afg-model-sheet-root" role="presentation" onClick={e => { if(e.target===e.currentTarget){setOpen(false);setShowUpgrade(null);} }}>
      <section className="afg-model-sheet" role="dialog" aria-modal="true" aria-label={dari ? 'انتخاب مدل' : 'Select model'}>
        <header className="flex items-center justify-between border-b px-4 py-4">
          <div><h2 className="text-base font-semibold">{dari ? 'انتخاب مدل' : 'Select model'}</h2><p className="mt-1 text-xs opacity-60">{selectedProvider ? providerLabel(selectedProvider) + ' · ' + models.filter((model) => model.providerId === selectedProvider).length : providerEntries.length + ' providers'}</p></div>
          <button className="rounded-full p-2 hover:bg-black/5" onClick={()=>setOpen(false)} aria-label="Close"><X size={19}/></button>
        </header>
        {selectedProvider && <div className="px-4 pt-3"><label className="afg-model-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={dari?'جستجوی مدل یا ارائه‌دهنده':'Search models or providers'}/></label></div>}
        {!selectedProvider ? <div className="afg-provider-list">
          {providerEntries.map((provider) => <button key={provider.id} type="button" disabled={!provider.available} className="afg-provider-card" onClick={() => { setSelectedProvider(provider.id); setQuery(''); }}>
            <ProviderIcon provider={provider.id} />
            <span className="min-w-0 flex-1 text-start"><strong>{provider.label || providerLabel(provider.id)}</strong><small>{provider.available ? provider.count + ' ' + (dari ? 'مدل موجود' : 'available models') : (dari ? 'هنوز پیکربندی نشده' : 'Not configured yet')}</small></span>
            <ChevronDown className="afg-provider-next" size={18} />
          </button>)}
          {!providerEntries.length && <p className="p-6 text-center text-sm opacity-60">{dari ? 'هیچ ارائه‌دهنده فعالی موجود نیست' : 'No active providers available'}</p>}
        </div> : <>
        <div className="afg-provider-back"><button type="button" onClick={() => { setSelectedProvider(null); setQuery(''); }}>← {dari ? 'همه ارائه‌دهندگان' : 'All providers'}</button><strong>{providerLabel(selectedProvider)}</strong></div>
        <div className="afg-model-list">
          <button className={'afg-model-row '+(!selected?'is-selected':'')} onClick={()=>{onSelect('auto');setOpen(false);}}>
            <span className="afg-brand-mark bg-slate-800 text-white">✦</span><span className="min-w-0 flex-1"><strong>Auto</strong><small>{dari?'انتخاب خودکار مدل سالم':'Choose the healthiest eligible model'}</small></span><span className="text-xs opacity-60">AUTO</span>{!selected&&<Check size={18}/>}
          </button>
          {groups.map(group=><div key={group.category}><div className="afg-model-group-title">{group.label}</div>{group.items.map(model=>{const active=selectedModel===model.providerId+'::'+model.id;const supportedInChat=Boolean(model.capabilities?.imageGen||(model.capabilities?.text&&model.capabilities?.streaming));const disabled=!model.selectable||!supportedInChat;return <button key={model.providerId+'::'+model.id} className={'afg-model-row '+(active?'is-selected ':'')+(disabled?'is-disabled':'')} onClick={()=>choose(model)} aria-disabled={disabled}>
            <ProviderIcon provider={model.providerId} model={model.id} /><span className="min-w-0 flex-1 text-start"><strong>{model.displayName}</strong><small>{model.disabledReason || (model.contextWindow ? model.contextWindow.toLocaleString()+' context' : (dari?'مدل گفت‌وگو':'Chat model'))}</small></span>
            <span className="afg-model-cost">{model.requiresSubscription ? <span className="afg-premium-badge">Premium</span> : priceLabel(model)}</span>{disabled?<Lock size={16}/>:active?<Check size={18}/>:null}
          </button>;})}</div>)}
          {!groups.length&&<p className="p-6 text-center text-sm opacity-60">{dari?'مدلی پیدا نشد':'No models found'}</p>}
        </div></>}
        <footer className="border-t px-4 py-3 text-xs opacity-60">{dari?'هزینه‌ها و دسترسی بر اساس اطلاعات تأییدشده ارائه‌دهنده نمایش داده می‌شود.':'Pricing and access are shown only when confirmed by the provider.'}</footer>
      </section>
    </div>}
    {showUpgrade&&<div className="afg-model-sheet-root" onClick={e=>{if(e.target===e.currentTarget){setShowUpgrade(null);setOpen(false);}}}><section className="afg-model-paywall" role="dialog" aria-modal="true">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-amber-700"><Lock/></div><h3 className="text-lg font-semibold">{showUpgrade.selectable && !showUpgrade.capabilities?.imageGen && !(showUpgrade.capabilities?.text && showUpgrade.capabilities?.streaming) ? (dari?'این مدل برای چت مستقیم نیست':'This is not a chat model') : showUpgrade.requiresSubscription ? (dari?'اشتراک ویژه لازم است':'Premium subscription required') : (dari?'این مدل در دسترس نیست':'Model access restricted')}</h3><p className="mt-2 text-sm opacity-70">{showUpgrade.selectable && !showUpgrade.capabilities?.imageGen && !(showUpgrade.capabilities?.text && showUpgrade.capabilities?.streaming) ? (dari?'این مدل در گروه قابلیت خودش نمایش داده می‌شود و از ورودی چت قابل اجرا نیست.':'This model appears in its capability group and cannot run as a chat completion.') : showUpgrade.requiresSubscription ? (dari ? 'برای استفاده از این مدل، طرح '+String(showUpgrade.accessTier||'Pro').toUpperCase()+' را فعال کنید.' : 'Upgrade to the '+String(showUpgrade.accessTier||'Pro').toUpperCase()+' plan to use this model.') : (showUpgrade.disabledReason || (dari?'مدیر دسترسی این مدل را غیرفعال کرده است.':'This model is disabled by the administrator.'))}</p><button className="afg-model-close mt-5 w-full" onClick={()=>{setShowUpgrade(null);setOpen(false);}}>{dari?'متوجه شدم':'Got it'}</button>
    </section></div>}
  </>;
};
