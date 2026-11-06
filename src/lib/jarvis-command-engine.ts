import type { JarvisAction } from '@afg-ai/capacitor-jarvis';

export type JarvisCommand =
  | { kind: 'app'; packageName: string; label: string }
  | { kind: 'action'; action: JarvisAction }
  | { kind: 'unknown' };

const appAliases: Array<{ packageName: string; label: string; aliases: string[] }> = [
  { packageName: 'com.android.settings', label: 'Android Settings', aliases: ['settings', 'android settings', 'تنظیمات', 'تنظیمات اندروید', 'تنظیمات گوشی', 'امستنې', 'د اندروید امستنې', 'الإعدادات', 'إعدادات أندرويد'] },
  { packageName: 'com.google.android.youtube', label: 'YouTube', aliases: ['youtube', 'يوتيوب', 'یوتیوب', 'یوټیوب', 'یوتوب'] },
  { packageName: 'org.telegram.messenger', label: 'Telegram', aliases: ['telegram', 'تلگرام', 'ټیلیګرام', 'تيليجرام'] },
  { packageName: 'com.whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'واتساپ', 'واتس اپ', 'واټساپ'] },
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

  const action = actionAliases.find(item => item.aliases.some(alias => command === normalize(alias)));
  return action ? { kind: 'action', action: action.action } : { kind: 'unknown' };
}
