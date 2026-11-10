import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronRight, ArrowLeft, Globe, Palette, MessageSquare, Brain, Code2, Shield,
  Cpu, Smartphone, Mic, FileText, Github, Send, Server, Network, KeyRound, Router, Settings2,
  CheckCircle2, AlertCircle, LockKeyhole, ExternalLink
} from 'lucide-react';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { AfgAccountSettings } from './AfgAccountSettings';
import { AfgFileLibrary } from './AfgFileLibrary';
import { AfgIntelligencePanel } from './AfgIntelligencePanel';
import { AfgApiConnectorPanel } from './AfgApiConnectorPanel';
import { getHubUi } from '../../utils/localeUi';

type Context = 'user' | 'admin';
type SettingId = 'language'|'appearance'|'chat'|'memory'|'intelligence'|'coding'|'privacy'|'files'|'models'|'local'|'voice'|'github'|'telegram'|'ftp'|'mcp'|'byok'|'router'|'api-hub'|'9router';
type Item = { id: SettingId; group: string; title: string; subtitle: string; icon: React.ElementType; keywords: string[] };
type Status = 'active'|'ready'|'setup'|'disabled'|'unknown';

const API = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const csrf = () => decodeURIComponent(document.cookie.split('; ').find(v => v.startsWith('afg_csrf='))?.slice(9) || '');
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrf());
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API + path, { ...init, headers, credentials: 'include', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The integration status check timed out. Please retry.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const ITEMS: Item[] = [
  {id:'language',group:'Personalize',title:'App language',subtitle:'Choose the language used across AFG AI.',icon:Globe,keywords:['locale','dari','english','persian','pashto','arabic','urdu','turkish','russian','french','spanish','german','chinese','hindi','bengali','indonesian','portuguese','japanese','korean','ترجمه']},
  {id:'appearance',group:'Personalize',title:'Appearance',subtitle:'Theme, accent color, density and typography.',icon:Palette,keywords:['light','dark','system','neon','color']},
  {id:'chat',group:'Personalize',title:'Chat settings',subtitle:'Response preferences, chat width and startup behavior.',icon:MessageSquare,keywords:['instructions','prompt','images','startup']},
  {id:'memory',group:'Personalize',title:'Memory',subtitle:'Review and manage saved memory items.',icon:Brain,keywords:['remember','saved memory']},
  {id:'intelligence',group:'Your Assistant',title:'AFG AI Intelligence',subtitle:'Private knowledge, memory retrieval and training-data curation.',icon:Brain,keywords:['knowledge','training','fine tuning','rag','dataset','learning','دانش','آموزش']},
  {id:'coding',group:'Personalize',title:'Coding',subtitle:'Coding workspace and execution preferences.',icon:Code2,keywords:['agent','terminal','programming','sandbox']},
  {id:'privacy',group:'Personalize',title:'Privacy & security',subtitle:'Account security, sessions and personal data.',icon:Shield,keywords:['lock','biometric','screenshots','delete account']},
  {id:'files',group:'Your Assistant',title:'Files & workspace',subtitle:'Private file library, upload and quarantine status.',icon:FileText,keywords:['upload','pdf','documents','workspace','storage']},
  {id:'models',group:'Your Assistant',title:'Models & providers',subtitle:'Verified models, default selection and availability.',icon:Cpu,keywords:['ai','model','provider','fallback']},
  {id:'local',group:'Your Assistant',title:'Local models',subtitle:'On-device models and offline mode availability.',icon:Smartphone,keywords:['offline','ollama','webllm','download']},
  {id:'voice',group:'Your Assistant',title:'Voice & speech',subtitle:'Speech recognition and text-to-speech capabilities.',icon:Mic,keywords:['microphone','tts','stt']},
  {id:'github',group:'Connections',title:'GitHub',subtitle:'Link your account to import repositories and publish changes.',icon:Github,keywords:['oauth','repository','git']},
  {id:'telegram',group:'Connections',title:'Telegram',subtitle:'Pair your account with the AFG AI Telegram bot.',icon:Send,keywords:['bot','pairing']},
  {id:'ftp',group:'Connections',title:'FTP / SFTP sync',subtitle:'Connect a remote workspace for file transfer.',icon:Server,keywords:['sftp','ftp','upload','download']},
  {id:'api-hub',group:'Connections',title:'Public APIs & API keys',subtitle:'Discover APIs, store your own credentials securely and enable AI tools.',icon:KeyRound,keywords:['public apis','api key','connector','rest','http','mashape','bearer','authentication']},
  {id:'mcp',group:'Connections',title:'Connected tools (MCP)',subtitle:'Tools exposed by a supported desktop runtime.',icon:Network,keywords:['mcp','tools','servers']},
  {id:'byok',group:'Special Providers',title:'Connected accounts (BYOK)',subtitle:'Use your own provider credentials when enabled.',icon:KeyRound,keywords:['openai','anthropic','claude','deepseek','api key']},
  {id:'router',group:'Special Providers',title:'9Router / local router',subtitle:'Connect a local OpenAI-compatible model router.',icon:Router,keywords:['litellm','ollama','localhost','proxy']},
  {id:'9router',group:'Special Providers',title:'9Router AI Gateway',subtitle:'Chat models, image, video, speech, web search and embeddings through 9Router.',icon:Router,keywords:['9router','multimodal','image generation','video','tts','stt','search','embeddings']},
];

const copy = {
  en: {
    search:'Search settings', user:'User settings', admin:'Admin settings', back:'Back to settings',
    configured:'Connected', available:'Available', setup:'Requires setup', disabled:'Disabled by administrator', checking:'Checking status…',
    save:'Save', notConfigured:'Not configured', signIn:'Sign in to configure personal settings.',
    disabledText:'This feature is disabled by the platform administrator.',
    setupText:'The backend has not confirmed this integration as active. Ask an administrator to finish setup.',
    noResults:'No settings match your search.',
    groups:['Personalize','Your Assistant','Connections','Special Providers'],
    githubConnect:'Connect GitHub account', githubDisconnect:'Disconnect GitHub',
    githubReady:'GitHub OAuth is configured by the platform. Connect your personal account to continue.',
    openAccount:'Account and preference controls', adminIntro:'Global configuration and infrastructure controls are protected by administrator role checks.',
    models:'Verified models', noModels:'No health-verified models are currently available.',
    defaultModel:'Default model', modelSaved:'Default model saved.',
    local:'Offline model runtime', voice:'Voice capabilities', feature:'Feature availability',
    notAvailable:'Not available until the backend reports it as enabled.',
    statusError:'Could not verify backend status. Treat this feature as unavailable.',
    language:'Language preference', languageHelp:'Four primary interface languages are available: Dari, English, Pashto and Arabic.',
    adminGate:'Admin access is verified by the server; this view does not grant admin privileges.',
  },
  fa: {
    search:'جستجوی تنظیمات', user:'تنظیمات کاربر', admin:'تنظیمات مدیر', back:'بازگشت به تنظیمات',
    configured:'متصل', available:'فعال', setup:'نیازمند راه‌اندازی', disabled:'توسط مدیر غیرفعال شده', checking:'در حال بررسی وضعیت…',
    save:'ذخیره', notConfigured:'تنظیم نشده', signIn:'برای ذخیره تنظیمات شخصی وارد حساب شوید.',
    disabledText:'این قابلیت توسط مدیر پلتفرم غیرفعال شده است.',
    setupText:'فعال بودن این اتصال هنوز از سوی سرور تأیید نشده است. مدیر باید راه‌اندازی را تکمیل کند.',
    noResults:'تنظیمی با این جستجو پیدا نشد.',
    groups:['شخصی‌سازی','دستیار هوشمند','اتصال‌ها','ارائه‌دهندگان ویژه'],
    githubConnect:'اتصال حساب GitHub', githubDisconnect:'قطع اتصال GitHub',
    githubReady:'OAuth گیت‌هاب توسط پلتفرم تنظیم شده است. حساب شخصی خود را متصل کنید.',
    openAccount:'کنترل‌های حساب و ترجیحات', adminIntro:'تنظیمات سراسری و زیرساخت فقط با نقش مدیر قابل دسترسی است.',
    models:'مدل‌های تأییدشده', noModels:'اکنون هیچ مدل تأییدشده و سالمی موجود نیست.',
    defaultModel:'مدل پیش‌فرض', modelSaved:'مدل پیش‌فرض ذخیره شد.',
    local:'اجرای مدل آفلاین', voice:'قابلیت‌های صوتی', feature:'دسترسی قابلیت',
    notAvailable:'تا زمانی که سرور فعال بودن آن را تأیید نکند، در دسترس نیست.',
    statusError:'بررسی وضعیت سرور ناموفق بود؛ این قابلیت غیرفعال فرض می‌شود.',
    language:'ترجیحات زبان', languageHelp:'۱۸ زبان و منطقه قابل انتخاب است. ترجمه کامل رابط کاربری به‌تدریج تکمیل می‌شود و زبان‌های ترجمه‌نشده فعلاً متن انگلیسی نمایش می‌دهند.',
    adminGate:'دسترسی مدیر توسط سرور بررسی می‌شود؛ این صفحه امتیاز مدیر ایجاد نمی‌کند.',
  },
  ps: {
    search:'امستنې ولټوئ',user:'د کارونکي امستنې',admin:'د مدیر امستنې',back:'امستنو ته بېرته',configured:'وصل شو',available:'شته',setup:'چمتو کولو ته اړتیا لري',disabled:'د مدیر له خوا بند شوی',checking:'حالت کتل کېږي…',save:'خوندي کول',notConfigured:'نه دی تنظیم شوی',signIn:'د شخصي امستنو لپاره ننوتل وکړئ.',
    disabledText:'دا ځانګړنه د پلاتفورم د مدیر له خوا بنده شوې ده.',setupText:'سرور لا د دې نښلونې فعالوالی نه دی تایید کړی. له مدیر څخه د تنظیم بشپړولو غوښتنه وکړئ.',noResults:'ستاسو د لټون سره سم امستنه نشته.',groups:['شخصي کول','ستاسو مرستیال','نښلونې','ځانګړي برابرونکي'],
    githubConnect:'GitHub حساب ونښلوئ',githubDisconnect:'GitHub اړیکه پرې کړئ',githubReady:'GitHub OAuth د پلاتفورم له خوا تنظیم شوی. د دوام لپاره خپل حساب ونښلوئ.',openAccount:'د حساب او غوره‌توبونو کنټرول',adminIntro:'نړیوال تنظیمات او د زېربنا کنټرول یوازې د مدیر د اجازې له لارې کار کوي.',
    models:'تایید شوي ماډلونه',noModels:'اوس مهال هېڅ تایید شوی ماډل نشته.',defaultModel:'اصلي ماډل',modelSaved:'اصلي ماډل خوندي شو.',local:'نالیکي ماډلونه',voice:'غږیزې وړتیاوې',feature:'د ځانګړنې شتون',notAvailable:'تر هغه نه شته چې سرور یې فعالوالی تایید کړي.',statusError:'د سرور حالت ونه کتل شو؛ دا ځانګړنه د نه شتون په توګه وګڼئ.',language:'د ژبې غوره‌توب',languageHelp:'د رابطې څلور اصلي ژبې شته: دري، انګلیسي، پښتو او عربي.',adminGate:'د مدیر اجازه سرور تاییدوي؛ دا پاڼه د مدیر واک نه درکوي.'
  },
  ar: {
    search:'البحث في الإعدادات',user:'إعدادات المستخدم',admin:'إعدادات المسؤول',back:'العودة إلى الإعدادات',configured:'متصل',available:'متاح',setup:'يتطلب الإعداد',disabled:'معطّل بواسطة المسؤول',checking:'جارٍ التحقق…',save:'حفظ',notConfigured:'غير مُعدّ',signIn:'سجّل الدخول لضبط الإعدادات الشخصية.',
    disabledText:'هذه الميزة معطّلة من مسؤول المنصة.',setupText:'لم يؤكد الخادم تفعيل هذا الاتصال بعد. اطلب من المسؤول إكمال الإعداد.',noResults:'لا توجد إعدادات تطابق البحث.',groups:['التخصيص','مساعدك','الاتصالات','مزودون خاصون'],
    githubConnect:'ربط حساب GitHub',githubDisconnect:'فصل GitHub',githubReady:'تم إعداد GitHub OAuth من المنصة. اربط حسابك الشخصي للمتابعة.',openAccount:'إعدادات الحساب والتفضيلات',adminIntro:'إعدادات المنصة والبنية التحتية محمية بصلاحيات المسؤول.',
    models:'النماذج المعتمدة',noModels:'لا تتوفر حالياً نماذج تم التحقق منها.',defaultModel:'النموذج الافتراضي',modelSaved:'تم حفظ النموذج الافتراضي.',local:'النماذج المحلية',voice:'إمكانات الصوت',feature:'توفر الميزة',notAvailable:'لن تتوفر حتى يؤكد الخادم تفعيلها.',statusError:'تعذر التحقق من حالة الخادم؛ اعتبر هذه الميزة غير متاحة.',language:'تفضيل اللغة',languageHelp:'لغات الواجهة الأساسية المتاحة: الدَّرية والإنجليزية والبشتوية والعربية.',adminGate:'يتحقق الخادم من صلاحية المسؤول؛ هذه الصفحة لا تمنح صلاحيات إدارية.'
  }
};

const LANGUAGE_OPTIONS: Array<{id:Language;label:string;native:string}> = [
  {id:'english',label:'English',native:'English'},{id:'dari',label:'Dari',native:'دری'},
  {id:'pashto',label:'Pashto',native:'پښتو'},{id:'persian',label:'Persian',native:'فارسی'},
  {id:'arabic',label:'Arabic',native:'العربية'},{id:'urdu',label:'Urdu',native:'اردو'},
  {id:'turkish',label:'Turkish',native:'Türkçe'},{id:'russian',label:'Russian',native:'Русский'},
  {id:'french',label:'French',native:'Français'},{id:'spanish',label:'Spanish',native:'Español'},
  {id:'german',label:'German',native:'Deutsch'},{id:'chinese',label:'Chinese (Simplified)',native:'简体中文'},
  {id:'hindi',label:'Hindi',native:'हिन्दी'},{id:'bengali',label:'Bengali',native:'বাংলা'},
  {id:'indonesian',label:'Indonesian',native:'Bahasa Indonesia'},{id:'portuguese',label:'Portuguese',native:'Português'},
  {id:'japanese',label:'Japanese',native:'日本語'},{id:'korean',label:'Korean',native:'한국어'},
];

interface Props {
  language: Language; theme: Theme; user: UserProfile;
  onSetLanguage: (language: Language) => void; onToggleTheme: () => void;
  onSetTheme: (theme: Theme) => void; onOpenShortcuts: () => void;
}

export const AfgSettingsHub: React.FC<Props> = ({language,theme,user,onSetLanguage,onSetTheme,onOpenShortcuts}) => {
  const locale = language === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const fa = locale === 'dari';
  const hubUi = getHubUi(language);
  const t = { ...copy.en, ...(locale === 'dari' ? copy.fa : locale === 'pashto' ? copy.ps : locale === 'arabic' ? copy.ar : {}), ...hubUi };
  const extra = {
    dari:{settings:'تنظیمات',manage:'مرکز تنظیمات AFG AI',adminLegacy:'پنل قدیمی مدیریت داخل برنامه حذف شده است. مدیریت زیرساخت و کاربران از درگاه امن و جداگانه 9Router انجام می‌شود.',gateway:'وضعیت و مدیریت درگاه 9Router از بخش مدیریت امن و جداگانه انجام می‌شود. این صفحه هیچ لینک یا وضعیت ساختگی نشان نمی‌دهد.',shortcuts:'میان‌برهای صفحه‌کلید',guest:'حساب مهمان',signedIn:'وارد شده',group:['شخصی‌سازی','دستیار هوشمند','اتصال‌ها','ارائه‌دهندگان ویژه']},
    english:{settings:'Settings',manage:'Manage your AFG AI experience',adminLegacy:'The legacy in-app admin panel has been removed. Infrastructure and user administration are handled by the separate authenticated 9Router control plane.',gateway:'9Router gateway administration is handled through the separate authenticated control plane. This page does not display a fabricated link or status.',shortcuts:'Keyboard shortcuts',guest:'Guest account',signedIn:'SIGNED IN',group:['Personalize','Your Assistant','Connections','Special Providers']},
    pashto:{settings:'امستنې',manage:'د AFG AI تجربه تنظیم کړئ',adminLegacy:'د اپ پخوانی مدیریتي پینل لرې شوی. د زېربنا او کاروونکو اداره د 9Router له خوندي جلا پینل څخه کېږي.',gateway:'د 9Router دروازې اداره د خوندي جلا مدیریتي پینل له لارې کېږي. دا پاڼه ناسم لینک یا حالت نه ښيي.',shortcuts:'د کیبورډ لنډلارې',guest:'د مېلمه حساب',signedIn:'ننوتل شوی',group:['شخصي کول','ستاسو مرستیال','نښلونې','ځانګړي برابرونکي']},
    arabic:{settings:'الإعدادات',manage:'إدارة تجربة AFG AI',adminLegacy:'تمت إزالة لوحة الإدارة القديمة داخل التطبيق. تتم إدارة البنية التحتية والمستخدمين عبر لوحة 9Router منفصلة ومحمية.',gateway:'تتم إدارة بوابة 9Router عبر لوحة تحكم منفصلة ومحمية. لا تعرض هذه الصفحة رابطاً أو حالة غير حقيقية.',shortcuts:'اختصارات لوحة المفاتيح',guest:'حساب ضيف',signedIn:'تم تسجيل الدخول',group:['التخصيص','مساعدك','الاتصالات','مزودون خاصون']}
  }[locale];
  const itemTitles: Record<string,string> = {
    language: locale==='dari'?'زبان برنامه':locale==='pashto'?'د اپ ژبه':locale==='arabic'?'لغة التطبيق':'App language',
    appearance: locale==='dari'?'ظاهر برنامه':locale==='pashto'?'بڼه':locale==='arabic'?'المظهر':'Appearance',
    chat: locale==='dari'?'تنظیمات گفتگو':locale==='pashto'?'د خبرو امستنې':locale==='arabic'?'إعدادات المحادثة':'Chat settings',
    memory: locale==='dari'?'حافظه':locale==='pashto'?'حافظه':locale==='arabic'?'الذاكرة':'Memory',
    intelligence: locale==='dari'?'هوش اختصاصی AFG AI':locale==='pashto'?'د AFG AI ځانګړې ځیرکتیا':locale==='arabic'?'ذكاء AFG AI':'AFG AI Intelligence',
    coding: locale==='dari'?'برنامه‌نویسی':locale==='pashto'?'کوډ لیکنه':locale==='arabic'?'البرمجة':'Coding',
    privacy: locale==='dari'?'حریم خصوصی و امنیت':locale==='pashto'?'محرمیت او امنیت':locale==='arabic'?'الخصوصية والأمان':'Privacy & security',
    files: locale==='dari'?'فایل‌ها و فضای کاری':locale==='pashto'?'فایلونه او کاري ځای':locale==='arabic'?'الملفات ومساحة العمل':'Files & workspace',
    models: locale==='dari'?'مدل‌ها و ارائه‌دهندگان':locale==='pashto'?'ماډلونه او برابرونکي':locale==='arabic'?'النماذج والمزوّدون':'Models & providers',
    local: locale==='dari'?'مدل‌های محلی':locale==='pashto'?'ځایي ماډلونه':locale==='arabic'?'النماذج المحلية':'Local models',
    voice: locale==='dari'?'صدا و گفتار':locale==='pashto'?'غږ او وینا':locale==='arabic'?'الصوت والكلام':'Voice & speech',
    github: locale==='dari'?'اتصال GitHub':locale==='pashto'?'GitHub نښلول':locale==='arabic'?'ربط GitHub':'GitHub',
    telegram: locale==='dari'?'اتصال تلگرام':locale==='pashto'?'Telegram نښلول':locale==='arabic'?'ربط Telegram':'Telegram',
    ftp: locale==='dari'?'همگام‌سازی FTP / SFTP':locale==='pashto'?'FTP / SFTP همغږي':locale==='arabic'?'مزامنة FTP / SFTP':'FTP / SFTP sync',
    'api-hub': locale==='dari'?'APIهای عمومی و کلیدها':locale==='pashto'?'عامه API او کیلي':locale==='arabic'?'واجهات API العامة والمفاتيح':'Public APIs & API keys',
    mcp: locale==='dari'?'ابزارهای متصل (MCP)':locale==='pashto'?'نښتي وسایل (MCP)':locale==='arabic'?'الأدوات المتصلة (MCP)':'Connected tools (MCP)',
    byok: locale==='dari'?'حساب‌های متصل (BYOK)':locale==='pashto'?'نښتي حسابونه (BYOK)':locale==='arabic'?'الحسابات المتصلة (BYOK)':'Connected accounts (BYOK)',
    router: locale==='dari'?'درگاه محلی 9Router':locale==='pashto'?'ځایي 9Router دروازه':locale==='arabic'?'بوابة 9Router المحلية':'9Router / local router',
    '9router':'9Router AI Gateway'
  };
  const pageCopy = {
    dari:{appearance:'ظاهر برنامه',chat:'تنظیمات گفتگو',memory:'حافظه شخصی',coding:'محیط برنامه‌نویسی',privacy:'حریم خصوصی و امنیت',memoryHelp:'رضایت حافظه، موارد ذخیره‌شده و دسترسی حافظه را از تنظیمات حساب مدیریت کنید.',privacyHelp:'امنیت حساب، نشست‌های فعال، خروجی گرفتن و حذف حساب را مدیریت کنید.',codingHelp:'ترمینل و اجرای کد تا زمان فعال‌شدن محیط امن تأییدشده غیرفعال می‌ماند.',chatHelp:'سبک پاسخ، طول، خلاقیت، زبان پیش‌فرض و ترجیحات مدل را تنظیم کنید.',guestHelp:'این تنظیمات در حساب شما ذخیره می‌شوند؛ تغییرات مهمان فقط در همین دستگاه می‌مانند.',githubLinked:'حساب GitHub وصل است:',githubNotConfigured:'اتصال GitHub توسط مدیر تنظیم نشده است.',githubSignIn:'برای اتصال GitHub وارد حساب شوید.',telegram:'اتصال ربات تلگرام تا زمان تنظیم ربات پلتفرم و API جفت‌سازی در دسترس نیست.',ftp:'اطلاعات ورود از راه دور تا فعال‌شدن API رمزگذاری‌شده شخصی FTP/SFTP پذیرفته نمی‌شود.',mcp:'کشف runtime ابزارهای MCP فقط هنگام اتصال یک عامل دسکتاپ پشتیبانی‌شده در دسترس است.',byok:'BYOK تا زمان فعال‌سازی توسط مدیر و راه‌اندازی خزانه امن کلید، غیرفعال می‌ماند.',router:'روتر محلی به پل ارتباطی روی دستگاه نیاز دارد؛ localhost سرور همان گوشی شما نیست.',refresh:'تازه‌سازی وضعیت سرور',date:'تاریخ، عدد و قالب منطقه‌ای بر اساس زبان انتخاب‌شده تنظیم می‌شود.'},
    english:{appearance:'Appearance',chat:'Chat preferences',memory:'Personal memory',coding:'Coding workspace',privacy:'Privacy & security',memoryHelp:'Manage memory consent, saved items and memory availability in account controls below.',privacyHelp:'Manage account security, active sessions, export and account deletion below.',codingHelp:'Terminal and code execution stay unavailable until an administrator enables a verified sandbox.',chatHelp:'Configure response style, length, creativity, default language and model preferences below.',guestHelp:'These controls are stored in your account when signed in; guest changes remain local to this device.',githubLinked:'GitHub account linked:',githubNotConfigured:'GitHub integration is not configured by the administrator.',githubSignIn:'Sign in to connect GitHub.',telegram:'Telegram pairing is unavailable until the platform bot and pairing API are configured.',ftp:'Remote credentials are not accepted until the encrypted personal FTP/SFTP API is enabled.',mcp:'MCP runtime discovery is available only when a supported desktop agent is connected.',byok:'BYOK remains hidden from active use until the administrator enables the feature and secure key vault.',router:'A local router requires a device-side bridge; localhost on the server is not your phone.',refresh:'Refresh backend status',date:'Date, number and regional formatting follow the selected language.'},
    pashto:{appearance:'بڼه',chat:'د خبرو امستنې',memory:'شخصي حافظه',coding:'د کوډ کاري چاپېریال',privacy:'محرمیت او امنیت',memoryHelp:'د حافظې اجازه، خوندي شوي توکي او د حافظې شتون د حساب له امستنو اداره کړئ.',privacyHelp:'د حساب امنیت، فعالې ناستې، د معلوماتو ایستل او د حساب ړنګول اداره کړئ.',codingHelp:'ټرمینل او د کوډ اجرا تر هغه بند وي چې مدیر تایید شوی خوندي چاپېریال فعال کړي.',chatHelp:'د ځواب سبک، اوږدوالی، نوښت، اصلي ژبه او د ماډل غوره‌توبونه تنظیم کړئ.',guestHelp:'د ننوتلو پر مهال امستنې په حساب کې ساتل کېږي؛ د مېلمه بدلونونه یوازې په همدې وسیله پاتې کېږي.',githubLinked:'GitHub حساب وصل دی:',githubNotConfigured:'GitHub نښلونې د مدیر له خوا نه ده تنظیم شوې.',githubSignIn:'د GitHub نښلولو لپاره ننوتل وکړئ.',telegram:'د Telegram جوړه کول تر هغه نه شته چې د پلاتفورم بوټ او د جوړه کولو API تنظیم شي.',ftp:'د لرې لاسرسي معلومات تر خوندي شخصي FTP/SFTP API پورې نه منل کېږي.',mcp:'د MCP runtime کشف یوازې د ملاتړ شوي ډیسکتاپ عامل په نښلېدو شونی دی.',byok:'BYOK تر هغه فعال نه دی چې مدیر یې او د کیلي خوندي خزانه فعاله کړي.',router:'ځایي روټر د وسیلې دننه پل ته اړتیا لري؛ د سرور localhost ستاسو موبایل نه دی.',refresh:'د سرور حالت تازه کول',date:'نېټه، شمېرې او سیمه‌ییزه بڼه د ټاکل شوې ژبې له مخې بدلېږي.'},
    arabic:{appearance:'المظهر',chat:'تفضيلات المحادثة',memory:'الذاكرة الشخصية',coding:'بيئة البرمجة',privacy:'الخصوصية والأمان',memoryHelp:'أدر الموافقة على الذاكرة والعناصر المحفوظة وتوفر الذاكرة من إعدادات الحساب.',privacyHelp:'أدر أمان الحساب والجلسات النشطة والتصدير وحذف الحساب.',codingHelp:'تبقى الطرفية وتنفيذ التعليمات البرمجية غير متاحين حتى يفعّل المسؤول بيئة معزولة موثوقة.',chatHelp:'اضبط أسلوب الرد وطوله وإبداعه واللغة الافتراضية وتفضيلات النموذج.',guestHelp:'تُحفظ هذه الإعدادات في حسابك عند تسجيل الدخول؛ وتبقى تغييرات الضيف على هذا الجهاز.',githubLinked:'حساب GitHub مرتبط:',githubNotConfigured:'لم يضبط المسؤول تكامل GitHub.',githubSignIn:'سجّل الدخول لربط GitHub.',telegram:'لا يتوفر إقران Telegram حتى إعداد روبوت المنصة وواجهة الإقران.',ftp:'لا تُقبل بيانات الدخول البعيدة حتى تفعيل واجهة FTP/SFTP الشخصية المشفرة.',mcp:'لا يتوفر اكتشاف تشغيل MCP إلا عند اتصال وكيل سطح مكتب مدعوم.',byok:'يبقى BYOK غير نشط حتى يفعّل المسؤول الميزة وخزنة المفاتيح الآمنة.',router:'يتطلب الموجّه المحلي جسراً على الجهاز؛ فـ localhost على الخادم ليس هاتفك.',refresh:'تحديث حالة الخادم',date:'يتبع تنسيق التاريخ والأرقام والمنطقة اللغة المحددة.'}
  }[locale];
  const itemDescriptions:Record<string,string> = {
    language:locale==='dari'?'زبان تمام بخش‌های برنامه را انتخاب کنید.':locale==='pashto'?'د ټول اپ ژبه وټاکئ.':locale==='arabic'?'اختر لغة جميع أجزاء التطبيق.':'Choose the language used across the app.',
    appearance:locale==='dari'?'رنگ و ظاهر برنامه را تنظیم کنید.':locale==='pashto'?'د اپ رنګونه او بڼه تنظیم کړئ.':locale==='arabic'?'اضبط ألوان التطبيق ومظهره.':'Configure the app theme and appearance.',
    chat:locale==='dari'?'رفتار پاسخ‌گویی و مدل گفتگو را تنظیم کنید.':locale==='pashto'?'د ځواب ورکولو او خبرو ماډل تنظیم کړئ.':locale==='arabic'?'اضبط أسلوب الرد ونموذج المحادثة.':'Configure response behavior and chat preferences.',
    memory:locale==='dari'?'حافظه و اطلاعات ذخیره‌شده حساب را مدیریت کنید.':locale==='pashto'?'د حساب حافظه او خوندي شوي معلومات اداره کړئ.':locale==='arabic'?'أدر الذاكرة والمعلومات المحفوظة في الحساب.':'Manage account memory and saved information.',
    files:locale==='dari'?'فایل‌های خصوصی و فضای کاری را مدیریت کنید.':locale==='pashto'?'شخصي فایلونه او کاري ځای اداره کړئ.':locale==='arabic'?'أدر الملفات الخاصة ومساحة العمل.':'Manage private files and workspace.',
    models:locale==='dari'?'مدل‌های تأییدشده و مدل پیش‌فرض را انتخاب کنید.':locale==='pashto'?'تایید شوي ماډلونه او اصلي ماډل وټاکئ.':locale==='arabic'?'اختر النماذج المعتمدة والنموذج الافتراضي.':'Choose verified models and your default model.',
    github:locale==='dari'?'حساب GitHub خود را به برنامه وصل کنید.':locale==='pashto'?'خپل GitHub حساب له اپ سره ونښلوئ.':locale==='arabic'?'اربط حساب GitHub بالتطبيق.':'Connect your GitHub account to the app.',
    local:locale==='dari'?'اجرای مدل‌ها روی همین دستگاه.':locale==='pashto'?'ماډلونه په همدې وسیله وچلوئ.':locale==='arabic'?'شغّل النماذج على هذا الجهاز.':'Run models on this device.',
    voice:locale==='dari'?'ورودی و خروجی گفتار را تنظیم کنید.':locale==='pashto'?'د وینا داخلول او وتل تنظیم کړئ.':locale==='arabic'?'اضبط إدخال الكلام وإخراجه.':'Configure speech input and output.',
    'api-hub':locale==='dari'?'APIهای عمومی و ابزارهای هوشمند را مدیریت کنید.':locale==='pashto'?'عامه API او هوښیار وسایل اداره کړئ.':locale==='arabic'?'أدر واجهات API العامة والأدوات الذكية.':'Manage public APIs and intelligent tools.',
    intelligence:locale==='dari'?'دانش و حافظه اختصاصی AFG AI را مدیریت کنید.':locale==='pashto'?'د AFG AI ځانګړې پوهه او حافظه اداره کړئ.':locale==='arabic'?'أدر معرفة AFG AI وذاكرته الخاصة.':'Manage AFG AI private knowledge and memory.'
  };
  const localizedItems = ITEMS.map(item=>({...item,title:itemTitles[item.id]||item.title,subtitle:itemDescriptions[item.id]||item.subtitle,group:extra.group[['Personalize','Your Assistant','Connections','Special Providers'].indexOf(item.group)]||item.group}));

  const groupLabels = (hubUi.groups || '').split(' · ');
  const [context,setContext] = useState<Context>('user');
  const [query,setQuery] = useState('');
  const [page,setPage] = useState<SettingId|null>(null);
  const [status,setStatus] = useState<Record<string,Status>>({});
  const [statusLoading,setStatusLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [authenticated,setAuthenticated] = useState(false);
  const [github,setGithub] = useState({configured:false,linked:false,username:''});
  const [featureFlags,setFeatureFlags] = useState<Record<string,boolean>>({});
  const [models,setModels] = useState<Array<{id:string;providerId?:string;displayName?:string;selectable?:boolean}>>([]);
  const [selectedModel,setSelectedModel] = useState('');
  const [adminAllowed,setAdminAllowed] = useState(false);

  const refreshStatus = async () => {
    setStatusLoading(true); setError('');
    const next: Record<string,Status> = {};
    try {
      const [me,cap,gh,featureData] = await Promise.all([
        request('/api/auth/me').catch(()=>({authenticated:false})),
        request('/api/capabilities').catch(()=>({verified:false,capabilities:{}})),
        request('/api/integrations/github/status').catch(()=>({configured:false,linked:false})),
        request('/api/features/status').catch(()=>({verified:false,featureFlags:{},integrations:{}})),
      ]);
      setAuthenticated(me.authenticated===true);
      setAdminAllowed(me.authenticated===true && ['admin','superadmin'].includes(me.user?.role));
      setGithub({configured:gh.configured===true || featureData.githubOAuthConfigured===true,linked:gh.linked===true,username:gh.username||''});
      const flagMap:Record<string,boolean> = featureData.verified===true ? (featureData.featureFlags||{}) : {};
      const integrations:Record<string,any> = featureData.verified===true ? (featureData.integrations||{}) : {};
      setFeatureFlags(flagMap);
      const caps=cap.capabilities||{};
      next.models=cap.verified===true?'ready':'setup';
      const localFlag = flagMap.local_models ?? flagMap.offline_models ?? flagMap.offline_learning;
      next.local=localFlag===false?'disabled':localFlag===true?'setup':'unknown';
      next.voice=flagMap.voice===false?'disabled':flagMap.voice===true && (caps['speech-to-text']||caps['text-to-speech'])?'ready':(caps['speech-to-text']||caps['text-to-speech'])?'ready':'setup';
      next.github=gh.linked===true?'active':gh.configured===true?'ready':'setup';
      const integrationStatus=(slug:string):Status => integrations[slug]?.active===true?'ready':integrations[slug]?.status==='disabled'?'disabled':'setup';
      next.telegram=integrationStatus('telegram'); next.ftp=integrationStatus('ftp-sftp'); next.mcp=integrationStatus('mcp');
      next.byok=flagMap.byok===false?'disabled':flagMap.byok===true?'ready':'unknown'; next.router='setup';
      setStatus(next);
      const catalog=await request('/api/models').catch(()=>({models:[]}));
      const rawRows=Array.isArray(cap.modelDescriptors)?cap.modelDescriptors:(Array.isArray(catalog.models)?catalog.models:[]);
      const rows=rawRows.map((m:any)=>typeof m==='string'?{id:m,displayName:m,selectable:cap.verified===true}:m);
      setModels(rows.filter((m:any)=>m && typeof m.id==='string' && m.selectable!==false));
      const prefs=me.authenticated?await request('/api/account/preferences').catch(()=>({})):({});
      setSelectedModel(prefs.preferences?.default_model||'');
    } catch {
      setError(t.statusError);
      setStatus({models:'unknown',local:'unknown',voice:'unknown',github:'unknown',telegram:'unknown',ftp:'unknown',mcp:'unknown',byok:'unknown',router:'unknown'});
    } finally { setStatusLoading(false); }
  };
  useEffect(()=>{void refreshStatus();},[]);

  const filtered = useMemo(()=>localizedItems.filter(item=>{
    const q=query.trim().toLowerCase();
    if(item.id==='byok' && featureFlags.byok===false) return false;
    if(item.id==='9router' && !adminAllowed) return false;
    return !q || [item.title,item.subtitle,item.group,...item.keywords].join(' ').toLowerCase().includes(q);
  }),[query,featureFlags,adminAllowed,language]);
  const groups = extra.group;
  const statusLabel=(id:SettingId)=>{
    if(statusLoading)return t.checking;
    const value=status[id];
    if(value==='active'||value==='ready')return value==='active'?t.configured:t.available;
    if(value==='disabled')return t.disabled;
    return t.setup;
  };
  const isDisabled=(id:SettingId)=>status[id]==='disabled';
  const openGithub=async()=>{
    setError('');setNotice('');
    if(!authenticated){setError(t.signIn);return;}
    if(!github.configured){setError(t.setupText);return;}
    try{const data=await request('/api/integrations/github/start',{method:'POST',body:'{}'});if(!data.authUrl)throw new Error(t.setupText);window.location.assign(data.authUrl);}
    catch(e){setError(e instanceof Error?e.message:t.setupText);}
  };
  const unlinkGithub=async()=>{
    try{await request('/api/integrations/github/link',{method:'DELETE'});setGithub(v=>({...v,linked:false,username:''}));setStatus(v=>({...v,github:'ready'}));setNotice('GitHub account disconnected.');}
    catch(e){setError(e instanceof Error?e.message:'Could not disconnect GitHub.');}
  };
  const saveModel=async()=>{
    if(!authenticated){setError(t.signIn);return;}
    if(!selectedModel){setError(t.noModels);return;}
    try{
      await request('/api/account/preferences',{method:'PATCH',body:JSON.stringify({defaultModel:selectedModel,language,appearance:theme})});
      setNotice(t.modelSaved);
    }catch(e){setError(e instanceof Error?e.message:'Could not save the default model.');}
  };
  const selected = page ? ITEMS.find(item=>item.id===page) : null;
  const statusBadge=(id:SettingId)=><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status[id]==='active'?'bg-emerald-500/15 text-emerald-300':status[id]==='disabled'?'bg-slate-700 text-slate-400':'bg-amber-500/10 text-amber-300'}`}>{statusLabel(id)}</span>;
  const row=(item:Item)=><button key={item.id} type="button" disabled={isDisabled(item.id)} onClick={()=>{setPage(item.id);setError('');setNotice('');}} className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cyan-400/5 disabled:cursor-not-allowed disabled:opacity-50 ${rtl?'text-right':''}`}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/15 bg-cyan-500/5 text-cyan-300"><item.icon className="h-5 w-5"/></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.subtitle}</span></span>
    <span className="flex shrink-0 items-center gap-2">{(status[item.id]||item.id==='github')&&['github','models','local','voice','telegram','ftp','mcp','byok','router'].includes(item.id)&&statusBadge(item.id)}<ChevronRight className={`h-4 w-4 text-slate-500 ${rtl?'rotate-180':''}`}/></span>
  </button>;

  if(context==='admin') return <section className="afg-settings-hub mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6">
    <button onClick={()=>setContext('user')} className="mb-3 inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="h-4 w-4"/>{t.back}</button>
    <p className="mb-3 text-xs text-slate-400">{t.adminIntro}</p>
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4"><h2 className="font-bold text-white">{t.admin}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{extra.adminLegacy}</p></div>
  </section>;

  return <section className="afg-settings-hub mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-6" dir={rtl?'rtl':'ltr'}>
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-white">{extra.settings}</h1><p className="mt-1 text-xs text-slate-400">{extra.manage}</p></div>
        <button type="button" onClick={()=>setContext('admin')} className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-200"><LockKeyhole className="mr-1 inline h-4 w-4"/>{t.admin}</button>
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 focus-within:border-cyan-400"><Search className="h-5 w-5 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"/>{query&&<button type="button" onClick={()=>setQuery('')} className="text-xs text-cyan-300">×</button>}</label>
    </header>
    {error&&<p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}
    {page&&selected ? <div className="space-y-4 animate-in slide-in-from-right-2">
      <button type="button" onClick={()=>setPage(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300"><ArrowLeft className={`h-4 w-4 ${rtl?'rotate-180':''}`}/>{t.back}</button>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><selected.icon className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h2 className="font-black text-white">{selected.title}</h2><p className="text-xs text-slate-400">{selected.subtitle}</p></div>{['github','models','local','voice','telegram','ftp','mcp','byok','router'].includes(page)&&statusBadge(page)}</div>
      </div>
      {page==='files' && <AfgFileLibrary language={language}/>}
      {page==='intelligence' && <AfgIntelligencePanel language={language}/>}
      {page==='api-hub'&&<AfgApiConnectorPanel language={language}/>}
      {page==='9router'&&<div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4"><h3 className="font-semibold text-white">9Router AI Gateway</h3><p className="mt-2 text-sm leading-6 text-slate-300">{extra.gateway}</p></div>}
      {(['appearance','language','chat','memory','coding','privacy'] as SettingId[]).includes(page) && <>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3">
          <p className="text-sm font-semibold text-cyan-100">{page==='language'?t.language:page==='appearance'?pageCopy.appearance:page==='chat'?pageCopy.chat:page==='memory'?pageCopy.memory:page==='coding'?pageCopy.coding:pageCopy.privacy}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{page==='language'?t.languageHelp:page==='memory'?pageCopy.memoryHelp:page==='privacy'?pageCopy.privacyHelp:page==='coding'?pageCopy.codingHelp:page==='chat'?pageCopy.chatHelp:pageCopy.guestHelp}</p>
        </div>
        {page==='language' && <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
          <label className="block text-sm font-semibold text-white">{t.language}
            <select value={language} onChange={e=>onSetLanguage(e.target.value as Language)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white">
              {LANGUAGE_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.native} — {option.label}</option>)}
            </select>
          </label>
          <p className="text-xs leading-5 text-slate-400">{pageCopy.date}</p>
        </div>}
        <AfgAccountSettings language={language} theme={theme} onTheme={onSetTheme} onLanguage={onSetLanguage}/>
      </>}
      {page==='models'&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <h3 className="font-bold text-white">{t.models}</h3>
        {models.length? <><label className="block text-xs text-slate-400">{t.defaultModel}<select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white">{models.map(m=><option key={m.providerId+'::'+m.id} value={m.providerId+'::'+m.id}>{m.displayName||m.id}</option>)}</select></label><button onClick={()=>void saveModel()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950">{t.save}</button></>:<p className="text-sm text-slate-400">{t.noModels}</p>}
        <p className="text-xs text-slate-500">{status[page]==='ready'?t.available:t.setupText}</p>
      </div>}
      {page==='github'&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <p className="text-sm text-slate-300">{github.linked?pageCopy.githubLinked+' @'+github.username:github.configured?t.githubReady:t.setupText}</p>
        {!github.configured && <p id="github-not-configured" className="text-xs text-rose-300" role="status">{pageCopy.githubNotConfigured}</p>}
        {github.linked?<button onClick={()=>void unlinkGithub()} className="rounded-xl border border-rose-500/30 px-4 py-2 text-sm text-rose-300">{t.githubDisconnect}</button>:<button disabled={!github.configured||!authenticated} title={!github.configured ? pageCopy.githubNotConfigured : !authenticated ? pageCopy.githubSignIn : t.githubConnect} aria-describedby={!github.configured ? 'github-not-configured' : undefined} onClick={()=>void openGithub()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{t.githubConnect}</button>}
      </div>}
      {(['local','voice','telegram','ftp','mcp','byok','router'] as SettingId[]).includes(page)&&<div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-200">{status[page]==='disabled'?t.disabledText:status[page]==='ready'||status[page]==='active'?t.available:t.setupText}</p>
        {page==='voice'&&<p className="text-xs text-slate-400">{t.notAvailable}</p>}
        {page==='local'&&<p className="text-xs text-slate-400">{t.notAvailable}</p>}
        {page==='telegram'&&<p className="text-xs text-slate-400">{pageCopy.telegram}</p>}
        {page==='ftp'&&<p className="text-xs text-slate-400">{pageCopy.ftp}</p>}
        {page==='mcp'&&<p className="text-xs text-slate-400">{pageCopy.mcp}</p>}
        {page==='byok'&&<p className="text-xs text-slate-400">{pageCopy.byok}</p>}
        {page==='router'&&<p className="text-xs text-slate-400">{pageCopy.router}</p>}
      </div>}
      <button type="button" onClick={()=>void refreshStatus()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300"{pageCopy.refresh}</button>
    </div> : <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Settings2 className="h-5 w-5"/></div><div className="min-w-0"><p className="font-bold text-white">{language==='english'?user.nameEn:user.name}</p><p className="text-xs text-slate-400">{user.email||extra.guest}</p></div><span className="ml-auto text-[10px] font-bold text-cyan-300">{authenticated?extra.signedIn:extra.guest}</span></div>
      {filtered.length?groups.map((group,index)=>{const rows=filtered.filter(item=>item.group===group);if(!rows.length)return null;return <section key={group} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/75"><h2 className="px-4 pb-2 pt-4 text-[11px] font-black uppercase tracking-wider text-cyan-300">{groupLabels[index] || group}</h2><div className="divide-y divide-slate-800/80">{rows.map(row)}</div></section>}):<p className="rounded-2xl border border-slate-800 p-6 text-center text-sm text-slate-400">{t.noResults}</p>}
      <button type="button" onClick={onOpenShortcuts} className="w-full rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300">{extra.shortcuts}</button>
    </div>}
    <div className="pb-4 text-center text-[10px] text-slate-600">AFG AI · Settings Hub</div>
  </section>;
};
