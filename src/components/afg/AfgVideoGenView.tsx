import React from "react";
import MediaStudio from "../media/MediaStudio";
import type { Language } from "../../types/afg";
export const AfgVideoGenView: React.FC<{ language: Language }> = ({
  language,
}) => <MediaStudio language={language} initialType="video_analyze" />;
