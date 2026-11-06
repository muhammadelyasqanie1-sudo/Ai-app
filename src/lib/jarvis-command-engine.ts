import type { JarvisAction } from '@afg-ai/capacitor-jarvis';

export type JarvisCommand =
  | { kind: 'app'; packageName: string; label: string }
  | { kind: 'action'; action: JarvisAction }
  | { kind: 'device'; action: 'battery' | 'network' | 'sensors' | 'vibrate' | 'torchOn' | 'torchOff' | 'location' | 'contacts' | 'recentSms' | 'camera' }
  | { kind: 'unknown' };

const appAliases: Array<{ packageName: string; label: string; aliases: string[] }> = [
  { packageName: 'com.android.settings', label: 'Android Settings', aliases: ['settings', 'android settings', 'تنظیمات', 'تنظیمات اندروید', 'تنظیمات گوشی', 'امستنې', 'د اندروید امستنې', 'الإعدادات', 'إعدادات أندرويد'] },
  { packageName: 'com.google.android.youtube', label: 'YouTube', aliases: ['youtube', 'يوتيوب', 'یوتیوب', 'یوټیوب', 'یوتوب'] },
  { packageName: 'org.telegram.messenger', label: 'Telegram', aliases: ['telegram', 'تلگرام', 'ټیلیګرام', 'تيليجرام'] },
  { packageName: 'com.whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'واتساپ', 'واتس اپ', 'واټساپ'] },
];

const deviceAliases: Array<{ action: Extract<JarvisCommand, {kind:'device'}>['action']; aliases: string[] }> = [
  { action: 'battery', aliases: ['battery', 'battery status', 'battery level', 'what is my battery level', 'check battery', 'وضعیت باتری', 'سطح باتری', 'باتری چقدر است', 'بیټرۍ', 'د بیټرۍ حالت', 'حالة البطارية'] },
  { action: 'network', aliases: ['network status', 'check network', 'internet status', 'wifi status', 'وضعیت شبکه', 'وضعیت اینترنت', 'حالت وای فای', 'د شبکې حالت', 'حالة الشبكة'] },
  { action: 'sensors', aliases: ['list sensors', 'check sensors', 'phone sensors', 'hardware sensors', 'حسگرها', 'سنسورها', 'حسگرهای گوشی', 'سنسورونه', 'المستشعرات'] },
  { action: 'vibrate', aliases: ['vibrate', 'vibrate phone', 'buzz phone', 'لرزش', 'گوشی را بلرزان', 'موبایل ره بلرزان', 'وړاندې ولړزوه'] },
  { action: 'torchOn', aliases: ['turn on flashlight', 'flashlight on', 'torch on', 'چراغ قوه را روشن کن', 'چراغ‌قوه ره روشن کو', 'فلش روشن', 'فلش ره روشن کو', 'څراغ بل کړه'] },
  { action: 'torchOff', aliases: ['turn off flashlight', 'flashlight off', 'torch off', 'چراغ قوه را خاموش کن', 'چراغ‌قوه ره خاموش کو', 'فلش خاموش', 'فلش ره بند کو', 'څراغ مړ کړه'] },
  { action: 'location', aliases: ['where am i', 'get my location', 'current location', 'موقعیت من کجاست', 'موقعیت فعلی', 'لوکیشن', 'زه چېرته یم', 'موقعي الحالي'] },
  { action: 'contacts', aliases: ['list contacts', 'show contacts', 'my contacts', 'مخاطبین', 'لیست مخاطبین', 'شماره هایم', 'اړیکې', 'جهات الاتصال'] },
  { action: 'recentSms', aliases: ['read recent sms', 'last five messages', 'read last 5 sms', 'پیامک های اخیر', 'پیامک‌های اخیر', 'پنج پیامک اخیر', 'وروستي پیغامونه', 'الرسائل الأخيرة'] },
  { action: 'camera', aliases: ['take a photo', 'open camera', 'take photo', 'عکس بگیر', 'دوربین را باز کن', 'دوربین ره باز کو', 'عکس واخله', 'افتح الكاميرا'] },
];

const actionAliases: Array<{ action: JarvisAction; aliases: string[] }> = [
  { action: 'back', aliases: ['back', 'go back', 'بازگشت', 'برگرد', 'به عقب برگرد', 'عقب برو', 'شاته', 'بېرته', 'رجوع'] },
  { action: 'home', aliases: ['home', 'go home', 'صفحه اصلی', 'صفحه خانه', 'برو به خانه', 'خانه', 'کور', 'کورپاڼه', 'الرئيسية', 'الصفحة الرئيسية'] },
  { action: 'notifications', aliases: ['notifications', 'notification', 'اعلان', 'اعلان ها', 'اعلان‌ها', 'اعلان ها را باز کن', 'خبرتیاوې', 'خبرتیا', 'الإشعارات'] },
  { action: 'quickSettings', aliases: ['quick settings', 'تنظیمات سریع', 'تنظیمات فوری', 'تنظیمات سریع را باز کن', 'چټک امستنې', 'الإعدادات السريعة'] },
  { action: 'scrollForward', aliases: ['scroll down', 'down', 'پایین برو', 'پایین رفتن', 'صفحه را پایین ببر', 'صفحه ره پایین ببر', 'لاندې لاړ شه', 'للأسفل'] },
  { action: 'scrollBackward', aliases: ['scroll up', 'up', 'بالا برو', 'بالا رفتن', 'صفحه را بالا ببر', 'صفحه ره بالا ببر', 'پورته لاړ شه', 'للأعلى'] },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[؟?!.،,؛;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function appPhraseMatches(command: string, alias: string): boolean {
  const name = normalize(alias);
  const exactPhrases = [
    name, 'open ' + name, 'باز کن ' + name, 'برو به ' + name,
    name + ' را باز کن', name + ' ره باز کن', name + ' ره باز کو',
    name + ' را باز کو', 'خلاص کړه ' + name, 'افتح ' + name,
  ];
  return exactPhrases.some(phrase => command === normalize(phrase));
}

/** Strict, deterministic on-device matching for English, Afghan Dari, Pashto and Arabic. */
export function parseJarvisCommand(input: string): JarvisCommand {
  const command = normalize(input);
  if (!command || command.length > 120) return { kind: 'unknown' };

  const app = appAliases.find(item => item.aliases.some(alias => appPhraseMatches(command, alias)));
  if (app) return { kind: 'app', packageName: app.packageName, label: app.label };

  const device = deviceAliases.find(item => item.aliases.some(alias => command === normalize(alias)));
  if (device) return { kind: 'device', action: device.action };

  const action = actionAliases.find(item => item.aliases.some(alias => command === normalize(alias)));
  return action ? { kind: 'action', action: action.action } : { kind: 'unknown' };
}
