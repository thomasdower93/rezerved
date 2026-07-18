import React, { useState, useEffect, useRef } from 'react';

interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

export function TimeInput({ value, onChange, className = '', style, label }: TimeInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatTimeForDisplay(value));
    }
  }, [value, isFocused]);

  const formatTimeForDisplay = (time: string): string => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const parseTimeInput = (input: string): string | null => {
    const cleaned = input.trim().toUpperCase();

    const match = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i);
    if (!match) return null;

    let hours = parseInt(match[1]);
    let minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3];

    if (isNaN(hours) || isNaN(minutes)) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (hours < 1 || hours > 23) {
      if (hours === 0 && meridiem) {
        hours = 12;
      } else {
        return null;
      }
    }

    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }

    if (hours > 23) return null;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setDisplayValue(input);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseTimeInput(displayValue);
    if (parsed) {
      onChange(parsed);
    } else {
      setDisplayValue(formatTimeForDisplay(value));
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  const inputElement = (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleInputChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="HH:MM"
      className={className}
      style={style}
    />
  );

  if (label) {
    return (
      <div className="w-full">
        <label className="block text-sm font-medium text-app-text-secondary mb-1">
          {label}
        </label>
        {inputElement}
      </div>
    );
  }

  return inputElement;
}
