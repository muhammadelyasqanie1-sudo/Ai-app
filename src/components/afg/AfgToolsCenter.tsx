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
  RotateCcw
} from 'lucide-react';
import type { Language, ToolSubTab } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgToolsCenterProps {
  language: Language;
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

export const AfgToolsCenter: React.FC<AfgToolsCenterProps> = ({ language }) => {
  const t = translations[language];
  const [activeSubTab, setActiveSubTab] = useState<ToolSubTab>('overview');
  const [fileStatus, setFileStatus] = useState<{ available: boolean; acceptedFormats: string[]; message: string } | null>(null);
  useEffect(() => {
    if (activeSubTab !== 'file-tools') return;
    fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/files/status')
      .then((response) => response.json())
      .then((data) => setFileStatus({
        available: data.available === true,
        acceptedFormats: Array.isArray(data.acceptedFormats) ? data.acceptedFormats : [],
        message: typeof data.message === 'string' ? data.message : '',
      }))
      .catch(() => setFileStatus({
        available: false,
        acceptedFormats: ['PDF', 'TXT', 'DOCX', 'CSV', 'XLSX', 'JSON', 'source files', 'images'],
        message: language === 'dari' ? 'وضعیت سرویس فایل قابل دریافت نیست.' : 'File service status could not be reached.',
      }));
  }, [activeSubTab, language]);


  // --- Translation Tool State ---
  const [sourceLang, setSourceLang] = useState<'fa' | 'ps' | 'en' | 'ar'>('fa');
  const [targetLang, setTargetLang] = useState<'fa' | 'ps' | 'en' | 'ar'>('en');
  const [transInput, setTransInput] = useState(
    language === 'dari' ? 'سلام، من از افغانستان هستم و از هوش مصنوعی استفاده می‌کنم.' : 'Hello, I am using the smart AFG AI assistant.'
  );
  const [transOutput, setTransOutput] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedTrans, setCopiedTrans] = useState(false);

  // --- Calculator State ---
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [afnAmount, setAfnAmount] = useState('1000');

  // --- QR Generator State ---
  const [qrText, setQrText] = useState('');
  const [qrUnavailable, setQrUnavailable] = useState(false);

  // --- Code Gen State ---
  const [codePrompt, setCodePrompt] = useState('Create a responsive glassmorphic button in React with Tailwind CSS');
  const [generatedCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // --- Summarizer State ---
  const [summarizeText, setSummarizeText] = useState('');
  const [summaryResult, setSummaryResult] = useState('');

  // Translation remains disabled until a real translation provider is connected.
  const handleTranslate = () => {
    setTransOutput(language === 'dari' ? 'سرویس ترجمه هنوز به سرور وصل نشده است.' : 'A translation provider is not configured yet.');
  };

  const handleCopy = (text: string, setFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const toolCards = [
    { id: 'translate' as ToolSubTab, title: t.toolTranslate, desc: language === 'dari' ? 'تا اتصال سرویس ترجمه غیرفعال' : 'Unavailable until a translation provider is connected', ready: false, icon: Languages, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
    { id: 'code-help' as ToolSubTab, title: t.toolCodeHelp, desc: language === 'dari' ? 'تولید مستقل کد هنوز وصل نیست' : 'Standalone code generation is not connected', ready: false, icon: Code2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { id: 'voice-tools' as ToolSubTab, title: t.toolVoice, desc: language === 'dari' ? 'ورودی گفتار وابسته به مرورگر' : 'Browser-dependent speech input', ready: true, icon: Mic, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'pdf-tools' as ToolSubTab, title: t.toolPdf, desc: language === 'dari' ? 'بارگذاری و استخراج متن فعال نیست' : 'Upload and text extraction are unavailable', ready: false, icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    { id: 'calculator' as ToolSubTab, title: t.toolCalc, desc: language === 'dari' ? 'محاسبه محلی' : 'Local arithmetic calculator', ready: true, icon: Calculator, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'qr-scanner' as ToolSubTab, title: language === 'dari' ? 'تولیدکننده QR' : 'QR Generator', desc: language === 'dari' ? 'با سرویس بیرونی QRServer' : 'Uses the external QRServer service', ready: true, icon: QrCode, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'summarizer' as ToolSubTab, title: t.toolSummarizer, desc: language === 'dari' ? 'تا اتصال مدل واقعی غیرفعال' : 'Unavailable until a real model is connected', ready: false, icon: FileCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
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

      {/* Tool 1: Interactive Translator (Text & Voice) */}
      {activeSubTab === 'translate' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40">
            <p className="text-xs text-amber-200">{language === 'dari' ? 'ارائه‌دهنده ترجمه تنظیم نشده است؛ این ابزار غیرفعال است.' : 'No translation provider is configured; this tool is disabled.'}</p>
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
                <option value="fa">فارسی / دری (Dari)</option>
                <option value="ps">پښتو (Pashto)</option>
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </select>

              <button 
                onClick={() => {
                  const temp = sourceLang;
                  setSourceLang(targetLang);
                  setTargetLang(temp);
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
                {language === 'dari' ? 'متن مبدا:' : 'Source Text:'}
              </label>
              <textarea
                rows={5}
                value={transInput}
                onChange={(e) => setTransInput(e.target.value)}
                placeholder="Type or paste text..."
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
            disabled={true}
            className="w-full py-3 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-sm shadow-md"
          >
            {isTranslating ? 'در حال ترجمه هوشمند...' : (language === 'dari' ? 'ترجمه کن' : 'Translate Now')}
          </button>
        </div>
      )}

      {/* Tool 2: Code Help & Generator */}
      {activeSubTab === 'code-help' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Code2 className="w-5 h-5 text-emerald-400" />
              <span>{t.toolCodeHelp}</span>
            </h2>
            <button
              onClick={() => handleCopy(generatedCode, setCopiedCode)}
              disabled={!generatedCode}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-cyan-300 hover:bg-slate-700 flex items-center gap-1.5 border border-cyan-800/40"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? t.copied : t.copy}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={codePrompt}
              onChange={(e) => setCodePrompt(e.target.value)}
              placeholder="e.g. Write a python script to parse CSV and send email..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-cyan-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              disabled={true}
              className="px-4 py-2.5 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-xs"
            >
              Generate Code
            </button>
          </div>

          <pre className="p-4 rounded-2xl bg-black/80 border border-cyan-900/60 text-emerald-300 font-mono text-xs sm:text-sm overflow-x-auto leading-relaxed">
            <code>{generatedCode || (language === 'dari' ? 'تولیدکننده کد به سرویس واقعی وصل نشده است.' : 'The code generator is not connected to a real service.')}</code>
          </pre>
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

          <button disabled className="w-full py-3 rounded-xl bg-slate-800 text-slate-500 font-bold text-sm cursor-not-allowed">
            {language === 'dari' ? 'خلاصه‌سازی تا اتصال مدل غیرفعال است' : 'Summarization unavailable until an AI provider is connected'}
                    </button>

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
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-amber-400" />
            <span>{t.toolVoice}</span>
          </h2>
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-900/40 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <Mic className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {language === 'dari' ? 'تبدیل زنده گفتار به نوشتار' : 'Live Speech-to-Text Transcriber'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {language === 'dari' ? 'با کلیک بر روی دکمه میکروفون در صفحه چت، به زبان فارسی، پشتو یا انگلیسی صحبت کنید تا متن دقیق پیاده‌سازی شود.' : 'Use the microphone in the chat input to speak freely in Dari, Pashto, or English.'}
            </p>
          </div>
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
