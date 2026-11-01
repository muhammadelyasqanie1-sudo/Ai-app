import React from 'react';
import { Check, Globe2 } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgLanguageModalProps {
  isOpen: boolean;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
}

export const AfgLanguageModal: React.FC<AfgLanguageModalProps> = ({ isOpen, language, onSelectLanguage }) => {
  if (!isOpen) return null;

  return (
    <main className="afg-language-screen" role="main" aria-labelledby="afg-language-title">
      <section className="afg-language-panel">
        <div className="afg-language-mark" aria-hidden="true"><Globe2 size={30} /></div>
        <p className="afg-language-brand">AFG AI</p>
        <h1 id="afg-language-title">Choose your language</h1>
        <p className="afg-language-subtitle">Select a language to continue. You can change it later in Settings.</p>
        <div className="afg-language-options">
          <button type="button" className={`afg-language-option ${language === 'dari' ? 'is-selected' : ''}`} onClick={() => onSelectLanguage('dari')} lang="fa-AF" dir="rtl">
            <span className="afg-language-native">دری</span>
            <span className="afg-language-meta">افغانستان</span>
            {language === 'dari' && <Check aria-hidden="true" />}
          </button>
          <button type="button" className={`afg-language-option ${language === 'english' ? 'is-selected' : ''}`} onClick={() => onSelectLanguage('english')} lang="en" dir="ltr">
            <span className="afg-language-native">English</span>
            <span className="afg-language-meta">Global</span>
            {language === 'english' && <Check aria-hidden="true" />}
          </button>
        </div>
        <p className="afg-language-footnote">Your choice is saved on this device.</p>
      </section>
    </main>
  );
};
