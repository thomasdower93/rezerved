import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, ExternalLink, Images, X, ChevronLeft, ChevronRight, UtensilsCrossed } from 'lucide-react';
import { Restaurant } from '../lib/types';

interface RestaurantHeroSectionProps {
  restaurant: Restaurant;
  /** YYYY-MM-DD, used to show today's opening hours */
  date?: string;
  className?: string;
}

// ── Gallery modal ──────────────────────────────────────────────────────────────

interface GalleryModalProps {
  images: string[];
  initialIndex: number;
  restaurantName: string;
  onClose: () => void;
}

function GalleryModal({ images, initialIndex, restaurantName, onClose }: GalleryModalProps) {
  const [current, setCurrent] = useState(initialIndex);

  const prev = useCallback(() => setCurrent(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">{restaurantName}</span>
            <span className="text-xs text-white/50">·</span>
            <span className="text-xs text-white/50">{current + 1} / {images.length}</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
            style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.80)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.08)', aspectRatio: '16/9' }}
        >
          <img
            src={images[current]}
            alt={`${restaurantName} photo ${current + 1}`}
            className="w-full h-full object-cover"
          />
          {/* Nav overlays */}
          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full transition-all"
                style={{ background: 'rgba(0,0,0,0.55)', color: 'white', backdropFilter: 'blur(4px)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.75)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={next}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full transition-all"
                style={{ background: 'rgba(0,0,0,0.55)', color: 'white', backdropFilter: 'blur(4px)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.75)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {images.map((src, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden transition-all"
                style={{
                  border: idx === current
                    ? '2px solid rgba(210,172,72,0.90)'
                    : '2px solid rgba(255,255,255,0.10)',
                  opacity: idx === current ? 1 : 0.55,
                }}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image placeholder panel ────────────────────────────────────────────────────

function ImagePlaceholder() {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(30,26,20,1) 0%, rgba(24,20,16,1) 100%)',
      }}
    >
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl"
        style={{ background: 'rgba(195,158,52,0.10)', border: '1px solid rgba(195,158,52,0.20)' }}
      >
        <UtensilsCrossed className="w-6 h-6" style={{ color: 'rgba(195,158,52,0.50)' }} />
      </div>
      <p className="text-xs font-medium" style={{ color: 'rgba(195,158,52,0.45)' }}>
        Photos coming soon
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RestaurantHeroSection({ restaurant, className = '' }: RestaurantHeroSectionProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);

  const images: string[] = (() => {
    const g = restaurant.gallery_images ?? [];
    if (g.length > 0) return g;
    if (restaurant.cover_image_url) return [restaurant.cover_image_url];
    return [];
  })();

  const coverImage = restaurant.cover_image_url || images[0] || null;
  const hasImages = images.length > 0;
  const hasGallery = images.length > 0;

  // Location / maps data
  const addressParts = [restaurant.address, restaurant.city, restaurant.postcode].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : restaurant.location;
  const hasAddress = !!(restaurant.address || restaurant.location);
  const mapsUrl = hasAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const cardBorder = 'border border-app-border';
  const cardBg = 'bg-app-bg-secondary';

  return (
    <>
      {/* ── Desktop: two-column row ── */}
      <div className={`hidden sm:flex gap-4 mb-5 ${className}`} style={{ minHeight: 180 }}>

        {/* Left — Location card (38%) */}
        <div
          className={`flex flex-col justify-between p-5 rounded-2xl ${cardBg} ${cardBorder}`}
          style={{ flex: '0 0 38%', maxWidth: '38%' }}
        >
          {/* Header */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(195,158,52,0.75)' }} />
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'rgba(195,158,52,0.65)', letterSpacing: '0.10em' }}
              >
                Location
              </span>
            </div>

            {hasAddress ? (
              <div className="space-y-0.5">
                {restaurant.address && (
                  <p className="text-sm font-medium text-app-text leading-snug">{restaurant.address}</p>
                )}
                {(restaurant.city || restaurant.postcode) && (
                  <p className="text-sm text-app-text-secondary">
                    {[restaurant.city, restaurant.postcode].filter(Boolean).join('\u2002')}
                  </p>
                )}
                {!restaurant.address && restaurant.location && (
                  <p className="text-sm font-medium text-app-text leading-snug">{restaurant.location}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-app-text-tertiary">Location details unavailable</p>
            )}
          </div>

          {/* Open in Maps button */}
          {mapsUrl && (
            <div className="mt-4">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all"
                style={{
                  border: '1px solid rgba(195,158,52,0.38)',
                  color: 'rgba(210,172,72,1)',
                  background: 'rgba(195,158,52,0.08)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'rgba(195,158,52,0.16)';
                  el.style.borderColor = 'rgba(195,158,52,0.60)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'rgba(195,158,52,0.08)';
                  el.style.borderColor = 'rgba(195,158,52,0.38)';
                }}
              >
                <ExternalLink className="w-3 h-3" />
                Open in Maps
              </a>
            </div>
          )}
        </div>

        {/* Right — Hero image card (62%) */}
        <div
          className={`relative overflow-hidden rounded-2xl ${cardBorder}`}
          style={{ flex: '1 1 0%', minHeight: 180 }}
        >
          {hasImages && coverImage ? (
            <>
              <img
                src={coverImage}
                alt={restaurant.name}
                className="w-full h-full object-cover"
                style={{ display: 'block' }}
              />
              {/* Dark gradient overlay — bottom fade for any future caption */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0) 70%)',
                }}
              />
              {/* Top-right vignette to help button legibility */}
              <div
                className="absolute top-0 right-0 w-40 h-20 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at top right, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)',
                }}
              />
            </>
          ) : (
            <ImagePlaceholder />
          )}

          {/* View Gallery button — top-right */}
          {hasGallery && (
            <button
              onClick={() => setGalleryOpen(true)}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: 'rgba(0,0,0,0.58)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.92)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'rgba(0,0,0,0.75)';
                el.style.borderColor = 'rgba(195,158,52,0.55)';
                el.style.color = 'rgba(210,172,72,1)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'rgba(0,0,0,0.58)';
                el.style.borderColor = 'rgba(255,255,255,0.14)';
                el.style.color = 'rgba(255,255,255,0.92)';
              }}
            >
              <Images className="w-3.5 h-3.5" />
              {images.length > 1 ? `${images.length} photos` : 'View photo'}
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile: stacked ── */}
      <div className={`flex sm:hidden flex-col gap-3 mb-4 ${className}`}>
        {/* Hero image — full width, compact height */}
        <div
          className={`relative overflow-hidden rounded-2xl ${cardBorder}`}
          style={{ height: 180 }}
        >
          {hasImages && coverImage ? (
            <>
              <img
                src={coverImage}
                alt={restaurant.name}
                className="w-full h-full object-cover"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to top, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0) 60%)',
                }}
              />
              <div
                className="absolute top-0 right-0 w-32 h-16 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at top right, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 70%)',
                }}
              />
            </>
          ) : (
            <ImagePlaceholder />
          )}

          {hasGallery && (
            <button
              onClick={() => setGalleryOpen(true)}
              className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl"
              style={{
                background: 'rgba(0,0,0,0.60)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.90)',
              }}
            >
              <Images className="w-3 h-3" />
              {images.length > 1 ? `${images.length} photos` : 'View'}
            </button>
          )}
        </div>

        {/* Location card — compact row */}
        {hasAddress && (
          <div
            className={`flex items-start gap-3 p-4 rounded-2xl ${cardBg} ${cardBorder}`}
          >
            <div
              className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg mt-0.5"
              style={{ background: 'rgba(195,158,52,0.10)', border: '1px solid rgba(195,158,52,0.20)' }}
            >
              <MapPin className="w-4 h-4" style={{ color: 'rgba(195,158,52,0.75)' }} />
            </div>
            <div className="flex-1 min-w-0">
              {restaurant.address && (
                <p className="text-sm font-medium text-app-text leading-snug truncate">{restaurant.address}</p>
              )}
              {(restaurant.city || restaurant.postcode) && (
                <p className="text-xs text-app-text-secondary mt-0.5">
                  {[restaurant.city, restaurant.postcode].filter(Boolean).join('\u2002')}
                </p>
              )}
              {!restaurant.address && restaurant.location && (
                <p className="text-sm font-medium text-app-text leading-snug">{restaurant.location}</p>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold mt-2 transition-opacity hover:opacity-80"
                  style={{ color: 'rgba(210,172,72,1)' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open in Maps
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gallery modal */}
      {galleryOpen && images.length > 0 && (
        <GalleryModal
          images={images}
          initialIndex={0}
          restaurantName={restaurant.name}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}
