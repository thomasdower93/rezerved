import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Images, Upload, X, Star, Loader2, AlertCircle, GripVertical, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BUCKET = 'restaurant-images';
const MAX_PHOTOS = 8;
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Photo {
  url: string;
  storagePath: string; // e.g. "{restaurantId}/abc123.jpg"
}

interface RestaurantPhotosPanelProps {
  restaurantId: string;
  /** Current saved images from restaurant.gallery_images */
  initialImages: string[];
  /** Styling context: 'staff' (dark) | 'admin' (light) */
  theme?: 'staff' | 'admin';
  onSaved?: (galleryImages: string[], coverImageUrl: string | null) => void;
}

// Derive a storagePath from a public URL (last two path segments after /object/public/bucket/)
function urlToPath(url: string, restaurantId: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    // …/storage/v1/object/public/restaurant-images/{restaurantId}/{file}
    const bucketIdx = parts.indexOf(BUCKET);
    if (bucketIdx !== -1 && bucketIdx + 2 < parts.length) {
      return parts.slice(bucketIdx + 1).join('/');
    }
  } catch { /* fall through */ }
  // Fallback: assume "{restaurantId}/{filename}"
  const filename = url.split('/').pop() ?? url;
  return `${restaurantId}/${filename}`;
}

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function RestaurantPhotosPanel({
  restaurantId,
  initialImages,
  theme = 'staff',
  onSaved,
}: RestaurantPhotosPanelProps) {
  const isDark = theme === 'staff';

  // photos[] is the working order; index 0 = cover
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (initialImages ?? []).map(url => ({ url, storagePath: urlToPath(url, restaurantId) }))
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dirty = useRef(false);

  // Reset when restaurantId changes
  useEffect(() => {
    setPhotos((initialImages ?? []).map(url => ({ url, storagePath: urlToPath(url, restaurantId) })));
    dirty.current = false;
  }, [restaurantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`You've reached the ${MAX_PHOTOS}-photo limit. Remove a photo to add more.`);
      return;
    }
    const toUpload = fileArr.slice(0, remaining);

    for (const file of toUpload) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`"${file.name}" is not a supported image type. Use JPEG, PNG, WebP or GIF.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB size limit.`);
        return;
      }
    }

    setError(null);
    setUploading(true);

    const newPhotos: Photo[] = [];
    for (const file of toUpload) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storagePath = `${restaurantId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        setError(`Failed to upload "${file.name}": ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const url = getPublicUrl(storagePath);
      newPhotos.push({ url, storagePath });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    dirty.current = true;
    setUploading(false);

    if (fileArr.length > remaining) {
      setError(`Only ${remaining} photo${remaining !== 1 ? 's' : ''} added — ${MAX_PHOTOS}-photo limit reached.`);
    }
  }, [photos.length, restaurantId]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneActive(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (index: number) => {
    const photo = photos[index];
    // Remove from state immediately (optimistic)
    setPhotos(prev => prev.filter((_, i) => i !== index));
    dirty.current = true;

    // Delete from storage (best-effort — don't block UI)
    await supabase.storage.from(BUCKET).remove([photo.storagePath]);
  };

  // Drag-to-reorder
  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { setDragOverIndex(index); };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverIndex !== null && dragItem.current !== dragOverIndex) {
      setPhotos(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragItem.current!, 1);
        next.splice(dragOverIndex, 0, moved);
        return next;
      });
      dirty.current = true;
    }
    dragItem.current = null;
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const galleryImages = photos.map(p => p.url);
    const coverImageUrl = galleryImages[0] ?? null;

    const { error: dbError } = await supabase
      .from('restaurants')
      .update({ gallery_images: galleryImages, cover_image_url: coverImageUrl })
      .eq('id', restaurantId);

    if (dbError) {
      setError(`Failed to save: ${dbError.message}`);
      setSaving(false);
      return;
    }

    dirty.current = false;
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    onSaved?.(galleryImages, coverImageUrl);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const panelBg = isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200';
  const cardBg = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const labelColor = isDark ? 'text-slate-300' : 'text-slate-700';
  const subColor = isDark ? 'text-slate-500' : 'text-slate-400';
  const dropBg = isDark
    ? 'bg-slate-900/60 border-slate-600 hover:border-slate-500'
    : 'bg-slate-100 border-slate-300 hover:border-slate-400';
  const dropActiveBg = isDark ? 'border-amber-400/70 bg-amber-400/5' : 'border-amber-500/60 bg-amber-50';
  const deleteBtn = isDark
    ? 'bg-black/50 text-white/80 hover:bg-red-600/80 hover:text-white'
    : 'bg-white/80 text-slate-600 hover:bg-red-50 hover:text-red-600';
  const errorBg = isDark ? 'bg-red-900/30 border-red-700/50 text-red-300' : 'bg-red-50 border-red-200 text-red-700';
  const successBg = isDark ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700';

  const canUpload = photos.length < MAX_PHOTOS && !uploading;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${panelBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Images className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <div>
            <p className={`text-sm font-semibold ${labelColor}`}>Restaurant Photos</p>
            <p className={`text-xs mt-0.5 ${subColor}`}>
              {photos.length}/{MAX_PHOTOS} photos · First photo is used as cover image
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isDark
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50'
              : 'bg-amber-500/10 text-amber-700 border border-amber-500/30 hover:bg-amber-500/20'
          }`}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save photos'}
        </button>
      </div>

      {/* Error / success */}
      {error && (
        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 border ${errorBg}`}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto flex-shrink-0 opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${successBg}`}>
          <span>Photos saved successfully.</span>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {photos.map((photo, idx) => (
            <div
              key={photo.storagePath}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              className={`relative group rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all ${cardBg} border`}
              style={{
                aspectRatio: '4/3',
                outline: dragOverIndex === idx ? `2px solid rgba(245,158,11,0.7)` : 'none',
                outlineOffset: 2,
                opacity: dragItem.current === idx ? 0.5 : 1,
              }}
            >
              <img
                src={photo.url}
                alt={`Restaurant photo ${idx + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />

              {/* Cover badge */}
              {idx === 0 && (
                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(245,158,11,1)', backdropFilter: 'blur(4px)' }}>
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Cover
                </div>
              )}

              {/* Drag handle */}
              <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all"
                style={{ color: 'rgba(255,255,255,0.70)' }}>
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(idx)}
                className={`absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full transition-all opacity-0 group-hover:opacity-100 ${deleteBtn}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>

              {/* Photo number */}
              <div className="absolute bottom-2 right-2 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-all"
                style={{ color: 'rgba(255,255,255,0.65)' }}>
                {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canUpload && (
        <div
          className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer ${dropZoneActive ? dropActiveBg : dropBg}`}
          style={{ minHeight: photos.length === 0 ? 140 : 80 }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDropZoneActive(true); }}
          onDragLeave={() => setDropZoneActive(false)}
          onDrop={handleDrop}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
            {uploading ? (
              <>
                <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                <p className={`text-xs font-medium ${subColor}`}>Uploading…</p>
              </>
            ) : (
              <>
                <Upload className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <div className="text-center">
                  <p className={`text-xs font-medium ${labelColor}`}>
                    {photos.length === 0 ? 'Add photos' : 'Add more photos'}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${subColor}`}>
                    Drag & drop or click · JPEG, PNG, WebP · Max {MAX_FILE_SIZE_MB} MB · {MAX_PHOTOS - photos.length} remaining
                  </p>
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            onChange={handleFileInput}
            className="sr-only"
          />
        </div>
      )}

      {photos.length >= MAX_PHOTOS && (
        <p className={`text-xs text-center ${subColor}`}>
          {MAX_PHOTOS}-photo limit reached. Delete a photo to add another.
        </p>
      )}

      {photos.length > 1 && (
        <p className={`text-[11px] ${subColor}`}>
          Drag photos to reorder. The first photo is used as the cover image on the booking page.
        </p>
      )}
    </div>
  );
}
