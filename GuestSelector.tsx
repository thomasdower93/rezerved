import React, { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown } from 'lucide-react';

interface GuestSelectorProps {
  value: number;
  onChange: (size: number) => void;
  min?: number;
  max?: number;
}

export function GuestSelector({ value, onChange, min = 1, max = 10 }: GuestSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  useEffect(() => {
    if (!isOpen) return;

    const currentIndex = options.indexOf(value);
    if (currentIndex !== -1) {
      setFocusedIndex(currentIndex);
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect(options[focusedIndex]);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyboard);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, [isOpen, focusedIndex, options, value]);

  const handleSelect = (size: number) => {
    onChange(size);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2 px-3 py-2 bg-app-bg-tertiary rounded-xl border border-app-border">
      <Users className="w-4 h-4 text-app-accent" />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 text-sm font-medium text-app-text bg-transparent border-none outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg rounded"
      >
        <span>{value} {value === 1 ? 'Guest' : 'Guests'}</span>
        <ChevronDown className={`w-3 h-3 text-app-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-2 w-40 bg-[rgba(20,20,20,0.98)] dark:bg-[rgba(20,20,20,0.98)] border border-app-border/40 rounded-xl shadow-2xl overflow-hidden z-[100]"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.15s ease-out, slideUp 0.15s ease-out',
          }}
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((size, index) => (
              <button
                key={size}
                type="button"
                onClick={() => handleSelect(size)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                  size === value
                    ? 'bg-app-accent/20 text-app-accent font-medium'
                    : index === focusedIndex
                    ? 'bg-white/10 text-app-text'
                    : 'text-app-text hover:bg-white/5'
                }`}
              >
                {size} {size === 1 ? 'Guest' : 'Guests'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
