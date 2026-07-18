import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale';
  threshold?: number;
}

export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  threshold = 0.1,
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => setIsVisible(true), delay);
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [delay, threshold]);

  const directionClasses = {
    up: isVisible
      ? 'translate-y-0 opacity-100'
      : 'translate-y-8 opacity-0',
    down: isVisible
      ? 'translate-y-0 opacity-100'
      : '-translate-y-8 opacity-0',
    left: isVisible
      ? 'translate-x-0 opacity-100'
      : 'translate-x-8 opacity-0',
    right: isVisible
      ? 'translate-x-0 opacity-100'
      : '-translate-x-8 opacity-0',
    scale: isVisible
      ? 'scale-100 opacity-100'
      : 'scale-95 opacity-0',
  };

  return (
    <div
      ref={ref}
      className={`
        transition-all duration-700 ease-out
        ${directionClasses[direction]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
