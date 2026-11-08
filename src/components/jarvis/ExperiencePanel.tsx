import { formatLocalizedNumber } from "../../utils/i18n";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  Cpu,
  Moon,
  Sun,
  Monitor,
  X,
} from "lucide-react";
import { AfgCinematicIntro } from "../afg/AfgCinematicIntro";
import { playUiSound } from "../../lib/uiSound";
import type { Language, TabType, Theme } from "../../types/afg";
import type { ExperiencePreferences, GraphicsProfile } from "./experience";
import { experienceCopy } from "./experienceCopy";

export default function ExperiencePanel(p: {
  intro: boolean;
  onClose: () => void;
  language: Language;
  onLanguage: (language: Language) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  preferences: ExperiencePreferences;
  update: (patch: Partial<ExperiencePreferences>) => void;
  profile: Exclude<GraphicsProfile, "auto">;
  reduced: boolean;
  storageError: boolean;
  models: number;
  signedIn: boolean;
  onNavigate: (tab: TabType) => void;
  onSignIn: () => void;
}) {
  const t = experienceCopy(p.language);
  const dialog = useRef<HTMLDialogElement>(null);
  const [intro, setIntro] = useState(p.intro);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  const navigate = (tab: TabType) => {
    p.onClose();
    p.onNavigate(tab);
  };
  return (
    <dialog
      ref={dialog}
      className={`afg-experience-dialog ${intro ? "is-intro" : ""}`}
      aria-labelledby="afg-experience-title"
      onCancel={(event) => {
        event.preventDefault();
        p.onClose();
      }}
    >
      <header className="afg-dialog-heading">
        <h1 id="afg-experience-title">{intro ? t.welcome : t.appearance}</h1>
        <button
          type="button"
          aria-label={intro ? t.skip : t.close}
          onClick={p.onClose}
        >
          <X size={20} />
        </button>
      </header>
      {intro ? (
        <>
          <AfgCinematicIntro
            embedded
            language={p.language}
            profile={p.profile}
            reduced={p.reduced}
            onComplete={() => {
              setIntro(false);
              requestAnimationFrame(() =>
                dialog.current
                  ?.querySelector<HTMLSelectElement>("select")
                  ?.focus(),
              );
            }}
          />
          <button className="afg-skip" onClick={p.onClose}>
            {t.skip}
          </button>
        </>
      ) : (
        <div className="afg-experience-content">
          <p className="afg-dialog-description">{t.tagline}</p>
          <div className="afg-preference-row">
            <label htmlFor="afg-experience-language">{t.language}</label>
            <select
              id="afg-experience-language"
              value={p.language}
              onChange={(e) => p.onLanguage(e.target.value as Language)}
            >
              <option value="english">English</option>
              <option value="dari">دری</option>
              <option value="pashto">پښتو</option>
              <option value="persian">فارسی</option>
              <option value="arabic">العربية</option>
              {!["english", "dari", "pashto", "persian", "arabic"].includes(
                p.language,
              ) && <option value={p.language}>{p.language}</option>}
            </select>
          </div>
          <fieldset>
            <legend>{t.theme}</legend>
            <div className="afg-choice-group">
              {(
                [
                  ["dark", Moon],
                  ["light", Sun],
                  ["system", Monitor],
                ] as const
              ).map(([theme, Icon]) => (
                <button
                  type="button"
                  key={theme}
                  aria-pressed={p.theme === theme}
                  onClick={() => p.onTheme(theme)}
                >
                  <Icon size={16} />
                  {t[theme]}
                  {p.theme === theme && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="afg-preference-row">
            <label htmlFor="afg-graphics">
              {t.graphics}
              <small>
                {t.activeProfile}: {t[p.profile]}
              </small>
            </label>
            <select
              id="afg-graphics"
              aria-describedby="afg-graphics-help"
              value={p.preferences.graphics}
              onChange={(e) =>
                p.update({ graphics: e.target.value as GraphicsProfile })
              }
            >
              {(["auto", "high", "balanced", "low"] as const).map((value) => (
                <option key={value} value={value}>
                  {t[value]}
                </option>
              ))}
            </select>
          </div>
          <p className="afg-setting-help" id="afg-graphics-help">
            {t.graphicsHelp}
          </p>
          <label className="afg-motion-toggle">
            <span>
              {t.motion}
              <small>{t.motionHelp}</small>
            </span>
            <input
              type="checkbox"
              checked={p.preferences.motion === "reduced"}
              onChange={(e) =>
                p.update({ motion: e.target.checked ? "reduced" : "system" })
              }
            />
          </label>
          <label className="afg-motion-toggle">
            <span>
              {t.sound}
              <small>{t.soundHelp}</small>
            </span>
            <input
              type="checkbox"
              checked={p.preferences.sound}
              onChange={(e) => {
                p.update({ sound: e.target.checked });
                if (e.target.checked) playUiSound('notice');
              }}
            />
          </label>
          <div className="afg-preference-row">
            <label htmlFor="afg-sound-volume">{t.volume}</label>
            <input
              id="afg-sound-volume"
              className="afg-volume-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={p.preferences.volume}
              disabled={!p.preferences.sound}
              aria-valuetext={`${Math.round(p.preferences.volume * 100)}%`}
              onChange={(e) =>
                p.update({ volume: Number(e.target.value) })
              }
            />
          </div>
          <section className="afg-connection-card">
            <div>
              <Cpu size={19} />
              <span>
                <strong>{t.provider}</strong>
                <small>
                  {p.models
                    ? `${formatLocalizedNumber(p.models, p.language)} · ${t.available}`
                    : t.unavailable}
                </small>
              </span>
            </div>
            <p>{t.providerHelp}</p>
            <button type="button" onClick={() => navigate("settings")}>
              {t.configure}
              <ArrowRight size={14} />
            </button>
          </section>
          <div className="afg-setup-links">
            <button type="button" onClick={() => navigate("voice")}>
              <AudioLines size={18} />
              <span>
                {t.voice}
                <small>{t.voiceHelp}</small>
              </span>
              <ArrowRight size={14} />
            </button>
            <button type="button" onClick={() => navigate("offline-models")}>
              <Cpu size={18} />
              <span>
                {t.local}
                <small>{t.localHelp}</small>
              </span>
              <ArrowRight size={14} />
            </button>
            {!p.signedIn && (
              <button
                type="button"
                onClick={() => {
                  p.onClose();
                  p.onSignIn();
                }}
              >
                <span>
                  {t.account}
                  <small>{t.accountHelp}</small>
                </span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
          {p.storageError && (
            <p className="afg-setting-error" role="alert">
              {t.storageError}
            </p>
          )}
          <footer>
            <p>{t.saved}</p>
            <button type="button" className="afg-primary" onClick={p.onClose}>
              {t.done}
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className="afg-replay"
              onClick={() => setIntro(true)}
            >
              {t.replay}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
