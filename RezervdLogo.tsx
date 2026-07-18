import React from 'react';

interface RezervdLogoProps {
  className?: string;
  variant?: 'header' | 'footer';
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  linkToHome?: boolean;
}

export function RezervdLogo({ variant = 'header', size, className = '', style, linkToHome = true }: RezervdLogoProps) {
  let desktopWidth: number;
  if (size === 'sm') desktopWidth = 280;
  else if (size === 'md') desktopWidth = 320;
  else if (size === 'lg') desktopWidth = 360;
  else desktopWidth = variant === 'footer' ? 240 : 280;

  const img = (
    <img
      src="/newlogo-Photoroom.png"
      alt="Rezerved — Dine with intention"
      className={`rzv-logo ${className}`}
      style={{ width: `${desktopWidth}px`, height: 'auto', display: 'block', ...style }}
      draggable={false}
    />
  );

  if (!linkToHome) return img;

  return (
    <a href="/" aria-label="Rezerved — return to homepage" className="rzv-logo-link">
      {img}
    </a>
  );
}
