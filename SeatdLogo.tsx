import React from 'react';

interface SeatdLogoProps {
  className?: string;
  variant?: 'header' | 'footer';
  size?: 'sm' | 'md' | 'lg';
  showSlogan?: boolean;
  style?: React.CSSProperties;
}

export function SeatdLogo({ variant = 'header', className = '', style }: SeatdLogoProps) {
  const width = variant === 'footer' ? 240 : 300;
  return (
    <img
      src="/newlogo-Photoroom.png"
      alt="Rezerved — Dine with intention"
      style={{ width: `${width}px`, height: 'auto', display: 'block', flexShrink: 0, ...style }}
      className={className}
      draggable={false}
    />
  );
}
