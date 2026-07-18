import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';

interface TimeSelectorProps {
  value: string;
  onChange: (time: string) => void;
  label?: string;
  className?: string;
  interval?: number;
}

export function TimeSelector({ value, onChange, label, className = '', interval = 15 }: TimeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse the current time value with validation
  const parseTime = () => {
    if (!value || typeof value !== 'string') {
      return { hours: 12, minutes: 0 };
    }
    const parts = value.split(':');
    if (parts.length !== 2) {
      return { hours: 12, minutes: 0 };
    }
    const [h, m] = parts.map(Number);
    if (isNaN(h) || isNaN(m)) {
      return { hours: 12, minutes: 0 };
    }
    return { hours: h, minutes: m };
  };

  const { hours, minutes } = parseTime();
  const isPM = hours >= 12;
  const displayHour = hours % 12 || 12;

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyboard);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, [isOpen]);

  const updateTime = (newHour: number, newMinute: number, newIsPM: boolean) => {
    let hour24 = newHour === 12 ? 0 : newHour;
    if (newIsPM) {
      hour24 += 12;
    }
    const timeValue = `${hour24.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`;
    onChange(timeValue);
  };

  const adjustHour = (delta: number) => {
    let newHour = displayHour + delta;
    if (newHour > 12) newHour = 1;
    if (newHour < 1) newHour = 12;
    updateTime(newHour, minutes, isPM);
  };

  const adjustMinute = (delta: number) => {
    let newMinute = minutes + delta;
    if (newMinute >= 60) newMinute = 0;
    if (newMinute < 0) newMinute = 60 - interval;
    // Round to nearest interval
    newMinute = Math.round(newMinute / interval) * interval;
    if (newMinute >= 60) newMinute = 0;
    updateTime(displayHour, newMinute, isPM);
  };

  const toggleAMPM = () => {
    updateTime(displayHour, minutes, !isPM);
  };

  const displayText = `${displayHour}:${minutes.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;

  const selector = (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-app-bg-tertiary rounded-xl border border-app-border hover:border-app-accent/50 transition-colors text-sm font-medium text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/50 focus:border-transparent"
      >
        <Clock className="w-4 h-4 text-app-accent flex-shrink-0" />
        <span className="whitespace-nowrap">{displayText}</span>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 bg-[rgba(20,20,20,0.98)] border border-app-border/40 rounded-xl shadow-2xl overflow-hidden z-[100] p-4"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Hour Control */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => adjustHour(1)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-app-text"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div className="w-14 h-12 flex items-center justify-center bg-app-bg-secondary rounded-lg border border-app-border">
                <span className="text-2xl font-semibold text-app-text">{displayHour.toString().padStart(2, '0')}</span>
              </div>
              <button
                type="button"
                onClick={() => adjustHour(-1)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-app-text"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <span className="text-2xl font-semibold text-app-text-secondary">:</span>

            {/* Minute Control */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => adjustMinute(interval)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-app-text"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div className="w-14 h-12 flex items-center justify-center bg-app-bg-secondary rounded-lg border border-app-border">
                <span className="text-2xl font-semibold text-app-text">{minutes.toString().padStart(2, '0')}</span>
              </div>
              <button
                type="button"
                onClick={() => adjustMinute(-interval)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-app-text"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* AM/PM Toggle */}
            <div className="flex flex-col gap-1 ml-1">
              <button
                type="button"
                onClick={toggleAMPM}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !isPM
                    ? 'bg-app-accent text-white'
                    : 'bg-app-bg-secondary text-app-text-secondary hover:bg-white/10'
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={toggleAMPM}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isPM
                    ? 'bg-app-accent text-white'
                    : 'bg-app-bg-secondary text-app-text-secondary hover:bg-white/10'
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-app-border/30">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
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
