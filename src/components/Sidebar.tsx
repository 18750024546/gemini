import React from 'react';
import { Menu, Plus, MessageSquare, Settings, HelpCircle, Activity, Trash2 } from 'lucide-react';
import { ChatSession } from '@/types/chat';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  history: ChatSession[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  setIsOpen, 
  history, 
  currentChatId, 
  onSelectChat, 
  onDeleteChat,
  onNewChat 
}) => {
  return (
    <div 
      className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1e1f20] text-[#e3e3e3] transition-all duration-300 ease-in-out ${
        isOpen ? 'w-[280px]' : 'w-[68px]'
      }`}
    >
      <div className="flex items-center p-4">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-full hover:bg-[#333537] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <button 
          onClick={onNewChat}
          className={`flex items-center gap-3 w-full p-3 rounded-full bg-[#1a1a1c] hover:bg-[#333537] transition-colors mb-6 ${!isOpen && 'justify-center'}`}
        >
          <Plus className="w-5 h-5 text-gray-400" />
          {isOpen && <span className="text-sm font-medium">New chat</span>}
        </button>

        {isOpen && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-gray-400 mb-2 px-3">Recent</h3>
            <div className="flex flex-col gap-1">
              {history.map((session) => (
                <div 
                  key={session.id}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-full hover:bg-[#333537] cursor-pointer ${
                    currentChatId === session.id ? 'bg-[#004a77] hover:bg-[#004a77]' : ''
                  }`}
                  onClick={() => onSelectChat(session.id)}
                >
                  <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-sm text-left">{session.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-white text-gray-400 transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {history.length === 0 && (
                <p className="px-3 text-xs text-gray-500">No recent chats</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 mt-auto">
        <div className="flex flex-col gap-1">
          <button className={`flex items-center gap-3 p-3 rounded-full hover:bg-[#333537] transition-colors ${!isOpen && 'justify-center'}`}>
            <HelpCircle className="w-5 h-5 text-gray-400" />
            {isOpen && <span className="text-sm">Help</span>}
          </button>
          <button className={`flex items-center gap-3 p-3 rounded-full hover:bg-[#333537] transition-colors ${!isOpen && 'justify-center'}`}>
            <Activity className="w-5 h-5 text-gray-400" />
            {isOpen && <span className="text-sm">Activity</span>}
          </button>
          <button className={`flex items-center gap-3 p-3 rounded-full hover:bg-[#333537] transition-colors ${!isOpen && 'justify-center'}`}>
            <Settings className="w-5 h-5 text-gray-400" />
            {isOpen && <span className="text-sm">Settings</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
