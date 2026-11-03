import React from 'react';
import type { Language, Theme, UserProfile } from '../../types/afg';
import { AfgSettingsHub } from './AfgSettingsHub';

interface AfgSettingsViewProps {
  language: Language;
  theme: Theme;
  user: UserProfile;
  onSetLanguage: (language: Language) => void;
  onToggleTheme: () => void;
  onSetTheme: (theme: Theme) => void;
  onOpenShortcuts: () => void;
}

export const AfgSettingsView: React.FC<AfgSettingsViewProps> = (props) => (
  <AfgSettingsHub
    language={props.language}
    theme={props.theme}
    user={props.user}
    onSetLanguage={props.onSetLanguage}
    onToggleTheme={props.onToggleTheme}
    onSetTheme={props.onSetTheme}
    onOpenShortcuts={props.onOpenShortcuts}
  />
);
