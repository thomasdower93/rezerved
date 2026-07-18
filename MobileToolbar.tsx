import React from 'react';
import { MousePointer2, Plus, Minus, DoorOpen, Square, Bath } from 'lucide-react';
import { Tool } from '../lib/types';

interface MobileToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function MobileToolbar({ activeTool, onToolChange }: MobileToolbarProps) {
  const tools: { id: Tool; icon: React.ReactNode; label: string; hint?: string }[] = [
    { id: 'select', icon: <MousePointer2 className="w-6 h-6" />, label: 'Select' },
    { id: 'add_table', icon: <Plus className="w-6 h-6" />, label: 'Table', hint: 'Tap to place table' },
    { id: 'wall', icon: <Minus className="w-6 h-6 rotate-90" />, label: 'Wall', hint: 'Tap once to start, tap again to finish' },
    { id: 'door', icon: <DoorOpen className="w-6 h-6" />, label: 'Door', hint: 'Tap to place door' },
    { id: 'window', icon: <Square className="w-6 h-6" />, label: 'Window', hint: 'Tap to place window' },
    { id: 'wc', icon: <Bath className="w-6 h-6" />, label: 'WC', hint: 'Tap to place WC' },
  ];

  const activeToolData = tools.find(t => t.id === activeTool);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 pb-safe">
      {activeToolData?.hint && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
          <p className="text-xs text-slate-600 text-center">{activeToolData.hint}</p>
        </div>
      )}
      <div className="flex items-center justify-around px-2 py-3">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all min-w-[64px] ${
              activeTool === tool.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-700 active:bg-slate-100'
            }`}
          >
            {tool.icon}
            <span className="text-xs font-medium">{tool.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
