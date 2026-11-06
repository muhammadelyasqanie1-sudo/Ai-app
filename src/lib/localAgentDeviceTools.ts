import { Capacitor } from '@capacitor/core';
import { AFGOfflineModels } from '@afg-ai/capacitor-offline-models';

export type DeviceToolResult = { handled: true; text: string } | { handled: false };

/**
 * Deterministic, allowlisted device commands. The language model never gets
 * arbitrary shell access. Calling and SMS open Android's own confirmation UI.
 */
export async function runExplicitDeviceCommand(input: string): Promise<DeviceToolResult> {
  if (Capacitor.getPlatform() !== 'android') return { handled: false };
  const text = input.trim();
  const lower = text.toLowerCase();

  const wantsBattery = /\b(battery|charge level|charging status)\b/.test(lower) ||
    /(باتری|شارژ گوشی|میزان شارژ)/.test(text);
  if (wantsBattery) {
    const battery = await AFGOfflineModels.getBatteryStatus();
    const level = battery.level >= 0 ? battery.level + '%' : 'unknown';
    return { handled: true, text: 'Battery: ' + level + '. Charging: ' + (battery.charging ? 'yes' : 'no') +
      (battery.temperatureC >= 0 ? '. Temperature: ' + battery.temperatureC.toFixed(1) + '°C.' : '.') };
  }

  const appMatch = lower.match(/\b(open|launch|start)\s+(youtube|maps|chrome|settings|camera)\b/) ||
    text.match(/(باز کن|اجرا کن|بازکردن)\s*(یوتیوب|نقشه|کروم|تنظیمات|دوربین)/i);
  if (appMatch) {
    const raw = (appMatch[2] || '').toLowerCase();
    const appMap: Record<string, 'youtube' | 'maps' | 'chrome' | 'settings' | 'camera'> = {
      youtube: 'youtube', 'یوتیوب': 'youtube', maps: 'maps', 'نقشه': 'maps',
      chrome: 'chrome', 'کروم': 'chrome', settings: 'settings', 'تنظیمات': 'settings',
      camera: 'camera', 'دوربین': 'camera',
    };
    const app = appMap[raw];
    if (!app) return { handled: false };
    await AFGOfflineModels.openApp({ app });
    return { handled: true, text: 'Opened ' + app + ' using Android.' };
  }

  if (/\b(vibrate|vibration|buzz)\b/.test(lower) || /(لرزش|ویبره)/.test(text)) {
    await AFGOfflineModels.vibrate({ durationMs: 180 });
    return { handled: true, text: 'Vibration activated.' };
  }

  const callMatch = lower.match(/\b(?:call|dial)\s+(\+?[0-9][0-9\s().-]{4,24})/) ||
    text.match(/(?:تماس بگیر با|زنگ بزن به)\s*(\+?[0-9۰-۹٠-٩][0-9۰-۹٠-٩\s().-]{4,24})/);
  if (callMatch) {
    const phone = normalizePhone(callMatch[1]);
    await AFGOfflineModels.requestCallConfirmation({ phoneNumber: phone });
    return { handled: true, text: 'Android dialer opened. Review the number and tap Call yourself to confirm.' };
  }

  const smsMatch = text.match(/(?:send sms|text)\s+(\+?[0-9][0-9\s().-]{4,24})\s*[:,-]\s*([\s\S]{1,5000})/i) ||
    text.match(/(?:پیامک بفرست به)\s*(\+?[0-9۰-۹٠-٩][0-9۰-۹٠-٩\s().-]{4,24})\s*[:：،-]\s*([\s\S]{1,5000})/i);
  if (smsMatch) {
    const phone = normalizePhone(smsMatch[1]);
    await AFGOfflineModels.requestSmsConfirmation({ phoneNumber: phone, message: smsMatch[2].trim() });
    return { handled: true, text: 'Android SMS composer opened. Review the recipient and message, then tap Send yourself.' };
  }

  return { handled: false };
}

function normalizePhone(value: string): string {
  const normalized = value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  return normalized.replace(/[^+0-9]/g, '').slice(0, 25);
}
