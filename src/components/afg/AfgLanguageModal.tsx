import React from 'react';
import { Check, Globe, Sparkles, X } from 'lucide-react';
import { AfgBrainLogo } from './AfgBrainLogo';
import type { Language } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgLanguageModalProps {
  isOpen: boolean;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
}

export const AfgLanguageModal: React.FC<AfgLanguageModalProps> = ({
  isOpen,
  language,
  onSelectLanguage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#09122c] border border-cyan-500/40 p-6 shadow-2xl text-center space-y-5">
        
        <AfgBrainLogo size="lg" showBadge className="mx-auto" />

        <div>
          <h2 className="text-xl font-black text-white">
            Choose Language / انتخاب زبان
          </h2>
          <p className="text-xs text-cyan-300/80 mt-1">
            زبان مورد نظر خود را برای محیط کاربری انتخاب کنید
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Dari / Farsi */}
          <button
            onClick={() => onSelectLanguage('dari')}
            className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
              language === 'dari'
                ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                : 'bg-slate-900/60 border-slate-700 hover:border-cyan-500/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇦🇫</span>
              <div className="text-right">
                <span className="text-sm font-black text-white block">دری / فارسی</span>
                <span className="text-[11px] text-slate-400">افغانستان و فارسی‌زبانان</span>
              </div>
            </div>
            {language === 'dari' && (
              <span className="w-6 h-6 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
          </button>

          {/* English */}
          <button
            onClick={() => onSelectLanguage('english')}
            className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
              language === 'english'
                ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                : 'bg-slate-900/60 border-slate-700 hover:border-cyan-500/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇬🇧</span>
              <div className="text-left">
                <span className="text-sm font-black text-white block">English</span>
                <span className="text-[11px] text-slate-400">United States / Global</span>
              </div>
            </div>
            {language === 'english' && (
              <span className="w-6 h-6 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Powered by AFG AI ❤️
        </p>

      </div>
    </div>
  );
};
