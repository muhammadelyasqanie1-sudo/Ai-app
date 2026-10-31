import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Users, 
  Server, 
  Cpu, 
  BarChart3, 
  Lock, 
  Sliders, 
  Activity, 
  CheckCircle2,
  Crown
} from 'lucide-react';
import type { Language } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgAdminPanelProps {
  language: Language;
}

export const AfgAdminPanel: React.FC<AfgAdminPanelProps> = ({ language }) => {
  const t = translations[language];
  const [accessRestrictions, setAccessRestrictions] = useState(true);
  const [dailyLimits, setDailyLimits] = useState(true);
  const [autoModeration, setAutoModeration] = useState(true);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40">
        <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" />
          <span>{t.adminTitle}</span>
        </h1>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold">
          System Operational
        </span>
      </div>

      {/* Admin Modules Grid (Matching Screenshot 2) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        
        {/* Users */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#09122c]/90 border border-cyan-500/30 hover:border-cyan-400/60 transition-all shadow-md group">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white">
            {t.usersManage}
          </h3>
          <p className="text-xs text-cyan-300/80 mt-1">
            2,450 {language === 'dari' ? 'کاربر فعال' : 'Active Users'}
          </p>
        </div>

        {/* Services Control */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#09122c]/90 border border-purple-500/30 hover:border-purple-400/60 transition-all shadow-md group">
          <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-105 transition-transform">
            <Server className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white">
            {t.servicesControl}
          </h3>
          <p className="text-xs text-purple-300/80 mt-1">
            8 {language === 'dari' ? 'سرویس آنلاین' : 'Online Services'}
          </p>
        </div>

        {/* Providers */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#09122c]/90 border border-amber-500/30 hover:border-amber-400/60 transition-all shadow-md group">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white">
            {t.providersModels}
          </h3>
          <p className="text-xs text-amber-300/80 mt-1">
            AFG-Core 3.8 & Flash
          </p>
        </div>

        {/* Reports Analytics */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#09122c]/90 border border-emerald-500/30 hover:border-emerald-400/60 transition-all shadow-md group">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white">
            {t.reportsAnalytics}
          </h3>
          <p className="text-xs text-emerald-300/80 mt-1">
            99.98% {language === 'dari' ? 'آپ‌تایم سرور' : 'Uptime'}
          </p>
        </div>

      </div>

      {/* Toggles (Matching Screenshot 2) */}
      <div className="rounded-3xl bg-[#09122c]/90 border border-cyan-900/40 p-4 sm:p-6 space-y-4 shadow-xl">
        
        {/* Toggle 1: User Access Restrictions */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-950">
          <div>
            <h4 className="text-sm font-bold text-white">
              {t.userAccessRestrictions}
            </h4>
            <p className="text-xs text-slate-400">
              {language === 'dari' ? 'فقط کاربران تایید شده دسترسی داشته باشند' : 'Restrict features to authenticated accounts'}
            </p>
          </div>
          <button
            onClick={() => setAccessRestrictions(!accessRestrictions)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${accessRestrictions ? 'bg-cyan-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${accessRestrictions ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Toggle 2: Daily Limits */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-950">
          <div>
            <h4 className="text-sm font-bold text-white">
              {t.dailyLimits}
            </h4>
            <p className="text-xs text-slate-400">
              {language === 'dari' ? 'محدودیت تعداد درخواست در هر ۲۴ ساعت' : 'Throttle per-user requests per 24 hours'}
            </p>
          </div>
          <button
            onClick={() => setDailyLimits(!dailyLimits)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${dailyLimits ? 'bg-cyan-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${dailyLimits ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Toggle 3: Auto Moderation */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">
              {t.autoModeration}
            </h4>
            <p className="text-xs text-slate-400">
              {language === 'dari' ? 'فیلتر خودکار محتوای نامناسب و اسپم' : 'Automatic safety check on prompts and media'}
            </p>
          </div>
          <button
            onClick={() => setAutoModeration(!autoModeration)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${autoModeration ? 'bg-cyan-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${autoModeration ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

      </div>

      {/* View Dashboard Button */}
      <button 
        onClick={() => alert(language === 'dari' ? 'داشبورد در وضعیت بهینه قرار دارد.' : 'Dashboard is fully operational.')}
        className="w-full py-3.5 rounded-2xl gradient-btn-cyan text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:scale-101 transition-all"
      >
        <Activity className="w-4 h-4" />
        <span>{t.viewDashboard}</span>
      </button>

    </div>
  );
};
