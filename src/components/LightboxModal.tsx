import { useMediaUrl } from '../db';
import { LightboxSlide } from '../types';

interface LightboxModalProps {
  slides: LightboxSlide[];
  index: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

export function LightboxModal({
  slides,
  index,
  isOpen,
  onClose,
  onNavigate,
}: LightboxModalProps) {
  const current = slides[index];
  const resolvedSrc = useMediaUrl(isOpen ? current?.src : '');

  if (!isOpen || !slides.length || !current) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-lg font-bold transition-colors"
      >
        &times;
      </button>

      {slides.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(-1);
          }}
          aria-label="Previous photo"
          className="absolute left-3 sm:left-6 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-xl font-bold transition-colors"
        >
          &lsaquo;
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full flex flex-col items-center gap-3"
      >
        {resolvedSrc && (
          <img
            src={resolvedSrc}
            alt={current.cap}
            referrerPolicy="no-referrer"
            className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}
        <div className="flex items-center justify-between gap-4 w-full max-w-2xl px-2 text-white/90 text-sm">
          <p className="leading-snug">{current.cap}</p>
          {slides.length > 1 && (
            <span className="text-xs text-white/70 tabular-nums shrink-0">
              {index + 1} / {slides.length}
            </span>
          )}
        </div>
      </div>

      {slides.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(1);
          }}
          aria-label="Next photo"
          className="absolute right-3 sm:right-6 w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer text-xl font-bold transition-colors"
        >
          &rsaquo;
        </button>
      )}
    </div>
  );
}
