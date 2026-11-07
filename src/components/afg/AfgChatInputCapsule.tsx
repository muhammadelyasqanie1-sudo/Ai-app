import { AudioWaveform } from '../jarvis/AudioWaveform';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Send, 
  Smile, 
  Mic, 
  MicOff, 
  Image as ImageIcon, 
  Camera, 
  FileText, 
  Link as LinkIcon, 
  X,
  Sparkles,
  Paperclip,
  Square
} from 'lucide-react';
import type { Language, ChatAttachment, AfgModelOption } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';
import { AfgModelSelector } from './AfgModelSelector';
import { formatFileSize } from '../../utils/i18n';

interface AfgChatInputCapsuleProps {
  onSendMessage: (text: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
  language: Language;
  availableModels: string[];
  modelOptions: AfgModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  modelsLoading?: boolean;
  speechToTextAvailable?: boolean;
  fileUploadEnabled?: boolean;
  isLoading?: boolean;
  onRecordingChange?: (active: boolean) => void;
  onStop: () => void;
  thinkingLevel?: 'minimal' | 'standard' | 'deep';
  planMode?: boolean;
  permissionLevel?: 'ask' | 'guided' | 'full';
}

export const AfgChatInputCapsule: React.FC<AfgChatInputCapsuleProps> = ({
  onSendMessage,
  disabled = false,
  language,
  availableModels,
  modelOptions,
  selectedModel,
  onSelectModel,
  modelsLoading = false,
  speechToTextAvailable = false,
  fileUploadEnabled = false,
  isLoading = false,
  onRecordingChange,
  onStop,
  thinkingLevel = 'standard',
  planMode = false,
  permissionLevel = 'guided',
}) => {
  const t = translations[language];
  // Keep an unsent draft on this device so navigation, reloads or a temporary
  // network interruption do not silently erase what the user was writing.
  const [inputText, setInputText] = useState(() => {
    try { return (localStorage.getItem('afg_chat_draft_v1') || '').slice(0, 20_000); }
    catch { return ''; }
  });
  useEffect(() => {
    try {
      if (inputText.trim()) localStorage.setItem('afg_chat_draft_v1', inputText.slice(0, 20_000));
      else localStorage.removeItem('afg_chat_draft_v1');
    } catch { /* Draft persistence is best-effort when device storage is unavailable. */ }
  }, [inputText]);
  useEffect(() => {
    const clearPrivateDraft = () => {
      setInputText('');
      try { localStorage.removeItem('afg_chat_draft_v1'); } catch { /* Ignore unavailable storage. */ }
    };
    window.addEventListener('afg-signout', clearPrivateDraft);
    return () => window.removeEventListener('afg-signout', clearPrivateDraft);
  }, []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  useEffect(() => { onRecordingChange?.(isRecording); return () => onRecordingChange?.(false); }, [isRecording, onRecordingChange]);
  const [voiceEnabled,setVoiceEnabled]=useState(()=>localStorage.getItem('afg_voice_enabled')!=='false');
  const voiceAvailable=voiceEnabled&&speechToTextAvailable;
  useEffect(()=>{const sync=()=>setVoiceEnabled(localStorage.getItem('afg_voice_enabled')!=='false');window.addEventListener('afg-voice-preference-change',sync);window.addEventListener('afg-preferences-change',sync);return()=>{window.removeEventListener('afg-voice-preference-change',sync);window.removeEventListener('afg-preferences-change',sync);};},[]);
  const [voiceRecordingError, setVoiceRecordingError] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Dismiss composer popovers on outside touch/click and Escape.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !attachmentButtonRef.current?.contains(target)) setIsMenuOpen(false);
      if (showEmojiPicker &&
          !emojiPickerRef.current?.contains(target) &&
          !emojiButtonRef.current?.contains(target)) {
        setShowEmojiPicker(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
      setShowEmojiPicker(false);
      setLinkInputOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEmojiPicker, isMenuOpen, linkInputOpen]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingConsent = useRef<{ transcribe: boolean } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  useEffect(()=>{if(!voiceEnabled&&isRecording){if(recordingConsent.current)recordingConsent.current.transcribe=false;if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();mediaStreamRef.current?.getTracks().forEach(track=>track.stop());mediaStreamRef.current=null;setIsRecording(false);}},[voiceEnabled,isRecording]);

  useEffect(() => () => {
    if (recordingConsent.current) recordingConsent.current.transcribe = false;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const toggleRecording = async () => {
    if (!voiceAvailable) return;
    if (isRecording) {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      setVoiceRecordingError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };
      const consent = { transcribe: true };
      recordingConsent.current = consent;
      recorder.onerror = () => {
        consent.transcribe = false;
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        setVoiceRecordingError(language === 'dari' ? 'ضبط صدا ناموفق بود.' : 'Audio recording failed.');
        setIsRecording(false);
      };
      recorder.onstop = () => {
        setIsRecording(false);
        const permitted = consent.transcribe;
        consent.transcribe = false;
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (!blob.size || !permitted) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = String(reader.result || '');
            const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/transcribe', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mimeType: blob.type || 'audio/webm', audioBase64: dataUrl.split(',')[1] || '', language: language === 'dari' ? 'fa' : 'en' }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Speech recognition failed.');
            if (typeof data.text === 'string' && data.text.trim()) setInputText((previous) => previous ? previous + ' ' + data.text.trim() : data.text.trim());
          } catch (error) {
            setVoiceRecordingError(error instanceof Error ? error.message : 'Speech recognition failed.');
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setVoiceRecordingError(language === 'dari' ? 'دسترسی به میکروفون ممکن نیست.' : 'Microphone access is unavailable.');
      setIsRecording(false);
    }
  };

  const handleSend = () => {
    if (disabled || isLoading) return;
    const trimmed = inputText.trim();
    if (!trimmed && attachments.length === 0) return;
    onSendMessage(trimmed, attachments);
    setInputText('');
    setAttachments([]);
    setIsMenuOpen(false);
    setLinkInputOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'gallery' | 'file' | 'camera') => {
    const file = e.target.files?.[0];
    if (file) {
      const newAtt: ChatAttachment = {
        type,
        name: file.name,
        size: formatFileSize(file.size, language),
        url: URL.createObjectURL(file),
      };
      setAttachments((prev) => [...prev, newAtt]);
      setIsMenuOpen(false);
    }
  };

  const handleAddLink = () => {
    if (linkUrl.trim()) {
      setAttachments((prev) => [
        ...prev,
        {
          type: 'link',
          name: linkUrl.trim(),
          url: linkUrl.trim(),
        },
      ]);
      setLinkUrl('');
      setLinkInputOpen(false);
      setIsMenuOpen(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Popular Afghan & General Emojis
  const quickEmojis = ['🇦🇫', '❤️', '👋', '✨', '💡', '🤖', '🔥', '👍', '🌺', '🚀'];

  // Token estimate: approx 4 chars per token
  const charCount = inputText.length;
  const tokenEstimate = Math.ceil(charCount / 4);

  return (
    <div className="afg-composer-shell w-full max-w-4xl mx-auto relative px-2 sm:px-4">
      
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'gallery')}
        accept="image/*,video/*,.pdf,.doc,.docx,.txt"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'camera')}
      />

      {/* File selection stays disabled until a verified upload endpoint is configured. */}
      {isMenuOpen && (
        <div ref={menuRef} className="absolute -top-24 right-4 z-50 w-72 rounded-2xl bg-[#091126]/95 border border-amber-500/40 p-4 shadow-xl">
          <p className="text-xs leading-6 text-amber-100">
            {language === 'dari' ? 'بارگذاری فایل، تصویر و لینک هنوز به سرور وصل نیست؛ فعلاً فقط پیام متنی ارسال می‌شود.' : 'File, image, and link uploads are not connected to the server yet. Text messages only are supported.'}
          </p>
        </div>
      )}

      {/* Attachments Preview Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-cyan-500/30 text-xs text-cyan-200"
            >
              <Paperclip className="w-3 h-3 text-cyan-400" />
              <span className="truncate max-w-[150px]">{att.name}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="p-0.5 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute -top-12 left-14 z-40 flex items-center gap-1 p-1.5 rounded-xl bg-slate-900/95 border border-cyan-600/40 backdrop-blur-md shadow-xl">
          {quickEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                setInputText((prev) => prev + emoji);
                setShowEmojiPicker(false);
              }}
              className="p-1 hover:scale-125 transition-transform text-base"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Compact Claude-inspired model trigger with grouped bottom sheet. */}
      <div className="afg-model-chip flex items-center justify-between gap-2 px-3 py-1.5 mb-2 rounded-full border">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-xs font-semibold">{language === 'dari' ? 'مدل' : 'Model'}</span>{(planMode || thinkingLevel !== 'standard') && <span className="rounded-full border px-2 py-1 text-[9px] font-semibold">{planMode ? (language === 'dari' ? 'برنامه‌ریزی' : 'Plan mode') : '🧠 ' + thinkingLevel}</span>}</div>
        <AfgModelSelector models={modelOptions} selectedModel={selectedModel} onSelect={onSelectModel} language={language} loading={modelsLoading} />
      </div>

      {/* The Signature AFG AI Capsule Input Container (Matching Screenshot 1) */}
      <div className="relative flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-full bg-[#08112b]/90 border border-cyan-500/40 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_rgba(0,229,255,0.18)] focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(0,229,255,0.35)] transition-all">
        
        {/* Big '+' Attachment Button (Left in LTR, Right in RTL or consistent with Screenshot 1) */}
        <button
          ref={attachmentButtonRef}
          type="button"
          onClick={() => { if (fileUploadEnabled) setIsMenuOpen(!isMenuOpen); }}
          aria-expanded={isMenuOpen}
          disabled={!fileUploadEnabled}
          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center shrink-0 transition-all ${
            isMenuOpen
              ? 'bg-gradient-to-tr from-cyan-400 to-sky-300 text-slate-950 rotate-45 shadow-[0_0_20px_#00e5ff]'
              : fileUploadEnabled ? 'bg-gradient-to-b from-[#00b4d8] to-[#0077b6] text-white hover:from-[#48cae4] hover:to-[#0096c7] shadow-[0_4px_15px_rgba(0,180,216,0.5)] active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
          }`}
          title={fileUploadEnabled ? t.attachModalTitle : (language === 'dari' ? 'بارگذاری فایل هنوز توسط مدیر فعال نشده است' : 'File uploads are not enabled by the administrator')}
          aria-label="Add Attachment"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Input Text Area */}
        <div className="flex-1 flex items-center min-w-0 px-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              // auto grow up to 100px
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.chatPlaceholder}
            disabled={disabled}
            className="w-full bg-transparent resize-none text-slate-100 placeholder-slate-400/80 text-sm sm:text-base focus:outline-none max-h-24 py-1.5 leading-relaxed"
          />
        </div>

        {/* Emoji Button */}
        <button
          ref={emojiButtonRef}
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          aria-expanded={showEmojiPicker}
          className="p-2 text-slate-400 hover:text-amber-300 hover:scale-110 transition-all"
          title="Emoji"
          aria-label="Add Emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Voice Speech-to-Text Button */}
        {voiceAvailable && <button
          type="button"
          onClick={toggleRecording}
          disabled={!voiceAvailable}
          className={`p-2 rounded-full transition-all ${
            isRecording
              ? 'bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-400'
              : voiceAvailable ? 'text-slate-400 hover:text-cyan-300' : 'text-slate-700 cursor-not-allowed opacity-40'
          }`}
          title={!voiceEnabled ? (language === 'dari' ? 'قابلیت صوتی در تنظیمات غیرفعال است' : 'Voice is disabled in settings') : (!speechToTextAvailable ? (language === 'dari' ? 'ارائه‌دهنده گفتار به متن در دسترس نیست' : 'No verified speech-to-text provider is available') : (isRecording ? t.recording : 'Voice input'))}
          aria-label="Voice input"
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>}
        {voiceRecordingError && <span className="max-w-28 text-[10px] text-rose-300">{voiceRecordingError}</span>}

        {/* Big Gradient Send Pill Button ("ارسال" / "Send") - The Signature Feature in Screenshot 1 */}
        <button
          type="button"
          onClick={isLoading ? onStop : handleSend}
          disabled={!isLoading && (disabled || (!inputText.trim() && attachments.length === 0))}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm sm:text-base shrink-0 transition-all ${
            isLoading ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40' : !inputText.trim() && attachments.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              : 'gradient-btn-cyan hover:scale-103 active:scale-97 cursor-pointer'
          }`}
          title={isLoading ? (language === 'dari' ? 'توقف تولید' : 'Stop generation') : t.send}
          aria-label={isLoading ? 'Stop generation' : 'Send Message'}
        >
          {isLoading ? <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Send className={`w-4 h-4 sm:w-5 sm:h-5 ${language === 'dari' ? 'rotate-180' : ''}`} />}
          <span className="font-extrabold tracking-wide">{isLoading ? (language === 'dari' ? 'توقف' : 'Stop') : t.send}</span>
        </button>

      </div>

      {isRecording && <AudioWaveform stream={mediaStreamRef.current} language={language}/>}
      {/* Transparent Character & Token Counter (fulfills user request #8) */}
      {!fileUploadEnabled && <p className="px-4 mt-1 text-[10px] text-slate-500">{language === 'dari' ? 'بارگذاری فایل تا زمان فعال‌سازی ذخیره‌سازی سرور غیرفعال است.' : 'File uploads are unavailable until server storage is enabled.'}</p>}
      <div className="flex items-center justify-between px-4 mt-1.5 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>{charCount} chars</span>
          <span>•</span>
          <span>~{tokenEstimate} tokens</span>
        </div>
        <div className="text-[10px] text-cyan-400/70 font-medium">
          {selectedModel || (language === 'dari' ? 'مدل تأییدشده موجود نیست' : 'No verified model available')}
        </div>
      </div>

    </div>
  );
};
