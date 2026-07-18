import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string; label: string }[];
}

export function Select({ label, error, options, className = '', children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-app-text-secondary mb-1.5 transition-colors">
          {label}
        </label>
      )}
      <select
        className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-app-accent/50 focus:border-app-accent transition-all duration-200 bg-app-bg-tertiary text-app-text hover:border-app-accent/30 cursor-pointer ${
          error ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' : 'border-app-border'
        } ${className}`}
        {...props}
      >
        {options ? (
          options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        ) : (
          children
        )}
      </select>
      {error && (
        <p className="mt-1.5 text-sm text-red-600 dark:text-red-400 animate-slideUp">{error}</p>
      )}
    </div>
  );
}
