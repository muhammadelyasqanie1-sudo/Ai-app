import React from 'react';
import { Check, Globe2 } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgLanguageModalProps {
  isOpen: boolean;
  language: Language | null;
  onSelectLanguage: (lang: Language) => void;
}

const LANGUAGE_OPTIONS: Array<{id:Language;name:string;native:string;region:string;rtl?:boolean}> = [
  {id:'english',name:'English',native:'English',region:'Global'},
  {id:'dari',name:'Dari',native:'دری',region:'Afghanistan',rtl:true},
  {id:'pashto',name:'Pashto',native:'پښتو',region:'Afghanistan / Pakistan',rtl:true},
  {id:'persian',name:'Persian',native:'فارسی',region:'Iran / Global',rtl:true},
  {id:'arabic',name:'Arabic',native:'العربية',region:'Middle East / Global',rtl:true},
  {id:'urdu',name:'Urdu',native:'اردو',region:'Pakistan / India',rtl:true},
  {id:'turkish',name:'Turkish',native:'Türkçe',region:'Türkiye'},
  {id:'russian',name:'Russian',native:'Русский',region:'Eastern Europe / Central Asia'},
  {id:'french',name:'French',native:'Français',region:'Global'},
  {id:'spanish',name:'Spanish',native:'Español',region:'Global'},
  {id:'german',name:'German',native:'Deutsch',region:'Europe'},
  {id:'chinese',name:'Chinese (Simplified)',native:'简体中文',region:'China'},
  {id:'hindi',name:'Hindi',native:'हिन्दी',region:'India'},
  {id:'bengali',name:'Bengali',native:'বাংলা',region:'Bangladesh / India'},
  {id:'indonesian',name:'Indonesian',native:'Bahasa Indonesia',region:'Indonesia'},
  {id:'portuguese',name:'Portuguese',native:'Português',region:'Brazil / Portugal'},
  {id:'japanese',name:'Japanese',native:'日本語',region:'Japan'},
  {id:'korean',name:'Korean',native:'한국어',region:'South Korea'},
];

export const AfgLanguageModal: React.FC<AfgLanguageModalProps> = ({ isOpen, language, onSelectLanguage }) => {
  if (!isOpen) return null;

  return (
    <main className="afg-language-screen" role="main" aria-labelledby="afg-language-title">
      <section className="afg-language-panel">
        <div className="afg-language-mark" aria-hidden="true"><Globe2 size={30} /></div>
        <p className="afg-language-brand">AFG AI</p>
        <h1 id="afg-language-title">Choose your language</h1>
        <p className="afg-language-subtitle">Select a language to continue. You can change it later in Settings.</p>
        <div className="afg-language-options max-h-[55vh] overflow-y-auto">
          {LANGUAGE_OPTIONS.map((option) => (
            <button key={option.id} type="button" className={`afg-language-option ${language === option.id ? 'is-selected' : ''}`} onClick={() => onSelectLanguage(option.id)} lang={option.id} dir={option.rtl ? 'rtl' : 'ltr'}>
              <span className="afg-language-native">{option.native}</span>
              <span className="afg-language-meta">{option.name} · {option.region}</span>
              {language === option.id && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
        <p className="afg-language-footnote">Your choice is saved on this device. Some interface translations are being added progressively; languages without a completed translation currently display English UI text.</p>
      </section>
    </main>
  );
};
