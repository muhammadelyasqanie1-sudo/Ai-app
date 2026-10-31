import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, X, Volume2, Settings2 } from 'lucide-react';

export interface SpeechState {
  messageId: string;
  text: string;
  isPlaying: boolean;
  isPaused: boolean;
  rate: number;
  voiceName?: string;
}

interface SpeechPlayerProps {
  speechState: SpeechState;
  onPlayPause: () => void;
  onRestart: () => void;
  onChangeRate: (rate: number) => void;
  onChangeVoice: (voiceName: string) => void;
  onStop: () => void;
}

export const SpeechPlayer: React.FC<SpeechPlayerProps> = ({
  speechState,
  onPlayPause,
  onRestart,
  onChangeRate,
  onChangeVoice,
  onStop,
}) => {
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        // Filter english or all voices
        const filtered = voices.filter((v) => v.lang.startsWith('en')) || voices;
        setAvailableVoices(filtered.length > 0 ? filtered : voices);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const rates = [1, 1.25, 1.5, 2];

  const handleNextRate = () => {
    const currentIndex = rates.indexOf(speechState.rate);
    const nextIndex = (currentIndex + 1) % rates.length;
    onChangeRate(rates[nextIndex]);
  };

  return (
    <div
      className="max-w-3xl mx-auto px-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
      role="region"
      aria-label="Read aloud audio player"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-[#2f2f2f]/95 border border-neutral-300 dark:border-neutral-700 shadow-lg backdrop-blur-md text-neutral-800 dark:text-neutral-100">
        {/* Left: Speaker icon & Animated Soundwave Bars */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1 text-emerald-500">
            <Volume2 className="w-4 h-4 shrink-0" />
            <div className="flex items-end gap-0.5 h-4 w-5 px-0.5">
              <span
                className={`w-1 bg-emerald-500 rounded-full transition-all duration-150 ${
                  speechState.isPlaying
                    ? 'h-3.5 animate-pulse'
                    : 'h-1.5'
                }`}
              />
              <span
                className={`w-1 bg-emerald-500 rounded-full transition-all duration-200 ${
                  speechState.isPlaying
                    ? 'h-4 animate-bounce'
                    : 'h-2'
                }`}
              />
              <span
                className={`w-1 bg-emerald-500 rounded-full transition-all duration-150 ${
                  speechState.isPlaying
                    ? 'h-2.5 animate-pulse'
                    : 'h-1'
                }`}
              />
            </div>
          </div>

          <div className="text-xs truncate font-medium max-w-[200px] sm:max-w-xs text-neutral-700 dark:text-neutral-300">
            {speechState.isPlaying ? 'Reading response aloud...' : 'Read aloud paused'}
          </div>
        </div>

        {/* Center / Right: Audio Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Restart */}
          <button
            onClick={onRestart}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            aria-label="Replay from start"
            title="Replay from beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="p-2 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            aria-label={speechState.isPlaying ? 'Pause speech' : 'Play speech'}
            title={speechState.isPlaying ? 'Pause' : 'Resume'}
          >
            {speechState.isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Playback speed multiplier */}
          <button
            onClick={handleNextRate}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer min-w-[36px]"
            aria-label={`Playback speed ${speechState.rate}x, click to change`}
            title="Adjust speed"
          >
            {speechState.rate}x
          </button>

          {/* Voice selector dropdown toggle (if voices available) */}
          {availableVoices.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowVoiceMenu((prev) => !prev)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
                aria-label="Select speech voice"
                title="Select voice"
              >
                <Settings2 className="w-4 h-4" />
              </button>

              {showVoiceMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-56 max-h-48 overflow-y-auto rounded-xl p-1 bg-white dark:bg-[#252525] shadow-xl border border-neutral-200 dark:border-neutral-700 z-50 text-xs">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase">
                    Select Voice
                  </div>
                  {availableVoices.slice(0, 10).map((voice) => (
                    <button
                      key={voice.name}
                      onClick={() => {
                        onChangeVoice(voice.name);
                        setShowVoiceMenu(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg truncate cursor-pointer transition-colors ${
                        speechState.voiceName === voice.name
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                      }`}
                    >
                      {voice.name.replace(/Google|Microsoft/g, '').trim()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Close / Stop */}
          <button
            onClick={onStop}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            aria-label="Stop and dismiss Read Aloud player"
            title="Stop Read Aloud"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
