'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';
import { ChatSession, ChatMessage } from '@/types/chat';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
        // Do NOT automatically load the first chat. Start fresh or let user choose.
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(history));
  }, [history]);

  const createNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
  };

  const selectChat = (id: string) => {
    const session = history.find(s => s.id === id);
    if (session) {
      setCurrentChatId(session.id);
      setMessages(session.messages);
    }
  };

  const deleteChat = (id: string) => {
    const newHistory = history.filter(s => s.id !== id);
    setHistory(newHistory);
    
    // If deleted chat was active, reset to new chat state
    if (currentChatId === id) {
      setCurrentChatId(null);
      setMessages([]);
    }
  };

  const handleSendMessage = async (text: string) => {
    const userMessage: ChatMessage = { role: 'user', text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    let chatId = currentChatId;
    let newHistory = [...history];

    // If this is the first message of a new chat, create the session
    if (!chatId) {
      chatId = uuidv4();
      const newSession: ChatSession = {
        id: chatId,
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: newMessages,
        createdAt: Date.now(),
      };
      newHistory = [newSession, ...newHistory];
      setCurrentChatId(chatId);
    } else {
      // Update existing session
      const index = newHistory.findIndex(s => s.id === chatId);
      if (index !== -1) {
        newHistory[index] = { ...newHistory[index], messages: newMessages };
      }
    }
    setHistory(newHistory);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If JSON parse fails, use status text (e.g. for 504 Gateway Timeout from tunnel)
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      let accumulatedResponse = '';
      
      // Add initial empty bot message
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedResponse += chunk;
        
        setMessages(prev => {
            const updated = [...prev];
            // Update the last message (which is the bot message)
            if (updated.length > 0) {
                 updated[updated.length - 1] = { ...updated[updated.length - 1], text: accumulatedResponse };
            }
            return updated;
        });
      }

      // Update history with final complete message
      const finalMessages = [...newMessages, { role: 'model', text: accumulatedResponse }];
      const finalHistory = newHistory.map(session => 
        session.id === chatId 
          ? { ...session, messages: finalMessages } 
          : session
      );
      setHistory(finalHistory);

    } catch (error: any) {
      console.error('Error:', error);
      
      let errorMessage = error.message;
      let errorTitle = 'Error';
      let troubleshootSteps = '1. Check your API Key.\n2. If using a proxy, ensure it is running.\n3. Try deploying to Vercel for better stability.';

      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        errorTitle = 'Rate Limit Exceeded';
        errorMessage = 'You have exceeded the free tier rate limit for the Gemini API.';
        troubleshootSteps = '1. Wait for a minute and try again.\n2. The free tier has limits on requests per minute/day.\n3. Consider upgrading to a paid plan if needed.';
      } else if (errorMessage.includes('404')) {
        errorTitle = 'Model Not Found';
        errorMessage = 'The requested AI model is not available for your API Key.';
        troubleshootSteps = '1. Check if your API Key supports the selected model.\n2. The developer may need to update the model name.';
      }

      const errorMessageObj: ChatMessage = { 
        role: 'model', 
        text: `❌ **${errorTitle}**\n\n${errorMessage}\n\n**Troubleshooting:**\n${troubleshootSteps}` 
      };

      // Replace the streaming (empty/partial) message with error
      setMessages(prev => {
          const updated = [...prev];
          // If the last message was the partial bot message, replace it
          if (updated.length > newMessages.length) {
              updated[updated.length - 1] = errorMessageObj;
          } else {
              updated.push(errorMessageObj);
          }
          return updated;
      });
      
      // Update history with error message
      const errorHistory = newHistory.map(session => 
        session.id === chatId 
          ? { ...session, messages: [...newMessages, errorMessageObj] } 
          : session
      );
      setHistory(errorHistory);

    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (isLoading || messages.length === 0 || !currentChatId) return;
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'model') return;

    // Remove last model message
    const newMessages = messages.slice(0, -1);
    const lastUserMsg = newMessages[newMessages.length - 1];
    
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    setMessages(newMessages);
    setIsLoading(true);

    // Update history to remove last message
    let newHistory = [...history];
    const index = newHistory.findIndex(s => s.id === currentChatId);
    if (index !== -1) {
       newHistory[index] = { ...newHistory[index], messages: newMessages };
       setHistory(newHistory);
    }

    try {
      const historyForApi = newMessages.slice(0, -1);
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lastUserMsg.text, history: historyForApi }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
           throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      let accumulatedResponse = '';
      
      // Add initial empty bot message
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedResponse += chunk;
        
        setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
                 updated[updated.length - 1] = { ...updated[updated.length - 1], text: accumulatedResponse };
            }
            return updated;
        });
      }

      const finalMessages = [...newMessages, { role: 'model', text: accumulatedResponse }];
      const finalHistory = newHistory.map(session => 
        session.id === currentChatId 
          ? { ...session, messages: finalMessages } 
          : session
      );
      setHistory(finalHistory);

    } catch (error: any) {
      console.error('Error:', error);
      
      let errorMessage = error.message;
      let errorTitle = 'Error';
      let troubleshootSteps = '1. Check your API Key.\n2. If using a proxy, ensure it is running.\n3. Try deploying to Vercel for better stability.';

      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        errorTitle = 'Rate Limit Exceeded';
        errorMessage = 'You have exceeded the free tier rate limit for the Gemini API.';
        troubleshootSteps = '1. Wait for a minute and try again.\n2. The free tier has limits on requests per minute/day.\n3. Consider upgrading to a paid plan if needed.';
      } else if (errorMessage.includes('404')) {
        errorTitle = 'Model Not Found';
        errorMessage = 'The requested AI model is not available for your API Key.';
        troubleshootSteps = '1. Check if your API Key supports the selected model.\n2. The developer may need to update the model name.';
      }

      const errorMessageObj: ChatMessage = { 
        role: 'model', 
        text: `❌ **${errorTitle}**\n\n${errorMessage}\n\n**Troubleshooting:**\n${troubleshootSteps}` 
      };

      setMessages(prev => {
          const updated = [...prev];
          if (updated.length > newMessages.length) {
              updated[updated.length - 1] = errorMessageObj;
          } else {
              updated.push(errorMessageObj);
          }
          return updated;
      });
      
      const errorHistory = newHistory.map(session => 
        session.id === currentChatId 
          ? { ...session, messages: [...newMessages, errorMessageObj] } 
          : session
      );
      setHistory(errorHistory);

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#131314] overflow-hidden text-[#e3e3e3]">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        history={history}
        currentChatId={currentChatId}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        onNewChat={createNewChat}
      />
      <ChatInterface 
        sidebarOpen={sidebarOpen} 
        messages={messages}
        isLoading={isLoading}
        onSendMessage={handleSendMessage}
        onRegenerate={handleRegenerate}
      />
    </div>
  );
}
