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
import type { Language, ChatAttachment } from '../../types/afg';
import { translations } from '../../utils/afgTranslations';

interface AfgChatInputCapsuleProps {
  onSendMessage: (text: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
  language: Language;
  availableModels: string[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  modelsLoading?: boolean;
}

export const AfgChatInputCapsule: React.FC<AfgChatInputCapsuleProps> = ({
  onSendMessage,
  disabled = false,
  language,
  availableModels,
  selectedModel,
  onSelectModel,
  modelsLoading = false,
}) => {
  const t = translations[language];
  const [inputText, setInputText] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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

  // Web Speech Recognition for voice input
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language === 'dari' ? 'fa-IR' : 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText((prev) => (prev ? prev + ' ' + transcript : transcript));
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [language]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert(language === 'dari' ? 'مرورگر شما از ورودی گفتار پشتیبانی نمی‌کند.' : 'Web Speech is not supported in this browser.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.lang = language === 'dari' ? 'fa-IR' : 'en-US';
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn('Speech start error', err);
      }
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

      {/* Attachment Popover Sheet (from Screenshot 1) */}
      {isMenuOpen && (
        <div 
          ref={menuRef}
          className="absolute -top-48 right-4 sm:right-6 z-50 w-72 sm:w-80 rounded-2xl bg-[#091126]/95 backdrop-blur-2xl border border-cyan-500/40 p-3 shadow-[0_15px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(0,229,255,0.25)] animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-900/40">
            <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              {t.attachModalTitle}
            </span>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Gallery */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/60 hover:bg-cyan-950/60 border border-slate-700/60 hover:border-cyan-500/50 text-slate-200 hover:text-cyan-300 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform text-cyan-400">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-center">{t.attachGallery}</span>
            </button>

            {/* Camera */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/60 hover:bg-cyan-950/60 border border-slate-700/60 hover:border-cyan-500/50 text-slate-200 hover:text-cyan-300 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform text-sky-400">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-center">{t.attachCamera}</span>
            </button>

            {/* Document / File */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/60 hover:bg-cyan-950/60 border border-slate-700/60 hover:border-cyan-500/50 text-slate-200 hover:text-cyan-300 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform text-indigo-400">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-center">{t.attachFile}</span>
            </button>

            {/* Link */}
            <button
              onClick={() => setLinkInputOpen(true)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/60 hover:bg-cyan-950/60 border border-slate-700/60 hover:border-cyan-500/50 text-slate-200 hover:text-cyan-300 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform text-teal-400">
                <LinkIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-center">{t.attachLink}</span>
            </button>
          </div>

          {/* Quick link input prompt */}
          {linkInputOpen && (
            <div className="mt-2.5 pt-2 border-t border-cyan-900/40 flex items-center gap-1.5">
              <input
                type="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-cyan-700/50 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleAddLink}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                +
              </button>
            </div>
          )}
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
          disabled={disabled || modelsLoading || availableModels.length === 0}
          aria-label={language === 'dari' ? 'انتخاب مدل هوش مصنوعی' : 'Select AI model'}
          className="min-w-0 max-w-[72%] rounded-xl border border-cyan-700/50 bg-slate-900 px-2.5 py-2 text-[11px] text-cyan-100 outline-none focus:border-cyan-400 disabled:opacity-60"
        >
          {availableModels.length === 0 ? (
            <option value="">{language === 'dari' ? 'مدل موجود نیست' : 'No models available'}</option>
          ) : availableModels.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
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
          className={`p-2 rounded-full transition-all ${
            isRecording
              ? 'bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-400'
              : 'text-slate-400 hover:text-cyan-300'
          }`}
          title={isRecording ? t.recording : 'Voice input'}
          aria-label="Voice input"
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

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
          AFG AI Core 3.8
        </div>
      </div>

    </div>
  );
};
