import React, { useState, useRef, useEffect } from 'react';
import { Send, Image, Mic, Sparkles } from 'lucide-react';
import Message from './Message';
import { ChatMessage } from '@/types/chat';

interface ChatInterfaceProps {
  sidebarOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onRegenerate: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  sidebarOpen, 
  messages, 
  isLoading, 
  onSendMessage,
  onRegenerate
}) => {
  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(messages.length);
  const isUserAtBottomRef = useRef(true); // Track if user is at bottom

  // Safe messages array
  const safeMessages = Array.isArray(messages) ? messages : [];

  // Handle Scroll Events to track user position
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Increased threshold to 200px to be more forgiving
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 200;
    isUserAtBottomRef.current = isAtBottom;
  };

  // Robust auto-scroll logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNewMessage = safeMessages.length > prevMessagesLength.current;
    prevMessagesLength.current = safeMessages.length;

    const scrollToBottom = () => {
        container.scrollTop = container.scrollHeight;
    };

    if (isNewMessage) {
      // New message: Always snap to bottom
      isUserAtBottomRef.current = true;
      // Use requestAnimationFrame for better timing with React renders
      requestAnimationFrame(scrollToBottom);
    } else if (isUserAtBottomRef.current) {
      // Streaming update: Keep pinned
      // We use requestAnimationFrame to ensure we scroll AFTER the content paint
      requestAnimationFrame(scrollToBottom);
    }
  }, [safeMessages]);

  // Handle Resize (e.g., thinking block expanding) to keep pinned
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // If user was at bottom, keep them at bottom when content resizes
      if (isUserAtBottomRef.current) {
         container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []); // Remove dependency on isLoading to always respect "at bottom" state

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-full transition-all duration-300 ${sidebarOpen ? 'ml-[280px]' : 'ml-[68px]'} bg-[#131314]`}>
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pt-8 pb-32"
      >
        {safeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#e3e3e3] p-8">
            <div className="w-12 h-12 mb-4 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center animate-pulse">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-medium mb-2 bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
              Hello, User
            </h1>
            <p className="text-2xl text-gray-500 font-medium">How can I help you today?</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {safeMessages.map((msg, idx) => (
              <Message 
                key={idx} 
                role={msg.role} 
                text={msg.text} 
                isLast={idx === safeMessages.length - 1}
                isStreaming={isLoading && idx === safeMessages.length - 1}
                onRegenerate={onRegenerate}
              />
            ))}
            {isLoading && (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'model' || !safeMessages[safeMessages.length - 1].text) && (
              <div className="flex gap-4 w-full max-w-4xl mx-auto p-4">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center animate-pulse">
                   <Sparkles className="w-4 h-4 text-white" />
                 </div>
                 <div className="flex items-center">
                   <span className="text-gray-400 animate-pulse">Thinking...</span>
                 </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`fixed bottom-0 right-0 p-4 bg-[#131314] transition-all duration-300 ${sidebarOpen ? 'left-[280px]' : 'left-[68px]'}`}>
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#1e1f20] rounded-3xl p-2 flex items-center gap-2 border border-[#444746]">
            <button className="p-2 rounded-full hover:bg-[#333537] transition-colors text-gray-400">
              <Image className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a prompt here"
              className="flex-1 bg-transparent border-none outline-none text-[#e3e3e3] placeholder-gray-500 p-2"
              disabled={isLoading}
            />
            {input.trim() ? (
              <button 
                onClick={handleSend}
                disabled={isLoading}
                className={`p-2 rounded-full transition-colors ${isLoading ? 'bg-[#333537] text-gray-500' : 'bg-white text-black hover:bg-gray-200'}`}
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button className="p-2 rounded-full hover:bg-[#333537] transition-colors text-gray-400">
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-xs text-center text-gray-500 mt-2">
            Gemini may display inaccurate info, including about people, so double-check its responses.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
