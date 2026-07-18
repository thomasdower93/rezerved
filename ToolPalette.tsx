import React from 'react';
import { MousePointer2, Plus, Minus, DoorOpen, Square, Bath } from 'lucide-react';

export type Tool = 'select' | 'add_table' | 'wall' | 'door' | 'window' | 'wc';

interface ToolPaletteProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function ToolPalette({ activeTool, onToolChange }: ToolPaletteProps) {
  const tools: { id: Tool; icon: React.ReactNode; label: string; hint?: string }[] = [
    { id: 'select', icon: <MousePointer2 className="w-5 h-5" />, label: 'Select / Move' },
    { id: 'add_table', icon: <Plus className="w-5 h-5" />, label: 'Add Table', hint: 'Click to place table' },
    { id: 'wall', icon: <Minus className="w-5 h-5 rotate-90" />, label: 'Draw Wall', hint: 'Click once to start, click again to finish' },
    { id: 'door', icon: <DoorOpen className="w-5 h-5" />, label: 'Add Door', hint: 'Click to place door' },
    { id: 'window', icon: <Square className="w-5 h-5" />, label: 'Add Window', hint: 'Click to place window' },
    { id: 'wc', icon: <Bath className="w-5 h-5" />, label: 'Add WC', hint: 'Click to place WC' },
  ];

  const activeTHint = tools.find(t => t.id === activeTool)?.hint;

  return (
    <div className="bg-white rounded-xl shadow-md p-4 space-y-2">
      <div className="text-sm font-medium text-slate-700 mb-3">Tools</div>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
            activeTool === tool.id
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
          title={tool.label}
        >
          {tool.icon}
          <span className="text-sm font-medium">{tool.label}</span>
        </button>
      ))}
      {activeTHint && (
        <div className="mt-4 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500 leading-relaxed">{activeTHint}</p>
        </div>
      )}
    </div>
  );
}
