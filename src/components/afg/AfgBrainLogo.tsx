import React from 'react';

interface AfgBrainLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
}

export const AfgBrainLogo: React.FC<AfgBrainLogoProps> = ({
  size = 'md',
  showBadge = false,
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Background ambient neon glow */}
      <div className="absolute inset-0 bg-cyan-400/30 blur-xl rounded-full pointer-events-none" />

      {/* Cyber Brain SVG */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${sizeMap[size]} relative z-10 drop-shadow-[0_0_12px_rgba(0,229,255,0.7)] transition-transform duration-300 hover:scale-105`}
      >
        <defs>
          <linearGradient id="afgBrainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f5d4" />
            <stop offset="50%" stopColor="#00bbf9" />
            <stop offset="100%" stopColor="#4361ee" />
          </linearGradient>
          <linearGradient id="neuralLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f5d4" />
            <stop offset="100%" stopColor="#3a86ff" />
          </linearGradient>
          <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Brain Contours - Left Hemisphere */}
        <path
          d="M47 22C43 20 37 20 32 23C24 27 21 34 23 43C17 46 14 53 16 60C18 68 25 73 31 73C33 79 38 84 45 84C46 84 47 83 47 81V22Z"
          fill="url(#afgBrainGrad)"
          fillOpacity="0.22"
          stroke="url(#afgBrainGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Outer Brain Contours - Right Hemisphere */}
        <path
          d="M53 22C57 20 63 20 68 23C76 27 79 34 77 43C83 46 86 53 84 60C82 68 75 73 69 73C67 79 62 84 55 84C54 84 53 83 53 81V22Z"
          fill="url(#afgBrainGrad)"
          fillOpacity="0.22"
          stroke="url(#afgBrainGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Neural Circuit Lines - Left */}
        <path
          d="M32 35C36 38 42 38 47 36"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M26 50C31 49 38 52 47 50"
          stroke="#00bbf9"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M28 65C34 66 40 63 47 64"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Neural Circuit Lines - Right */}
        <path
          d="M68 35C64 38 58 38 53 36"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M74 50C69 49 62 52 53 50"
          stroke="#00bbf9"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M72 65C66 66 60 63 53 64"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Neural Glowing Synaptic Nodes */}
        <circle cx="32" cy="35" r="2.8" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="47" cy="36" r="2.2" fill="#00f5d4" />
        <circle cx="26" cy="50" r="2.5" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="47" cy="50" r="2.2" fill="#00bbf9" />
        <circle cx="28" cy="65" r="2.5" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="47" cy="64" r="2.2" fill="#00f5d4" />

        <circle cx="68" cy="35" r="2.8" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="53" cy="36" r="2.2" fill="#00f5d4" />
        <circle cx="74" cy="50" r="2.5" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="53" cy="50" r="2.2" fill="#00bbf9" />
        <circle cx="72" cy="65" r="2.5" fill="#ffffff" filter="url(#glowFilter)" />
        <circle cx="53" cy="64" r="2.2" fill="#00f5d4" />

        {/* Central Cortex Synapse Pulse */}
        <line x1="50" y1="26" x2="50" y2="78" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 3" opacity="0.8" />
      </svg>

      {/* Afghan Flag Mini Heart or Badge */}
      {showBadge && (
        <span className="absolute -bottom-1 -right-1 text-xs select-none">
          🇦🇫
        </span>
      )}
    </div>
  );
};
