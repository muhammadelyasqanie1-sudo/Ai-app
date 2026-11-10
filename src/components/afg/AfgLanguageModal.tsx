import React from 'react';
import { Check, Globe2 } from 'lucide-react';
import type { Language } from '../../types/afg';

interface AfgLanguageModalProps {
  isOpen: boolean;
  language: Language | null;
  onSelectLanguage: (lang: Language) => void;
}

const LANGUAGE_SCREEN_COPY: Record<Language,{title:string;subtitle:string;footnote:string}> = {
  dari:{title:'زبان خود را انتخاب کنید',subtitle:'برای ادامه، زبان مورد نظر را برگزینید. بعداً نیز می‌توانید آن را در تنظیمات تغییر دهید.',footnote:'انتخاب شما در همین دستگاه ذخیره می‌شود.'},
  english:{title:'Choose your language',subtitle:'Select a language to continue. You can change it later in Settings.',footnote:'Your choice is saved on this device.'},
  pashto:{title:'خپله ژبه وټاکئ',subtitle:'د دوام لپاره خپله ژبه وټاکئ. وروسته یې په امستنو کې بدلولی شئ.',footnote:'ستاسو انتخاب په همدې وسیله کې خوندي کېږي.'},
  persian:{title:'زبان خود را انتخاب کنید',subtitle:'برای ادامه زبان دلخواه را انتخاب کنید. بعداً از تنظیمات قابل تغییر است.',footnote:'انتخاب شما روی همین دستگاه ذخیره می‌شود.'},
  arabic:{title:'اختر لغتك',subtitle:'اختر لغة للمتابعة. يمكنك تغييرها لاحقاً من الإعدادات.',footnote:'يُحفظ اختيارك على هذا الجهاز.'},
  urdu:{title:'اپنی زبان منتخب کریں',subtitle:'جاری رکھنے کے لیے زبان منتخب کریں۔ آپ اسے بعد میں ترتیبات میں بدل سکتے ہیں۔',footnote:'آپ کا انتخاب اسی ڈیوائس پر محفوظ ہوگا۔'},
  turkish:{title:'Dilinizi seçin',subtitle:'Devam etmek için bir dil seçin. Daha sonra Ayarlar’dan değiştirebilirsiniz.',footnote:'Seçiminiz bu cihazda kaydedilir.'},
  russian:{title:'Выберите язык',subtitle:'Выберите язык для продолжения. Позже его можно изменить в настройках.',footnote:'Ваш выбор сохранён на этом устройстве.'},
  french:{title:'Choisissez votre langue',subtitle:'Sélectionnez une langue pour continuer. Vous pourrez la modifier dans les paramètres.',footnote:'Votre choix est enregistré sur cet appareil.'},
  spanish:{title:'Elige tu idioma',subtitle:'Selecciona un idioma para continuar. Puedes cambiarlo más tarde en Ajustes.',footnote:'Tu elección se guarda en este dispositivo.'},
  german:{title:'Sprache auswählen',subtitle:'Wähle eine Sprache, um fortzufahren. Du kannst sie später in den Einstellungen ändern.',footnote:'Deine Auswahl wird auf diesem Gerät gespeichert.'},
  chinese:{title:'选择语言',subtitle:'选择一种语言以继续。之后可以在设置中更改。',footnote:'你的选择将保存在此设备上。'},
  hindi:{title:'अपनी भाषा चुनें',subtitle:'जारी रखने के लिए भाषा चुनें। आप इसे बाद में सेटिंग में बदल सकते हैं।',footnote:'आपकी पसंद इस डिवाइस पर सहेजी जाएगी।'},
  bengali:{title:'আপনার ভাষা নির্বাচন করুন',subtitle:'চালিয়ে যেতে একটি ভাষা বেছে নিন। পরে সেটিংস থেকে পরিবর্তন করতে পারবেন।',footnote:'আপনার পছন্দ এই ডিভাইসে সংরক্ষিত হবে।'},
  indonesian:{title:'Pilih bahasa Anda',subtitle:'Pilih bahasa untuk melanjutkan. Anda dapat mengubahnya nanti di Pengaturan.',footnote:'Pilihan Anda disimpan di perangkat ini.'},
  portuguese:{title:'Escolha seu idioma',subtitle:'Selecione um idioma para continuar. Você pode alterá-lo depois nas configurações.',footnote:'Sua escolha fica salva neste dispositivo.'},
  japanese:{title:'言語を選択',subtitle:'続行する言語を選んでください。後から設定で変更できます。',footnote:'選択内容はこの端末に保存されます。'},
  korean:{title:'언어 선택',subtitle:'계속하려면 언어를 선택하세요. 나중에 설정에서 변경할 수 있습니다.',footnote:'선택한 언어는 이 기기에 저장됩니다。'}
};

const LANGUAGE_OPTIONS: Array<{id:Language;name:string;native:string;region:string;rtl?:boolean}> = [
  {id:'dari',name:'Dari',native:'دری',region:'افغانستان',rtl:true},
  {id:'english',name:'English',native:'English',region:'Global'},
  {id:'pashto',name:'Pashto',native:'پښتو',region:'افغانستان / پاکستان',rtl:true},
  {id:'arabic',name:'Arabic',native:'العربية',region:'العالم العربي',rtl:true},
];

export const AfgLanguageModal: React.FC<AfgLanguageModalProps> = ({ isOpen, language, onSelectLanguage }) => {
  if (!isOpen) return null;
  const screenCopy = LANGUAGE_SCREEN_COPY[language || 'english'] || LANGUAGE_SCREEN_COPY.english;

  return (
    <main className="afg-language-screen" role="main" aria-labelledby="afg-language-title">
      <section className="afg-language-panel">
        <div className="afg-language-mark" aria-hidden="true"><Globe2 size={30} /></div>
        <p className="afg-language-brand">AFG AI</p>
        <h1 id="afg-language-title">{screenCopy.title}</h1>
        <p className="afg-language-subtitle">{screenCopy.subtitle}</p>
        <div className="afg-language-options max-h-[55vh] overflow-y-auto">
          {LANGUAGE_OPTIONS.map((option) => (
            <button key={option.id} type="button" className={`afg-language-option ${language === option.id ? 'is-selected' : ''}`} onClick={() => onSelectLanguage(option.id)} lang={option.id} dir={option.rtl ? 'rtl' : 'ltr'}>
              <span className="afg-language-native">{option.native}</span>
              <span className="afg-language-meta">{option.name} · {option.region}</span>
              {language === option.id && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
        <p className="afg-language-footnote">{screenCopy.footnote}</p>
      </section>
    </main>
  );
};
