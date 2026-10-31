import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  Paperclip,
  Globe,
  Brain,
  Mic,
  MicOff,
  X,
  FileCode,
  Image as ImageIcon,
} from 'lucide-react';

interface AttachmentFile {
  name: string;
  type: string;
  url?: string;
  size: number;
}

interface ChatInputProps {
  onSendMessage: (message: string, options: { webSearch: boolean; reasoning: boolean; attachments: AttachmentFile[] }) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  disabled,
}) => {
  const [text, setText] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;

    onSendMessage(text.trim(), { webSearch, reasoning, attachments });
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: AttachmentFile[] = [];
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/');
      newAttachments.push({
        name: file.name,
        type: file.type,
        url: isImg ? URL.createObjectURL(file) : undefined,
        size: file.size,
      });
    });

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Simulate quick dictation speech test
      if (!isRecording) {
        setIsRecording(true);
        setTimeout(() => {
          setText((prev) => (prev ? prev + ' Explain the latest news' : 'Explain the latest news'));
          setIsRecording(false);
        }, 1500);
      }
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const canSubmit = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-3 pt-2">
      <div className="relative rounded-3xl bg-[#f4f4f4] dark:bg-[#2f2f2f] border border-neutral-200/80 dark:border-neutral-700/80 shadow-md focus-within:border-neutral-400 dark:focus-within:border-neutral-500 transition-all p-3">
        {/* Attachment preview pills */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-1">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1e1e1e] border border-neutral-300 dark:border-neutral-700 text-xs shadow-2xs"
              >
                {att.url ? (
                  <img src={att.url} alt={att.name} className="w-5 h-5 rounded object-cover" />
                ) : att.name.endsWith('.ts') || att.name.endsWith('.js') || att.name.endsWith('.py') ? (
                  <FileCode className="w-4 h-4 text-blue-500" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                )}
                <span className="max-w-[140px] truncate font-medium text-neutral-800 dark:text-neutral-200">
                  {att.name}
                </span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  aria-label="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          disabled={disabled}
          className="w-full max-h-52 bg-transparent text-[15px] leading-relaxed text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 border-none outline-none resize-none px-1 py-1 font-sans"
          aria-label="Chat input"
        />

        {/* Bottom controls bar */}
        <div className="flex items-center justify-between pt-2 mt-1">
          {/* Left tools pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              aria-label="Upload files"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700/80 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              aria-label="Attach files"
              title="Attach files or images"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Web Search toggle */}
            <button
              type="button"
              onClick={() => setWebSearch((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                webSearch
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700/80'
              }`}
              aria-label="Toggle web search"
              title="Search the web for real-time information"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>

            {/* Reason toggle */}
            <button
              type="button"
              onClick={() => setReasoning((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                reasoning
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700/80'
              }`}
              aria-label="Toggle reasoning"
              title="Think deeply step-by-step"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Reason</span>
            </button>
          </div>

          {/* Right action buttons: Mic & Send */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700/80'
              }`}
              aria-label={isRecording ? 'Stop recording voice' : 'Voice input'}
              title="Voice dictation"
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="w-8 h-8 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                aria-label="Stop generating response"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!canSubmit}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                  canSubmit
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90'
                    : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed'
                }`}
                aria-label="Send message"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="text-center text-[11px] text-neutral-400 dark:text-neutral-500 mt-2 select-none">
        ChatGPT can make mistakes. Check important info.
      </div>
    </div>
  );
};
