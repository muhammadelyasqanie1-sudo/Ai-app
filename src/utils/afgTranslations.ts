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
    navAdmin: 'مدیریت',
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

    // Admin Panel
    adminTitle: 'پنل مدیریت سیستم',
    usersManage: 'مدیریت کاربران',
    servicesControl: 'کنترل سرویس‌ها',
    providersModels: 'مدل‌های هوش مصنوعی',
    reportsAnalytics: 'گزارش‌ها و آمار',
    userAccessRestrictions: 'محدودیت دسترسی کاربران',
    dailyLimits: 'سقف درخواست روزانه',
    autoModeration: 'پایش و فیلترینگ هوشمند',
    viewDashboard: 'مشاهده داشبورد کامل',
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
    navAdmin: 'Admin',
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

    // Admin Panel
    adminTitle: 'System Admin Panel',
    usersManage: 'User Management',
    servicesControl: 'Services Control',
    providersModels: 'AI Models & Providers',
    reportsAnalytics: 'Reports & Analytics',
    userAccessRestrictions: 'User Access Restrictions',
    dailyLimits: 'Daily Quota Limits',
    autoModeration: 'Intelligent Auto Moderation',
    viewDashboard: 'View Full Dashboard',
  }
};


const primaryLanguageOverrides: Partial<Record<'pashto' | 'arabic', Partial<typeof baseTranslations.english>>> = {
  pashto: {
    brandName:'AFG AI',brandSubtitle:'د افغانستان لپاره هوښیار مصنوعي ځیرکتیا • ستاسو ملګری',brandTagline:'ستاسو هوښیار AI مرستیال',brandMotto:'د افغانستان لپاره په ویاړ جوړ شوی 🇦🇫',serverReady:'سرور چمتو دی',online:'آنلاین',
    greeting:'سلام!',welcomeBack:'AFG AI ته بېرته ښه راغلاست',premiumUser:'وړیا کارن',askAnythingPlaceholder:'هره پوښتنه وکړئ...',
    navHome:'کور',navChat:'خبرې',navTools:'وسایل',navImage:'انځور جوړول',navVideo:'ویډیو جوړول',navHistory:'تاریخچه',navSettings:'امستنې',navAdmin:'مدیریت',navInvite:'ملګري راوبلئ',navProfile:'پروفایل',
    chatTitle:'د AFG AI هوښیار مرستیال',chatSubtitle:'ستاسو پوښتنو ته په دري، پښتو، عربي او انګلیسي ځوابونه',chatPlaceholder:'پیغام ولیکئ...',send:'لېږل',recording:'ثبت روان دی...',readAloud:'په غږ یې ولولئ',stopSpeech:'غږ بند کړئ',copy:'کاپي',copied:'کاپي شو!',attachModalTitle:'ضمیمه زیاتول',attachGallery:'له ګالري انځور وټاکئ',attachCamera:'کمره – انځور واخلئ',attachFile:'فایل (PDF، DOC، TXT)',attachLink:'ویب لینک',
    suggestPrompt1:'د مصنوعي ځیرکتیا راتلونکی په ساده ډول تشریح کړئ',suggestPrompt2:'د کابل او پامیر د ښکلا په اړه ښکلی شعر ولیکئ',suggestPrompt3:'د Tailwind په کارولو د کارن کارت لپاره React کوډ ولیکئ',suggestPrompt4:'په افغانستان کې د انلاین سوداګرۍ پنځه نظریې',
    quickAccess:'چټک لاسرسی',seeAll:'ټول وګورئ',smartChatDesc:'هوښیارې خبرې',createArtDesc:'هنري انځور جوړول',makeVideoDesc:'ویډیو جوړول',
    toolsCenter:'د هوښیار وسایلو مرکز',toolsSubtitle:'د مصنوعي ځیرکتیا د پروسس پیاوړي وسایل',toolChat:'له AI سره خبرې',toolChatDesc:'خبرې او پوښتنې او ځوابونه',toolImageGen:'د انځور جوړوونکی',toolImageGenDesc:'ښکلي او واقعي انځورونه جوړ کړئ',toolVideoGen:'د ویډیو جوړوونکی',toolVideoGenDesc:'له متن څخه ویډیو او خوځښت جوړ کړئ',toolCodeHelp:'د کوډ مرستیال',toolCodeHelpDesc:'کوډ ولیکئ، تېروتنې یې ومومئ او تشریح یې کړئ',toolTranslate:'د متن او غږ ژباړه',toolTranslateDesc:'دري، پښتو، انګلیسي او نورو ژبو ته ژباړه',toolPdf:'د PDF او اسنادو وسایل',toolPdfDesc:'له اسنادو متن وباسئ او لنډیز یې جوړ کړئ',toolVoice:'غږ او وینا',toolVoiceDesc:'غږ متن ته او متن غږ ته واړوئ',toolFile:'د فایلونو سمبالښت',toolFileDesc:'فایلونه تنظیم او بڼې یې واړوئ',toolCalc:'هوښیار حسابګر',toolCalcDesc:'علمي محاسبې او د اسعارو بدلون',toolQr:'د QR کوډ جوړوونکی او لوستونکی',toolQrDesc:'QR کوډونه جوړ او ولولئ',toolSummarizer:'د متن لنډیز',toolSummarizerDesc:'اوږده لیکنې په لنډو ټکو کې راټولې کړئ',
    imgGenTitle:'د انځور جوړولو سټوډیو',imgGenSubtitle:'خپل خیالونه په زړه‌راښکونکو انځورونو بدل کړئ',imgPromptPlaceholder:'په افغانستان کې د واورو او شنې اسمان لرونکی ښکلی غر...',imgStyle:'د انځور بڼه',imgAspect:'د انځور تناسب',btnGenerateImage:'انځور جوړول 🪄',myCreations:'زما جوړ کړي انځورونه',download:'کښته کول',share:'شریکول',save:'ساتل',
    videoGenTitle:'د ویډیو جوړولو سټوډیو',videoGenSubtitle:'له متن څخه د AI ویډیو جوړول',videoPromptPlaceholder:'د لمر لوېدو پر مهال د هندوکش پر غرونو د عقاب الوت...',btnGenerateVideo:'ویډیو جوړول 🎬',myVideos:'زما ویډیوګانې',
    historyTitle:'د خبرو تاریخچه',historySearchPlaceholder:'خبرې ولټوئ...',emptyHistory:'تر اوسه هېڅ خبرې نه دي ثبت شوې',clearHistory:'تاریخچه پاکول',
    settingsTitle:'د اپ امستنې',accountSecurity:'حساب او امنیت',appLanguage:'د اپ ژبه',darkMode:'تیاره بڼه',notifications:'خبرتیاوې',soundEffects:'د کلیک او خبرتیا غږونه',privacyPolicy:'محرمیت او اصول',aboutUs:'د AFG AI په اړه',helpSupport:'مرسته او ملاتړ',logout:'وتل',
    aboutTitle:'د AFG AI په اړه',aboutVersion:'۱.۰.۰ نسخه',aboutDescription:'AFG AI د افغانستان او نړۍ کاروونکو لپاره یو هوښیار مرستیال دی چې زده‌کړه، ورځني کارونه، منځپانګه جوړول او پروګرام‌لیکنه اسانه کوي.',website:'رسمي وېبپاڼه',telegram:'د ټیلیګرام چینل',github:'په GitHub کې پروژه',madeWithLove:'د افغانستان لپاره په مینه جوړ شوی ❤️',allRightsReserved:'ټول حقوق د AFG AI خوندي دي © ۲۰۲۶',
    adminTitle:'د سیستم د مدیر پینل',usersManage:'د کاروونکو مدیریت',servicesControl:'د خدمتونو کنټرول',providersModels:'د AI ماډلونه او برابرونکي',reportsAnalytics:'راپورونه او شمېرې',userAccessRestrictions:'د کاروونکو د لاسرسي محدودیتونه',dailyLimits:'د ورځنیو غوښتنو حد',autoModeration:'هوښیار اتومات څارنه',viewDashboard:'بشپړ ډشبورډ وګورئ'
  },
  arabic: {
    brandName:'AFG AI',brandSubtitle:'ذكاء اصطناعي لأفغانستان • رفيقك الذكي',brandTagline:'مساعدك الذكي',brandMotto:'صُنع بفخر من أجل أفغانستان 🇦🇫',serverReady:'الخادم جاهز',online:'متصل',
    greeting:'مرحباً!',welcomeBack:'مرحباً بعودتك إلى AFG AI',premiumUser:'مستخدم مجاني',askAnythingPlaceholder:'اسأل عن أي شيء...',
    navHome:'الرئيسية',navChat:'المحادثة',navTools:'الأدوات',navImage:'إنشاء صورة',navVideo:'إنشاء فيديو',navHistory:'السجل',navSettings:'الإعدادات',navAdmin:'الإدارة',navInvite:'دعوة الأصدقاء',navProfile:'الملف الشخصي',
    chatTitle:'مساعد AFG AI الذكي',chatSubtitle:'إجابات لأسئلتك بالدَّرية والعربية والبشتوية والإنجليزية',chatPlaceholder:'اكتب رسالة...',send:'إرسال',recording:'جارٍ التسجيل...',readAloud:'اقرأ بصوت عالٍ',stopSpeech:'إيقاف الصوت',copy:'نسخ',copied:'تم النسخ!',attachModalTitle:'إضافة مرفق',attachGallery:'اختر صورة من المعرض',attachCamera:'الكاميرا – التقط صورة',attachFile:'ملف (PDF، DOC، TXT)',attachLink:'رابط ويب',
    suggestPrompt1:'اشرح مستقبل الذكاء الاصطناعي ببساطة',suggestPrompt2:'اكتب قصيدة جميلة عن جمال كابل وجبال پامير',suggestPrompt3:'اكتب كود React لبطاقة مستخدم حديثة باستخدام Tailwind',suggestPrompt4:'خمس أفكار لأعمال تجارية عبر الإنترنت في أفغانستان',
    quickAccess:'الوصول السريع',seeAll:'عرض الكل',smartChatDesc:'محادثة ذكية',createArtDesc:'إنشاء عمل فني',makeVideoDesc:'إنشاء فيديو',
    toolsCenter:'مركز الأدوات الذكية',toolsSubtitle:'مجموعة من أدوات معالجة الذكاء الاصطناعي',toolChat:'محادثة الذكاء الاصطناعي',toolChatDesc:'المحادثة والأسئلة والأجوبة',toolImageGen:'إنشاء الصور',toolImageGenDesc:'أنشئ صوراً جميلة وواقعية',toolVideoGen:'إنشاء الفيديو',toolVideoGenDesc:'إنشاء الرسوم المتحركة والفيديو من النص',toolCodeHelp:'مساعد البرمجة',toolCodeHelpDesc:'اكتب التعليمات البرمجية وصححها واشرحها',toolTranslate:'ترجمة النص والصوت',toolTranslateDesc:'الترجمة بين الدَّرية والبشتوية والإنجليزية وغيرها',toolPdf:'أدوات PDF والمستندات',toolPdfDesc:'استخراج النصوص وتلخيص المستندات',toolVoice:'الصوت والكلام',toolVoiceDesc:'تحويل الكلام إلى نص والنص إلى كلام',toolFile:'إدارة الملفات',toolFileDesc:'تنظيم الملفات وتحويل صيغها',toolCalc:'آلة حاسبة ذكية',toolCalcDesc:'الحسابات العلمية وتحويل العملات',toolQr:'قارئ ومنشئ QR',toolQrDesc:'إنشاء رموز QR ومسحها فوراً',toolSummarizer:'تلخيص النصوص',toolSummarizerDesc:'تلخيص المقالات الطويلة في نقاط موجزة',
    imgGenTitle:'استوديو إنشاء الصور',imgGenSubtitle:'حوّل خيالك إلى صور مذهلة',imgPromptPlaceholder:'جبال أفغانستان الجميلة مع الثلوج والسماء الزرقاء...',imgStyle:'نمط الصورة',imgAspect:'نسبة العرض إلى الارتفاع',btnGenerateImage:'إنشاء صورة 🪄',myCreations:'إبداعاتي',download:'تنزيل',share:'مشاركة',save:'حفظ',
    videoGenTitle:'استوديو إنشاء الفيديو',videoGenSubtitle:'إنشاء فيديوهات بالذكاء الاصطناعي من النص',videoPromptPlaceholder:'تحليق نسر فوق جبال هندوكوش عند غروب الشمس...',btnGenerateVideo:'إنشاء فيديو 🎬',myVideos:'فيديوهاتي',
    historyTitle:'سجل المحادثات',historySearchPlaceholder:'ابحث في المحادثات...',emptyHistory:'لا توجد محادثات مسجلة بعد',clearHistory:'مسح السجل',
    settingsTitle:'إعدادات التطبيق',accountSecurity:'الحساب والأمان',appLanguage:'لغة التطبيق',darkMode:'الوضع الداكن',notifications:'الإشعارات',soundEffects:'أصوات النقر والتنبيهات',privacyPolicy:'الخصوصية والشروط',aboutUs:'حول AFG AI',helpSupport:'المساعدة والدعم',logout:'تسجيل الخروج',
    aboutTitle:'حول AFG AI',aboutVersion:'الإصدار 1.0.0',aboutDescription:'AFG AI مساعد ذكي من الجيل الجديد للمستخدمين في أفغانستان والعالم، يسهّل التعلم والمهام اليومية وإنشاء المحتوى والبرمجة.',website:'الموقع الرسمي',telegram:'قناة تيليغرام',github:'المشروع على GitHub',madeWithLove:'صُنع بحب ❤️ من أجل أفغانستان',allRightsReserved:'جميع الحقوق محفوظة لـ AFG AI © 2026',
    adminTitle:'لوحة إدارة النظام',usersManage:'إدارة المستخدمين',servicesControl:'التحكم بالخدمات',providersModels:'نماذج ومزوّدو الذكاء الاصطناعي',reportsAnalytics:'التقارير والتحليلات',userAccessRestrictions:'قيود وصول المستخدمين',dailyLimits:'حد الطلبات اليومي',autoModeration:'الإشراف الآلي الذكي',viewDashboard:'عرض لوحة التحكم الكاملة'
  }
};

const localized = (language: Language) => ({
  ...baseTranslations.english,
  ...getCoreUi(language),
  ...getMoreCoreUi(language),
  ...(primaryLanguageOverrides[language as 'pashto' | 'arabic'] || {}),
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
