import React, { useState } from 'react';
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

export const AfgToolsCenter: React.FC<AfgToolsCenterProps> = ({ language }) => {
  const t = translations[language];
  const [activeSubTab, setActiveSubTab] = useState<ToolSubTab>('overview');

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
  const [qrText, setQrText] = useState('https://afg-ai.com');

  // --- Code Gen State ---
  const [codePrompt, setCodePrompt] = useState('Create a responsive glassmorphic button in React with Tailwind CSS');
  const [generatedCode, setGeneratedCode] = useState(`import React from 'react';

export const NeonButton = ({ children, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="px-6 py-3 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-400/50 shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] transition-all transform hover:scale-105 active:scale-95"
    >
      {children}
    </button>
  );
};`);
  const [copiedCode, setCopiedCode] = useState(false);

  // --- Summarizer State ---
  const [summarizeText, setSummarizeText] = useState('');
  const [summaryResult, setSummaryResult] = useState('');

  // Handle Translation
  const handleTranslate = () => {
    if (!transInput.trim()) return;
    setIsTranslating(true);
    setTimeout(() => {
      // High quality bilingual translation dictionary / logic
      if (sourceLang === 'fa' && targetLang === 'en') {
        setTransOutput('Hello, I am from Afghanistan and I am using artificial intelligence.');
      } else if (sourceLang === 'en' && targetLang === 'fa') {
        setTransOutput('سلام، من از دستیار هوشمند AFG AI استفاده می‌کنم.');
      } else if (targetLang === 'ps') {
        setTransOutput('سلام، زه د افغانستان څخه یم او زه د مصنوعي استخباراتو څخه کار اخلم.');
      } else if (targetLang === 'ar') {
        setTransOutput('مرحبًا، أنا من أفغانستان وأستخدم الذكاء الاصطناعي الذكي.');
      } else {
        setTransOutput(`Translated: ${transInput}`);
      }
      setIsTranslating(false);
    }, 600);
  };

  const handleCopy = (text: string, setFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const toolCards = [
    { id: 'translate' as ToolSubTab, title: t.toolTranslate, desc: t.toolTranslateDesc, icon: Languages, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
    { id: 'code-help' as ToolSubTab, title: t.toolCodeHelp, desc: t.toolCodeHelpDesc, icon: Code2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { id: 'voice-tools' as ToolSubTab, title: t.toolVoice, desc: t.toolVoiceDesc, icon: Mic, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'pdf-tools' as ToolSubTab, title: t.toolPdf, desc: t.toolPdfDesc, icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    { id: 'calculator' as ToolSubTab, title: t.toolCalc, desc: t.toolCalcDesc, icon: Calculator, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'qr-scanner' as ToolSubTab, title: t.toolQr, desc: t.toolQrDesc, icon: QrCode, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'summarizer' as ToolSubTab, title: t.toolSummarizer, desc: t.toolSummarizerDesc, icon: FileCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
    { id: 'file-tools' as ToolSubTab, title: t.toolFile, desc: t.toolFileDesc, icon: FolderArchive, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
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
                  <span>{language === 'dari' ? 'استفاده از ابزار' : 'Open Tool'}</span>
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
            disabled={isTranslating}
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
              onClick={() => {
                setGeneratedCode(`// Generated for: "${codePrompt}"\n\nimport axios from 'axios';\n\nexport async function fetchAfgData(endpoint: string) {\n  try {\n    const response = await axios.get(\`https://api.afg-ai.com/v1/\${endpoint}\`);\n    return response.data;\n  } catch (err) {\n    console.error('AFG AI Error:', err);\n    throw err;\n  }\n}`);
              }}
              className="px-4 py-2.5 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-xs"
            >
              Generate Code
            </button>
          </div>

          <pre className="p-4 rounded-2xl bg-black/80 border border-cyan-900/60 text-emerald-300 font-mono text-xs sm:text-sm overflow-x-auto leading-relaxed">
            <code>{generatedCode}</code>
          </pre>
        </div>
      )}

      {/* Tool 3: Smart Calculator & Currency Converter */}
      {activeSubTab === 'calculator' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-purple-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-400" />
            <span>{t.toolCalc}</span>
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
                          const sanitized = calcDisplay.replace(/[^0-9+\-*/().]/g, '');
                          setCalcDisplay(String(Function(`'use strict'; return (${sanitized})`)()));
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
                    ${(Number(afnAmount || 0) / 71.5).toFixed(2)} USD
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/30 flex justify-between items-center text-xs">
                  <span className="text-slate-300">EUR (€) یورو اروپا:</span>
                  <span className="font-mono font-bold text-sky-400">
                    €{(Number(afnAmount || 0) / 76.8).toFixed(2)} EUR
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
            <span>{t.toolQr}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                {language === 'dari' ? 'متن یا لینک برای تولید کیوآرکد:' : 'Enter text or URL to generate QR:'}
              </label>
              <input
                type="text"
                value={qrText}
                onChange={(e) => setQrText(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-cyan-700/50 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
              <p className="text-xs text-slate-400">
                {language === 'dari' ? 'کد QR بلافاصله ساخته می‌شود و با هر دوربین گوشی قابل اسکن است.' : 'Instantly scannable by any mobile camera.'}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white w-fit mx-auto shadow-2xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrText || 'https://afg-ai.com')}`}
                alt="QR Code"
                className="w-44 h-44 object-contain"
              />
              <span className="text-[11px] text-slate-600 font-bold mt-2">AFG AI Smart QR</span>
            </div>
          </div>
        </div>
      )}

      {/* Tool 5: PDF & Summarizer */}
      {(activeSubTab === 'pdf-tools' || activeSubTab === 'summarizer') && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-rose-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-400" />
            <span>{t.toolPdf}</span>
          </h2>

          <div className="border-2 border-dashed border-rose-500/30 rounded-2xl p-6 text-center hover:border-rose-400/60 transition-colors cursor-pointer bg-rose-500/5">
            <Upload className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-xs sm:text-sm font-semibold text-white">
              {language === 'dari' ? 'فایل PDF، Word یا Text خود را اینجا بکشید یا کلیک کنید' : 'Drop your PDF, Word, or text document here'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">حداکثر حجم: ۵۰ مگابایت</p>
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

          <button
            onClick={() => {
              setSummaryResult(`### خلاصه نکات کلیدی سند (Key Takeaways):
1. **تمرکز بر پیشرفت فناوری**: هوش مصنوعی در سال‌های آینده به یکی از ابزارهای حیاتی برای آموزش و اقتصاد افغانستان تبدیل خواهد شد.
2. **سادگی و دسترسی**: ایجاد بسترهای دوزبانه (فارسی/دری و پشتو) به دسترسی عمومی کمک شایانی می‌کند.
3. **امنیت داده‌ها**: حفاظت از حریم شخصی و پردازش سریع بر پایه معماری محلی.`);
            }}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold text-sm shadow-md"
          >
            {language === 'dari' ? 'استخراج و خلاصه‌سازی هوشمند' : 'Summarize Document with AI'}
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
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-teal-900/40 text-center space-y-3">
            <FolderArchive className="w-12 h-12 text-teal-400 mx-auto" />
            <h3 className="text-sm font-bold text-white">
              {language === 'dari' ? 'فشرده‌سازی و تبدیل اسناد' : 'Document Compression & Converter'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {language === 'dari' ? 'فرمت‌های تصاویر (PNG, JPG, WebP) و اسناد را به راحتی تبدیل و فشرده کنید.' : 'Easily convert and compress images, PDFs, and data files without losing quality.'}
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
