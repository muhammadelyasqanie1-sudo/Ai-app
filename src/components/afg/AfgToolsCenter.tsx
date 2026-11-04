import React, { useEffect, useState } from 'react';
import { 
  Languages, 
  FileText, 
  Mic, 
  FolderArchive, 
  Calculator, 
  QrCode, 
  Code2, 
  FileCheck, 
  Volume2, 
  Copy, 
  Check, 
  ArrowRightLeft, 
  Sparkles,
  Upload,
  Download,
  Play,
  RotateCcw,
  Network,
  PlugZap
} from 'lucide-react';
import type { Language, ToolSubTab } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';
import { AfgProductivityCenter } from './AfgProductivityCenter';
import { AfgApiHubPanel } from './AfgApiHubPanel';
import { AfgMcpPanel } from './AfgMcpPanel';

interface AfgToolsCenterProps {
  language: Language;
  onRunTool: (prompt: string, options: Record<string, unknown>) => void;
  capabilities: Record<string, boolean>;
}

function calculateExpression(expression: string): number {
  const normalized = expression.replace(/\s+/g, '');
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  if (!normalized || tokens.join('') !== normalized) throw new Error('Invalid expression');
  let index = 0;
  let parseExpression: () => number;

  const parseFactor = (): number => {
    const token = tokens[index++];
    if (token === '+') return parseFactor();
    if (token === '-') return -parseFactor();
    if (token === '(') {
      const value = parseExpression();
      if (tokens[index++] !== ')') throw new Error('Missing closing parenthesis');
      return value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Invalid number');
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = parseFactor();
      if (operator === '/' && right === 0) throw new Error('Division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  parseExpression = () => {
    let value = parseTerm();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = parseExpression();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid expression');
  return result;
}

export const AfgToolsCenter: React.FC<AfgToolsCenterProps> = ({ language, onRunTool, capabilities }) => {
  const t = translations[language];
  const [activeSubTab, setActiveSubTab] = useState<ToolSubTab>('overview');
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('afg_voice_enabled') !== 'false');
  const voiceSttAvailable = voiceEnabled && capabilities['speech-to-text'];
  const voiceTtsAvailable = voiceEnabled && capabilities['text-to-speech'];
  useEffect(() => { const syncVoice = () => setVoiceEnabled(localStorage.getItem('afg_voice_enabled') !== 'false'); window.addEventListener('afg-voice-preference-change', syncVoice); window.addEventListener('afg-preferences-change', syncVoice); return () => { window.removeEventListener('afg-voice-preference-change', syncVoice); window.removeEventListener('afg-preferences-change', syncVoice); }; }, []);
  const [fileStatus, setFileStatus] = useState<{ available: boolean; acceptedFormats: string[]; message: string } | null>(null);
  useEffect(() => {
    if (activeSubTab !== 'file-tools') return;
    fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/files/status')
      .then((response) => response.json())
      .then((data) => setFileStatus({
        available: data.available === true,
        acceptedFormats: Array.isArray(data.plannedFormats) ? data.plannedFormats : [],
        message: typeof data.message === 'string' ? data.message : '',
      }))
      .catch(() => setFileStatus({
        available: false,
        acceptedFormats: ['PDF', 'TXT', 'DOCX', 'CSV', 'XLSX', 'JSON', 'source files', 'images'],
        message: language === 'dari' ? 'وضعیت سرویس فایل قابل دریافت نیست.' : 'File service status could not be reached.',
      }));
  }, [activeSubTab, language]);


  useEffect(() => {
    if (activeSubTab !== 'voice-tools' || !voiceTtsAvailable) return;
    fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/voices', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => setVoiceOptions(Array.isArray(data.voices) ? data.voices.filter((voice: any) => typeof voice?.id === 'string' && typeof voice?.label === 'string') : []))
      .catch(() => setVoiceOptions([]));
  }, [activeSubTab, capabilities, voiceEnabled]);

  // --- Translation Tool State ---
  const [sourceLang, setSourceLang] = useState<'auto' | 'fa' | 'ps' | 'en' | 'ar'>('auto');
  const [targetLang, setTargetLang] = useState<'fa' | 'ps' | 'en' | 'ar'>('en');
  const [transInput, setTransInput] = useState(
    language === 'dari' ? 'سلام، من از افغانستان هستم و از هوش مصنوعی استفاده می‌کنم.' : 'Hello, I am using the smart AFG AI assistant.'
  );
  const [transOutput, setTransOutput] = useState('');
  const [translationFileName, setTranslationFileName] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedTrans, setCopiedTrans] = useState(false);

  // --- Calculator State ---
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [afnAmount, setAfnAmount] = useState('1000');

  // --- QR Generator State ---
  const [qrText, setQrText] = useState('');
  const [qrUnavailable, setQrUnavailable] = useState(false);

  // --- Code Gen State ---
  const [codePrompt, setCodePrompt] = useState('');
  const [codingTask, setCodingTask] = useState('generate');

  // --- Summarizer State ---
  const [summarizeText, setSummarizeText] = useState('');
  const [summarizeFileName, setSummarizeFileName] = useState('');
  const handleSummarizerFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 200_000) { setSummaryResult(language === 'dari' ? 'فایل متنی باید حداکثر ۲۰۰ کیلوبایت باشد.' : 'Text file must be 200 KB or smaller.'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt','md','csv','json'].includes(extension || '')) { setSummaryResult(language === 'dari' ? 'فقط فایل‌های TXT، MD، CSV و JSON پشتیبانی می‌شوند. برای PDF هنوز استخراج امن فعال نیست.' : 'Only TXT, MD, CSV and JSON files are supported. Secure PDF extraction is not enabled yet.'); return; }
    try { const text = await file.text(); if (!text.trim()) throw new Error('empty'); setSummarizeText(text); setSummarizeFileName(file.name); setSummaryResult(''); }
    catch { setSummaryResult(language === 'dari' ? 'خواندن فایل متنی ممکن نشد.' : 'Could not read the text file.'); }
  };
  const [summaryResult, setSummaryResult] = useState('');
  const [writingPrompt, setWritingPrompt] = useState('');
  const [writingTemplate, setWritingTemplate] = useState('article');
  const [writingTone, setWritingTone] = useState('professional');
  const [writingStyle, setWritingStyle] = useState('clear');
  const [writingLanguage, setWritingLanguage] = useState(language === 'dari' ? 'dari' : 'english');
  const [writingLength, setWritingLength] = useState('medium');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [researchSources, setResearchSources] = useState<Array<{ title: string; url: string; snippet: string }>>([]);
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState<'auto' | 'en' | 'fa' | 'ps' | 'ar'>(language === 'dari' ? 'fa' : 'en');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [voiceConversationMode, setVoiceConversationMode] = useState(false);

  // Translation uses the selected verified text-generation model.
  const handleTranslationFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 45_000) { setTransOutput(language === 'dari' ? 'فایل متنی باید کمتر از ۴۵ کیلوبایت باشد.' : 'Text document must be 45 KB or smaller.'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md', 'csv', 'json'].includes(extension || '')) { setTransOutput(language === 'dari' ? 'فعلاً فقط فایل‌های TXT، MD، CSV و JSON متنی پشتیبانی می‌شوند.' : 'Only text-based TXT, MD, CSV and JSON documents are supported here.'); return; }
    try { setTransInput(await file.text()); setTranslationFileName(file.name); setTransOutput(''); }
    catch { setTransOutput(language === 'dari' ? 'خواندن فایل ممکن نشد.' : 'Could not read the selected file.'); }
  };

  const handleTranslate = () => {
    if (!transInput.trim()) return;
    onRunTool(transInput.trim(), { toolMode: 'translation', sourceLanguage: sourceLang, targetLanguage: targetLang });
    setTransOutput(language === 'dari' ? 'درخواست ترجمه به دستیار هوشمند فرستاده شد؛ نتیجه در صفحه چت نمایش داده می‌شود.' : 'Translation request sent to the AI assistant; the result will appear in Chat.');
  };

  const handleTranscribeFile = (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setVoiceError(language === 'dari' ? 'حجم فایل صوتی باید کمتر از ۱۰ مگابایت باشد.' : 'Audio file must be 10 MB or smaller.'); return; }
    setVoiceLoading(true); setVoiceError(''); setVoiceTranscript('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const audioBase64 = dataUrl.split(',')[1] || '';
        const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/transcribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mimeType: file.type, audioBase64, language: voiceLanguage }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Speech recognition is unavailable.');
        setVoiceTranscript(typeof data.text === 'string' ? data.text : '');
        if (voiceConversationMode && typeof data.text === 'string' && data.text.trim()) onRunTool(data.text.trim(), { toolMode: 'chat' });
      } catch (error) { setVoiceError(error instanceof Error ? error.message : 'Transcription failed.'); }
      finally { setVoiceLoading(false); }
    };
    reader.onerror = () => { setVoiceError('Could not read the audio file.'); setVoiceLoading(false); };
    reader.readAsDataURL(file);
  };

  const handleSynthesize = async () => {
    if (!voiceText.trim() || voiceLoading) return;
    setVoiceLoading(true); setVoiceError(''); setVoiceAudioUrl('');
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/synthesize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: voiceText.trim(), voice: voiceId.trim() || undefined, language: voiceLanguage === 'auto' ? undefined : voiceLanguage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Speech synthesis is unavailable.');
      setVoiceAudioUrl('data:' + data.mimeType + ';base64,' + data.audioBase64);
    } catch (error) { setVoiceError(error instanceof Error ? error.message : 'Speech synthesis failed.'); }
    finally { setVoiceLoading(false); }
  };

  const handleResearch = async () => {
    if (!researchQuery.trim() || researchLoading) return;
    setResearchLoading(true); setResearchError(''); setResearchSources([]);
    try {
      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: researchQuery.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Research is unavailable.');
      const sources = Array.isArray(data.sources) ? data.sources.filter((item: any) => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url) && typeof item?.title === 'string') : [];
      setResearchSources(sources);
      if (!sources.length) setResearchError(language === 'dari' ? 'منبع قابل تأیید پیدا نشد.' : 'No verified source URLs were returned.');
    } catch (error) { setResearchError(error instanceof Error ? error.message : 'Research failed.'); }
    finally { setResearchLoading(false); }
  };

  const handleCopy = (text: string, setFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const toolCards = [
    { id: 'api-hub' as ToolSubTab, title: language === 'dari' ? 'مرکز جامع API' : 'Universal API Hub', desc: language === 'dari' ? 'کاتالوگ Public APIs، اتصال سرویس‌ها و ساخت ابزار هوشمند' : 'Discover Public APIs, connect services and create AI tools', ready: true, icon: Network, color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-400/40' },
    { id: 'mcp' as ToolSubTab, title: language === 'dari' ? 'ابزارها و سرورهای MCP' : 'MCP Servers & Tools', desc: language === 'dari' ? 'اتصال امن ابزارهای استاندارد هوش مصنوعی' : 'Connect secure, standardized AI tools', ready: true, icon: PlugZap, color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-400/40' },
    { id: 'productivity' as ToolSubTab, title: language === 'dari' ? 'مرکز بهره‌وری' : 'Productivity Center', desc: language === 'dari' ? 'یادداشت، وظایف، آموزش، جلسه و برنامه‌ریزی' : 'Notes, tasks, study, meetings and planning', ready: Boolean(capabilities.chat), icon: Sparkles, color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-400/40' },
    { id: 'translate' as ToolSubTab, title: t.toolTranslate, desc: language === 'dari' ? 'ترجمه با مدل چت تأییدشده' : 'Uses the verified chat model', ready: Boolean(capabilities.chat), icon: Languages, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
    { id: 'code-help' as ToolSubTab, title: t.toolCodeHelp, desc: language === 'dari' ? 'تولید، توضیح، اشکال‌زدایی و بهینه‌سازی کد' : 'Generate, explain, debug and optimize code', ready: Boolean(capabilities.chat), icon: Code2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { id: 'writing-studio' as ToolSubTab, title: language === 'dari' ? 'استودیوی نویسندگی' : 'Writing Studio', desc: language === 'dari' ? 'ایمیل، مقاله، رزومه و محتوای تبلیغاتی' : 'Emails, articles, CVs and marketing content', ready: Boolean(capabilities.chat), icon: FileText, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30' },
    { id: 'research' as ToolSubTab, title: language === 'dari' ? 'پژوهش وب' : 'Web Research', desc: language === 'dari' ? 'جستجوی منابع واقعی و لینک‌های اصلی' : 'Search real sources and original URLs', ready: Boolean(capabilities.research), icon: Languages, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    { id: 'voice-tools' as ToolSubTab, title: t.toolVoice, desc: !voiceEnabled ? (language === 'dari' ? 'در تنظیمات غیرفعال شده' : 'Disabled in settings') : (language === 'dari' ? 'نیازمند ارائه‌دهنده صوتی سازگار' : 'Requires a compatible voice provider'), ready: Boolean(voiceSttAvailable || voiceTtsAvailable), icon: Mic, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'pdf-tools' as ToolSubTab, title: t.toolPdf, desc: language === 'dari' ? 'بارگذاری و استخراج متن فعال نیست' : 'Upload and text extraction are unavailable', ready: false, icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    { id: 'calculator' as ToolSubTab, title: t.toolCalc, desc: language === 'dari' ? 'محاسبه محلی' : 'Local arithmetic calculator', ready: true, icon: Calculator, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'qr-scanner' as ToolSubTab, title: language === 'dari' ? 'تولیدکننده QR' : 'QR Generator', desc: language === 'dari' ? 'با سرویس بیرونی QRServer' : 'Uses the external QRServer service', ready: true, icon: QrCode, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'summarizer' as ToolSubTab, title: t.toolSummarizer, desc: language === 'dari' ? 'خلاصه‌سازی با مدل چت تأییدشده' : 'Summarize text with the verified chat model', ready: Boolean(capabilities.chat), icon: FileCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
    { id: 'file-tools' as ToolSubTab, title: t.toolFile, desc: language === 'dari' ? 'پردازش فایل هنوز پیاده‌سازی نشده' : 'File processing is not implemented', ready: false, icon: FolderArchive, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span>{t.toolsCenter}</span>
          </h1>
          <p className="text-xs sm:text-sm text-cyan-300/80 mt-0.5">
            {t.toolsSubtitle}
          </p>
        </div>

        {activeSubTab !== 'overview' && (
          <button
            onClick={() => setActiveSubTab('overview')}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
          >
            ← {language === 'dari' ? 'بازگشت به تمام ابزارها' : 'Back to All Tools'}
          </button>
        )}
      </div>

      {/* Overview Grid (Screenshot 2 & 4) */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {toolCards.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                onClick={() => setActiveSubTab(tool.id)}
                className={`p-5 rounded-2xl bg-[#091129]/80 hover:bg-[#0e1b3d] border ${tool.border} hover:scale-103 cursor-pointer transition-all shadow-[0_4px_20px_rgba(0,0,0,0.4)] group flex flex-col justify-between`}
              >
                <div>
                  <div className={`w-12 h-12 rounded-2xl ${tool.bg} flex items-center justify-center ${tool.color} mb-3 group-hover:scale-110 transition-transform shadow-md`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {tool.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-cyan-950 flex items-center justify-between text-xs font-semibold text-cyan-400">
                  <span>{tool.ready ? (language === 'dari' ? 'بازکردن ابزار' : 'Open Tool') : (language === 'dari' ? 'غیرفعال' : 'Unavailable')}</span>
                  <span>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeSubTab === 'productivity' && <AfgProductivityCenter language={language} onRunTool={onRunTool} />}
      {activeSubTab === 'api-hub' && <AfgApiHubPanel language={language}/>}
      {activeSubTab === 'mcp' && <AfgMcpPanel language={language}/>}

      {/* Tool 1: Interactive Translator (Text & Voice) */}
      {activeSubTab === 'translate' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40">
            <p className="text-xs text-amber-200">{language === 'dari' ? 'ترجمه با مدل چت تأییدشده انجام می‌شود.' : 'Translation uses the selected verified chat model.'}</p>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Languages className="w-5 h-5 text-sky-400" />
              <span>{t.toolTranslate}</span>
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as any)}
                aria-label="Source Language"
                className="bg-slate-900 text-white rounded-lg px-2 py-1 border border-cyan-700/50"
              >
                <option value="auto">{language === 'dari' ? 'تشخیص خودکار' : 'Auto-detect'}</option>
                <option value="fa">{language === 'dari' ? 'دری / فارسی' : 'Dari / Persian'}</option>
                <option value="ps">{language === 'dari' ? 'پشتو' : 'Pashto'}</option>
                <option value="en">{language === 'dari' ? 'انگلیسی' : 'English'}</option>
                <option value="ar">{language === 'dari' ? 'عربی' : 'Arabic'}</option>
              </select>

              <button 
                onClick={() => {
                  const temp = sourceLang;
                  setSourceLang(targetLang);
                  setTargetLang(temp === 'auto' ? 'en' : temp);
                }}
                className="p-1 rounded-lg bg-slate-800 text-cyan-400 hover:bg-slate-700"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>

              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as any)}
                aria-label="Target Language"
                className="bg-slate-900 text-white rounded-lg px-2 py-1 border border-cyan-700/50"
              >
                <option value="en">English</option>
                <option value="fa">فارسی / دری (Dari)</option>
                <option value="ps">پښتو (Pashto)</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                {language === 'dari' ? 'متن یا سند متنی مبدا:' : 'Source text or text document:'}
              </label>
              <input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(e) => handleTranslationFile(e.target.files?.[0])} className="mb-2 w-full text-xs text-slate-300" />
              {translationFileName && <p className="mb-2 text-[11px] text-cyan-300">{translationFileName}</p>}
              <textarea
                rows={5}
                maxLength={45000}
                value={transInput}
                onChange={(e) => setTransInput(e.target.value)}
                placeholder={language === 'dari' ? 'متن را بنویسید یا جای‌گذاری کنید...' : 'Type or paste text...'}
                className="w-full rounded-2xl bg-slate-900/80 border border-cyan-900/50 p-3 text-sm text-white focus:outline-none focus:border-cyan-400 resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400">
                  {language === 'dari' ? 'ترجمه هوشمند:' : 'AI Translation:'}
                </label>
                {transOutput && (
                  <button
                    onClick={() => handleCopy(transOutput, setCopiedTrans)}
                    className="text-xs text-cyan-400 flex items-center gap-1 hover:text-white"
                  >
                    {copiedTrans ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedTrans ? t.copied : t.copy}</span>
                  </button>
                )}
              </div>
              <div className="w-full h-[120px] rounded-2xl bg-slate-900/40 border border-cyan-900/30 p-3 text-sm text-cyan-100 overflow-y-auto leading-relaxed">
                {isTranslating ? (
                  <span className="text-slate-500 italic">Translating...</span>
                ) : transOutput ? (
                  transOutput
                ) : (
                  <span className="text-slate-600">Translation will appear here...</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleTranslate}
            disabled={!transInput.trim()}
            className="w-full py-3 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-sm shadow-md"
          >
            {isTranslating ? 'در حال ترجمه هوشمند...' : (language === 'dari' ? 'ترجمه کن' : 'Translate Now')}
          </button>
        </div>
      )}

      {/* Tool 2: Code Help & Generator */}
      {activeSubTab === 'code-help' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Code2 className="w-5 h-5 text-emerald-400" /><span>{t.toolCodeHelp}</span></h2>
          <label className="block text-xs text-slate-300">{language === 'dari' ? 'نوع کار برنامه‌نویسی' : 'Coding task'}
            <select value={codingTask} onChange={e=>setCodingTask(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-cyan-700/50 p-3 text-sm text-white">
              {([['generate',language==='dari'?'تولید کد':'Generate code'],['explain',language==='dari'?'توضیح کد':'Explain code'],['debug',language==='dari'?'اشکال‌زدایی':'Debug'],['refactor',language==='dari'?'بازنویسی':'Refactor'],['optimize',language==='dari'?'بهینه‌سازی':'Optimize'],['document',language==='dari'?'مستندسازی':'Documentation'],['test',language==='dari'?'ساخت آزمون':'Generate tests'],['sql',language==='dari'?'SQL و پایگاه داده':'SQL and databases'],['git',language==='dari'?'Git و GitHub':'Git and GitHub'],['general',language==='dari'?'راهنمایی عمومی':'General guidance']] as string[][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <textarea rows={5} value={codePrompt} onChange={e=>setCodePrompt(e.target.value)} placeholder={language === 'dari' ? 'درخواست، کد یا خطا را اینجا وارد کنید...' : 'Describe the task, paste code or include the error message...'} className="w-full rounded-2xl bg-slate-900 border border-cyan-700/50 p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400" />
          <button onClick={() => { if (codePrompt.trim()) onRunTool(codePrompt.trim(), { toolMode: 'coding', codingTask }); }} disabled={!codePrompt.trim()} className="w-full py-3 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-sm disabled:opacity-40">{language === 'dari' ? 'ارسال به دستیار برنامه‌نویسی' : 'Ask Coding Assistant'}</button>
          <p className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs leading-6 text-slate-300">{language === 'dari' ? 'پاسخ کامل در صفحه چت نمایش داده می‌شود. کد شما در سرور اصلی اجرا نمی‌شود؛ اجرای کد نیازمند محیط ایزوله جداگانه است.' : 'The complete response appears in Chat. Your code is never executed on the main application server; execution requires a separate isolated runner.'}</p>
        </div>
      )}
      {activeSubTab === 'research' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-blue-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white">{language === 'dari' ? 'پژوهش وب با منابع واقعی' : 'Web Research with real sources'}</h2>
          <p className="text-xs text-slate-400">{language === 'dari' ? 'جستجو فقط با TAVILY_API_KEY تنظیم‌شده در سرور کار می‌کند. لینک‌ها عیناً از نتیجه جستجو گرفته می‌شوند.' : 'Search runs only when TAVILY_API_KEY is configured on the server. Source URLs are passed through from the search response.'}</p>
          <div className="flex gap-2"><input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} maxLength={500} placeholder={language === 'dari' ? 'موضوع پژوهش را بنویسید...' : 'What would you like to research?'} className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-blue-900/50 p-3 text-sm text-white" /><button onClick={handleResearch} disabled={!researchQuery.trim() || researchLoading} className="rounded-xl bg-blue-500 px-4 text-sm font-bold text-white disabled:opacity-40">{researchLoading ? '…' : (language === 'dari' ? 'جستجو' : 'Search')}</button></div>
          {researchError && <p className="text-sm text-amber-200">{researchError}</p>}
          {researchSources.length > 0 && <div className="space-y-3"><h3 className="text-sm font-bold text-emerald-300">{language === 'dari' ? 'منابع تأییدشده' : 'Verified sources'}</h3>{researchSources.map((source, index) => <article key={source.url} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-cyan-300 underline break-all">{index + 1}. {source.title}</a><p className="text-xs text-slate-400">{source.snippet}</p><p className="text-[11px] text-slate-500 break-all">{source.url}</p></article>)}<button onClick={() => onRunTool('Analyze the following verified web research results. Separate verified sources from your interpretation. Cite only the exact URLs included below.\n\n'+researchSources.map((s,i)=>`[${i+1}] ${s.title}\nURL: ${s.url}\nExcerpt: ${s.snippet}`).join('\n\n'), { toolMode: 'research' })} className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-slate-950">{language === 'dari' ? 'تحلیل منابع با هوش مصنوعی' : 'AI interpretation of sources'}</button></div>}
        </div>
      )}

      {activeSubTab === 'writing-studio' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-fuchsia-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-fuchsia-400" />{language === 'dari' ? 'استودیوی نویسندگی' : 'Writing Studio'}</h2>
          <textarea rows={5} value={writingPrompt} onChange={(e) => setWritingPrompt(e.target.value)} placeholder={language === 'dari' ? 'موضوع، اطلاعات و خواسته‌های خود را بنویسید...' : 'Describe what you want written and provide the key facts...'} className="w-full rounded-2xl bg-slate-900 border border-fuchsia-900/50 p-3 text-sm text-white" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300">{language === 'dari' ? 'قالب' : 'Template'}<select value={writingTemplate} onChange={(e) => setWritingTemplate(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['email', language === 'dari' ? 'ایمیل' : 'Email'],['article', language === 'dari' ? 'مقاله' : 'Article'],['blog', language === 'dari' ? 'وبلاگ' : 'Blog'],['proposal', language === 'dari' ? 'پیشنهادنامه' : 'Proposal'],['cv', language === 'dari' ? 'زندگی‌نامه کاری' : 'CV / Resume'],['cover-letter', language === 'dari' ? 'نامه درخواست کار' : 'Cover letter'],['social', language === 'dari' ? 'پست شبکه اجتماعی' : 'Social post'],['product-description', language === 'dari' ? 'معرفی محصول' : 'Product description'],['ad', language === 'dari' ? 'آگهی' : 'Advertisement'],['story', language === 'dari' ? 'داستان' : 'Story'],['script', language === 'dari' ? 'سناریو' : 'Script']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{language === 'dari' ? 'لحن' : 'Tone'}<select value={writingTone} onChange={(e) => setWritingTone(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['neutral', language === 'dari' ? 'معمولی' : 'Neutral'],['professional', language === 'dari' ? 'حرفه‌ای' : 'Professional'],['friendly', language === 'dari' ? 'دوستانه' : 'Friendly'],['formal', language === 'dari' ? 'رسمی' : 'Formal'],['persuasive', language === 'dari' ? 'متقاعدکننده' : 'Persuasive'],['creative', language === 'dari' ? 'خلاقانه' : 'Creative'],['academic', language === 'dari' ? 'علمی' : 'Academic'],['concise', language === 'dari' ? 'مختصر' : 'Concise']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{language === 'dari' ? 'سبک' : 'Style'}<select value={writingStyle} onChange={(e) => setWritingStyle(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['clear', language === 'dari' ? 'روشن' : 'Clear'],['plain', language === 'dari' ? 'ساده' : 'Plain'],['technical', language === 'dari' ? 'تخصصی' : 'Technical'],['narrative', language === 'dari' ? 'روایی' : 'Narrative'],['bullet-points', language === 'dari' ? 'نکته‌ای' : 'Bullet points'],['structured', language === 'dari' ? 'ساختاریافته' : 'Structured']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{language === 'dari' ? 'زبان خروجی' : 'Output language'}<select value={writingLanguage} onChange={(e) => setWritingLanguage(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white"><option value="english">{language === 'dari' ? 'انگلیسی' : 'English'}</option><option value="dari">{language === 'dari' ? 'دری' : 'Dari'}</option><option value="pashto">{language === 'dari' ? 'پشتو' : 'Pashto'}</option><option value="arabic">{language === 'dari' ? 'عربی' : 'Arabic'}</option></select></label>
            <label className="text-xs text-slate-300">{language === 'dari' ? 'طول متن' : 'Length'}<select value={writingLength} onChange={(e) => setWritingLength(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['short', language === 'dari' ? 'کوتاه' : 'Short'],['medium', language === 'dari' ? 'متوسط' : 'Medium'],['long', language === 'dari' ? 'بلند' : 'Long'],['detailed', language === 'dari' ? 'مفصل' : 'Detailed']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <button onClick={() => { if (writingPrompt.trim()) onRunTool(writingPrompt.trim(), { toolMode: 'writing', writingTemplate, writingTone, writingStyle, writingLanguage, writingLength }); }} disabled={!writingPrompt.trim()} className="w-full py-3 rounded-xl bg-fuchsia-500 text-slate-950 font-bold disabled:opacity-40">{language === 'dari' ? 'ساخت متن' : 'Create writing'}</button>
        </div>
      )}

      {/* Tool 3: Smart Calculator & Currency Converter */}
      {activeSubTab === 'calculator' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-purple-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-400" />
            <span>{language === 'dari' ? 'محاسبه‌گر ساده' : 'Basic Calculator'}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Standard Keypad */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-purple-900/50 space-y-3">
              <div className="p-3 rounded-xl bg-slate-900 text-right text-2xl font-mono font-bold text-purple-300 overflow-x-auto">
                {calcDisplay}
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm font-bold">
                {['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='].map((btn) => (
                  <button
                    key={btn}
                    onClick={() => {
                      if (btn === 'C') setCalcDisplay('0');
                      else if (btn === '=') {
                        try {
                          // Simple safe math evaluation
                          setCalcDisplay(String(calculateExpression(calcDisplay)));
                        } catch {
                          setCalcDisplay('Error');
                        }
                      } else {
                        setCalcDisplay(prev => prev === '0' || prev === 'Error' ? btn : prev + btn);
                      }
                    }}
                    className={`py-2.5 rounded-xl transition-all ${
                      btn === '='
                        ? 'col-span-2 bg-purple-600 text-white hover:bg-purple-500'
                        : btn === 'C'
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency Converter (AFN, USD, EUR) */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-purple-900/50 space-y-4">
              <h3 className="text-xs font-bold text-purple-300 uppercase">
                {language === 'dari' ? 'تبدیل نرخ افغانی به دلار و یورو' : 'Afghan Afghani (AFN) Currency Converter'}
              </h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {language === 'dari' ? 'مقدار به افغانی (AFN):' : 'Amount in AFN:'}
                </label>
                <input
                  type="number"
                  value={afnAmount}
                  onChange={(e) => setAfnAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-purple-800/40 text-white font-mono"
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/30 flex justify-between items-center text-xs">
                  <span className="text-slate-300">USD ($) دلار آمریکا:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    Live rate unavailable
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/30 flex justify-between items-center text-xs">
                  <span className="text-slate-300">EUR (€) یورو اروپا:</span>
                  <span className="font-mono font-bold text-sky-400">
                    {language === 'dari' ? 'نرخ زنده موجود نیست' : 'Live rate unavailable'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool 4: QR Code Generator & Scanner */}
      {activeSubTab === 'qr-scanner' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-400" />
            <span>{language === 'dari' ? 'تولیدکننده کد QR' : 'QR Code Generator'}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                {language === 'dari' ? 'متن یا لینک برای تولید کیوآرکد:' : 'Enter text or URL to generate QR:'}
              </label>
              <input
                type="text"
                value={qrText}
                onChange={(e) => { setQrText(e.target.value); setQrUnavailable(false); }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-cyan-700/50 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
              <p className="text-xs text-slate-400">
                {language === 'dari' ? 'محتوای واردشده برای ساخت QR به سرویس بیرونی QRServer ارسال می‌شود.' : 'Your entered content is sent to the external QRServer service to generate the code.'}
              </p>
            </div>

            {qrText.trim() && !qrUnavailable ? <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white w-fit mx-auto shadow-2xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrText)}`}
                alt="QR Code"
                className="w-44 h-44 object-contain"
                onError={() => setQrUnavailable(true)}
              />
              <span className="text-[11px] text-slate-600 font-bold mt-2">QRServer</span>
            </div> : <p className="text-xs text-slate-500 text-center">{qrUnavailable ? (language === 'dari' ? 'سرویس QR در دسترس نیست.' : 'QR service is unavailable.') : (language === 'dari' ? 'برای تولید QR متن وارد کنید.' : 'Enter text to generate a QR code.')}</p>}
          </div>
        </div>
      )}

      {/* Tool 5: PDF & Summarizer */}
      {(activeSubTab === 'pdf-tools' || activeSubTab === 'summarizer') && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-rose-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-400" />
            <span>{activeSubTab === 'summarizer' ? t.toolSummarizer : t.toolPdf}</span>
          </h2>

          <div className="border-2 border-dashed border-rose-500/30 rounded-2xl p-6 text-center bg-rose-500/5">
            <Upload className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-xs sm:text-sm font-semibold text-amber-200">
              {language === 'dari' ? 'بارگذاری و پردازش فایل هنوز فعال نیست.' : 'File upload and document processing are not enabled yet.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'dari' ? 'فایل متنی (TXT، MD، CSV، JSON):' : 'Text document (TXT, MD, CSV, JSON):'}
            </label>
            <input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(e) => { void handleSummarizerFile(e.target.files?.[0]); e.currentTarget.value = ''; }} className="mb-2 w-full text-xs text-slate-300" />
            {summarizeFileName && <p className="mb-2 text-[11px] text-cyan-300">{summarizeFileName}</p>}
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {language === 'dari' ? 'یا متن را مستقیم جای‌گذاری کنید:' : 'Or paste text directly:'}
            </label>
            <textarea
              rows={4}
              value={summarizeText}
              onChange={(e) => setSummarizeText(e.target.value)}
              placeholder="Paste article text here..."
              className="w-full rounded-2xl bg-slate-900 border border-rose-900/40 p-3 text-sm text-white focus:outline-none focus:border-rose-400 resize-none"
            />
          </div>

          <button onClick={() => { if (summarizeText.trim()) onRunTool(summarizeText.trim(), { productivityType: 'summary', productivityParameters: { length: 'medium' } }); }} disabled={!summarizeText.trim()} className="w-full py-3 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-40">
            {language === 'dari' ? 'خلاصه‌سازی با هوش مصنوعی' : 'Summarize with AFG AI'}
          </button>
          <p className="text-[11px] text-slate-500">{language === 'dari' ? 'نتیجه در صفحه چت نمایش داده و در فضای کاری ذخیره می‌شود.' : 'The result appears in Chat and is saved to your Productivity workspace when signed in.'}</p>

          {summaryResult && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-rose-800/40 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              {summaryResult}
            </div>
          )}
        </div>
      )}

      {/* Tool 6: Voice Tools */}
      {activeSubTab === 'voice-tools' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-amber-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Mic className="w-5 h-5 text-amber-400" /><span>{t.toolVoice}</span></h2>
          {!voiceEnabled && <p className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200">{language === 'dari' ? 'قابلیت‌های صوتی در تنظیمات حساب غیرفعال شده‌اند.' : 'Voice features are disabled in your account settings.'}</p>}
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={voiceConversationMode} onChange={(e) => setVoiceConversationMode(e.target.checked)} disabled={!voiceSttAvailable} />{language === 'dari' ? 'حالت مکالمه: متن تشخیص‌شده را خودکار به چت بفرست' : 'Conversation mode: automatically send recognized speech to Chat'}</label>
          <label className="block text-xs text-slate-300">{language === 'dari' ? 'زبان گفتار' : 'Speech language'}<select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value as any)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white"><option value="auto">{language === 'dari' ? 'تشخیص خودکار' : 'Auto-detect'}</option><option value="en">{language === 'dari' ? 'انگلیسی' : 'English'}</option><option value="fa">{language === 'dari' ? 'دری / فارسی' : 'Dari / Persian'}</option><option value="ps">{language === 'dari' ? 'پشتو' : 'Pashto'}</option><option value="ar">{language === 'dari' ? 'عربی' : 'Arabic'}</option></select></label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-2xl bg-slate-900/80 border border-amber-900/40 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">{language === 'dari' ? 'گفتار به متن' : 'Speech to Text'}</h3>
              <p className="text-xs text-slate-400">{language === 'dari' ? 'فایل صوتی را برای پیاده‌سازی متن انتخاب کنید.' : 'Choose an audio file to transcribe.'}</p>
              <input type="file" accept="audio/webm,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/aac" disabled={!voiceSttAvailable || voiceLoading} onChange={(e) => handleTranscribeFile(e.target.files?.[0])} className="w-full text-xs text-slate-300 disabled:opacity-40" />
              {voiceEnabled && !capabilities['speech-to-text'] && <p className="text-xs text-amber-200">{language === 'dari' ? 'تا اتصال مدل و آداپتر واقعی STT غیرفعال است.' : 'Disabled until a real STT model and adapter are configured.'}</p>}
              {voiceTranscript && <textarea readOnly value={voiceTranscript} rows={4} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-sm text-white" />}
            </section>
            <section className="rounded-2xl bg-slate-900/80 border border-amber-900/40 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">{language === 'dari' ? 'متن به گفتار' : 'Text to Speech'}</h3>
              <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} maxLength={5000} rows={4} placeholder={language === 'dari' ? 'متن برای خواندن...' : 'Text to speak...'} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-sm text-white" />
              {voiceOptions.length > 0 ? <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={!voiceTtsAvailable} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-white disabled:opacity-40"><option value="">{language === 'dari' ? 'صدای پیش‌فرض' : 'Default voice'}</option>{voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select> : <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder={language === 'dari' ? 'شناسه صدای ارائه‌دهنده (اختیاری)' : 'Provider voice ID (optional)'} disabled={!voiceTtsAvailable} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-white disabled:opacity-40" />}
              <button onClick={handleSynthesize} disabled={!voiceTtsAvailable || !voiceText.trim() || voiceLoading} className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">{voiceLoading ? '…' : (language === 'dari' ? 'تولید صدا' : 'Generate speech')}</button>
              {voiceEnabled && !capabilities['text-to-speech'] && <p className="text-xs text-amber-200">{language === 'dari' ? 'تا اتصال مدل و آداپتر واقعی TTS غیرفعال است.' : 'Disabled until a real TTS model and adapter are configured.'}</p>}
              {voiceAudioUrl && <audio controls src={voiceAudioUrl} className="w-full" />}
            </section>
          </div>
          {voiceLoading && <p className="text-xs text-amber-200">{language === 'dari' ? 'در حال پردازش صوت...' : 'Processing audio...'}</p>}
          {voiceError && <p className="text-xs text-rose-300">{voiceError}</p>}
        </div>
      )}

      {/* Tool 7: File Tools */}
      {activeSubTab === 'file-tools' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-teal-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FolderArchive className="w-5 h-5 text-teal-400" />
            <span>{t.toolFile}</span>
          </h2>
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-teal-900/40 space-y-4">
            <div className="text-center space-y-2">
              <FolderArchive className="w-12 h-12 text-teal-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">
                {language === 'dari' ? 'دستیار فایل و اسناد' : 'File & Document Assistant'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                {language === 'dari'
                  ? 'قالب‌های هدف: PDF، TXT، DOCX، CSV، XLSX، JSON، فایل‌های کد و تصاویر.'
                  : 'Planned formats: PDF, TXT, DOCX, CSV, XLSX, JSON, source code and images.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(fileStatus?.acceptedFormats || ['PDF', 'TXT', 'DOCX', 'CSV', 'XLSX', 'JSON', 'Source files', 'Images']).map((format) => (
                <span key={format} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{format}</span>
              ))}
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-center">
              <p className="text-sm font-semibold text-amber-200">
                {fileStatus?.available ? (language === 'dari' ? 'سرویس آماده است' : 'File service is ready') : (language === 'dari' ? 'بارگذاری فایل هنوز غیرفعال است' : 'File upload is not enabled yet')}
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                {fileStatus?.message || (language === 'dari'
                  ? 'تا فعال‌شدن ذخیره‌سازی خصوصی، بررسی نوع و امضای فایل، اسکن بدافزار، استخراج متن و سهمیه‌بندی هر کاربر، فایل‌ها پذیرفته نمی‌شوند.'
                  : 'Files are not accepted until private object storage, MIME and magic-byte validation, malware scanning, text extraction and per-user quotas are implemented.')}
              </p>
            </div>
            <div className="text-xs text-slate-400">
              <p className="font-semibold text-slate-300">{language === 'dari' ? 'عملیات برنامه‌ریزی‌شده' : 'Planned operations'}</p>
              <p className="mt-1">{language === 'dari' ? 'خلاصه‌سازی، پرسش و پاسخ، استخراج، توضیح، ترجمه، سازمان‌دهی، تحلیل جدول، ساخت گزارش و مقایسه.' : 'Summarize, Q&A, extract, explain, translate, organize, analyze tables, generate reports and compare documents.'}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
