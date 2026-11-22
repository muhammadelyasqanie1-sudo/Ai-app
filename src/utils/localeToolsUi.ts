import type { Language } from '../types/afg';

// Secondary-locale completion: keys that previously fell back to English
// copies in the 13 non-primary locales (measured by
// scripts/i18n-untranslated.ts). Each row provides correct native-language
// terminology in the exact toolKeys order. Spread order in
// afgTranslations.localized() makes these win over the English base.
// Rows are provided ONLY for the secondary locales — dari/pashto/persian/
// arabic are already fully translated upstream, so getToolsUi returns an
// empty object for them and the existing dictionaries stay untouched.
const toolKeys = [
  'brandSubtitle','brandMotto','premiumUser',
  'suggestPrompt1','suggestPrompt2','suggestPrompt3','suggestPrompt4',
  'smartChatDesc','createArtDesc','makeVideoDesc',
  'toolsCenter','toolsSubtitle',
  'toolChat','toolChatDesc','toolImageGen','toolImageGenDesc','toolVideoGen','toolVideoGenDesc','toolCodeHelp','toolCodeHelpDesc','toolTranslate','toolTranslateDesc','toolPdf','toolPdfDesc','toolVoice','toolVoiceDesc','toolFile','toolFileDesc','toolCalc','toolCalcDesc','toolQr','toolQrDesc','toolSummarizer','toolSummarizerDesc',
  'imgGenTitle','imgGenSubtitle','imgPromptPlaceholder','imgStyle','imgAspect','btnGenerateImage','myCreations','download','share','save',
  'videoGenTitle','videoGenSubtitle','videoPromptPlaceholder','btnGenerateVideo','myVideos',
  'historySearchPlaceholder','accountSecurity','soundEffects','privacyPolicy','aboutUs','aboutVersion','aboutDescription','telegram','github','madeWithLove','allRightsReserved',
  'adminTitle','usersManage','servicesControl','providersModels','reportsAnalytics','userAccessRestrictions','dailyLimits','autoModeration','viewDashboard',
  'navAdmin','navChat','online'
] as const;

const toolRows: Partial<Record<Language, string[]>> = {
  urdu: [
    'افغانستان کے لیے ہوشیار مصنوعی ذہانت • آپ کا ذہین ساتھی','افغانستان کے لیے فخر سے بنائی گئی 🇦🇫','مفت صارف',
    'مصنوعی ذہانت کا مستقبل آسان الفاظ میں سمجھائیں','کابل اور پامیر کی خوبصورتی پر ایک خوبصورت نظم لکھیں','Tailwind کے ساتھ ایک جدید پروفائل کارڈ کے لیے TypeScript React کوڈ','افغانستان اور وسطی ایشیا کے لیے ۵ تخلیقی اسٹارٹ اپ آئیڈیاز',
    'ذہین گفتگو','فن تخلیق کریں','ویڈیو بنائیں',
    'ذہین ٹولز سینٹر','مصنوعی ذہانت کی طاقتور پروسیسنگ ٹولز کا مجموعہ',
    'AI گفتگو','گفتگو کا معاون اور سوال و جواب','تصویر جنریٹر','حیران کن اور حقیقی تصاویر بنائیں','ویڈیو جنریٹر','متن سے اینیمیشن اور ویڈیوز بنائیں','کوڈ معاون','۲۰ سے زیادہ زبانوں میں کوڈ لکھیں، ڈیبگ کریں اور سمجھائیں','متن اور آواز کا ترجمہ','دری، پشتو، انگریزی اور دیگر زبانوں کے درمیان ترجمہ','PDF اور دستاویزات کے ٹولز','دستاویزات سے متن نکالیں، خلاصہ بنائیں اور ترمیم کریں','آواز اور تقریر کے ٹولز','تقریر سے متن اور متن سے تقریر','فائل مینیجر اور ٹولز','فائلیں کمپریس، تبدیل اور منظم کریں','ذہین کیلکولیٹر','سائنسی حساب اور کرنسی کی تبدیلی','QR اسکینر اور تخلیق کار','QR کوڈز فوری بنائیں اور اسکین کریں','متن کا خلاصہ ساز','لمبی دستاویزات کو مختصر نکات میں خلاصہ کریں',
    'تصویر جنریشن اسٹوڈیو','اپنی تخیل کو حیران کن مناظر میں بدلیں','افغانستان کی ایک شاندار پہاڑی وادی فیروزی جھیلوں اور برف پوش چوٹیوں کے ساتھ...','تصویر کا انداز','نسبتِ ابعاد','تصویر بنائیں 🪄','میری تخلیقات','ڈاؤن لوڈ','شیئر کریں','محفوظ کریں',
    'ویڈیو جنریشن اسٹوڈیو','توصیفی متن سے سینمائی AI ویڈیوز بنائیں','سنہری غروبِ آفتاب میں تاریخی افغان قلعے کے اوپر شاندار ڈرون شاٹ...','ویڈیو بنائیں 🎬','میری ویڈیوز',
    'گفتگوئیں تلاش کریں...','اکاؤنٹ اور سیکیورٹی','صوتی اثرات اور ہاپٹکس','رازداری اور شرائط','AFG AI کے بارے میں','ورژن 1.0.0','AFG AI افغان اور بین الاقوامی صارفین کے لیے بنایا گیا نئی نسل کا ذہین معاون ہے۔ جدید مصنوعی ذہانت کی معماریوں کے ساتھ یہ روزمرہ رابطے، تعلیم، مواد کی تخلیق اور پروگرامنگ کو آسان اور دلچسپ بناتا ہے۔','ٹیلیگرام چینل','GitHub مخزن','❤️ سے افغانستان کے لیے بنائی گئی','جملہ حقوق محفوظ ہیں © 2026 AFG AI',
    'سسٹم ایڈمن پینل','صارفین کا انتظام','خدمات کا کنٹرول','AI ماڈلز اور فراہم کنندگان','رپورٹس اور تجزیات','صارف تک رسائی کی پابندیاں','روزانہ کوٹہ کی حدیں','ذہین خودکار نگرانی','مکمل ڈیش بورڈ دیکھیں',
    'ایڈمن','چیٹ','آن لائن'
  ],
  turkish: [
    'Afganistan için Akıllı Yapay Zekâ • Akıllı Yardımcınız','Afganistan için gururla geliştirildi 🇦🇫','Ücretsiz Kullanıcı',
    'Yapay zekânın geleceğini basitçe açıkla','Kabil ve Pamir dağlarının güzelliği üzerine bir şiir yaz','Tailwind ile modern bir profil kartı için TypeScript React kodu','Afganistan ve Orta Asya için 5 yaratıcı girişim fikri',
    'Akıllı Sohbet','Sanat Oluştur','Video Oluştur',
    'Akıllı Araçlar Merkezi','Güçlü yapay zekâ işleme araçları koleksiyonu',
    'AI Sohbet','Sohbet asistanı ve soru-cevap','Görsel Oluşturucu','Çarpıcı ve gerçekçi görseller oluşturun','Video Oluşturucu','Metinden animasyon ve video oluşturun','Kod Asistanı','20+ dilde kod yazma, hata ayıklama ve açıklama','Metin ve Ses Çevirisi','Darice, Peştuca, İngilizce ve daha fazlası arasında çeviri','PDF ve Belge Araçları','Belgelerden metin çıkar, özetle ve düzenle','Ses ve Konuşma Araçları','Konuşmayı metne, metni konuşmaya dönüştür','Dosya Yöneticisi ve Araçlar','Dosyaları sıkıştırın, dönüştürün ve yönetin','Akıllı Hesap Makinesi','Bilimsel hesaplamalar ve döviz çevirisi','QR Tarayıcı ve Oluşturucu','QR kodlarını anında oluşturun ve tarayın','Metin Özetleyici','Uzun belgeleri kısa maddelerle özetleyin',
    'Görsel Oluşturma Stüdyosu','Hayalinizi büyüleyici görsellere dönüştürün','Afganistan\'da firuz gölleri, karlı zirveler ve kiraz çiçekleriyle görkemli bir dağ vadisi...','Görsel Stili','En-Boy Oranı','Görsel Oluştur 🪄','Oluşturduklarım','İndir','Paylaş','Kaydet',
    'Video Oluşturma Stüdyosu','Açıklayıcı metinden sinematik AI videoları oluşturun','Altın saat gün batımında tarihi Afgan kalesi üzerinde sinematik drone çekimi...','Video Oluştur 🎬','Videolarım',
    'Sohbetlerde ara...','Hesap ve Güvenlik','Ses Efektleri ve Dokunsal Geri Bildirim','Gizlilik ve Şartlar','AFG AI Hakkında','Sürüm 1.0.0','AFG AI, Afgan ve uluslararası kullanıcılar için geliştirilmiş yeni nesil bir akıllı asistandır. Modern yapay zekâ mimarileriyle günlük iletişimi, öğrenmeyi, içerik üretimini ve programlamayı kolay ve keyifli hale getirir.','Telegram Kanalı','GitHub Deposu','❤️ ile Afganistan için geliştirildi','Tüm hakları saklıdır © 2026 AFG AI',
    'Sistem Yönetim Paneli','Kullanıcı Yönetimi','Hizmet Denetimi','AI Modelleri ve Sağlayıcılar','Raporlar ve Analizler','Kullanıcı Erişim Kısıtlamaları','Günlük Kota Sınırları','Akıllı Otomatik Denetim','Tam Panoyu Görüntüle',
    'Yönetim','Sohbet','Çevrimiçi'
  ],
  russian: [
    'Умный ИИ для Афганистана • Ваш умный спутник','С гордостью создано для Афганистана 🇦🇫','Бесплатный пользователь',
    'Объясни просто будущее искусственного интеллекта','Напиши стихотворение о красоте Кабула и Памирских гор','Код на TypeScript React для современной карточки профиля с Tailwind','5 креативных идей стартапов для Афганистана и Центральной Азии',
    'Умный чат','Создать арт','Создать видео',
    'Центр умных инструментов','Набор мощных инструментов обработки ИИ',
    'ИИ-чат','Диалоговый помощник и вопросы-ответы','Генератор изображений','Создавайте впечатляющие и реалистичные изображения','Генератор видео','Создавайте анимацию и видео из текста','Помощник по коду','Пишите, отлаживайте и объясняйте код на 20+ языках','Перевод текста и голоса','Перевод между дари, пушту, английским и другими языками','Инструменты PDF и документов','Извлекайте текст, суммируйте и редактируйте документы','Инструменты голоса и речи','Речь в текст и текст в речь','Файловый менеджер и инструменты','Сжимайте, конвертируйте и управляйте файлами','Умный калькулятор','Научные расчёты и конвертация валют','Сканер и создатель QR','Мгновенно создавайте и сканируйте QR-коды','Суммаризатор текста','Суммируйте длинные документы в краткие пункты',
    'Студия генерации изображений','Превратите воображение в захватывающие визуальные образы','Величественная горная долина Афганистана с бирюзовыми озёрами, снежными вершинами и цветущей вишней...','Стиль изображения','Соотношение сторон','Создать изображение 🪄','Мои работы','Скачать','Поделиться','Сохранить',
    'Студия генерации видео','Создавайте кинематографичные ИИ-видео из описательного текста','Кинематографичный дрон-кадр над исторической афганской цитаделью на закате...','Создать видео 🎬','Мои видео',
    'Поиск по чатам...','Аккаунт и безопасность','Звуковые эффекты и вибрация','Конфиденциальность и условия','Об AFG AI','Версия 1.0.0','AFG AI — умный помощник нового поколения, созданный для афганских и международных пользователей. Современные ИИ-архитектуры делают ежедневное общение, обучение, создание контента и программирование доступными и увлекательными.','Канал Telegram','Репозиторий GitHub','Создано с ❤️ для Афганистана','Все права защищены © 2026 AFG AI',
    'Панель администратора системы','Управление пользователями','Управление службами','ИИ-модели и провайдеры','Отчёты и аналитика','Ограничения доступа пользователей','Дневные лимиты квот','Умная автоматическая модерация','Открыть полную панель',
    'Админ','Чат','В сети'
  ],
  french: [
    'IA intelligente pour l’Afghanistan • Votre compagnon intelligent','Conçu avec fierté pour l’Afghanistan 🇦🇫','Utilisateur gratuit',
    'Explique simplement l’avenir de l’intelligence artificielle','Écris un poème sur la beauté de Kaboul et des montagnes du Pamir','Code TypeScript React pour une carte de profil moderne avec Tailwind','5 idées de startups créatives pour l’Afghanistan et l’Asie centrale',
    'Discussion intelligente','Créer une œuvre','Créer une vidéo',
    'Centre d’outils intelligents','Une collection d’outils de traitement IA puissants',
    'Chat IA','Assistant conversationnel et questions-réponses','Générateur d’images','Créez des images saisissantes et réalistes','Générateur de vidéos','Générez des animations et des vidéos à partir de texte','Assistant de code','Écrire, déboguer et expliquer du code dans plus de 20 langages','Traduction de texte et de voix','Traduisez entre le dari, le pachto, l’anglais et plus','Outils PDF et documents','Extrayez, résumez et modifiez des documents','Outils voix et parole','Discours en texte et texte en discours','Gestionnaire de fichiers et outils','Compressez, convertissez et gérez vos fichiers','Calculatrice intelligente','Calculs scientifiques et conversion de devises','Scanner et créateur de QR','Générez et scannez des codes QR instantanément','Résumeur de texte','Résumez de longs documents en points concis',
    'Studio de génération d’images','Transformez votre imagination en visuels époustouflants','Une majestueuse vallée de montagne en Afghanistan avec des lacs turquoise, des sommets enneigés et des cerisiers en fleurs...','Style d’image','Ratio d’aspect','Générer l’image 🪄','Mes créations','Télécharger','Partager','Enregistrer',
    'Studio de génération de vidéos','Générez des vidéos IA cinématographiques à partir d’un texte descriptif','Plan de drone cinématographique survolant une citadelle afghane historique au coucher du soleil doré...','Générer la vidéo 🎬','Mes vidéos',
    'Rechercher dans les conversations...','Compte et sécurité','Effets sonores et retour haptique','Confidentialité et conditions','À propos de AFG AI','Version 1.0.0','AFG AI est un assistant intelligent de nouvelle génération conçu pour les utilisateurs afghans et internationaux. Grâce à des architectures IA modernes, il rend la communication quotidienne, l’apprentissage, la création de contenu et la programmation accessibles et agréables.','Chaîne Telegram','Dépôt GitHub','Fait avec ❤️ pour l’Afghanistan','Tous droits réservés © 2026 AFG AI',
    'Panneau d’administration système','Gestion des utilisateurs','Contrôle des services','Modèles IA et fournisseurs','Rapports et analyses','Restrictions d’accès des utilisateurs','Limites de quota quotidiennes','Modération automatique intelligente','Voir le tableau de bord complet',
    'Administration','Discussion','En ligne'
  ],
  spanish: [
    'IA inteligente para Afganistán • Tu compañero inteligente','Creado con orgullo para Afganistán 🇦🇫','Usuario gratuito',
    'Explica de forma sencilla el futuro de la inteligencia artificial','Escribe un poema sobre la belleza de Kabul y las montañas del Pamir','Código TypeScript React para una tarjeta de perfil moderna con Tailwind','5 ideas creativas de startups para Afganistán y Asia Central',
    'Chat inteligente','Crear arte','Crear vídeo',
    'Centro de herramientas inteligentes','Una colección de potentes herramientas de procesamiento con IA',
    'Chat con IA','Asistente conversacional y preguntas y respuestas','Generador de imágenes','Crea imágenes impresionantes y realistas','Generador de vídeos','Genera animaciones y vídeos a partir de texto','Asistente de código','Escribe, depura y explica código en más de 20 lenguajes','Traducción de texto y voz','Traduce entre darí, pastún, inglés y más','Herramientas PDF y de documentos','Extrae, resume y edita documentos','Herramientas de voz y habla','Voz a texto y texto a voz','Gestor de archivos y herramientas','Comprime, convierte y gestiona archivos','Calculadora inteligente','Cálculos científicos y conversión de divisas','Escáner y creador de QR','Genera y escanea códigos QR al instante','Resumidor de texto','Resume documentos largos en puntos concisos',
    'Estudio de generación de imágenes','Convierte tu imaginación en visuales impresionantes','Un majestuoso valle montañoso de Afganistán con lagos turquesa, cumbres nevadas y cerezos en flor...','Estilo de imagen','Relación de aspecto','Generar imagen 🪄','Mis creaciones','Descargar','Compartir','Guardar',
    'Estudio de generación de vídeos','Genera vídeos de IA cinematográficos a partir de texto descriptivo','Toma aérea cinematográfica sobre una ciudadela afgana histórica al atardecer dorado...','Generar vídeo 🎬','Mis vídeos',
    'Buscar en las conversaciones...','Cuenta y seguridad','Efectos de sonido y háptica','Privacidad y términos','Acerca de AFG AI','Versión 1.0.0','AFG AI es un asistente inteligente de nueva generación creado para usuarios afganos e internacionales. Con arquitecturas modernas de IA, hace que la comunicación diaria, el aprendizaje, la creación de contenido y la programación sean accesibles y gratificantes.','Canal de Telegram','Repositorio de GitHub','Hecho con ❤️ para Afganistán','Todos los derechos reservados © 2026 AFG AI',
    'Panel de administración del sistema','Gestión de usuarios','Control de servicios','Modelos de IA y proveedores','Informes y análisis','Restricciones de acceso de usuarios','Límites de cuota diaria','Moderación automática inteligente','Ver el panel completo',
    'Administración','Chat','En línea'
  ],
  german: [
    'Smarte KI für Afghanistan • Dein schlauer Begleiter','Mit Stolz für Afghanistan entwickelt 🇦🇫','Kostenloser Nutzer',
    'Erkläre die Zukunft der künstlichen Intelligenz einfach','Schreibe ein Gedicht über die Schönheit von Kabul und dem Pamir-Gebirge','TypeScript-React-Code für eine moderne Profilkarte mit Tailwind','5 kreative Start-up-Ideen für Afghanistan und Zentralasien',
    'Smarter Chat','Kunst erstellen','Video erstellen',
    'Zentrum für smarte Werkzeuge','Eine Sammlung leistungsstarker KI-Verarbeitungswerkzeuge',
    'KI-Chat','Konversationsassistent und Fragen & Antworten','Bildgenerator','Erstelle beeindruckende und realistische Bilder','Videogenerator','Erstelle Animationen und Videos aus Text','Code-Assistent','Code in über 20 Sprachen schreiben, debuggen und erklären','Text- und Sprachübersetzung','Übersetze zwischen Dari, Paschtu, Englisch und mehr','PDF- und Dokumentenwerkzeuge','Dokumente extrahieren, zusammenfassen und bearbeiten','Sprach- und Sprechwerkzeuge','Sprache zu Text und Text zu Sprache','Dateimanager und Werkzeuge','Dateien komprimieren, konvertieren und verwalten','Smarter Rechner','Wissenschaftliche Berechnungen und Währungsumrechnung','QR-Scanner und -Ersteller','QR-Codes sofort erstellen und scannen','Textzusammenfasser','Lange Dokumente in knappe Punkte zusammenfassen',
    'Bildgenerierungs-Studio','Verwandle deine Fantasie in atemberaubende Bilder','Ein majestätisches Bergtal in Afghanistan mit türkisfarbenen Seen, schneebedeckten Gipfeln und Kirschblüten...','Bildstil','Seitenverhältnis','Bild erstellen 🪄','Meine Kreationen','Herunterladen','Teilen','Speichern',
    'Videogenerierungs-Studio','Erstelle kinoreife KI-Videos aus beschreibendem Text','Kinematische Drohnenaufnahme über einer historischen afghanischen Zitadelle in der goldenen Abenddämmerung...','Video erstellen 🎬','Meine Videos',
    'Unterhaltungen durchsuchen...','Konto & Sicherheit','Soundeffekte & Haptik','Datenschutz & Bedingungen','Über AFG AI','Version 1.0.0','AFG AI ist ein intelligenter Assistent der nächsten Generation für afghanische und internationale Nutzer. Mit modernen KI-Architekturen macht es alltägliche Kommunikation, Lernen, Inhaltserstellung und Programmierung zugänglich und angenehm.','Telegram-Kanal','GitHub-Repository','Mit ❤️ für Afghanistan entwickelt','Alle Rechte vorbehalten © 2026 AFG AI',
    'Systemverwaltungspanel','Nutzerverwaltung','Diensteverwaltung','KI-Modelle & Anbieter','Berichte & Analysen','Nutzerzugriffsbeschränkungen','Tägliche Kontingentgrenzen','Intelligente automatische Moderation','Vollständiges Dashboard anzeigen',
    'Verwaltung','Chat','Online'
  ],
  chinese: [
    '为阿富汗打造的智能 AI • 你的智慧伙伴','为阿富汗骄傲打造 🇦🇫','免费用户',
    '简单讲解人工智能的未来','写一首关于喀布尔与帕米尔之美的诗','用 Tailwind 编写现代个人资料卡的 TypeScript React 代码','面向阿富汗与中亚的 5 个创意创业点子',
    '智能聊天','艺术创作','视频创作',
    '智能工具中心','强大的 AI 处理工具集合',
    'AI 聊天','对话助手与问答','图片生成器','创作震撼而逼真的图像','视频生成器','从文本生成动画与视频','代码助手','用 20 多种语言编写、调试并讲解代码','文本与语音翻译','在达里语、普什图语、英语等语言之间翻译','PDF 与文档工具','提取、摘要并编辑文档','语音与朗读工具','语音转文字、文字转语音','文件管理器与工具','压缩、转换并管理文件','智能计算器','科学计算与汇率换算','二维码扫描与生成器','即时生成并扫描二维码','文本摘要器','将长文档概括为简明要点',
    '图片生成工作室','把你的想象变成令人惊叹的画面','阿富汗雄伟的山谷，绿松石湖泊、雪峰与樱花相映成趣……','图片风格','宽高比','生成图片 🪄','我的作品','下载','分享','保存',
    '视频生成工作室','从描述性文本生成电影级 AI 视频','金色夕阳下航拍历史悠久的阿富汗古城堡的电影级镜头……','生成视频 🎬','我的视频',
    '搜索对话…','账户与安全','音效与触感反馈','隐私与条款','关于 AFG AI','版本 1.0.0','AFG AI 是为阿富汗及国际用户新一代打造的智能助手。凭借现代 AI 架构，让日常沟通、学习、内容创作与编程变得轻松而愉悦。','Telegram 频道','GitHub 仓库','用 ❤️ 为阿富汗打造','版权所有 © 2026 AFG AI',
    '系统管理面板','用户管理','服务控制','AI 模型与提供商','报告与分析','用户访问限制','每日配额限制','智能自动审核','查看完整仪表板',
    '管理','聊天','在线'
  ],
  hindi: [
    'अफ़ग़ानिस्तान के लिए स्मार्ट AI • आपका स्मार्ट साथी','अफ़ग़ानिस्तान के लिए गर्व से निर्मित 🇦🇫','मुफ़्त उपयोगकर्ता',
    'कृत्रिम बुद्धिमत्ता का भविष्य आसान भाषा में समझाओ','काबुल और पामिर पर्वतों की सुंदरता पर एक कविता लिखो','Tailwind के साथ आधुनिक प्रोफ़ाइल कार्ड के लिए TypeScript React कोड','अफ़ग़ानिस्तान और मध्य एशिया के लिए 5 रचनात्मक स्टार्टअप विचार',
    'स्मार्ट चैट','कला बनाएँ','वीडियो बनाएँ',
    'स्मार्ट टूल्स केंद्र','शक्तिशाली AI प्रोसेसिंग टूल्स का संग्रह',
    'AI चैट','संवादी सहायक और प्रश्न-उत्तर','इमेज जनरेटर','शानदार और यथार्थवादी चित्र बनाएँ','वीडियो जनरेटर','टेक्स्ट से एनिमेशन और वीडियो बनाएँ','कोड सहायक','20+ भाषाओं में कोड लिखें, डिबग करें और समझाएँ','टेक्स्ट और आवाज़ अनुवाद','दरी, पश्तो, अंग्रेज़ी और अन्य भाषाओं के बीच अनुवाद','PDF और दस्तावेज़ टूल्स','दस्तावेज़ों से टेक्स्ट निकालें, सारांश बनाएँ और संपादित करें','आवाज़ और वाणी टूल्स','वाणी से टेक्स्ट और टेक्स्ट से वाणी','फ़ाइल मैनेजर और टूल्स','फ़ाइलें संपीडित, रूपांतरित और प्रबंधित करें','स्मार्ट कैलकुलेटर','वैज्ञानिक गणना और मुद्रा रूपांतरण','QR स्कैनर और निर्माता','QR कोड तुरंत बनाएँ और स्कैन करें','टेक्स्ट सारांशकर्ता','लंबे दस्तावेज़ों को संक्षिप्त बिंदुओं में सारांशित करें',
    'इमेज जनरेशन स्टूडियो','अपनी कल्पना को अद्भुत दृश्यों में बदलें','अफ़ग़ानिस्तान की एक भव्य पर्वतीय घाटी — फ़ीरोज़ा झीलें, बर्फ़ीली चोटियाँ और चेरी फूल...','छवि शैली','आस्पेक्ट अनुपात','छवि बनाएँ 🪄','मेरी रचनाएँ','डाउनलोड','साझा करें','सहेजें',
    'वीडियो जनरेशन स्टूडियो','वर्णनात्मक टेक्स्ट से सिनेमाई AI वीडियो बनाएँ','सुनहरी शाम में ऐतिहासिक अफ़ग़ान क़िले के ऊपर सिनेमाई ड्रोन शॉट...','वीडियो बनाएँ 🎬','मेरे वीडियो',
    'बातचीत खोजें...','खाता और सुरक्षा','ध्वनि प्रभाव और हैप्टिक','गोपनीयता और शर्तें','AFG AI के बारे में','संस्करण 1.0.0','AFG AI अफ़ग़ान और अंतरराष्ट्रीय उपयोगकर्ताओं के लिए निर्मित नई पीढ़ी का स्मार्ट सहायक है। आधुनिक AI आर्किटेक्चर के साथ यह रोज़मर्रा की बातचीत, सीखना, कंटेंट निर्माण और प्रोग्रामिंग को सुलभ और आनंददायक बनाता है।','टेलीग्राम चैनल','GitHub रिपॉज़िटरी','❤️ के साथ अफ़ग़ानिस्तान के लिए निर्मित','सर्वाधिकार सुरक्षित © 2026 AFG AI',
    'सिस्टम एडमिन पैनल','उपयोगकर्ता प्रबंधन','सेवा नियंत्रण','AI मॉडल और प्रदाता','रिपोर्ट और विश्लेषण','उपयोगकर्ता पहुँच प्रतिबंध','दैनिक कोटा सीमाएँ','बुद्धिमान स्वतः मॉडरेशन','पूरा डैशबोर्ड देखें',
    'एडमिन','चैट','ऑनलाइन'
  ],
  bengali: [
    'আফগানিস্তানের জন্য স্মার্ট AI • আপনার স্মার্ট সঙ্গী','আফগানিস্তানের জন্য গর্বের সাথে নির্মিত 🇦🇫','বিনামূল্যের ব্যবহারকারী',
    'কৃত্রিম বুদ্ধিমত্তার ভবিষ্যৎ সহজভাবে ব্যাখ্যা করো','কাবুল ও পামির পর্বতের সৌন্দর্য নিয়ে একটি কবিতা লেখো','Tailwind দিয়ে আধুনিক প্রোফাইল কার্ডের জন্য TypeScript React কোড','আফগানিস্তান ও মধ্য এশিয়ার জন্য ৫টি সৃজনশীল স্টার্টআপ আইডিয়া',
    'স্মার্ট চ্যাট','শিল্প সৃষ্টি','ভিডিও তৈরি',
    'স্মার্ট টুলস কেন্দ্র','শক্তিশালী AI প্রসেসিং টুলের সংগ্রহ',
    'AI চ্যাট','সংলাপ সহায়ক ও প্রশ্নোত্তর','ইমেজ জেনারেটর','চমৎকার ও বাস্তবসম্মত ছবি তৈরি করুন','ভিডিও জেনারেটর','টেক্সট থেকে অ্যানিমেশন ও ভিডিও তৈরি করুন','কোড সহকারী','২০টির বেশি ভাষায় কোড লিখুন, ডিবাগ ও ব্যাখ্যা করুন','টেক্সট ও ভয়েস অনুবাদ','দরি, পশতু, ইংরেজি ও অন্য ভাষার মধ্যে অনুবাদ','PDF ও ডকুমেন্ট টুলস','ডকুমেন্ট থেকে টেক্সট বের করুন, সারসংক্ষেপ ও সম্পাদনা করুন','ভয়েস ও বক্তৃতা টুলস','কথা থেকে টেক্সট ও টেক্সট থেকে কথা','ফাইল ম্যানেজার ও টুলস','ফাইল সংকুচিত, রূপান্তর ও ব্যবস্থাপনা করুন','স্মার্ট ক্যালকুলেটর','বৈজ্ঞানিক গণনা ও মুদ্রা রূপান্তর','QR স্ক্যানার ও নির্মাতা','সাথে সাথে QR কোড তৈরি ও স্ক্যান করুন','টেক্সট সারসংক্ষেপক','দীর্ঘ ডকুমেন্টকে সংক্ষিপ্ত পয়েন্টে সারসংক্ষেপ করুন',
    'ইমেজ জেনারেশন স্টুডিও','আপনার কল্পনাকে চমকপ্রদ দৃশ্যে রূপ দিন','আফগানিস্তানের এক মহিমাময় পাহাড়ি উপত্যকা — ফিরোজা লেক, তুষারশীর্ষ ও চেরি ফুল...','ছবির ধরন','অনুপাত','ছবি তৈরি করুন 🪄','আমার সৃষ্টিকর্ম','ডাউনলোড','শেয়ার','সংরক্ষণ',
    'ভিডিও জেনারেশন স্টুডিও','বর্ণনামূলক টেক্সট থেকে চলচ্চিত্রধর্মী AI ভিডিও তৈরি করুন','সোনালি সূর্যাস্তে ঐতিহাসিক আফগান দুর্গের উপর সিনেম্যাটিক ড্রোন শট...','ভিডিও তৈরি করুন 🎬','আমার ভিডিও',
    'কথোপকথন খুঁজুন...','অ্যাকাউন্ট ও নিরাপত্তা','সাউন্ড এফেক্ট ও হ্যাপটিক','গোপনীয়তা ও শর্তাবলী','AFG AI সম্পর্কে','সংস্করণ ১.০.০','AFG AI আফগান ও আন্তর্জাতিক ব্যবহারকারীদের জন্য নির্মিত নতুন প্রজন্মের স্মার্ট সহকারী। আধুনিক AI স্থাপত্যের মাধ্যমে এটি দৈনন্দিন যোগাযোগ, শেখা, কনটেন্ট তৈরি ও প্রোগ্রামিংকে সহজ ও আনন্দদায়ক করে।','টেলিগ্রাম চ্যানেল','GitHub সংগ্রহশালা','❤️ দিয়ে আফগানিস্তানের জন্য নির্মিত','সর্বস্বত্ব সংরক্ষিত © ২০২৬ AFG AI',
    'সিস্টেম অ্যাডমিন প্যানেল','ব্যবহারকারী ব্যবস্থাপনা','সেবা নিয়ন্ত্রণ','AI মডেল ও প্রদানকারী','রিপোর্ট ও বিশ্লেষণ','ব্যবহারকারী প্রবেশাধিকার সীমাবদ্ধতা','দৈনিক কোটা সীমা','বুদ্ধিমান স্বয়ংক্রিয় পরিমার্জন','সম্পূর্ণ ড্যাশবোর্ড দেখুন',
    'অ্যাডমিন','চ্যাট','অনলাইন'
  ],
  indonesian: [
    'AI Cerdas untuk Afghanistan • Pendamping Pintar Anda','Dibangun dengan Bangga untuk Afghanistan 🇦🇫','Pengguna Gratis',
    'Jelaskan masa depan kecerdasan buatan secara sederhana','Tulis puisi tentang keindahan Kabul dan pegunungan Pamir','Kode TypeScript React untuk kartu profil modern dengan Tailwind','5 ide startup kreatif untuk Afghanistan dan Asia Tengah',
    'Obrolan Cerdas','Buat Karya Seni','Buat Video',
    'Pusat Alat Pintar','Kumpulan alat pemrosesan AI yang kuat',
    'Obrolan AI','Asisten percakapan dan tanya jawab','Generator Gambar','Buat gambar yang memukau dan realistis','Generator Video','Buat animasi dan video dari teks','Asisten Kode','Tulis, debug, dan jelaskan kode dalam 20+ bahasa','Terjemahan Teks & Suara','Terjemahkan antara Dari, Pashto, Inggris dan lainnya','Alat PDF & Dokumen','Ekstrak, ringkas, dan edit dokumen','Alat Suara & Ucapan','Ucapan ke teks dan teks ke ucapan','Pengelola File & Alat','Kompres, konversi, dan kelola file','Kalkulator Pintar','Perhitungan ilmiah dan konversi mata uang','Pemindai & Pembuat QR','Buat dan pindai kode QR secara instan','Peringkas Teks','Ringkas dokumen panjang menjadi poin ringkas',
    'Studio Pembuatan Gambar','Ubah imajinasi Anda menjadi visual yang memukau','Lembah pegunungan megah di Afghanistan dengan danau safir, puncak bersalju dan bunga sakura...','Gaya Gambar','Rasio Aspek','Buat Gambar 🪄','Karya Saya','Unduh','Bagikan','Simpan',
    'Studio Pembuatan Video','Buat video AI sinematik dari teks deskriptif','Rekaman drone sinematik di atas benteng Afghanistan bersejarah saat matahari terbenam keemasan...','Buat Video 🎬','Video Saya',
    'Cari percakapan...','Akun & Keamanan','Efek Suara & Haptik','Privasi & Ketentuan','Tentang AFG AI','Versi 1.0.0','AFG AI adalah asisten cerdas generasi baru yang dibangun untuk pengguna Afghanistan dan internasional. Dengan arsitektur AI modern, ia membuat komunikasi sehari-hari, pembelajaran, pembuatan konten, dan pemrograman mudah diakses dan menyenangkan.','Kanal Telegram','Repositori GitHub','Dibuat dengan ❤️ untuk Afghanistan','Hak cipta dilindungi © 2026 AFG AI',
    'Panel Admin Sistem','Manajemen Pengguna','Kontrol Layanan','Model AI & Penyedia','Laporan & Analitik','Pembatasan Akses Pengguna','Batas Kuota Harian','Moderasi Otomatis Cerdas','Lihat Dasbor Lengkap',
    'Administrator','Obrolan','Daring'
  ],
  portuguese: [
    'IA inteligente para o Afeganistão • O seu companheiro inteligente','Criado com orgulho para o Afeganistão 🇦🇫','Usuário gratuito',
    'Explique de forma simples o futuro da inteligência artificial','Escreva um poema sobre a beleza de Cabul e as montanhas do Pamir','Código TypeScript React para um cartão de perfil moderno com Tailwind','5 ideias criativas de startups para o Afeganistão e Ásia Central',
    'Chat inteligente','Criar arte','Criar vídeo',
    'Central de ferramentas inteligentes','Uma coleção de ferramentas poderosas de processamento com IA',
    'Chat com IA','Assistente conversacional e perguntas e respostas','Gerador de imagens','Crie imagens impressionantes e realistas','Gerador de vídeos','Gere animações e vídeos a partir de texto','Assistente de código','Escreva, depure e explique código em mais de 20 linguagens','Tradução de texto e voz','Traduza entre dari, pashto, inglês e mais','Ferramentas de PDF e documentos','Extraia, resuma e edite documentos','Ferramentas de voz e fala','Fala para texto e texto para fala','Gerenciador de arquivos e ferramentas','Comprima, converta e gerencie arquivos','Calculadora inteligente','Cálculos científicos e conversão de moedas','Leitor e criador de QR','Gere e escaneie códigos QR instantaneamente','Resumidor de texto','Resuma documentos longos em pontos concisos',
    'Estúdio de geração de imagens','Transforme sua imaginação em visuais impressionantes','Um majestoso vale montanhoso no Afeganistão com lagos turquesa, picos nevados e flores de cerejeira...','Estilo da imagem','Proporção da imagem','Gerar imagem 🪄','Minhas criações','Baixar','Compartilhar','Salvar',
    'Estúdio de geração de vídeos','Gere vídeos de IA cinematográficos a partir de texto descritivo','Plano de drone cinematográfico sobre uma cidadela afegã histórica ao pôr do sol dourado...','Gerar vídeo 🎬','Meus vídeos',
    'Pesquisar nas conversas...','Conta e segurança','Efeitos sonoros e háptica','Privacidade e termos','Sobre o AFG AI','Versão 1.0.0','O AFG AI é um assistente inteligente de nova geração criado para usuários afegãos e internacionais. Com arquiteturas modernas de IA, torna a comunicação diária, o aprendizado, a criação de conteúdo e a programação acessíveis e agradáveis.','Canal do Telegram','Repositório do GitHub','Feito com ❤️ para o Afeganistão','Todos os direitos reservados © 2026 AFG AI',
    'Painel de administração do sistema','Gestão de usuários','Controle de serviços','Modelos de IA e provedores','Relatórios e análises','Restrições de acesso de usuários','Limites de cota diária','Moderação automática inteligente','Ver painel completo',
    'Administração','Chat','Online'
  ],
  japanese: [
    'アフガニスタンのためのスマートAI • あなたの賢いパートナー','アフガニスタンのために誇りを込めて開発 🇦🇫','無料ユーザー',
    '人工知能の未来をやさしく説明して','カーブルとパミールの美しさについて詩を書いて','Tailwindを使ったモダンなプロフィールカードのTypeScript Reactコード','アフガニスタンと中央アジア向けの5つのクリエイティブなスタートアップ案',
    'スマートチャット','アートを作る','動画を作る',
    'スマートツールセンター','強力なAI処理ツールのコレクション',
    'AIチャット','対話アシスタントと質問応答','画像ジェネレーター','鮮やかでリアルな画像を作成','動画ジェネレーター','テキストからアニメーションと動画を生成','コードアシスタント','20以上の言語でコードを書き、デバッグし、説明','テキストと音声の翻訳','ダリー語、パシュトー語、英語など間の翻訳','PDF・ドキュメントツール','ドキュメントからテキスト抽出・要約・編集','音声・スピーチツール','音声をテキストへ、テキストを音声へ','ファイルマネージャーとツール','ファイルの圧縮・変換・管理','スマート電卓','科学計算と通貨換算','QRスキャナー・作成ツール','QRコードを即時に生成・スキャン','テキスト要約ツール','長い文書を簡潔な箇条書きに要約',
    '画像生成スタジオ','想像力を息をのむビジュアルに変える','トルコシアンの湖、雪峰と桜に囲まれたアフガニスタンの壮大な山あいの渓谷...','画像スタイル','アスペクト比','画像を生成 🪄','私の作品','ダウンロード','共有','保存',
    '動画生成スタジオ','説明的なテキストからシネマティックなAI動画を生成','黄金の夕暮れ、歴史的なアフガン城塞の上空を飛ぶシネマティックなドローン撮影...','動画を生成 🎬','マイ動画',
    '会話を検索…','アカウントとセキュリティ','サウンド効果とハプティクス','プライバシーと利用規約','AFG AIについて','バージョン 1.0.0','AFG AIは、アフガニスタンと世界のユーザーのために作られた次世代のスマートアシスタントです。最新のAIアーキテクチャにより、日常のコミュニケーション、学習、コンテンツ制作、プログラミングを身近で楽しいものにします。','Telegramチャンネル','GitHubリポジトリ','❤️を込めてアフガニスタンのために開発','全著作権所有 © 2026 AFG AI',
    'システム管理パネル','ユーザー管理','サービス管理','AIモデルとプロバイダー','レポートと分析','ユーザーアクセス制限','1日の割り当て上限','インテリジェント自動モデレーション','完全なダッシュボードを表示',
    '管理','チャット','オンライン'
  ],
  korean: [
    '아프가니스탄을 위한 스마트 AI • 당신의 똑똑한 동반자','아프가니스탄을 위해 자랑스럽게 만들었습니다 🇦🇫','무료 사용자',
    '인공지능의 미래를 쉽게 설명해 줘','카불과 파미르 산맥의 아름다움에 관한 시를 써 줘','Tailwind으로 만드는 모던 프로필 카드의 TypeScript React 코드','아프가니스탄과 중앙아시아를 위한 5가지 창의적인 스타트업 아이디어',
    '스마트 채팅','아트 만들기','동영상 만들기',
    '스마트 도구 센터','강력한 AI 처리 도구 모음',
    'AI 채팅','대화형 어시스턴트와 질문·답변','이미지 생성기','멋지고 사실적인 이미지를 만들어 보세요','동영상 생성기','텍스트에서 애니메이션과 동영상을 생성하세요','코드 어시스턴트','20개 이상의 언어로 코드를 작성, 디버그하고 설명하세요','텍스트·음성 번역','다리어, 파슈토어, 영어 등 다양한 언어 간 번역','PDF·문서 도구','문서에서 텍스트를 추출하고 요약하고 편집하세요','음성·말하기 도구','음성을 텍스트로, 텍스트를 음성으로','파일 관리자 및 도구','파일을 압축, 변환하고 관리하세요','스마트 계산기','과학 계산과 환율 변환','QR 스캐너·생성기','QR 코드를 즉시 생성하고 스캔하세요','텍스트 요약기','긴 문서를 간결한 요점으로 요약하세요',
    '이미지 생성 스튜디오','상상력을 숨 막히는 비주얼로 바꿔 보세요','터키석 호수, 눈 덮인 봉우리와 벚꽃이 어우러진 아프가니스탄의 웅장한 산골짜기...','이미지 스타일','화면 비율','이미지 생성 🪄','내 작품','다운로드','공유','저장',
    '동영상 생성 스튜디오','설명 텍스트에서 시네마틱한 AI 동영상을 생성하세요','황금빛 노을 속 역사적인 아프가니스탄 성채 위를 나는 시네마틱한 드론 촬영...','동영상 생성 🎬','내 동영상',
    '대화 검색...','계정 및 보안','사운드 효과 및 햅틱','개인정보 및 이용약관','AFG AI 정보','버전 1.0.0','AFG AI는 아프가니스탄과 전 세계 사용자를 위해 만든 차세대 스마트 어시스턴트입니다. 최신 AI 아키텍처로 일상 소통, 학습, 콘텐츠 제작, 프로그래밍을 쉽고 즐겁게 만듭니다.','텔레그램 채널','GitHub 저장소','❤️을 담아 아프가니스탄을 위해 만들었습니다','모든 권리 보유 © 2026 AFG AI',
    '시스템 관리 패널','사용자 관리','서비스 제어','AI 모델 및 제공자','보고서 및 분석','사용자 접근 제한','일일 할당량 제한','지능형 자동 모더레이션','전체 대시보드 보기',
    '관리자','채팅','온라인'
  ]
};

// Native terminology for the secondary locales. Rows are only defined for
// locales that needed the completion; every row must have exactly
// toolKeys.length values (validated by check-i18n.ts).
export function getToolsUi(language: Language): Record<string, string> {
  const values = toolRows[language];
  if (!values) return {};
  if (values.length !== toolKeys.length) {
    throw new Error(`localeToolsUi: row "${language}" has ${values.length} values, expected ${toolKeys.length}`);
  }
  return Object.fromEntries(toolKeys.map((key, index) => [key, values[index]]));
}
