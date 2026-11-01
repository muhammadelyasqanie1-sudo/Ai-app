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
  Paperclip
} from 'lucide-react';
import type { Language, ChatAttachment, AfgModelOption } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

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
}) => {
  const t = translations[language];
  const [inputText, setInputText] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceRecordingError, setVoiceRecordingError] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Close popup menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const toggleRecording = async () => {
    if (!speechToTextAvailable) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
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
      recorder.onerror = () => {
        setVoiceRecordingError(language === 'dari' ? 'ضبط صدا ناموفق بود.' : 'Audio recording failed.');
        setIsRecording(false);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (!blob.size) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = String(reader.result || '');
            const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/voice/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mimeType: blob.type || 'audio/webm', audioBase64: dataUrl.split(',')[1] || '' }),
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
      setVoiceRecordingError(language === 'dari' ? 'دسترسی به میکروفون ممکن نیست.' : 'Microphone access is unavailable.');
      setIsRecording(false);
    }
  };

  const handleSend = () => {
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
    if (e.key === 'Enter' && !e.shiftKey) {
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
        size: `${(file.size / 1024).toFixed(1)} KB`,
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
    <div className="w-full max-w-4xl mx-auto relative px-2 sm:px-4">
      
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

      {/* Attachments are disabled until upload, storage, and model handling exist. */}
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
        <div className="absolute -top-12 left-14 z-40 flex items-center gap-1 p-1.5 rounded-xl bg-slate-900/95 border border-cyan-600/40 backdrop-blur-md shadow-xl">
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

      {/* Model picker stays with the composer so the active model is always visible. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-2xl bg-[#08112b]/90 border border-cyan-500/30">
        <span className="text-xs text-cyan-300 font-semibold">{language === 'dari' ? 'مدل هوش مصنوعی' : 'AI model'}</span>
        <select
          value={selectedModel}
          onChange={(event) => onSelectModel(event.target.value)}
          disabled={modelsLoading || (availableModels.length === 0 && modelOptions.length === 0)}
          aria-label={language === 'dari' ? 'انتخاب مدل هوش مصنوعی' : 'Select AI model'}
          className="min-w-0 max-w-[72%] rounded-xl border border-cyan-700/50 bg-slate-900 px-2.5 py-2 text-[11px] text-cyan-100 outline-none focus:border-cyan-400 disabled:opacity-60"
        >
          {modelOptions.length > 0 ? <>
            <option value="auto">{language === 'dari' ? 'خودکار — ارزان‌ترین مدل قیمت‌گذاری‌شده؛ در غیر آن مدل سالم پیش‌فرض' : 'Auto — lowest priced when configured; otherwise healthy default'}</option>
            {[...new Set(modelOptions.map((model) => model.providerId))].map((providerId) => (
              <optgroup key={providerId} label={providerId}>
                {modelOptions.filter((model) => model.providerId === providerId).map((model) => (
                  <option key={providerId + ':' + model.id} value={model.providerId + '::' + model.id} disabled={!model.selectable} title={model.selectable ? model.displayName : (model.disabledReason || 'Provider not reachable.')}>
                    {model.displayName} · {Object.entries(model.capabilities || {}).filter(([, enabled]) => enabled).map(([capability]) => capability).join(', ')}{model.selectable ? '' : ' — ' + (model.disabledReason || 'Provider not reachable.')}
                  </option>
                ))}
              </optgroup>
            ))}
          </> : availableModels.length > 0 ? <>
            <option value="auto">Auto — lowest-cost healthy model</option>
            {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
          </> : (
            <option value="">{language === 'dari' ? 'مدل موجود نیست' : 'No models available'}</option>
          )}
        </select>
      </div>

      {/* The Signature AFG AI Capsule Input Container (Matching Screenshot 1) */}
      <div className="relative flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-full bg-[#08112b]/90 border border-cyan-500/40 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_rgba(0,229,255,0.18)] focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(0,229,255,0.35)] transition-all">
        
        {/* Big '+' Attachment Button (Left in LTR, Right in RTL or consistent with Screenshot 1) */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center shrink-0 transition-all ${
            isMenuOpen
              ? 'bg-gradient-to-tr from-cyan-400 to-sky-300 text-slate-950 rotate-45 shadow-[0_0_20px_#00e5ff]'
              : 'bg-gradient-to-b from-[#00b4d8] to-[#0077b6] text-white hover:from-[#48cae4] hover:to-[#0096c7] shadow-[0_4px_15px_rgba(0,180,216,0.5)] active:scale-95'
          }`}
          title={t.attachModalTitle}
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
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-2 text-slate-400 hover:text-amber-300 hover:scale-110 transition-all"
          title="Emoji"
          aria-label="Add Emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Voice Speech-to-Text Button */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={!speechToTextAvailable}
          className={`p-2 rounded-full transition-all ${
            isRecording
              ? 'bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-400'
              : speechToTextAvailable ? 'text-slate-400 hover:text-cyan-300' : 'text-slate-700 cursor-not-allowed opacity-40'
          }`}
          title={!speechToTextAvailable ? (language === 'dari' ? 'ارائه‌دهنده گفتار به متن در دسترس نیست' : 'No verified speech-to-text provider is available') : (isRecording ? t.recording : 'Voice input')}
          aria-label="Voice input"
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        {voiceRecordingError && <span className="max-w-28 text-[10px] text-rose-300">{voiceRecordingError}</span>}

        {/* Big Gradient Send Pill Button ("ارسال" / "Send") - The Signature Feature in Screenshot 1 */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || (!inputText.trim() && attachments.length === 0)}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm sm:text-base shrink-0 transition-all ${
            !inputText.trim() && attachments.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              : 'gradient-btn-cyan hover:scale-103 active:scale-97 cursor-pointer'
          }`}
          title={t.send}
          aria-label="Send Message"
        >
          <Send className={`w-4 h-4 sm:w-5 sm:h-5 ${language === 'dari' ? 'rotate-180' : ''}`} />
          <span className="font-extrabold tracking-wide">{t.send}</span>
        </button>

      </div>

      {/* Transparent Character & Token Counter (fulfills user request #8) */}
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
