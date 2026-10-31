import React, { useState } from 'react';
import { 
  Sparkles, 
  Download, 
  Share2, 
  Bookmark, 
  BookmarkCheck, 
  RefreshCw, 
  Sliders, 
  Maximize2,
  Wand2,
  Check
} from 'lucide-react';
import type { Language, GeneratedImage } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgImageGenViewProps {
  language: Language;
}

const SAMPLE_CREATIONS: GeneratedImage[] = [
  {
    id: 'img-1',
    prompt: 'Pamir mountains with pristine turquoise glacial lake and spring cherry blossoms in Afghanistan',
    promptDari: 'یک کوهستان زیبا در افغانستان با برف و آسمان آبی و دریاچه فیروزه‌ای',
    style: 'Realistic',
    aspect: '16:9',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    timestamp: Date.now() - 1000 * 60 * 30,
    saved: true,
  },
  {
    id: 'img-2',
    prompt: 'Historic Afghan citadel of Herat with golden sunset light and intricate tile mosaics',
    promptDari: 'قلعه تاریخی هرات هنگام غروب آفتاب با کاشی‌کاری‌های لاجوردی',
    style: 'HD',
    aspect: '1:1',
    url: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80',
    timestamp: Date.now() - 1000 * 60 * 120,
    saved: false,
  },
  {
    id: 'img-3',
    prompt: 'Kabul Babur gardens with blooming roses, fountains and snowcapped peaks backdrop',
    promptDari: 'باغ بابر کابل با گل‌های سرخ، فواره‌ها و نمایی از کوه‌های پربرف',
    style: 'Art',
    aspect: '16:9',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
    timestamp: Date.now() - 1000 * 60 * 300,
    saved: true,
  },
  {
    id: 'img-4',
    prompt: 'Cyberpunk futuristic Kabul 2088 with neon Afghan calligraphy and flying solar shuttles',
    promptDari: 'کابل در سال ۲۰۸۸ به سبک سایبرپانک با خطاطی‌های نئونی',
    style: 'Anime',
    aspect: '1:1',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    timestamp: Date.now() - 1000 * 60 * 600,
    saved: false,
  },
];

export const AfgImageGenView: React.FC<AfgImageGenViewProps> = ({
  language,
}) => {
  const t = translations[language];
  const [prompt, setPrompt] = useState(
    language === 'dari' 
      ? 'یک کوهستان زیبا در افغانستان با برف و آسمان آبی و انعکاس در آب'
      : 'A majestic mountain valley in Afghanistan with snow peaks and crystal blue sky'
  );
  const [selectedStyle, setSelectedStyle] = useState<'HD' | 'Anime' | 'Realistic' | 'Art' | '3D Render'>('Realistic');
  const [selectedAspect, setSelectedAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage>(SAMPLE_CREATIONS[0]);
  const [creations, setCreations] = useState<GeneratedImage[]>(SAMPLE_CREATIONS);
  const [copiedLink, setCopiedLink] = useState(false);

  const styles: Array<'HD' | 'Anime' | 'Realistic' | 'Art' | '3D Render'> = ['HD', 'Anime', 'Realistic', 'Art', '3D Render'];
  const aspectRatios: Array<'1:1' | '16:9' | '9:16' | '4:3'> = ['1:1', '16:9', '9:16', '4:3'];

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    // Dynamic Afghan landscape selection or curated visual for generation
    const mockImages = [
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    ];

    setTimeout(() => {
      const randomImg = mockImages[Math.floor(Math.random() * mockImages.length)];
      const newCreation: GeneratedImage = {
        id: `gen-${Date.now()}`,
        prompt,
        promptDari: prompt,
        style: selectedStyle,
        aspect: selectedAspect,
        url: randomImg,
        timestamp: Date.now(),
        saved: true,
      };

      setCurrentImage(newCreation);
      setCreations(prev => [newCreation, ...prev]);
      setIsGenerating(false);
    }, 2200);
  };

  const handleToggleSave = (id: string) => {
    setCreations(prev => prev.map(item => item.id === id ? { ...item, saved: !item.saved } : item));
    if (currentImage.id === id) {
      setCurrentImage(prev => ({ ...prev, saved: !prev.saved }));
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentImage.url;
    a.download = `afg-ai-image-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(currentImage.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span>{t.imgGenTitle}</span>
          </h1>
          <p className="text-xs sm:text-sm text-cyan-300/80 mt-0.5">
            {t.imgGenSubtitle}
          </p>
        </div>

      </div>

      {/* Main Studio Controls Box */}
      <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.5)] space-y-4">
        
        {/* Prompt Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {language === 'dari' ? 'توضیح تصویر مورد نظر:' : 'Describe the image you want to create:'}
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.imgPromptPlaceholder}
            className="w-full rounded-2xl bg-slate-900/90 border border-cyan-700/50 p-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all resize-none leading-relaxed"
          />
        </div>

        {/* Style Chips (HD, Anime, Realistic, Art, 3D Render - from Screenshot 2) */}
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-2">
            {t.imgStyle}
          </span>
          <div className="flex flex-wrap gap-2">
            {styles.map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(style)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedStyle === style
                    ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-[0_0_15px_rgba(0,229,255,0.4)] scale-103'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-2">
            {t.imgAspect}
          </span>
          <div className="flex flex-wrap gap-2">
            {aspectRatios.map((aspect) => (
              <button
                key={aspect}
                onClick={() => setSelectedAspect(aspect)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedAspect === aspect
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-400 font-bold'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                {aspect}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-3.5 rounded-2xl gradient-btn-cyan text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(0,210,255,0.5)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{language === 'dari' ? 'در حال خلق تصویر با هوش مصنوعی...' : 'Generating Image with AI...'}</span>
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              <span>{t.btnGenerateImage}</span>
            </>
          )}
        </button>

      </div>

      {/* Generated Result Showcase Card (Matching Screenshot 2 & 4) */}
      <div className="p-4 sm:p-6 rounded-3xl bg-[#09122c]/90 border border-cyan-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.5)] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40">
          <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
            {language === 'dari' ? 'پیش‌نمایش تصویر تولید شده' : 'AI Generation Output'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {currentImage.style} • {currentImage.aspect}
          </span>
        </div>

        {/* Image Preview Box */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-cyan-900/50 group">
          <img
            src={currentImage.url}
            alt={currentImage.prompt}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
            <p className="text-xs text-white line-clamp-2">
              {currentImage.prompt}
            </p>
          </div>
        </div>

        {/* Action Buttons (Download, Share, Save - Matching Screenshot 4) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1">
          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-cyan-950/60 border border-cyan-500/30 text-xs sm:text-sm font-semibold text-cyan-200 hover:text-white transition-all"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>{t.download}</span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-cyan-950/60 border border-cyan-500/30 text-xs sm:text-sm font-semibold text-cyan-200 hover:text-white transition-all"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-sky-400" />}
            <span>{copiedLink ? t.copied : t.share}</span>
          </button>

          {/* Save */}
          <button
            onClick={() => handleToggleSave(currentImage.id)}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all ${
              currentImage.saved
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {currentImage.saved ? <BookmarkCheck className="w-4 h-4 text-amber-400" /> : <Bookmark className="w-4 h-4" />}
            <span>{t.save}</span>
          </button>
        </div>
      </div>

      {/* My Creations Carousel (Screenshot 2 & 4) */}
      <div>
        <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
          <span>{t.myCreations}</span>
          <span className="text-xs text-cyan-400 font-mono">({creations.length})</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {creations.map((item) => (
            <div
              key={item.id}
              onClick={() => setCurrentImage(item)}
              className={`relative rounded-xl overflow-hidden aspect-video cursor-pointer border transition-all ${
                currentImage.id === item.id
                  ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-102 shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                  : 'border-cyan-900/40 hover:border-cyan-500/60 hover:scale-102'
              }`}
            >
              <img
                src={item.url}
                alt={item.prompt}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-end">
                <span className="text-[10px] text-white font-medium truncate">
                  {language === 'dari' ? item.promptDari || item.prompt : item.prompt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
