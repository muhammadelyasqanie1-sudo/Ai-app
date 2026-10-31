import React, { useState, useRef } from 'react';
import { 
  Video, 
  Play, 
  Pause, 
  Download, 
  Sparkles, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Film,
  Maximize2
} from 'lucide-react';
import type { Language, GeneratedVideo, UserProfile } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgVideoGenViewProps {
  language: Language;
}

const SAMPLE_VIDEOS: GeneratedVideo[] = [
  {
    id: 'vid-1',
    prompt: 'Majestic eagle soaring over the snow-covered peaks of the Hindu Kush mountains at sunset',
    aspect: '16:9',
    duration: 5,
    thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    timestamp: Date.now() - 1000 * 60 * 60,
  },
  {
    id: 'vid-2',
    prompt: 'Golden hour drone panorama over the ancient Citadel of Herat and bazaar lights',
    aspect: '9:16',
    duration: 5,
    thumbnail: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    timestamp: Date.now() - 1000 * 60 * 180,
  },
  {
    id: 'vid-3',
    prompt: 'Pristine turquoise waters of Band-e Amir national park with water ripples in the sunlight',
    aspect: '1:1',
    duration: 5,
    thumbnail: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    timestamp: Date.now() - 1000 * 60 * 360,
  },
];

export const AfgVideoGenView: React.FC<AfgVideoGenViewProps> = ({
  language,
}) => {
  const t = translations[language];
  const [prompt, setPrompt] = useState(
    language === 'dari' 
      ? 'پرواز یک عقاب باشکوه بر فراز کوه‌های هندوکش هنگام غروب آفتاب با نمای سینمایی'
      : 'Cinematic drone shot flying through the Hindu Kush mountain pass at sunset'
  );
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<GeneratedVideo>(SAMPLE_VIDEOS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const aspectOptions: Array<'9:16' | '16:9' | '1:1'> = ['9:16', '16:9', '1:1'];

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    if (isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    setTimeout(() => {
      const newVideo: GeneratedVideo = {
        id: `vid-${Date.now()}`,
        prompt,
        aspect,
        duration: 5,
        thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        timestamp: Date.now(),
      };
      setCurrentVideo(newVideo);
      setIsGenerating(false);
    }, 3000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 animate-in fade-in duration-300">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-purple-400" />
            <span>{t.videoGenTitle}</span>
          </h1>
          <p className="text-xs sm:text-sm text-purple-300/80 mt-0.5">
            {t.videoGenSubtitle}
          </p>
        </div>
      </div>

      {/* Video Generation Studio Box */}
      <div className="p-4 sm:p-6 rounded-3xl bg-[#0e122b]/90 border border-purple-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.5)] space-y-4">
        
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {language === 'dari' ? 'توضیحات ویدیوی مورد نظر شما:' : 'Describe your video scene:'}
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.videoPromptPlaceholder}
            className="w-full rounded-2xl bg-slate-900/90 border border-purple-700/50 p-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all resize-none leading-relaxed"
          />
        </div>

        {/* Aspect Ratio Selector (9:16, 16:9, 1:1 - from Screenshot 2) */}
        <div>
          <span className="block text-xs font-semibold text-slate-400 mb-2">
            {language === 'dari' ? 'نسبت تصویر ویدیو:' : 'Video Aspect Ratio:'}
          </span>
          <div className="flex gap-2">
            {aspectOptions.map((asp) => (
              <button
                key={asp}
                onClick={() => setAspect(asp)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  aspect === asp
                    ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {asp}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Video Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-500 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(168,85,247,0.5)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{language === 'dari' ? 'در حال رندر و تولید فریم‌های ویدیو...' : 'Rendering video frames with AI...'}</span>
            </>
          ) : (
            <>
              <Film className="w-5 h-5" />
              <span>{t.btnGenerateVideo}</span>
            </>
          )}
        </button>

      </div>

      {/* Video Player & Showcase Box (Screenshot 2) */}
      <div className="p-4 sm:p-6 rounded-3xl bg-[#0e122b]/90 border border-purple-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.5)] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-purple-900/40">
          <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
            {language === 'dari' ? 'پخش ویدیو' : 'Video Player'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {currentVideo.duration}s • {currentVideo.aspect}
          </span>
        </div>

        {/* Responsive Video Container */}
        <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-purple-900/40 group max-h-[420px]">
          <video
            ref={videoRef}
            src={currentVideo.videoUrl}
            poster={currentVideo.thumbnail}
            loop
            muted={isMuted}
            className="w-full h-auto max-h-[420px] object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {/* Big Center Play Button Overlay (from Screenshot 2) */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-cyan-500/80 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_25px_rgba(0,229,255,0.7)] transition-all transform hover:scale-110"
            aria-label="Play Video"
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (videoRef.current) videoRef.current.muted = !isMuted;
            }}
            className="absolute bottom-4 right-4 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 italic px-1">
          "{currentVideo.prompt}"
        </p>
      </div>

      {/* My Videos Carousel (Screenshot 2) */}
      <div>
        <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
          <span>{t.myVideos}</span>
          <span className="text-xs text-purple-400 font-mono">({SAMPLE_VIDEOS.length})</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SAMPLE_VIDEOS.map((vid) => (
            <div
              key={vid.id}
              onClick={() => {
                setCurrentVideo(vid);
                setIsPlaying(false);
              }}
              className="relative rounded-xl overflow-hidden aspect-video cursor-pointer border border-purple-900/40 hover:border-purple-400/80 transition-all hover:scale-102 group"
            >
              <img
                src={vid.thumbnail}
                alt={vid.prompt}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                <div className="w-8 h-8 rounded-full bg-purple-500/80 text-white flex items-center justify-center shadow-md">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
