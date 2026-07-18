import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateSelectorProps {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  label?: string;
  className?: string;
}

export function DateSelector({ value, onChange, min, max, label, className = '' }: DateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getDateOptions = () => {
    const options: { value: string; label: string }[] = [];
    const today = new Date();
    const minDate = min ? new Date(min) : today;
    const maxDate = max ? new Date(max) : new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    const current = new Date(minDate);
    while (current <= maxDate && options.length < 90) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.toLocaleDateString('en-US', { weekday: 'short' });
      const month = current.toLocaleDateString('en-US', { month: 'short' });
      const day = current.getDate();
      const year = current.getFullYear();

      const isToday = dateStr === today.toISOString().split('T')[0];
      const isTomorrow = dateStr === new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let label = `${dayOfWeek}, ${month} ${day}, ${year}`;
      if (isToday) label = `Today, ${month} ${day}`;
      else if (isTomorrow) label = `Tomorrow, ${month} ${day}`;

      options.push({ value: dateStr, label });
      current.setDate(current.getDate() + 1);
    }

    return options;
  };

  const options = getDateOptions();

  useEffect(() => {
    if (!isOpen) return;

    const currentIndex = options.findIndex(opt => opt.value === value);
    if (currentIndex !== -1) {
      setFocusedIndex(currentIndex);
      setTimeout(() => {
        const element = dropdownRef.current?.querySelector(`[data-index="${currentIndex}"]`);
        element?.scrollIntoView({ block: 'nearest' });
      }, 0);
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
        handleSelect(options[focusedIndex].value);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyboard);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, [isOpen, focusedIndex, options, value]);

  const handleSelect = (date: string) => {
    onChange(date);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || value;

  const selector = (
    <div ref={containerRef} className={`relative inline-flex items-center gap-2 px-3 py-2 bg-app-bg-tertiary rounded-xl border border-app-border ${className}`}>
      <Calendar className="w-4 h-4 text-app-accent flex-shrink-0" />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 text-sm font-medium text-app-text bg-transparent border-none outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg rounded"
      >
        <span className="whitespace-nowrap">{displayText}</span>
        <ChevronDown className={`w-3 h-3 text-app-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-2 w-[280px] bg-[rgba(20,20,20,0.98)] dark:bg-[rgba(20,20,20,0.98)] border border-app-border/40 rounded-xl shadow-2xl overflow-hidden z-[100]"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.15s ease-out, slideUp 0.15s ease-out',
          }}
        >
          <div className="max-h-80 overflow-y-auto py-1">
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                data-index={index}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                  option.value === value
                    ? 'bg-app-accent/20 text-app-accent font-medium'
                    : index === focusedIndex
                    ? 'bg-white/10 text-app-text'
                    : 'text-app-text hover:bg-white/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (label) {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-app-text-secondary mb-1.5">
          {label}
        </label>
        {selector}
      </div>
    );
  }

  return selector;
}
