import React, { useRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current;
    if (!button) return;

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    const ripple = button.getElementsByClassName('ripple')[0];
    if (ripple) {
      ripple.remove();
    }

    button.appendChild(circle);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(event);
    onClick?.(event);
  };

  const baseStyles = 'relative ripple-container font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const variantStyles = {
    primary: 'bg-app-accent hover:bg-app-accent-hover text-white shadow-sm hover:shadow-md hover:scale-[1.02]',
    secondary: 'bg-app-bg-tertiary hover:bg-app-bg-secondary text-app-text border border-app-border hover:border-app-accent/30',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md hover:scale-[1.02] dark:bg-red-700 dark:hover:bg-red-800',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      ref={buttonRef}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}
