import type { JarvisAction } from '@afg-ai/capacitor-jarvis';

export type JarvisCommand =
  | { kind: 'app'; packageName: string; label: string }
  | { kind: 'action'; action: JarvisAction }
  | { kind: 'unknown' };

const appAliases: Array<{ packageName: string; label: string; aliases: string[] }> = [
  { packageName: 'com.android.settings', label: 'Android Settings', aliases: ['settings', 'android settings', 'تنظیمات', 'تنظیمات اندروید', 'امستنې', 'د اندروید امستنې', 'الإعدادات', 'إعدادات أندرويد'] },
  { packageName: 'com.google.android.youtube', label: 'YouTube', aliases: ['youtube', 'يوتيوب', 'یوتیوب', 'یوټیوب', 'یوتوب'] },
  { packageName: 'org.telegram.messenger', label: 'Telegram', aliases: ['telegram', 'تلگرام', 'ټیلیګرام', 'تيليجرام'] },
  { packageName: 'com.whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'واتساپ', 'واتس اپ', 'واټساپ'] },
];

const actionAliases: Array<{ action: JarvisAction; aliases: string[] }> = [
  { action: 'back', aliases: ['back', 'go back', 'بازگشت', 'برگرد', 'شاته', 'بېرته', 'رجوع'] },
  { action: 'home', aliases: ['home', 'go home', 'صفحه اصلی', 'خانه', 'کور', 'کورپاڼه', 'الرئيسية', 'الصفحة الرئيسية'] },
  { action: 'notifications', aliases: ['notifications', 'notification', 'اعلان', 'اعلان ها', 'اعلان‌ها', 'خبرتیاوې', 'خبرتیا', 'الإشعارات'] },
  { action: 'quickSettings', aliases: ['quick settings', 'تنظیمات سریع', 'تنظیمات فوری', 'چټک امستنې', 'الإعدادات السريعة'] },
  { action: 'scrollForward', aliases: ['scroll down', 'down', 'پایین برو', 'پایین رفتن', 'لاندې لاړ شه', 'للأسفل'] },
  { action: 'scrollBackward', aliases: ['scroll up', 'up', 'بالا برو', 'بالا رفتن', 'پورته لاړ شه', 'للأعلى'] },
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

/** Deterministic on-device phrase matching. It never executes unknown or free-form text. */
export function parseJarvisCommand(input: string): JarvisCommand {
  const command = normalize(input);
  if (!command || command.length > 120) return { kind: 'unknown' };

  const app = appAliases.find(item => item.aliases.some(alias => {
    const normalizedAlias = normalize(alias);
    return command === normalizedAlias || command === 'open ' + normalizedAlias || command === 'باز کن ' + normalizedAlias || command === 'خلاص کړه ' + normalizedAlias || command === 'افتح ' + normalizedAlias;
  }));
  if (app) return { kind: 'app', packageName: app.packageName, label: app.label };

  const action = actionAliases.find(item => item.aliases.some(alias => command === normalize(alias)));
  return action ? { kind: 'action', action: action.action } : { kind: 'unknown' };
}
