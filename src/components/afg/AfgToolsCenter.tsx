anguage === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const toolPs: Record<string,string> = {
    'File service status could not be reached.':'د فایل خدمت حالت ته لاسرسی ونه شو.',
    'Hello, I am using the smart AFG AI assistant.':'سلام، زه د AFG AI هوښیار مرستیال کاروم.',
    'Text file must be 200 KB or smaller.':'د متن فایل باید تر ۲۰۰ کیلوبایټو زیات نه وي.',
    'Only TXT, MD, CSV and JSON files are supported. Secure PDF extraction is not enabled yet.':'یوازې TXT، MD، CSV او JSON ملاتړ کېږي. د PDF خوندي متن ایستل لا فعال نه دي.',
    'Could not read the text file.':'متني فایل ولوستل نه شو.',
    'Text document must be 45 KB or smaller.':'د متن سند باید تر ۴۵ کیلوبایټو زیات نه وي.',
    'Only text-based TXT, MD, CSV and JSON documents are supported here.':'دلته یوازې TXT، MD، CSV او JSON متني سندونه ملاتړ کېږي.',
    'Could not read the selected file.':'ټاکل شوی فایل ولوستل نه شو.',
    'Translation request sent to the AI assistant; the result will appear in Chat.':'د ژباړې غوښتنه AI ته ولېږل شوه؛ پایله به په خبرو کې ښکاره شي.',
    'Audio file must be 10 MB or smaller.':'غږیز فایل باید تر ۱۰ مېګابایټو زیات نه وي.',
    'No verified source URLs were returned.':'د سرچینو هېڅ تایید شوی لینک ترلاسه نه شو.',
    'Developer Utilities':'د پراختیا وسایل','JSON, JWT, UUID, Base64, cURL, Cron and AI tool generation':'JSON، JWT، UUID، Base64، cURL، Cron او د AI وسایلو جوړول',
    'Chat, image, audio, video, search and multimodal models':'خبرې، انځور، غږ، ویډیو، لټون او څو رسنیز ماډلونه','Universal API Hub':'د API جامع مرکز','Discover Public APIs, connect services and create AI tools':'عامه API ومومئ، خدمتونه ونښلوئ او هوښیار وسایل جوړ کړئ',
    'MCP Servers & Tools':'د MCP سرورونه او وسایل','Connect secure, standardized AI tools':'معیاري او خوندي AI وسایل ونښلوئ','Productivity Center':'د ګټورتیا مرکز','Notes, tasks, study, meetings and planning':'یادښتونه، دندې، زده‌کړه، غونډې او پلان جوړونه',
    'Uses the verified chat model':'د تایید شوي خبرو ماډل کاروي','Generate, explain, debug and optimize code':'کوډ جوړول، تشریح، تېروتنې سمول او ښه کول','Writing Studio':'د لیکنې سټوډیو','Emails, articles, CVs and marketing content':'برېښنالیکونه، مقالې، ژوندلیکونه او بازارموندنیز متنونه',
    'Web Research':'وېب څېړنه','Search real sources and original URLs':'اصلي سرچینې او لینکونه ولټوئ','Authorized passive domain/IP intelligence, evidence and graph':'د مجاز ډومېن او IP غیر فعاله څېړنه، شواهد او اړیکې',
    'Disabled in settings':'په امستنو کې بنده ده','Requires a compatible voice provider':'د سازګار غږ برابرونکي ته اړتیا لري','Upload and text extraction are unavailable':'د فایل پورته کول او متن ایستل نشته',
    'Local arithmetic calculator':'ځایي حسابګر','QR Generator':'د QR جوړوونکی','Uses the external QRServer service':'د QRServer بهرنی خدمت کاروي','Summarize text with the verified chat model':'متن د تایید شوي خبرو ماډل په وسیله لنډوي','File processing is not implemented':'د فایل پروسس لا نه دی جوړ شوی',
    'Back to All Tools':'ټولو وسایلو ته بېرته','Open Tool':'وسیله پرانیستل','Unavailable':'شتون نه لري',
    'MCP tools are available only when a compatible runtime is actually connected.':'د MCP وسایل یوازې هغه وخت شته چې سازګار runtime په رښتیا ونښلول شي.',
    '9Router administration is handled in the separate authenticated control plane.':'د 9Router اداره په جلا خوندي مدیریتي پینل کې کېږي.',
    'Translation uses the selected verified chat model.':'ژباړه له ټاکل شوي تایید شوي خبرو ماډل څخه کار اخلي.',
    'Auto-detect':'اتومات پېژندنه','Dari / Persian':'دري / فارسي','Pashto':'پښتو','English':'انګلیسي','Arabic':'عربي',
    'Source text or text document:':'اصلي متن یا سند:','Type or paste text...':'متن ولیکئ یا دلته یې ونښلوئ...','AI Translation:':'هوښیاره ژباړه:','Translate Now':'اوس یې وژباړه',
    'Coding task':'د کوډ لیکلو دنده','Generate code':'کوډ جوړول','Explain code':'کوډ تشریح کول','Debug':'تېروتنې موندل','Refactor':'کوډ بیا جوړښتول','Optimize':'ښه کول','Documentation':'لاسوند جوړول','Generate tests':'ازموینې جوړول','SQL and databases':'SQL او ډیټابېسونه','Git and GitHub':'Git او GitHub','General guidance':'عمومي لارښوونه',
    'Describe the task, paste code or include the error message...':'دنده تشریح کړئ، کوډ یا د تېروتنې پیغام دلته ولیکئ...','Ask Coding Assistant':'د کوډ مرستیال څخه وپوښتئ',
    'The complete response appears in Chat. Your code is never executed on the main application server; execution requires a separate isolated runner.':'بشپړ ځواب په خبرو کې ښکاري. کوډ مو د اپ پر اصلي سرور نه اجرا کېږي؛ اجرا جلا خوندي چاپېریال ته اړتیا لري.',
    'Web Research with real sources':'د اصلي سرچینو په مرسته وېب څېړنه','Search runs only when TAVILY_API_KEY is configured on the server. Source URLs are passed through from the search response.':'لټون یوازې هغه وخت کار کوي چې TAVILY_API_KEY په سرور کې تنظیم وي. د سرچینو لینکونه د لټون له پایلو اخیستل کېږي.',
    'What would you like to research?':'د څه په اړه څېړنه غواړئ؟','Search':'لټون','Verified sources':'تایید شوې سرچینې','AI interpretation of sources':'د سرچینو د AI شننه',
    'Describe what you want written and provide the key facts...':'هغه څه تشریح کړئ چې لیکل یې غواړئ او مهم معلومات ورکړئ...','Template':'قالب','Email':'برېښنالیک','Article':'مقاله','Blog':'بلاګ','Proposal':'وړاندیز','CV / Resume':'کاري ژوندلیک','Cover letter':'د دندې غوښتنلیک لیک','Social post':'د ټولنیزو رسنیو پوسټ','Product description':'د محصول پېژندنه','Advertisement':'اعلان','Story':'کیسه','Script':'سناریو',
    'Tone':'لحن','Neutral':'عادي','Professional':'مسلکي','Friendly':'دوستانه','Formal':'رسمي','Persuasive':'قانع کوونکی','Creative':'نوښتګر','Academic':'علمي','Concise':'لنډ',
    'Style':'سبک','Clear':'روښانه','Plain':'ساده','Technical':'تخنیکي','Narrative':'روایتي','Bullet points':'نکته‌وار','Structured':'جوړښتي',
    'Output language':'د پایلې ژبه','Dari':'دري','Length':'اوږدوالی','Short':'لنډ','Medium':'منځنی','Long':'اوږد','Detailed':'مفصل','Create writing':'متن جوړول',
    'Basic Calculator':'ساده حسابګر','Afghan Afghani (AFN) Currency Converter':'د افغانۍ (AFN) د اسعارو بدلوونکی','Amount in AFN:':'مقدار په افغانیو (AFN):','Live rate unavailable':'ژوندی نرخ نشته',
    'QR Code Generator':'د QR کوډ جوړوونکی','Enter text or URL to generate QR:':'د QR جوړولو لپاره متن یا لینک ولیکئ:','Your entered content is sent to the external QRServer service to generate the code.':'ستاسو لیکل شوی متن د QR جوړولو لپاره QRServer بهرني خدمت ته لېږل کېږي.',
    'QR service is unavailable.':'د QR خدمت شتون نه لري.','Enter text to generate a QR code.':'د QR جوړولو لپاره متن ولیکئ.',
    'File upload and document processing are not enabled yet.':'د فایل پورته کول او د سند پروسس لا فعال نه دي.','Text document (TXT, MD, CSV, JSON):':'متني سند (TXT، MD، CSV، JSON):','Or paste text directly:':'یا متن مستقیم ونښلوئ:',
    'Summarize with AFG AI':'له AFG AI سره لنډیز جوړ کړئ','The result appears in Chat and is saved to your Productivity workspace when signed in.':'پایله په خبرو کې ښکاري او د ننوتلو پر مهال ستاسو د کار ځای کې خوندي کېږي.',
    'Voice features are disabled in your account settings.':'غږیزې وړتیاوې ستاسو د حساب په امستنو کې بندې دي.','Conversation mode: automatically send recognized speech to Chat':'د خبرو حالت: پېژندل شوې وینا په خپله چټ ته ولېږئ',
    'Speech language':'د وینا ژبه','Speech to Text':'وینا متن ته اړول','Choose an audio file to transcribe.':'د متن جوړولو لپاره غږیز فایل وټاکئ.',
    'Disabled until a real STT model and adapter are configured.':'تر هغه بند دی چې اصلي STT ماډل او اډاپټر تنظیم شي.',
    'Text to Speech':'متن په غږ اړول','Text to speak...':'هغه متن چې لوستل کېږي...','Default voice':'اصلي غږ','Provider voice ID (optional)':'د غږ برابرونکي پېژند (اختیاري)','Generate speech':'غږ جوړول',
    'Disabled until a real TTS model and adapter are configured.':'تر هغه بند دی چې اصلي TTS ماډل او اډاپټر تنظیم شي.','Processing audio...':'غږ پروسس کېږي...',
    'File & Document Assistant':'د فایل او سند مرستیال','Planned formats: PDF, TXT, DOCX, CSV, XLSX, JSON, source code and images.':'ټاکل شوې بڼې: PDF، TXT، DOCX، CSV، XLSX، JSON، د کوډ فایلونه او انځورونه.',
    'File service is ready':'د فایل خدمت چمتو دی','File upload is not enabled yet':'د فایل پورته کول لا فعال نه دي',
    'Files are not accepted until private object storage, MIME and magic-byte validation, malware scanning, text extraction and per-user quotas are implemented.':'تر هغه فایلونه نه منل کېږي چې شخصي زېرمه، د فایل ډول او لاسلیک تایید، د زیانمنو فایلونو سکین، متن ایستل او د هر کارن حدونه جوړ نه شي.',
    'Planned operations':'پلان شوي عملیات','Summarize, Q&A, extract, explain, translate, organize, analyze tables, generate reports and compare documents.':'لنډیز، پوښتنې او ځوابونه، ایستل، تشریح، ژباړه، تنظیم، د جدول شننه، راپور جوړول او د اسنادو پرتله کول.'
  };
  const toolAr: Record<string,string> = {
    'File service status could not be reached.':'تعذر الوصول إلى حالة خدمة الملفات.',
    'Hello, I am using the smart AFG AI assistant.':'مرحباً، أستخدم مساعد AFG AI الذكي.',
    'Text file must be 200 KB or smaller.':'يجب ألا يتجاوز حجم الملف النصي 200 كيلوبايت.',
    'Only TXT, MD, CSV and JSON files are supported. Secure PDF extraction is not enabled yet.':'تُدعم ملفات TXT وMD وCSV وJSON فقط. لم يتم تفعيل استخراج PDF الآمن بعد.',
    'Could not read the text file.':'تعذرت قراءة الملف النصي.','Text document must be 45 KB or smaller.':'يجب ألا يتجاوز حجم المستند النصي 45 كيلوبايت.',
    'Only text-based TXT, MD, CSV and JSON documents are supported here.':'تُدعم هنا المستندات النصية TXT وMD وCSV وJSON فقط.','Could not read the selected file.':'تعذرت قراءة الملف المحدد.',
    'Translation request sent to the AI assistant; the result will appear in Chat.':'تم إرسال طلب الترجمة إلى المساعد؛ ستظهر النتيجة في المحادثة.',
    'Audio file must be 10 MB or smaller.':'يجب ألا يتجاوز حجم الملف الصوتي 10 ميغابايت.','No verified source URLs were returned.':'لم يتم إرجاع روابط مصادر موثوقة.',
    'Developer Utilities':'أدوات المطور','JSON, JWT, UUID, Base64, cURL, Cron and AI tool generation':'JSON وJWT وUUID وBase64 وcURL وCron وإنشاء أدوات الذكاء الاصطناعي',
    'Chat, image, audio, video, search and multimodal models':'المحادثة والصور والصوت والفيديو والبحث والنماذج متعددة الوسائط','Universal API Hub':'مركز API الشامل','Discover Public APIs, connect services and create AI tools':'اكتشف واجهات API العامة واربط الخدمات وأنشئ أدوات ذكية',
    'MCP Servers & Tools':'خوادم وأدوات MCP','Connect secure, standardized AI tools':'ربط أدوات ذكاء اصطناعي آمنة وموحّدة','Productivity Center':'مركز الإنتاجية','Notes, tasks, study, meetings and planning':'الملاحظات والمهام والدراسة والاجتماعات والتخطيط',
    'Uses the verified chat model':'يستخدم نموذج المحادثة المعتمد','Generate, explain, debug and optimize code':'إنشاء التعليمات البرمجية وشرحها وتصحيحها وتحسينها','Writing Studio':'استوديو الكتابة','Emails, articles, CVs and marketing content':'رسائل ومقالات وسير ذاتية ومحتوى تسويقي',
    'Web Research':'بحث الويب','Search real sources and original URLs':'البحث عن مصادر حقيقية وروابط أصلية','Authorized passive domain/IP intelligence, evidence and graph':'استخبارات سلبية مصرح بها للنطاقات وعناوين IP والأدلة والروابط',
    'Disabled in settings':'معطّل في الإعدادات','Requires a compatible voice provider':'يتطلب مزوداً صوتياً متوافقاً','Upload and text extraction are unavailable':'رفع الملفات واستخراج النص غير متاحين',
    'Local arithmetic calculator':'آلة حاسبة محلية','QR Generator':'منشئ QR','Uses the external QRServer service':'يستخدم خدمة QRServer الخارجية','Summarize text with the verified chat model':'تلخيص النص باستخدام نموذج المحادثة المعتمد','File processing is not implemented':'لم تتم برمجة معالجة الملفات',
    'Back to All Tools':'العودة إلى جميع الأدوات','Open Tool':'فتح الأداة','Unavailable':'غير متاح',
    'MCP tools are available only when a compatible runtime is actually connected.':'تتوفر أدوات MCP فقط عند اتصال بيئة تشغيل متوافقة فعلياً.',
    '9Router administration is handled in the separate authenticated control plane.':'تتم إدارة 9Router عبر لوحة تحكم منفصلة ومحمية.','Translation uses the selected verified chat model.':'تستخدم الترجمة نموذج المحادثة المعتمد المحدد.',
    'Auto-detect':'اكتشاف تلقائي','Dari / Persian':'الدَّرية / الفارسية','Pashto':'البشتوية','English':'الإنجليزية','Arabic':'العربية',
    'Source text or text document:':'النص أو المستند المصدر:','Type or paste text...':'اكتب النص أو الصقه...','AI Translation:':'الترجمة بالذكاء الاصطناعي:','Translate Now':'ترجم الآن',
    'Coding task':'مهمة برمجية','Generate code':'إنشاء كود','Explain code':'شرح الكود','Debug':'تصحيح الأخطاء','Refactor':'إعادة هيكلة','Optimize':'تحسين','Documentation':'التوثيق','Generate tests':'إنشاء اختبارات','SQL and databases':'SQL وقواعد البيانات','Git and GitHub':'Git وGitHub','General guidance':'إرشادات عامة',
    'Describe the task, paste code or include the error message...':'اشرح المهمة أو الصق الكود أو رسالة الخطأ...','Ask Coding Assistant':'اسأل مساعد البرمجة',
    'The complete response appears in Chat. Your code is never executed on the main application server; execution requires a separate isolated runner.':'تظهر الإجابة الكاملة في المحادثة. لا يتم تنفيذ الكود على خادم التطبيق الرئيسي؛ يتطلب التنفيذ بيئة معزولة منفصلة.',
    'Web Research with real sources':'بحث الويب بمصادر حقيقية','Search runs only when TAVILY_API_KEY is configured on the server. Source URLs are passed through from the search response.':'يعمل البحث فقط عند إعداد TAVILY_API_KEY على الخادم. تُستخدم روابط المصادر كما وردت في نتائج البحث.',
    'What would you like to research?':'ما الموضوع الذي تريد البحث عنه؟','Search':'بحث','Verified sources':'مصادر موثوقة','AI interpretation of sources':'تحليل المصادر بالذكاء الاصطناعي',
    'Describe what you want written and provide the key facts...':'صف النص الذي تريد كتابته وقدّم الحقائق الأساسية...','Template':'القالب','Email':'بريد إلكتروني','Article':'مقال','Blog':'مدونة','Proposal':'مقترح','CV / Resume':'سيرة ذاتية','Cover letter':'خطاب تقديم','Social post':'منشور اجتماعي','Product description':'وصف المنتج','Advertisement':'إعلان','Story':'قصة','Script':'سيناريو',
    'Tone':'النبرة','Neutral':'محايدة','Professional':'احترافية','Friendly':'ودية','Formal':'رسمية','Persuasive':'إقناعية','Creative':'إبداعية','Academic':'أكاديمية','Concise':'موجزة',
    'Style':'الأسلوب','Clear':'واضح','Plain':'بسيط','Technical':'تقني','Narrative':'سردي','Bullet points':'نقاط','Structured':'منظم',
    'Output language':'لغة الإخراج','Dari':'الدَّرية','Length':'الطول','Short':'قصير','Medium':'متوسط','Long':'طويل','Detailed':'مفصل','Create writing':'إنشاء النص',
    'Basic Calculator':'آلة حاسبة أساسية','Afghan Afghani (AFN) Currency Converter':'محول العملة الأفغانية (AFN)','Amount in AFN:':'المبلغ بالأفغاني (AFN):','Live rate unavailable':'السعر المباشر غير متاح',
    'QR Code Generator':'منشئ رمز QR','Enter text or URL to generate QR:':'أدخل نصاً أو رابطاً لإنشاء QR:','Your entered content is sent to the external QRServer service to generate the code.':'يُرسل المحتوى الذي أدخلته إلى خدمة QRServer الخارجية لإنشاء الرمز.',
    'QR service is unavailable.':'خدمة QR غير متاحة.','Enter text to generate a QR code.':'أدخل نصاً لإنشاء رمز QR.',
    'File upload and document processing are not enabled yet.':'رفع الملفات ومعالجة المستندات غير مفعّلين بعد.','Text document (TXT, MD, CSV, JSON):':'مستند نصي (TXT وMD وCSV وJSON):','Or paste text directly:':'أو الصق النص مباشرة:',
    'Summarize with AFG AI':'لخّص باستخدام AFG AI','The result appears in Chat and is saved to your Productivity workspace when signed in.':'تظهر النتيجة في المحادثة وتُحفظ في مساحة الإنتاجية عند تسجيل الدخول.',
    'Voice features are disabled in your account settings.':'ميزات الصوت معطّلة في إعدادات حسابك.','Conversation mode: automatically send recognized speech to Chat':'وضع المحادثة: إرسال الكلام المتعرف عليه إلى المحادثة تلقائياً',
    'Speech language':'لغة الكلام','Speech to Text':'تحويل الكلام إلى نص','Choose an audio file to transcribe.':'اختر ملفاً صوتياً لتفريغه نصياً.',
    'Disabled until a real STT model and adapter are configured.':'معطّل حتى إعداد نموذج STT ومحوّل حقيقيين.',
    'Text to Speech':'تحويل النص إلى كلام','Text to speak...':'النص المراد نطقه...','Default voice':'الصوت الافتراضي','Provider voice ID (optional)':'معرّف صوت المزوّد (اختياري)','Generate speech':'إنشاء الكلام',
    'Disabled until a real TTS model and adapter are configured.':'معطّل حتى إعداد نموذج TTS ومحوّل حقيقيين.','Processing audio...':'جارٍ معالجة الصوت...',
    'File & Document Assistant':'مساعد الملفات والمستندات','Planned formats: PDF, TXT, DOCX, CSV, XLSX, JSON, source code and images.':'الصيغ المخطط لها: PDF وTXT وDOCX وCSV وXLSX وJSON وملفات المصدر والصور.',
    'File service is ready':'خدمة الملفات جاهزة','File upload is not enabled yet':'رفع الملفات غير مفعّل بعد',
    'Files are not accepted until private object storage, MIME and magic-byte validation, malware scanning, text extraction and per-user quotas are implemented.':'لن تُقبل الملفات حتى تنفيذ التخزين الخاص والتحقق من نوع الملف وتوقيعه وفحص البرمجيات الضارة واستخراج النص وحصص المستخدمين.',
    'Planned operations':'العمليات المخطط لها','Summarize, Q&A, extract, explain, translate, organize, analyze tables, generate reports and compare documents.':'تلخيص، أسئلة وأجوبة، استخراج، شرح، ترجمة، تنظيم، تحليل الجداول، إنشاء التقارير ومقارنة المستندات.'
  };
  const toolText = (dariText:string, englishText:string) => toolLocale === 'dari' ? dariText : toolLocale === 'pashto' ? (toolPs[englishText] || englishText) : toolLocale === 'arabic' ? (toolAr[englishText] || englishText) : englishText;

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
        message: toolText('وضعیت سرویس فایل قابل دریافت نیست.','File service status could not be reached.'),
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
    toolText('سلام، من از افغانستان هستم و از هوش مصنوعی استفاده می‌کنم.','Hello, I am using the smart AFG AI assistant.')
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
    if (file.size > 200_000) { setSummaryResult(toolText('فایل متنی باید حداکثر ۲۰۰ کیلوبایت باشد.','Text file must be 200 KB or smaller.')); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt','md','csv','json'].includes(extension || '')) { setSummaryResult(toolText('فقط فایل‌های TXT، MD، CSV و JSON پشتیبانی می‌شوند. برای PDF هنوز استخراج امن فعال نیست.','Only TXT, MD, CSV and JSON files are supported. Secure PDF extraction is not enabled yet.')); return; }
    try { const text = await file.text(); if (!text.trim()) throw new Error('empty'); setSummarizeText(text); setSummarizeFileName(file.name); setSummaryResult(''); }
    catch { setSummaryResult(toolText('خواندن فایل متنی ممکن نشد.','Could not read the text file.'));
  const [voiceAudioUrl, setVoiceAudioUrl] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [voiceConversationMode, setVoiceConversationMode] = useState(false);

  // Translation uses the selected verified text-generation model.
  const handleTranslationFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 45_000) { setTransOutput(toolText('فایل متنی باید کمتر از ۴۵ کیلوبایت باشد.','Text document must be 45 KB or smaller.')); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md', 'csv', 'json'].includes(extension || '')) { setTransOutput(toolText('فعلاً فقط فایل‌های TXT، MD، CSV و JSON متنی پشتیبانی می‌شوند.','Only text-based TXT, MD, CSV and JSON documents are supported here.')); return; }
    try { setTransInput(await file.text()); setTranslationFileName(file.name); setTransOutput(''); }
    catch { setTransOutput(toolText('خواندن فایل ممکن نشد.','Could not read the selected file.')); }
  };

  const handleTranslate = () => {
    if (!transInput.trim()) return;
    onRunTool(transInput.trim(), { toolMode: 'translation', sourceLanguage: sourceLang, targetLanguage: targetLang });
    setTransOutput(toolText('درخواست ترجمه به دستیار هوشمند فرستاده شد؛ نتیجه در صفحه چت نمایش داده می‌شود.','Translation request sent to the AI assistant; the result will appear in Chat.'));
  };

  const handleTranscribeFile = (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setVoiceError(toolText('حجم فایل صوتی باید کمتر از ۱۰ مگابایت باشد.','Audio file must be 10 MB or smaller.')); return; }
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
      if (!sources.length) setResearchError(toolText('منبع قابل تأیید پیدا نشد.','No verified source URLs were returned.')anguage === 'dari' || language === 'pashto' || language === 'arabic' ? language : 'english';
  const rtl = ['dari','pashto','persian','arabic','urdu'].includes(language);
  const cardText = {
    dari:{developer:'ابزارهای توسعه‌دهنده',developerDesc:'JSON، JWT، UUID، Base64، cURL، Cron و ساخت ابزار AI',gatewayDesc:'گفتگو، تصویر، صدا، ویدیو، جستجو و مدل‌های چندرسانه‌ای',api:'مرکز جامع API',apiDesc:'کاتالوگ Public APIs، اتصال سرویس‌ها و ساخت ابزار هوشمند',mcp:'ابزارها و سرورهای MCP',mcpDesc:'اتصال امن ابزارهای استاندارد هوش مصنوعی',productivity:'مرکز بهره‌وری',productivityDesc:'یادداشت، وظایف، آموزش، جلسه و برنامه‌ریزی',translateDesc:'ترجمه با مدل چت تأییدشده',codeDesc:'تولید، توضیح، اشکال‌زدایی و بهینه‌سازی کد',writing:'استودیوی نویسندگی',writingDesc:'ایمیل، مقاله، رزومه و محتوای تبلیغاتی',research:'پژوهش وب',researchDesc:'جستجوی منابع واقعی و لینک‌های اصلی',osintDesc:'تحلیل غیرفعال دامنه و IP مجاز، شواهد و گراف روابط',disabled:'در تنظیمات غیرفعال شده',voiceDesc:'نیازمند ارائه‌دهنده صوتی سازگار',pdfDesc:'بارگذاری و استخراج متن فعال نیست',calcDesc:'محاسبه محلی',qr:'تولیدکننده QR',qrDesc:'با سرویس بیرونی QRServer',summaryDesc:'خلاصه‌سازی با مدل چت تأییدشده',fileDesc:'پردازش فایل هنوز پیاده‌سازی نشده'},
    english:{developer:'Developer Utilities',developerDesc:'JSON, JWT, UUID, Base64, cURL, Cron and AI tool generation',gatewayDesc:'Chat, image, audio, video, search and multimodal models',api:'Universal API Hub',apiDesc:'Discover Public APIs, connect services and create AI tools',mcp:'MCP Servers & Tools',mcpDesc:'Connect secure, standardized AI tools',productivity:'Productivity Center',productivityDesc:'Notes, tasks, study, meetings and planning',translateDesc:'Uses the verified chat model',codeDesc:'Generate, explain, debug and optimize code',writing:'Writing Studio',writingDesc:'Emails, articles, CVs and marketing content',research:'Web Research',researchDesc:'Search real sources and original URLs',osintDesc:'Authorized passive domain/IP intelligence, evidence and graph',disabled:'Disabled in settings',voiceDesc:'Requires a compatible voice provider',pdfDesc:'Upload and text extraction are unavailable',calcDesc:'Local arithmetic calculator',qr:'QR Generator',qrDesc:'Uses the external QRServer service',summaryDesc:'Summarize text with the verified chat model',fileDesc:'File processing is not implemented'},
    pashto:{developer:'د پراختیا وسایل',developerDesc:'JSON، JWT، UUID، Base64، cURL، Cron او د AI وسایلو جوړول',gatewayDesc:'خبرې، انځور، غږ، ویډیو، لټون او څو رسنیز ماډلونه',api:'د API جامع مرکز',apiDesc:'عامه API ومومئ، خدمتونه ونښلوئ او هوښیار وسایل جوړ کړئ',mcp:'د MCP سرورونه او وسایل',mcpDesc:'معیاري او خوندي AI وسایل ونښلوئ',productivity:'د ګټورتیا مرکز',productivityDesc:'یادښتونه، دندې، زده‌کړه، غونډې او پلان جوړونه',translateDesc:'د تایید شوي خبرو ماډل کاروي',codeDesc:'کوډ جوړول، تشریح، تېروتنې سمول او ښه کول',writing:'د لیکنې سټوډیو',writingDesc:'برېښنالیکونه، مقالې، ژوندلیکونه او اعلانونه',research:'وېب څېړنه',researchDesc:'اصلي سرچینې او لینکونه ولټوئ',osintDesc:'د مجاز ډومېن او IP غیر فعاله څېړنه، شواهد او اړیکې',disabled:'په امستنو کې بنده ده',voiceDesc:'د سازګار غږ برابرونکي ته اړتیا لري',pdfDesc:'د فایل پورته کول او متن ایستل نشته',calcDesc:'ځایي حسابګر',qr:'د QR جوړوونکی',qrDesc:'د QRServer بهرنی خدمت کاروي',summaryDesc:'متن د تایید شوي خبرو ماډل په وسیله لنډوي',fileDesc:'د فایل پروسس لا نه دی جوړ شوی'},
    arabic:{developer:'أدوات المطورين',developerDesc:'JSON وJWT وUUID وBase64 وcURL وCron وإنشاء أدوات الذكاء الاصطناعي',gatewayDesc:'المحادثة والصور والصوت والفيديو والبحث والنماذج متعددة الوسائط',api:'مركز API الشامل',apiDesc:'اكتشف واجهات API العامة واربط الخدمات وأنشئ أدوات ذكية',mcp:'خوادم وأدوات MCP',mcpDesc:'ربط أدوات ذكاء اصطناعي آمنة وموحّدة',productivity:'مركز الإنتاجية',productivityDesc:'الملاحظات والمهام والدراسة والاجتماعات والتخطيط',translateDesc:'يستخدم نموذج المحادثة المعتمد',codeDesc:'إنشاء التعليمات البرمجية وشرحها وتصحيحها وتحسينها',writing:'استوديو الكتابة',writingDesc:'رسائل ومقالات وسير ذاتية ومحتوى تسويقي',research:'بحث الويب',researchDesc:'البحث عن مصادر حقيقية وروابط أصلية',osintDesc:'استخبارات سلبية مصرح بها للنطاقات وعناوين IP والأدلة والروابط',disabled:'معطّل في الإعدادات',voiceDesc:'يتطلب مزوداً صوتياً متوافقاً',pdfDesc:'رفع الملفات واستخراج النص غير متاحين',calcDesc:'آلة حاسبة محلية',qr:'منشئ QR',qrDesc:'يستخدم خدمة QRServer الخارجية',summaryDesc:'تلخيص النص باستخدام نموذج المحادثة المعتمد',fileDesc:'لم تتم برمجة معالجة الملفات بعد'}
  }[toolLocale];
  const toolCards = [
    { id: 'developer-tools' as ToolSubTab, title: cardText.developer, desc: cardText.developerDesc, ready: true, icon: Code2, color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-400/40' },
    { id: '9router' as ToolSubTab, title: '9Router Gateway', desc: cardText.gatewayDesc, ready: true, icon: Sparkles, color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-400/40' },
    { id: 'api-hub' as ToolSubTab, title: cardText.api, desc: cardText.apiDesc, ready: true, icon: Network, color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-400/40' },
    { id: 'mcp' as ToolSubTab, title: cardText.mcp, desc: cardText.mcpDesc, ready: true, icon: PlugZap, color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-400/40' },
    { id: 'productivity' as ToolSubTab, title: cardText.productivity, desc: cardText.productivityDesc, ready: Boolean(capabilities.chat), icon: Sparkles, color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-400/40' },
    { id: 'translate' as ToolSubTab, title: t.toolTranslate, desc: cardText.translateDesc, ready: Boolean(capabilities.chat), icon: Languages, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
    { id: 'code-help' as ToolSubTab, title: t.toolCodeHelp, desc: cardText.codeDesc, ready: Boolean(capabilities.chat), icon: Code2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { id: 'writing-studio' as ToolSubTab, title: cardText.writing, desc: cardText.writingDesc, ready: Boolean(capabilities.chat), icon: FileText, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30' },
    { id: 'research' as ToolSubTab, title: cardText.research, desc: cardText.researchDesc, ready: Boolean(capabilities.research), icon: Languages, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    { id: 'osint' as ToolSubTab, title: 'Passive OSINT', desc: cardText.osintDesc, ready: true, icon: ShieldCheck, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-400/40' },
    { id: 'voice-tools' as ToolSubTab, title: t.toolVoice, desc: !voiceEnabled ? (cardText.disabled) : (cardText.voiceDesc), ready: Boolean(voiceSttAvailable || voiceTtsAvailable), icon: Mic, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    { id: 'pdf-tools' as ToolSubTab, title: t.toolPdf, desc: cardText.pdfDesc, ready: false, icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    { id: 'calculator' as ToolSubTab, title: t.toolCalc, desc: cardText.calcDesc, ready: true, icon: Calculator, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    { id: 'qr-scanner' as ToolSubTab, title: cardText.qr, desc: cardText.qrDesc, ready: true, icon: QrCode, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    { id: 'summarizer' as ToolSubTab, title: t.toolSummarizer, desc: cardText.summaryDesc, ready: Boolean(capabilities.chat), icon: FileCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
    { id: 'file-tools' as ToolSubTab, title: t.toolFile, desc: cardText.fileDesc, ready: false, icon: FolderArchive, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
  ];

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
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
            ← {toolText('بازگشت به تمام ابزارها','Back to All Tools')}
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
                  <span>{tool.ready ? (toolText('بازکردن ابزار','Open Tool')) : (toolText('غیرفعال','Unavailable'))}</span>
                  <span>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeSubTab === 'productivity' && <AfgProductivityCenter language={language} onRunTool={onRunTool} />}
      {activeSubTab === 'api-hub' && <AfgApiConnectorPanel language={language}/>}
      {activeSubTab === 'osint' && <AfgOsintPanel language={language}/> }
      {activeSubTab === 'mcp' && <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 text-sm text-slate-300">{language==='dari'?'اتصال MCP فقط زمانی فعال می‌شود که یک runtime سازگار واقعاً متصل باشد.':'MCP tools are available only when a compatible runtime is actually connected.'}</div>}
      {activeSubTab === '9router' && <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 text-sm text-slate-300">{language==='dari'?'مدیریت درگاه 9Router در پنل امن و جداگانه انجام می‌شود.':'9Router administration is handled in the separate authenticated control plane.'}</div>}
      {activeSubTab === 'developer-tools' && <AfgPublicApiDeveloperTools language={language}/>}

      {/* Tool 1: Interactive Translator (Text & Voice) */}
      {activeSubTab === 'translate' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40">
            <p className="text-xs text-amber-200">{toolText('ترجمه با مدل چت تأییدشده انجام می‌شود.','Translation uses the selected verified chat model.')}</p>
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
                <option value="auto">{toolText('تشخیص خودکار','Auto-detect')}</option>
                <option value="fa">{toolText('دری / فارسی','Dari / Persian')}</option>
                <option value="ps">{toolText('پشتو','Pashto')}</option>
                <option value="en">{toolText('انگلیسی','English')}</option>
                <option value="ar">{toolText('عربی','Arabic')}</option>
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
                {toolText('متن یا سند متنی مبدا:','Source text or text document:')}
              </label>
              <input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(e) => handleTranslationFile(e.target.files?.[0])} className="mb-2 w-full text-xs text-slate-300" />
              {translationFileName && <p className="mb-2 text-[11px] text-cyan-300">{translationFileName}</p>}
              <textarea
                rows={5}
                maxLength={45000}
                value={transInput}
                onChange={(e) => setTransInput(e.target.value)}
                placeholder={toolText('متن را بنویسید یا جای‌گذاری کنید...','Type or paste text...')}
                className="w-full rounded-2xl bg-slate-900/80 border border-cyan-900/50 p-3 text-sm text-white focus:outline-none focus:border-cyan-400 resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400">
                  {toolText('ترجمه هوشمند:','AI Translation:')}
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
            {isTranslating ? 'در حال ترجمه هوشمند...' : (toolText('ترجمه کن','Translate Now'))}
          </button>
        </div>
      )}

      {/* Tool 2: Code Help & Generator */}
      {activeSubTab === 'code-help' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Code2 className="w-5 h-5 text-emerald-400" /><span>{t.toolCodeHelp}</span></h2>
          <label className="block text-xs text-slate-300">{toolText('نوع کار برنامه‌نویسی','Coding task')}
            <select value={codingTask} onChange={e=>setCodingTask(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-cyan-700/50 p-3 text-sm text-white">
              {([['generate',language==='dari'?'تولید کد':'Generate code'],['explain',language==='dari'?'توضیح کد':'Explain code'],['debug',language==='dari'?'اشکال‌زدایی':'Debug'],['refactor',language==='dari'?'بازنویسی':'Refactor'],['optimize',language==='dari'?'بهینه‌سازی':'Optimize'],['document',language==='dari'?'مستندسازی':'Documentation'],['test',language==='dari'?'ساخت آزمون':'Generate tests'],['sql',language==='dari'?'SQL و پایگاه داده':'SQL and databases'],['git',language==='dari'?'Git و GitHub':'Git and GitHub'],['general',language==='dari'?'راهنمایی عمومی':'General guidance']] as string[][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <textarea rows={5} value={codePrompt} onChange={e=>setCodePrompt(e.target.value)} placeholder={toolText('درخواست، کد یا خطا را اینجا وارد کنید...','Describe the task, paste code or include the error message...')} className="w-full rounded-2xl bg-slate-900 border border-cyan-700/50 p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400" />
          <button onClick={() => { if (codePrompt.trim()) onRunTool(codePrompt.trim(), { toolMode: 'coding', codingTask }); }} disabled={!codePrompt.trim()} className="w-full py-3 rounded-xl gradient-btn-cyan text-slate-950 font-bold text-sm disabled:opacity-40">{toolText('ارسال به دستیار برنامه‌نویسی','Ask Coding Assistant')}</button>
          <p className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs leading-6 text-slate-300">{toolText('پاسخ کامل در صفحه چت نمایش داده می‌شود. کد شما در سرور اصلی اجرا نمی‌شود؛ اجرای کد نیازمند محیط ایزوله جداگانه است.','The complete response appears in Chat. Your code is never executed on the main application server; execution requires a separate isolated runner.')}</p>
        </div>
      )}
      {activeSubTab === 'research' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-blue-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white">{toolText('پژوهش وب با منابع واقعی','Web Research with real sources')}</h2>
          <p className="text-xs text-slate-400">{toolText('جستجو فقط با TAVILY_API_KEY تنظیم‌شده در سرور کار می‌کند. لینک‌ها عیناً از نتیجه جستجو گرفته می‌شوند.','Search runs only when TAVILY_API_KEY is configured on the server. Source URLs are passed through from the search response.')}</p>
          <div className="flex gap-2"><input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} maxLength={500} placeholder={toolText('موضوع پژوهش را بنویسید...','What would you like to research?')} className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-blue-900/50 p-3 text-sm text-white" /><button onClick={handleResearch} disabled={!researchQuery.trim() || researchLoading} className="rounded-xl bg-blue-500 px-4 text-sm font-bold text-white disabled:opacity-40">{researchLoading ? '…' : (toolText('جستجو','Search'))}</button></div>
          {researchError && <p className="text-sm text-amber-200">{researchError}</p>}
          {researchSources.length > 0 && <div className="space-y-3"><h3 className="text-sm font-bold text-emerald-300">{toolText('منابع تأییدشده','Verified sources')}</h3>{researchSources.map((source, index) => <article key={source.url} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-cyan-300 underline break-all">{index + 1}. {source.title}</a><p className="text-xs text-slate-400">{source.snippet}</p><p className="text-[11px] text-slate-500 break-all">{source.url}</p></article>)}<button onClick={() => onRunTool('Analyze the following verified web research results. Separate verified sources from your interpretation. Cite only the exact URLs included below.\n\n'+researchSources.map((s,i)=>`[${i+1}] ${s.title}\nURL: ${s.url}\nExcerpt: ${s.snippet}`).join('\n\n'), { toolMode: 'research' })} className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-slate-950">{toolText('تحلیل منابع با هوش مصنوعی','AI interpretation of sources')}</button></div>}
        </div>
      )}

      {activeSubTab === 'writing-studio' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-fuchsia-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-fuchsia-400" />{cardText.writing}</h2>
          <textarea rows={5} value={writingPrompt} onChange={(e) => setWritingPrompt(e.target.value)} placeholder={toolText('موضوع، اطلاعات و خواسته‌های خود را بنویسید...','Describe what you want written and provide the key facts...')} className="w-full rounded-2xl bg-slate-900 border border-fuchsia-900/50 p-3 text-sm text-white" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300">{toolText('قالب','Template')}<select value={writingTemplate} onChange={(e) => setWritingTemplate(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['email', toolText('ایمیل','Email')],['article', toolText('مقاله','Article')],['blog', toolText('وبلاگ','Blog')],['proposal', toolText('پیشنهادنامه','Proposal')],['cv', toolText('زندگی‌نامه کاری','CV / Resume')],['cover-letter', toolText('نامه درخواست کار','Cover letter')],['social', toolText('پست شبکه اجتماعی','Social post')],['product-description', toolText('معرفی محصول','Product description')],['ad', toolText('آگهی','Advertisement')],['story', toolText('داستان','Story')],['script', toolText('سناریو','Script')]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{toolText('لحن','Tone')}<select value={writingTone} onChange={(e) => setWritingTone(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['neutral', toolText('معمولی','Neutral')],['professional', toolText('حرفه‌ای','Professional')],['friendly', toolText('دوستانه','Friendly')],['formal', toolText('رسمی','Formal')],['persuasive', toolText('متقاعدکننده','Persuasive')],['creative', toolText('خلاقانه','Creative')],['academic', toolText('علمی','Academic')],['concise', toolText('مختصر','Concise')]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{toolText('سبک','Style')}<select value={writingStyle} onChange={(e) => setWritingStyle(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['clear', toolText('روشن','Clear')],['plain', toolText('ساده','Plain')],['technical', toolText('تخصصی','Technical')],['narrative', toolText('روایی','Narrative')],['bullet-points', toolText('نکته‌ای','Bullet points')],['structured', toolText('ساختاریافته','Structured')]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-xs text-slate-300">{toolText('زبان خروجی','Output language')}<select value={writingLanguage} onChange={(e) => setWritingLanguage(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white"><option value="english">{toolText('انگلیسی','English')}</option><option value="dari">{toolText('دری','Dari')}</option><option value="pashto">{toolText('پشتو','Pashto')}</option><option value="arabic">{toolText('عربی','Arabic')}</option></select></label>
            <label className="text-xs text-slate-300">{toolText('طول متن','Length')}<select value={writingLength} onChange={(e) => setWritingLength(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white">{[['short', toolText('کوتاه','Short')],['medium', toolText('متوسط','Medium')],['long', toolText('بلند','Long')],['detailed', toolText('مفصل','Detailed')]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <button onClick={() => { if (writingPrompt.trim()) onRunTool(writingPrompt.trim(), { toolMode: 'writing', writingTemplate, writingTone, writingStyle, writingLanguage, writingLength }); }} disabled={!writingPrompt.trim()} className="w-full py-3 rounded-xl bg-fuchsia-500 text-slate-950 font-bold disabled:opacity-40">{toolText('ساخت متن','Create writing')}</button>
        </div>
      )}

      {/* Tool 3: Smart Calculator & Currency Converter */}
      {activeSubTab === 'calculator' && (
        <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-purple-500/40 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-400" />
            <span>{toolText('محاسبه‌گر ساده','Basic Calculator')}</span>
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
                {toolText('تبدیل نرخ افغانی به دلار و یورو','Afghan Afghani (AFN) Currency Converter')}
              </h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {toolText('مقدار به افغانی (AFN):','Amount in AFN:')}
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
                    {toolText('نرخ زنده موجود نیست','Live rate unavailable')}
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
            <span>{toolText('تولیدکننده کد QR','QR Code Generator')}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                {toolText('متن یا لینک برای تولید کیوآرکد:','Enter text or URL to generate QR:')}
              </label>
              <input
                type="text"
                value={qrText}
                onChange={(e) => { setQrText(e.target.value); setQrUnavailable(false); }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-cyan-700/50 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
              <p className="text-xs text-slate-400">
                {toolText('محتوای واردشده برای ساخت QR به سرویس بیرونی QRServer ارسال می‌شود.','Your entered content is sent to the external QRServer service to generate the code.')}
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
            </div> : <p className="text-xs text-slate-500 text-center">{qrUnavailable ? (toolText('سرویس QR در دسترس نیست.','QR service is unavailable.')) : (toolText('برای تولید QR متن وارد کنید.','Enter text to generate a QR code.'))}</p>}
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
              {toolText('بارگذاری و پردازش فایل هنوز فعال نیست.','File upload and document processing are not enabled yet.')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {toolText('فایل متنی (TXT، MD، CSV، JSON):','Text document (TXT, MD, CSV, JSON):')}
            </label>
            <input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(e) => { void handleSummarizerFile(e.target.files?.[0]); e.currentTarget.value = ''; }} className="mb-2 w-full text-xs text-slate-300" />
            {summarizeFileName && <p className="mb-2 text-[11px] text-cyan-300">{summarizeFileName}</p>}
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {toolText('یا متن را مستقیم جای‌گذاری کنید:','Or paste text directly:')}
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
            {toolText('خلاصه‌سازی با هوش مصنوعی','Summarize with AFG AI')}
          </button>
          <p className="text-[11px] text-slate-500">{toolText('نتیجه در صفحه چت نمایش داده و در فضای کاری ذخیره می‌شود.','The result appears in Chat and is saved to your Productivity workspace when signed in.')}</p>

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
          {!voiceEnabled && <p className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200">{toolText('قابلیت‌های صوتی در تنظیمات حساب غیرفعال شده‌اند.','Voice features are disabled in your account settings.')}</p>}
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={voiceConversationMode} onChange={(e) => setVoiceConversationMode(e.target.checked)} disabled={!voiceSttAvailable} />{toolText('حالت مکالمه: متن تشخیص‌شده را خودکار به چت بفرست','Conversation mode: automatically send recognized speech to Chat')}</label>
          <label className="block text-xs text-slate-300">{toolText('زبان گفتار','Speech language')}<select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value as any)} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-white"><option value="auto">{toolText('تشخیص خودکار','Auto-detect')}</option><option value="en">{toolText('انگلیسی','English')}</option><option value="fa">{toolText('دری / فارسی','Dari / Persian')}</option><option value="ps">{toolText('پشتو','Pashto')}</option><option value="ar">{toolText('عربی','Arabic')}</option></select></label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-2xl bg-slate-900/80 border border-amber-900/40 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">{toolText('گفتار به متن','Speech to Text')}</h3>
              <p className="text-xs text-slate-400">{toolText('فایل صوتی را برای پیاده‌سازی متن انتخاب کنید.','Choose an audio file to transcribe.')}</p>
              <input type="file" accept="audio/webm,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/aac" disabled={!voiceSttAvailable || voiceLoading} onChange={(e) => handleTranscribeFile(e.target.files?.[0])} className="w-full text-xs text-slate-300 disabled:opacity-40" />
              {voiceEnabled && !capabilities['speech-to-text'] && <p className="text-xs text-amber-200">{toolText('تا اتصال مدل و آداپتر واقعی STT غیرفعال است.','Disabled until a real STT model and adapter are configured.')}</p>}
              {voiceTranscript && <textarea readOnly value={voiceTranscript} rows={4} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-sm text-white" />}
            </section>
            <section className="rounded-2xl bg-slate-900/80 border border-amber-900/40 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">{toolText('متن به گفتار','Text to Speech')}</h3>
              <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} maxLength={5000} rows={4} placeholder={toolText('متن برای خواندن...','Text to speak...')} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-sm text-white" />
              {voiceOptions.length > 0 ? <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={!voiceTtsAvailable} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-white disabled:opacity-40"><option value="">{toolText('صدای پیش‌فرض','Default voice')}</option>{voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select> : <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder={toolText('شناسه صدای ارائه‌دهنده (اختیاری)','Provider voice ID (optional)')} disabled={!voiceTtsAvailable} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2 text-xs text-white disabled:opacity-40" />}
              <button onClick={handleSynthesize} disabled={!voiceTtsAvailable || !voiceText.trim() || voiceLoading} className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">{voiceLoading ? '…' : (toolText('تولید صدا','Generate speech'))}</button>
              {voiceEnabled && !capabilities['text-to-speech'] && <p className="text-xs text-amber-200">{toolText('تا اتصال مدل و آداپتر واقعی TTS غیرفعال است.','Disabled until a real TTS model and adapter are configured.')}</p>}
              {voiceAudioUrl && <audio controls src={voiceAudioUrl} className="w-full" />}
            </section>
          </div>
          {voiceLoading && <p className="text-xs text-amber-200">{toolText('در حال پردازش صوت...','Processing audio...')}</p>}
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
                {toolText('دستیار فایل و اسناد','File & Document Assistant')}
              </h3>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                {toolText('قالب‌های هدف: PDF، TXT، DOCX، CSV، XLSX، JSON، فایل‌های کد و تصاویر.','Planned formats: PDF, TXT, DOCX, CSV, XLSX, JSON, source code and images.')}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(fileStatus?.acceptedFormats || ['PDF', 'TXT', 'DOCX', 'CSV', 'XLSX', 'JSON', 'Source files', 'Images']).map((format) => (
                <span key={format} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{format}</span>
              ))}
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-center">
              <p className="text-sm font-semibold text-amber-200">
                {fileStatus?.available ? (toolText('سرویس آماده است','File service is ready')) : (toolText('بارگذاری فایل هنوز غیرفعال است','File upload is not enabled yet'))}
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                {fileStatus?.message || (toolText('تا فعال‌شدن ذخیره‌سازی خصوصی، بررسی نوع و امضای فایل، اسکن بدافزار، استخراج متن و سهمیه‌بندی هر کاربر، فایل‌ها پذیرفته نمی‌شوند.','Files are not accepted until private object storage, MIME and magic-byte validation, malware scanning, text extraction and per-user quotas are implemented.'))}
              </p>
            </div>
            <div className="text-xs text-slate-400">
              <p className="font-semibold text-slate-300">{toolText('عملیات برنامه‌ریزی‌شده','Planned operations')}</p>
              <p className="mt-1">{toolText('خلاصه‌سازی، پرسش و پاسخ، استخراج، توضیح، ترجمه، سازمان‌دهی، تحلیل جدول، ساخت گزارش و مقایسه.','Summarize, Q&A, extract, explain, translate, organize, analyze tables, generate reports and compare documents.')}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
