import type { Language } from '../types/afg';

/**
 * Copy for the application shell and account gate.
 *
 * These strings are used before the workspace shell is mounted, so they cannot
 * depend on a lazy-loaded screen dictionary. English, Dari, Pashto, Persian
 * and Arabic are reviewed here; other selectable locales deliberately fall
 * back to English until their shell copy is reviewed.
 */
export type CoreLocale = 'english' | 'dari' | 'pashto' | 'persian' | 'arabic';

export interface CoreCopy {
  sessionChecking: string;
  retry: string;
  loading: string;
  adminVerifying: string;
  adminDenied: string;
  imageEditUnavailable: string;
  imageGenerating: string;
  imageProviderUnavailable: string;
  imageGenerationFailed: string;
  imageUrlInvalid: string;
  visionUnavailable: string;
  fileUploadUnavailable: string;
  messageSaveFailed: string;
  assistantSaveFailed: string;
  cancelledSaveFailed: string;
  responseIncomplete: string;
  requestIdLabel: string;
  cancelledContent: string;
  assistantTitle: string;
  assistantClose: string;
  assistantLoading: string;
  terminalOpen: string;
  terminalShortcut: string;
  terminalLabel: string;
  autoModel: string;
  historyLoadFailed: string;
  deleteStorageFailed: string;
}

export interface AuthCopy {
  title: string;
  subtitle: string;
  google: string;
  email: string;
  guest: string;
  login: string;
  register: string;
  name: string;
  emailLabel: string;
  password: string;
  submitLogin: string;
  submitRegister: string;
  verifyTitle: string;
  verifyText: string;
  code: string;
  verify: string;
  back: string;
  switchLogin: string;
  switchRegister: string;
  loading: string;
  error: string;
  passwordHint: string;
  brand: string;
  or: string;
  secureAccess: string;
  togglePassword: string;
}

const english: CoreCopy = {
  sessionChecking: 'Checking your session…',
  retry: 'Retry',
  loading: 'Loading...',
  adminVerifying: 'Verifying administrator access…',
  adminDenied: 'Administrator portal access could not be verified.',
  imageEditUnavailable: 'Image editing with attachments is not enabled yet. Send a text prompt instead.',
  imageGenerating: 'Generating image…',
  imageProviderUnavailable: 'Image generation for this provider is not integrated yet.',
  imageGenerationFailed: 'Image generation failed.',
  imageUrlInvalid: 'The provider did not return a valid image URL.',
  visionUnavailable: 'This model cannot read images. Please switch to a Vision model.',
  fileUploadUnavailable: 'File uploads are not connected to server storage and processing yet.',
  messageSaveFailed: 'Your message could not be saved to your account. Check the connection and try again.',
  assistantSaveFailed: 'The response was received but could not be saved. Keep this page open and export the conversation before refreshing.',
  cancelledSaveFailed: 'The cancelled response could not be saved.',
  responseIncomplete: 'The response could not be completed. Your prompt is preserved; check the connection and model, then retry.',
  requestIdLabel: 'Request ID',
  cancelledContent: 'Generation cancelled.',
  assistantTitle: 'AFG AI assistant',
  assistantClose: 'Close',
  assistantLoading: 'Loading assistant...',
  terminalOpen: 'Open AFG AI Terminal',
  terminalShortcut: 'Terminal · Ctrl+Shift+T',
  terminalLabel: 'Terminal',
  autoModel: 'Auto model',
  historyLoadFailed: 'Failed to load your profile or history. Please try again.',
  deleteStorageFailed: 'Removed from this view, but account storage could not delete the message. Reload to compare.',
};

const dari: CoreCopy = {
  sessionChecking: 'در حال بررسی ورود…',
  retry: 'تلاش دوباره',
  loading: 'در حال بارگذاری...',
  adminVerifying: 'در حال بررسی دسترسی مدیریت…',
  adminDenied: 'دسترسی به پنل مدیریت تأیید نشد.',
  imageEditUnavailable: 'ویرایش تصویر با فایل پیوست هنوز فعال نیست؛ فعلاً توضیح متنی بفرستید.',
  imageGenerating: 'در حال تولید تصویر…',
  imageProviderUnavailable: 'مسیر تولید تصویر این ارائه‌دهنده هنوز وصل نشده است.',
  imageGenerationFailed: 'تولید تصویر ناموفق بود.',
  imageUrlInvalid: 'ارائه‌دهنده لینک معتبر تصویر برنگرداند.',
  visionUnavailable: 'این مدل نمی‌تواند تصویر را بخواند. لطفاً یک مدل دارای قابلیت Vision انتخاب کنید.',
  fileUploadUnavailable: 'بارگذاری فایل هنوز به ذخیره‌سازی و پردازش سرور وصل نشده است.',
  messageSaveFailed: 'پیام شما در حساب ذخیره نشد. اتصال را بررسی و دوباره تلاش کنید.',
  assistantSaveFailed: 'پاسخ دریافت شد اما ذخیره نشد. این صفحه را باز نگه دارید و پیش از تازه‌سازی، گفتگو را صادر کنید.',
  cancelledSaveFailed: 'پاسخ لغوشده ذخیره نشد.',
  responseIncomplete: 'پاسخ کامل نشد. پیام شما باقی مانده است؛ اتصال و مدل را بررسی کرده و دوباره تلاش کنید.',
  requestIdLabel: 'شناسه پیگیری',
  cancelledContent: 'تولید لغو شد.',
  assistantTitle: 'دستیار AFG AI',
  assistantClose: 'بستن',
  assistantLoading: 'در حال بارگذاری دستیار...',
  terminalOpen: 'باز کردن ترمینل AFG AI',
  terminalShortcut: 'ترمینل · Ctrl+Shift+T',
  terminalLabel: 'ترمینل',
  autoModel: 'مدل خودکار',
  historyLoadFailed: 'بارگذاری پروفایل یا تاریخچه ناموفق بود. لطفاً دوباره تلاش کنید.',
  deleteStorageFailed: 'از این نما حذف شد، اما ذخیره‌سازی حساب پیام را حذف نکرد. برای مقایسه صفحه را تازه کنید.',
};

const pashto: CoreCopy = {
  sessionChecking: 'ستاسو ناسته کتل کېږي…',
  retry: 'بیا هڅه',
  loading: 'بارول...',
  adminVerifying: 'د مدیر لاسرسی کتل کېږي…',
  adminDenied: 'د مدیر پینل لاسرسی تایید نه شو.',
  imageEditUnavailable: 'له فایل سره د انځور سمون لا نه دی فعال شوی؛ مهرباني وکړئ یوازې لیکلی توضیح ولیږئ.',
  imageGenerating: 'انځور جوړېږي…',
  imageProviderUnavailable: 'د دې برابرونکي لپاره د انځور جوړولو لاره لا نه ده نښلول شوې.',
  imageGenerationFailed: 'انځور جوړول ناکام شول.',
  imageUrlInvalid: 'برابرونکي معتبر د انځور لینک نه راستون کړ.',
  visionUnavailable: 'دا ماډل انځور نشي لوستلی. مهرباني وکړئ د لید وړتیا لرونکی ماډل وټاکئ.',
  fileUploadUnavailable: 'د فایل پورته کول لا تر سرور ذخیرې او پروسس پورې نه دي نښلول شوي.',
  messageSaveFailed: 'ستاسو پیغام ستاسو حساب ته خوندي نه شو. اړیکه وګورئ او بیا هڅه وکړئ.',
  assistantSaveFailed: 'ځواب ترلاسه شو خو خوندي نه شو. دا پاڼه پرانیستې وساتئ او له تازه کولو مخکې خبرې صادرې کړئ.',
  cancelledSaveFailed: 'لغوه شوی ځواب خوندي نه شو.',
  responseIncomplete: 'ځواب بشپړ نه شو. ستاسو پوښتنه خوندي ده؛ اړیکه او ماډل وګورئ او بیا هڅه وکړئ.',
  requestIdLabel: 'د تعقیب ID',
  cancelledContent: 'جوړول لغوه شول.',
  assistantTitle: 'د AFG AI مرستیال',
  assistantClose: 'بندول',
  assistantLoading: 'مرستیال بارول...',
  terminalOpen: 'د AFG AI ترمینل پرانیزئ',
  terminalShortcut: 'ترمینل · Ctrl+Shift+T',
  terminalLabel: 'ترمینل',
  autoModel: 'اتومات ماډل',
  historyLoadFailed: 'پروفایل یا تاریخچه بارول ناکام شول. مهرباني وکړئ بیا هڅه وکړئ.',
  deleteStorageFailed: 'له دې نندارې لرې شو، خو حساب ذخیره پیغام نه حذف کړ. د پرتله کولو لپاره پاڼه تازه کړئ.',
};

const persian: CoreCopy = {
  sessionChecking: 'در حال بررسی نشست…',
  retry: 'تلاش دوباره',
  loading: 'در حال بارگذاری...',
  adminVerifying: 'در حال بررسی دسترسی مدیر…',
  adminDenied: 'دسترسی به پنل مدیر تأیید نشد.',
  imageEditUnavailable: 'ویرایش تصویر با پیوست هنوز فعال نیست؛ فعلاً توضیح متنی بفرستید.',
  imageGenerating: 'در حال تولید تصویر…',
  imageProviderUnavailable: 'مسیر تولید تصویر این ارائه‌دهنده هنوز متصل نشده است.',
  imageGenerationFailed: 'تولید تصویر ناموفق بود.',
  imageUrlInvalid: 'ارائه‌دهنده لینک معتبر تصویر برنگرداند.',
  visionUnavailable: 'این مدل نمی‌تواند تصویر را بخواند. لطفاً مدلی با قابلیت بینایی انتخاب کنید.',
  fileUploadUnavailable: 'بارگذاری فایل هنوز به ذخیره‌سازی و پردازش سرور متصل نشده است.',
  messageSaveFailed: 'پیام شما در حساب ذخیره نشد. اتصال را بررسی و دوباره تلاش کنید.',
  assistantSaveFailed: 'پاسخ دریافت شد اما ذخیره نشد. این صفحه را باز نگه دارید و پیش از بازخوانی گفتگو را صادر کنید.',
  cancelledSaveFailed: 'پاسخ لغوشده ذخیره نشد.',
  responseIncomplete: 'پاسخ کامل نشد. پیام شما حفظ شده است؛ اتصال و مدل را بررسی و دوباره تلاش کنید.',
  requestIdLabel: 'شناسه پیگیری',
  cancelledContent: 'تولید لغو شد.',
  assistantTitle: 'دستیار AFG AI',
  assistantClose: 'بستن',
  assistantLoading: 'در حال بارگذاری دستیار...',
  terminalOpen: 'باز کردن ترمینال AFG AI',
  terminalShortcut: 'ترمینال · Ctrl+Shift+T',
  terminalLabel: 'ترمینال',
  autoModel: 'مدل خودکار',
  historyLoadFailed: 'بارگذاری پروفایل یا تاریخچه ناموفق بود. لطفاً دوباره تلاش کنید.',
  deleteStorageFailed: 'از این نما حذف شد، اما ذخیره‌سازی حساب پیام را حذف نکرد. برای مقایسه صفحه را بازخوانی کنید.',
};

const arabic: CoreCopy = {
  sessionChecking: 'جارٍ التحقق من جلستك…',
  retry: 'إعادة المحاولة',
  loading: 'جارٍ التحميل...',
  adminVerifying: 'جارٍ التحقق من وصول المسؤول…',
  adminDenied: 'تعذّر التحقق من وصول لوحة المسؤول.',
  imageEditUnavailable: 'تحرير الصور مع المرفقات غير مفعّل بعد؛ أرسل وصفاً نصياً بدلاً من ذلك.',
  imageGenerating: 'جارٍ إنشاء الصورة…',
  imageProviderUnavailable: 'مسار إنشاء الصور لهذا المزود غير موصول بعد.',
  imageGenerationFailed: 'فشل إنشاء الصورة.',
  imageUrlInvalid: 'لم يُرجع المزود رابط صورة صالحاً.',
  visionUnavailable: 'لا يستطيع هذا النموذج قراءة الصور. يرجى اختيار نموذج يدعم الرؤية.',
  fileUploadUnavailable: 'رفع الملفات غير موصول بتخزين الخادم ومعالجته بعد.',
  messageSaveFailed: 'تعذّر حفظ رسالتك في حسابك. تحقق من الاتصال وأعد المحاولة.',
  assistantSaveFailed: 'تم استلام الرد لكن تعذّر حفظه. أبقِ هذه الصفحة مفتوحة وصدّر المحادثة قبل التحديث.',
  cancelledSaveFailed: 'تعذّر حفظ الرد الملغى.',
  responseIncomplete: 'لم يكتمل الرد. تم حفظ مطالبتك؛ تحقق من الاتصال والنموذج ثم أعد المحاولة.',
  requestIdLabel: 'معرّف الطلب',
  cancelledContent: 'أُلغي الإنشاء.',
  assistantTitle: 'مساعد AFG AI',
  assistantClose: 'إغلاق',
  assistantLoading: 'جارٍ تحميل المساعد...',
  terminalOpen: 'فتح طرفية AFG AI',
  terminalShortcut: 'الطرفية · Ctrl+Shift+T',
  terminalLabel: 'الطرفية',
  autoModel: 'نموذج تلقائي',
  historyLoadFailed: 'تعذّر تحميل ملفك الشخصي أو سجلك. يرجى إعادة المحاولة.',
  deleteStorageFailed: 'أُزيلت من هذا العرض، لكن تخزين الحساب لم يحذف الرسالة. أعد التحميل للمقارنة.',
};

const coreByLocale: Record<CoreLocale, CoreCopy> = { english, dari, pashto, persian, arabic };

const authEnglish: AuthCopy = {
  title: 'Welcome to AFG AI',
  subtitle: 'Choose how you want to continue',
  google: 'Continue with Google',
  email: 'Continue with email',
  guest: 'Continue as guest',
  login: 'Sign in to your account',
  register: 'Create your account',
  name: 'Display name',
  emailLabel: 'Email address',
  password: 'Password',
  submitLogin: 'Sign in',
  submitRegister: 'Create account',
  verifyTitle: 'Verify your email',
  verifyText: 'Enter the six-digit code sent to your email',
  code: 'Verification code',
  verify: 'Verify and continue',
  back: 'Back',
  switchLogin: 'Already have an account? Sign in',
  switchRegister: 'New here? Create an account',
  loading: 'Please wait…',
  error: 'Request failed. Check your details and try again.',
  passwordHint: 'At least 12 characters',
  brand: 'One AI. Many capabilities.',
  or: 'OR',
  secureAccess: 'SECURE ACCESS',
  togglePassword: 'Toggle password visibility',
};

const authDari: AuthCopy = {
  title: 'به AFG AI خوش آمدید',
  subtitle: 'برای ادامه، روش ورود خود را انتخاب کنید',
  google: 'ادامه با Google',
  email: 'ادامه با ایمیل',
  guest: 'ادامه به‌عنوان مهمان',
  login: 'ورود به حساب',
  register: 'ایجاد حساب جدید',
  name: 'نام نمایشی',
  emailLabel: 'آدرس ایمیل',
  password: 'رمز عبور',
  submitLogin: 'ورود',
  submitRegister: 'ایجاد حساب',
  verifyTitle: 'تأیید ایمیل',
  verifyText: 'کد شش‌رقمی ارسال‌شده به ایمیل خود را وارد کنید',
  code: 'کد تأیید',
  verify: 'تأیید و ادامه',
  back: 'بازگشت',
  switchLogin: 'حساب دارید؟ ورود',
  switchRegister: 'حساب ندارید؟ ثبت‌نام',
  loading: 'لطفاً صبر کنید…',
  error: 'درخواست انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.',
  passwordHint: 'حداقل ۱۲ کاراکتر',
  brand: 'یک هوش مصنوعی، توانایی‌های بی‌پایان',
  or: 'یا',
  secureAccess: 'دسترسی امن',
  togglePassword: 'نمایش یا پنهان‌کردن رمز عبور',
};

const authPashto: AuthCopy = {
  title: 'AFG AI ته ښه راغلاست',
  subtitle: 'د دوام لپاره خپل د ننوتلو لاره وټاکئ',
  google: 'له Google سره دوام',
  email: 'له برېښنالیک سره دوام',
  guest: 'د میلمه په توګه دوام',
  login: 'خپل حساب ته ننوځئ',
  register: 'خپل حساب جوړ کړئ',
  name: 'د ښودنې نوم',
  emailLabel: 'برېښنالیک پته',
  password: 'پټنوم',
  submitLogin: 'ننوتل',
  submitRegister: 'حساب جوړول',
  verifyTitle: 'برېښنالیک تایید کړئ',
  verifyText: 'هغه شپږ عددي کوډ ولیکئ چې برېښنالیک ته لیږل شوی',
  code: 'د تایید کوډ',
  verify: 'تایید او دوام',
  back: 'بېرته',
  switchLogin: 'حساب لرئ؟ ننوځئ',
  switchRegister: 'نوی یاست؟ حساب جوړ کړئ',
  loading: 'مهرباني وکړئ صبر وکړئ…',
  error: 'غوښتنه ناکامه شوه. معلومات وګورئ او بیا هڅه وکړئ.',
  passwordHint: 'لږ تر لږه ۱۲ توري',
  brand: 'یو AI، بې پای توانایي.',
  or: 'یا',
  secureAccess: 'خوندي لاسرسی',
  togglePassword: 'پټنوم ښودل یا پټول',
};

const authPersian: AuthCopy = {
  title: 'به AFG AI خوش آمدید',
  subtitle: 'برای ادامه روش ورود خود را انتخاب کنید',
  google: 'ادامه با Google',
  email: 'ادامه با ایمیل',
  guest: 'ادامه به‌عنوان مهمان',
  login: 'ورود به حساب',
  register: 'ایجاد حساب جدید',
  name: 'نام نمایشی',
  emailLabel: 'نشانی ایمیل',
  password: 'گذرواژه',
  submitLogin: 'ورود',
  submitRegister: 'ایجاد حساب',
  verifyTitle: 'تأیید ایمیل',
  verifyText: 'کد شش‌رقمی ارسال‌شده به ایمیل خود را وارد کنید',
  code: 'کد تأیید',
  verify: 'تأیید و ادامه',
  back: 'بازگشت',
  switchLogin: 'حساب دارید؟ وارد شوید',
  switchRegister: 'حساب ندارید؟ ثبت‌نام کنید',
  loading: 'لطفاً صبر کنید…',
  error: 'درخواست انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.',
  passwordHint: 'حداقل ۱۲ کاراکتر',
  brand: 'یک هوش مصنوعی، توانایی‌های بی‌پایان',
  or: 'یا',
  secureAccess: 'دسترسی امن',
  togglePassword: 'نمایش یا پنهان‌کردن گذرواژه',
};

const authArabic: AuthCopy = {
  title: 'مرحباً بك في AFG AI',
  subtitle: 'اختر طريقة المتابعة',
  google: 'المتابعة باستخدام Google',
  email: 'المتابعة بالبريد الإلكتروني',
  guest: 'المتابعة كضيف',
  login: 'تسجيل الدخول إلى حسابك',
  register: 'إنشاء حسابك',
  name: 'الاسم المعروض',
  emailLabel: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  submitLogin: 'تسجيل الدخول',
  submitRegister: 'إنشاء الحساب',
  verifyTitle: 'تحقق من بريدك الإلكتروني',
  verifyText: 'أدخل الرمز المكوّن من ستة أرقام المرسل إلى بريدك',
  code: 'رمز التحقق',
  verify: 'تحقق وتابع',
  back: 'رجوع',
  switchLogin: 'لديك حساب؟ سجّل الدخول',
  switchRegister: 'جديد هنا؟ أنشئ حساباً',
  loading: 'يرجى الانتظار…',
  error: 'فشل الطلب. تحقق من بياناتك وأعد المحاولة.',
  passwordHint: '12 حرفاً على الأقل',
  brand: 'ذكاء واحد. قدرات متعددة.',
  or: 'أو',
  secureAccess: 'وصول آمن',
  togglePassword: 'إظهار كلمة المرور أو إخفاؤها',
};

const authByLocale: Record<CoreLocale, AuthCopy> = {
  english: authEnglish,
  dari: authDari,
  pashto: authPashto,
  persian: authPersian,
  arabic: authArabic,
};

export function resolveCoreLocale(language: Language): CoreLocale {
  return language === 'dari' || language === 'pashto' || language === 'persian' || language === 'arabic'
    ? language
    : 'english';
}

export function coreCopy(language: Language): CoreCopy {
  return coreByLocale[resolveCoreLocale(language)];
}

export function authCopy(language: Language): AuthCopy {
  return authByLocale[resolveCoreLocale(language)];
}
