import React from 'react';

export function AfgJarvisVisualCore({ active, connected, language }: { active: boolean; connected: boolean; language: string }) {
  const rtl = ['dari', 'persian', 'pashto', 'arabic', 'urdu'].includes(language);
  const status = active
    ? (language === 'dari' ? 'در حال پردازش فرمان' : language === 'pashto' ? 'د امر پروسس روان دی' : language === 'arabic' ? 'جارٍ معالجة الأمر' : 'PROCESSING COMMAND')
    : connected
      ? (language === 'dari' ? 'آماده و متصل' : language === 'pashto' ? 'چمتو او وصل' : language === 'arabic' ? 'جاهز ومتصل' : 'SYSTEM ONLINE')
      : (language === 'dari' ? 'در انتظار فرمان شما' : language === 'pashto' ? 'ستاسو د امر په تمه' : language === 'arabic' ? 'بانتظار أمرك' : 'AWAITING COMMAND');

  return <section dir={rtl ? 'rtl' : 'ltr'} aria-label="JARVIS animated visual interface" className="relative isolate mb-5 min-h-[390px] overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#030712] px-4 py-5 shadow-[0_0_55px_rgba(6,182,212,.12)] sm:min-h-[460px] sm:px-7">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(8,145,178,.19),transparent_48%),radial-gradient(ellipse_at_50%_100%,rgba(124,58,237,.15),transparent_55%)]" />
    <div className="jarvis-grid pointer-events-none absolute inset-0 opacity-35" />
    <div className="relative z-10 flex items-center justify-between gap-3">
      <div><p className="text-[10px] font-bold tracking-[.38em] text-cyan-300">AFG AI / J.A.R.V.I.S</p><p className="mt-1 text-[9px] tracking-[.25em] text-slate-500">PERSONAL INTELLIGENCE SYSTEM</p></div>
      <div className="flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5"><span className={`h-2 w-2 rounded-full ${active ? 'animate-ping bg-violet-300' : connected ? 'bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,.9)]' : 'bg-cyan-300 animate-pulse'}`} /><span className="text-[9px] font-semibold tracking-[.16em] text-cyan-100">{status}</span></div>
    </div>
    <div className="relative mx-auto mt-2 flex h-[270px] max-w-[520px] items-center justify-center sm:h-[330px]">
      <div className="absolute h-[235px] w-[235px] rounded-full border border-cyan-300/10 sm:h-[290px] sm:w-[290px]" />
      <div className="jarvis-orbit absolute h-[205px] w-[205px] rounded-full border border-dashed border-cyan-300/30 sm:h-[260px] sm:w-[260px]" />
      <div className="jarvis-orbit-reverse absolute h-[175px] w-[175px] rounded-full border border-violet-300/30 sm:h-[220px] sm:w-[220px]" />
      <div className={`jarvis-core relative z-10 h-32 w-32 rounded-full sm:h-40 sm:w-40 ${active ? 'jarvis-core-active' : ''}`}>
        <div className="absolute inset-0 rounded-full border border-cyan-100/70 bg-[radial-gradient(circle_at_35%_30%,#e0ffff_0%,#22d3ee_9%,#0e7490_27%,#172554_55%,#09051c_75%)] shadow-[0_0_35px_rgba(34,211,238,.75),inset_0_0_28px_rgba(196,181,253,.55)]" />
        <div className="absolute inset-3 rounded-full border border-white/25 shadow-[inset_0_0_25px_rgba(34,211,238,.55)]" />
        <div className="absolute inset-0 grid place-items-center text-3xl font-black tracking-widest text-white drop-shadow-[0_0_12px_rgba(103,232,249,1)] sm:text-4xl">J</div>
      </div>
      <div className="absolute left-[3%] top-[23%] rounded-xl border border-cyan-300/25 bg-slate-950/75 px-3 py-2 shadow-[0_0_22px_rgba(6,182,212,.12)] backdrop-blur-md"><p className="text-[9px] font-bold tracking-wider text-cyan-200">NEURAL CORE</p><p className="mt-1 text-[10px] text-slate-400">01 / ACTIVE</p></div>
      <div className="absolute right-[2%] top-[28%] rounded-xl border border-violet-300/25 bg-slate-950/75 px-3 py-2 shadow-[0_0_22px_rgba(139,92,246,.14)] backdrop-blur-md"><p className="text-[9px] font-bold tracking-wider text-violet-200">VOICE ENGINE</p><p className="mt-1 text-[10px] text-slate-400">02 / READY</p></div>
      <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-300/20 bg-slate-950/80 px-4 py-2 text-[9px] tracking-[.2em] text-cyan-100 backdrop-blur-md">LISTEN · THINK · RESPOND</div>
    </div>
    <div className="relative z-10 mx-auto max-w-md text-center"><p className="text-xs font-semibold tracking-[.28em] text-white sm:text-sm">BEYOND IMAGINATION</p><p className="mt-2 text-[10px] tracking-[.16em] text-slate-500">INTELLIGENCE THAT MOVES WITH YOU</p><div className="mx-auto mt-4 h-px max-w-[220px] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" /></div>
    <style>{`
      .jarvis-grid{background-image:linear-gradient(rgba(34,211,238,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.12) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(to bottom,transparent,#000 25%,#000 75%,transparent);transform:perspective(420px) rotateX(58deg) scale(1.8);transform-origin:bottom;animation:jarvis-grid-drift 12s linear infinite}
      .jarvis-orbit{animation:jarvis-spin 18s linear infinite}
      .jarvis-orbit-reverse{animation:jarvis-spin 13s linear infinite reverse}
      .jarvis-core{animation:jarvis-breathe 3.2s ease-in-out infinite}
      .jarvis-core-active{animation-duration:1.05s;filter:saturate(1.5)}
      @keyframes jarvis-spin{to{transform:rotate(360deg)}}
      @keyframes jarvis-breathe{0%,100%{transform:scale(.96);filter:brightness(.92)}50%{transform:scale(1.06);filter:brightness(1.28)}}
      @keyframes jarvis-grid-drift{to{background-position:0 68px,68px 0}}
      @media(prefers-reduced-motion:reduce){.jarvis-grid,.jarvis-orbit,.jarvis-orbit-reverse,.jarvis-core{animation:none!important}}
    `}</style>
  </section>;
}
