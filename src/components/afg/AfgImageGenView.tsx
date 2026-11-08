import React from "react";
import MediaStudio from "../media/MediaStudio";
import type { AfgModelOption, Language } from "../../types/afg";
export const AfgImageGenView: React.FC<{
  language: Language;
  selectedModel?: string;
  modelOptions?: AfgModelOption[];
}> = ({ language, selectedModel }) => (
  <MediaStudio
    language={language}
    initialModel={selectedModel === "auto" ? "" : selectedModel}
  />
);
