import React, { useState, useEffect } from 'react';

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}

export function ProgressiveImage({
  src,
  alt,
  className = '',
  placeholderClassName = '',
}: ProgressiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!imgRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(imgRef);

    return () => observer.disconnect();
  }, [imgRef]);

  return (
    <div className="relative overflow-hidden">
      {!isLoaded && (
        <div
          className={`absolute inset-0 bg-gradient-to-br from-app-bg-tertiary to-app-bg animate-pulse ${placeholderClassName}`}
        />
      )}
      <img
        ref={setImgRef}
        src={isInView ? src : undefined}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className={`
          transition-all duration-500
          ${isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-lg'}
          ${className}
        `}
        style={{ willChange: 'opacity, transform, filter' }}
      />
    </div>
  );
}
