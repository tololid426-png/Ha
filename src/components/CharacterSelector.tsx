import React, { useRef, useState, useEffect } from 'react';
import { History, X, Check, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { CharacterItem } from '../types/motion';
import { CHARACTER_PRESETS } from '../data/presets';

export const DEFAULT_SAMPLE_IMAGE = '/assets/rh_samples/frame_0.jpg';

interface CharacterSelectorProps {
  selectedCharacter: CharacterItem | null;
  onSelectCharacter: (char: CharacterItem) => void;
  customCharacterUrl: string | null;
  customCharacterFile: File | null;
  onUploadCustomImage: (dataUrl: string, file?: File | null) => void;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  selectedCharacter,
  onSelectCharacter,
  customCharacterUrl,
  customCharacterFile,
  onUploadCustomImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Upload status: strictly true ONLY if user uploaded their own genuine file.
  // Presets and sample previews do NOT count as uploaded files.
  const isUserUploaded = Boolean(customCharacterFile);
  const activeImageUrl = isUserUploaded
    ? (customCharacterUrl || '')
    : (selectedCharacter?.imageUrl || DEFAULT_SAMPLE_IMAGE);

  const handleProcessFile = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Mohon pilih file gambar yang valid (JPG, PNG, atau WEBP).');
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      // Calculate target dimensions: max width 1080, max height 1920, guaranteed EVEN numbers
      let targetW = origW;
      let targetH = origH;
      const maxW = 1080;
      const maxH = 1920;

      if (targetW > maxW || targetH > maxH) {
        const ratio = Math.min(maxW / targetW, maxH / targetH);
        targetW = Math.round(targetW * ratio);
        targetH = Math.round(targetH * ratio);
      }

      // Ensure even dimensions (divisible by 2 for NVVFX / ComfyUI Super-Res)
      targetW = Math.max(2, Math.floor(targetW / 2) * 2);
      targetH = Math.max(2, Math.floor(targetH / 2) * 2);

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const normalizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
              onUploadCustomImage(dataUrl, normalizedFile);
            } else {
              const reader = new FileReader();
              reader.onload = (e) => onUploadCustomImage(e.target?.result as string, file);
              reader.readAsDataURL(file);
            }
          },
          'image/jpeg',
          0.95
        );
      } else {
        const reader = new FileReader();
        reader.onload = (e) => onUploadCustomImage(e.target?.result as string, file);
        reader.readAsDataURL(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = (e) => onUploadCustomImage(e.target?.result as string, file);
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  // Clipboard Paste (Ctrl+V) support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleProcessFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleClearCustom = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadCustomImage('', null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Main Upload Dropzone Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative rounded-3xl border-2 transition-all p-5 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer select-none ${
          isDragging
            ? 'border-amber-500 bg-amber-50/70 scale-[1.01]'
            : isUserUploaded
            ? 'border-emerald-500/60 bg-[#f9faf7] hover:bg-[#f2f6ee]'
            : 'border-dashed border-stone-300 hover:border-stone-400 bg-[#f9f8f4] hover:bg-[#f4f3ec]'
        }`}
      >
        {/* Top Header inside Card */}
        <div className="w-full flex items-center justify-between gap-2 mb-3 px-1 min-h-[24px]">
          <div className="flex items-center gap-1.5" />
        </div>

        {/* Image Preview */}
        <div className="relative mb-3.5 group/preview">
          <div
            className={`w-28 h-36 sm:w-32 sm:h-40 rounded-2xl overflow-hidden shadow-md border-2 bg-stone-200 relative ${
              isUserUploaded ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-white'
            }`}
          >
            <img
              src={activeImageUrl}
              alt={isUserUploaded ? 'Foto Karakter User' : 'Contoh Gambar'}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
          </div>

          {isUserUploaded && (
            <button
              type="button"
              onClick={handleClearCustom}
              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-stone-900 text-white hover:bg-red-600 shadow-md transition-colors"
              title="Hapus foto dan kembali ke preview contoh"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Information & Simple Label */}
        <div className="space-y-1 mb-3.5 max-w-sm text-center">
          <p className="text-xs text-stone-600 font-medium">
            {isUserUploaded ? (
              <span className="text-emerald-700 font-semibold">
                ✓ {customCharacterFile?.name || 'Foto karakter Anda'} (Siap digunakan)
              </span>
            ) : (
              <span className="text-stone-600 font-medium">
                contoh gambar bukan input
              </span>
            )}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-3 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
              isUserUploaded
                ? 'bg-stone-900 hover:bg-stone-800 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUserUploaded ? 'Ganti Foto Anda' : 'Unggah Foto Karakter Sendiri'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsGalleryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700 shadow-sm transition-all active:scale-95"
          >
            <History className="w-3.5 h-3.5 text-stone-500" />
            <span>Lihat Galeri Contoh</span>
          </button>
        </div>
      </div>

      {/* Gallery Modal - Visual Reference Only */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-[#fbfbfa] border border-stone-300 shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-800">
                    Galeri Karakter Preset (Contoh Visual)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Hanya acuan contoh visual. Untuk generate, wajib mengunggah file sendiri.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGalleryOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grid of Preset Characters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 overflow-y-auto scrollbar-thin">
              {CHARACTER_PRESETS.map((char) => {
                const isSelected = selectedCharacter?.id === char.id && !isUserUploaded;
                return (
                  <div
                    key={char.id}
                    onClick={() => {
                      onSelectCharacter(char);
                      setIsGalleryOpen(false);
                    }}
                    className={`group relative rounded-2xl overflow-hidden cursor-pointer border-2 transition-all text-left bg-white shadow-sm ${
                      isSelected
                        ? 'border-stone-900 ring-2 ring-stone-900/20'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <div className="aspect-[3/4] w-full bg-stone-100 overflow-hidden relative">
                      <img
                        src={char.imageUrl}
                        alt={char.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-stone-900 text-white flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-[11px] font-bold text-white truncate drop-shadow">
                          {char.name}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsGalleryOpen(false)}
                className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
