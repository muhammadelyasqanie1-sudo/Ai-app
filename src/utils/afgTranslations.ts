import { getCoreUi, getMoreCoreUi } from './localeUi';
import type { Language } from '../types/afg';

const baseTranslations = {
  dari: {
    // Brand
    brandName: 'AFG AI',
    brandSubtitle: 'هوش مصنوعی افغانستان • همراه هوشمند تو',
    brandTagline: 'دستیار هوشمند شما',
    brandMotto: 'با افتخار برای افغانستان 🇦🇫',
    serverReady: 'سرور آماده است',
    online: 'آنلاین',
    
    // Header & User
    greeting: 'سلام!',
    welcomeBack: 'به AFG AI خوش آمدید',
    premiumUser: 'کاربر رایگان',
    askAnythingPlaceholder: 'سوال خود را بنویسید...',
    
    // Navigation
    navHome: 'خانه',
    navChat: 'چت',
    navTools: 'ابزارها',
    navImage: 'تولید عکس',
    navVideo: 'ساخت ویدیو',
    navHistory: 'تاریخچه',
    navSettings: 'تنظیمات',
    navInvite: 'دعوت دوستان',
    navProfile: 'پروفایل',
    
    // Chat Screen
    chatTitle: 'دستیار هوشمند AFG AI',
    chatSubtitle: 'پاسخ‌گویی به پرسش‌های شما به زبان دری و انگلیسی',
    chatPlaceholder: 'پرسشت را بنویس...',
    send: 'ارسال',
    recording: 'در حال ضبط...',
    readAloud: 'خواندن با صدا',
    stopSpeech: 'توقف صدا',
    copy: 'کپی',
    copied: 'کپی شد!',
    attachModalTitle: 'ارسال پیوست',
    attachGallery: 'انتخاب عکس از گالری',
    attachCamera: 'دوربین - عکس گرفتن',
    attachFile: 'فایل (PDF, DOC, TXT)',
    attachLink: 'لینک اینترنتی',
    suggestPrompt1: 'در مورد آینده هوش مصنوعی توضیح بده',
    suggestPrompt2: 'یک شعر زیبا درباره زیبایی‌های کابل و پامیر بنویس',
    suggestPrompt3: 'کد React برای ساخت یک کارت کاربری مدرن با Tailwind',
    suggestPrompt4: '۵ ایده برای کسب‌وکار آنلاین در افغانستان',

    // Quick Access
    quickAccess: 'دسترسی سریع',
    seeAll: 'مشاهده همه',
    smartChatDesc: 'گفتگوی پیشرفته',
    createArtDesc: 'تصویر خلاقانه',
    makeVideoDesc: 'ویدیو حرفه‌ای',

    // Tools Center
    toolsCenter: 'مرکز ابزارهای هوشمند',
    toolsSubtitle: 'مجموعه‌ای از قدرتمندترین ابزارهای پردازش هوش مصنوعی',
    toolChat: 'چت هوشمند',
    toolChatDesc: 'گفتگو و پرسش و پاسخ',
    toolImageGen: 'تولید تصویر',
    toolImageGenDesc: 'طراحی تصاویر زیبا و واقعی',
    toolVideoGen: 'ساخت ویدیو',
    toolVideoGenDesc: 'تولید انیمیشن و ویدیو',
    toolCodeHelp: 'کمک برنامه‌نویسی',
    toolCodeHelpDesc: 'نوشتن و دیباگ انواع کدهای نرم‌افزاری',
    toolTranslate: 'ترجمه متن و صدا',
    toolTranslateDesc: 'ترجمه فارسی، پشتو، انگلیسی و سایر زبان‌ها',
    toolPdf: 'ابزار PDF و اسناد',
    toolPdfDesc: 'خلاصه‌سازی، استخراج متن و ویرایش فایل‌ها',
    toolVoice: 'تبدیل صدا و گفتار',
    toolVoiceDesc: 'تبدیل متن به صوت و بالعکس',
    toolFile: 'مدیریت و فشرده‌سازی فایل',
    toolFileDesc: 'فشرده‌سازی و تبدیل فرمت‌ها',
    toolCalc: 'محاسبه‌گر پیشرفته',
    toolCalcDesc: 'محاسبات ریاضی و نرخ ارز',
    toolQr: 'اسکنر و ساخت کد QR',
    toolQrDesc: 'تولید و اسکن سریع کیوآرکد',
    toolSummarizer: 'خلاصه‌ساز متن',
    toolSummarizerDesc: 'خلاصه کردن مقالات طولانی به زبان ساده',

    // Image Generator
    imgGenTitle: 'استودیوی تولید تصویر',
    imgGenSubtitle: 'تصورات خود را به تصاویر خیره‌کننده تبدیل کنید',
    imgPromptPlaceholder: 'یک کوهستان زیبا در افغانستان با برف و آسمان آبی و انعکاس در دریاچه...',
    imgStyle: 'سبک تصویر',
    imgAspect: 'نسبت ابعاد',
    btnGenerateImage: 'تولید تصویر 🪄',
    myCreations: 'ساخته‌های من',
    download: 'دانلود',
    share: 'اشتراک‌گذاری',
    save: 'ذخیره',

    // Video Generator
    videoGenTitle: 'استودیوی ساخت ویدیو',
    videoGenSubtitle: 'تولید ویدیوی هوش مصنوعی از روی متن',
    videoPromptPlaceholder: 'پرواز یک عقاب باشکوه بر فراز کوه‌های هندوکش هنگام غروب آفتاب...',
    btnGenerateVideo: 'ساخت ویدیو 🎬',
    myVideos: 'ویدیوهای من',


    // History
    historyTitle: 'تاریخچه گفتگوها',
    historySearchPlaceholder: 'جستجو در تاریخچه...',
    emptyHistory: 'هنوز گفتگویی ثبت نشده است',
    clearHistory: 'پاک‌سازی تاریخچه',

    // Settings
    settingsTitle: 'تنظیمات برنامه',
    accountSecurity: 'حساب کاربری و امنیت',
    appLanguage: 'زبان برنامه',
    darkMode: 'حالت تیره (Dark Mode)',
    notifications: 'اعلان‌ها و پیام‌ها',
    soundEffects: 'صدای کلیک و اعلان',
    privacyPolicy: 'حریم خصوصی و قوانین',
    aboutUs: 'درباره AFG AI',
    helpSupport: 'پشتیبانی و راهنما',
    logout: 'خروج از حساب',

    // About Us
    aboutTitle: 'درباره AFG AI',
    aboutVersion: 'نسخه ۱.۰.۰',
    aboutDescription: 'AFG AI یک دستیار هوشمند و نسل جدید هوش مصنوعی است که با استفاده از مدرن‌ترین الگوریتم‌های هوش مصنوعی برای کاربران افغانستانی و فارسی‌زبان طراحی شده است تا امور روزمره، آموزش، تولید محتوا و برنامه‌نویسی را ساده و شگفت‌انگیز سازد.',
    website: 'وب‌سایت رسمی',
    telegram: 'کانال تلگرام',
    github: 'پروژه در گیت‌هاب',
    madeWithLove: 'ساخته شده با ❤️ برای افغانستان',
    allRightsReserved: 'تمامی حقوق متعلق به AFG AI است © 2026',

  },

  english: {
    // Brand
    brandName: 'AFG AI',
    brandSubtitle: 'Smart AI for Afghanistan • Your Smart Companion',
    brandTagline: 'Your Smart AI Assistant',
    brandMotto: 'Built with Pride for Afghanistan 🇦🇫',
    serverReady: 'Server Ready',
    online: 'Online',
    
    // Header & User
    greeting: 'Hello!',
    welcomeBack: 'Welcome back to AFG AI',
    premiumUser: 'Free User',
    askAnythingPlaceholder: 'Ask anything...',
    
    // Navigation
    navHome: 'Home',
    navChat: 'Chat',
    navTools: 'Tools',
    navImage: 'Image Gen',
    navVideo: 'Video Gen',
    navHistory: 'History',
    navSettings: 'Settings',
    navInvite: 'Invite',
    navProfile: 'Profile',
    
    // Chat Screen
    chatTitle: 'AFG AI Assistant',
    chatSubtitle: 'Answering your questions in Dari and English',
    chatPlaceholder: 'Type a message...',
    send: 'Send',
    recording: 'Recording...',
    readAloud: 'Read Aloud',
    stopSpeech: 'Stop Speech',
    copy: 'Copy',
    copied: 'Copied!',
    attachModalTitle: 'Add Attachment',
    attachGallery: 'Select Photo from Gallery',
    attachCamera: 'Camera - Take Photo',
    attachFile: 'File (PDF, DOC, TXT)',
    attachLink: 'Web Link',
    suggestPrompt1: 'Explain the future of artificial intelligence simply',
    suggestPrompt2: 'Write a poem about the beauty of Kabul and the Pamir mountains',
    suggestPrompt3: 'TypeScript React code for a modern profile card with Tailwind',
    suggestPrompt4: '5 creative startup ideas for Afghanistan and Central Asia',

    // Quick Access
    quickAccess: 'Quick Access',
    seeAll: 'See All',
    smartChatDesc: 'Smart Chat',
    createArtDesc: 'Create Art',
    makeVideoDesc: 'Make Video',

    // Tools Center
    toolsCenter: 'Smart Tools Center',
    toolsSubtitle: 'A collection of powerful AI processing tools',
    toolChat: 'AI Chat',
    toolChatDesc: 'Conversational assistant and Q&A',
    toolImageGen: 'Image Generator',
    toolImageGenDesc: 'Create stunning and realistic images',
    toolVideoGen: 'Video Generator',
    toolVideoGenDesc: 'Generate animations and videos from text',
    toolCodeHelp: 'Code Assistant',
    toolCodeHelpDesc: 'Write, debug, and explain code in 20+ languages',
    toolTranslate: 'Translate Text & Voice',
    toolTranslateDesc: 'Translate between Dari, Pashto, English and more',
    toolPdf: 'PDF & Document Tools',
    toolPdfDesc: 'Extract, summarize, and edit documents',
    toolVoice: 'Voice & Speech Tools',
    toolVoiceDesc: 'Speech to text and text to speech',
    toolFile: 'File Manager & Tools',
    toolFileDesc: 'Compress, convert, and manage files',
    toolCalc: 'Smart Calculator',
    toolCalcDesc: 'Scientific calculations and currency conversion',
    toolQr: 'QR Scanner & Creator',
    toolQrDesc: 'Generate and scan QR codes instantly',
    toolSummarizer: 'Text Summarizer',
    toolSummarizerDesc: 'Summarize long documents into concise bullet points',

    // Image Generator
    imgGenTitle: 'Image Generator Studio',
    imgGenSubtitle: 'Turn your imagination into breathtaking visuals',
    imgPromptPlaceholder: 'A majestic mountain valley in Afghanistan with turquoise lakes, snow peaks and cherry blossoms...',
    imgStyle: 'Image Style',
    imgAspect: 'Aspect Ratio',
    btnGenerateImage: 'Generate Image 🪄',
    myCreations: 'My Creations',
    download: 'Download',
    share: 'Share',
    save: 'Save',

    // Video Generator
    videoGenTitle: 'Video Generator Studio',
    videoGenSubtitle: 'Generate cinematic AI videos from descriptive text',
    videoPromptPlaceholder: 'Cinematic drone shot soaring over historic Afghan citadel at golden hour sunset...',
    btnGenerateVideo: 'Generate Video 🎬',
    myVideos: 'My Videos',


    // History
    historyTitle: 'Conversation History',
    historySearchPlaceholder: 'Search conversations...',
    emptyHistory: 'No conversation history found',
    clearHistory: 'Clear History',

    // Settings
    settingsTitle: 'Application Settings',
    accountSecurity: 'Account & Security',
    appLanguage: 'Application Language',
    darkMode: 'Dark Mode',
    notifications: 'Push Notifications',
    soundEffects: 'Sound Effects & Haptics',
    privacyPolicy: 'Privacy & Terms',
    aboutUs: 'About AFG AI',
    helpSupport: 'Help & Support',
    logout: 'Logout',

    // About Us
    aboutTitle: 'About AFG AI',
    aboutVersion: 'Version 1.0.0',
    aboutDescription: 'AFG AI is a next-generation smart assistant built for Afghan and international users. Empowered with modern AI architectures, it makes everyday communication, learning, content creation, and programming accessible and delightful.',
    website: 'Official Website',
    telegram: 'Telegram Channel',
    github: 'GitHub Repository',
    madeWithLove: 'Made with ❤️ for Afghanistan',
    allRightsReserved: 'All rights reserved © 2026 AFG AI',

  }
};

const localized = (language: Language) => ({
  ...baseTranslations.english,
  ...getCoreUi(language),
  ...getMoreCoreUi(language),
}) as typeof baseTranslations.english;

export const translations = {
  ...baseTranslations,
  dari: { ...baseTranslations.dari, ...getCoreUi('dari'), ...getMoreCoreUi('dari') },
  english: localized('english'),
  pashto: localized('pashto'),
  persian: localized('persian'),
  arabic: localized('arabic'),
  urdu: localized('urdu'),
  turkish: localized('turkish'),
  russian: localized('russian'),
  french: localized('french'),
  spanish: localized('spanish'),
  german: localized('german'),
  chinese: localized('chinese'),
  hindi: localized('hindi'),
  bengali: localized('bengali'),
  indonesian: localized('indonesian'),
  portuguese: localized('portuguese'),
  japanese: localized('japanese'),
  korean: localized('korean'),
};
