import React, { useRef, useState } from 'react';
import { History, X, Check, Film, Clapperboard, Link2, Sparkles, Play, AlertCircle, Upload } from 'lucide-react';
import { MotionPreset } from '../types/motion';
import { MOTION_PRESETS } from '../data/presets';

export const DEFAULT_SAMPLE_VIDEO = '/assets/rh_samples/driving_motion_0.mp4';
export const DEFAULT_SAMPLE_THUMBNAIL = '/assets/rh_samples/frame_0.jpg';

interface MotionSelectorProps {
  selectedMotion: MotionPreset | null;
  onSelectMotion: (motion: MotionPreset) => void;
  customMotionUrl: string | null;
  customMotionFile: File | null;
  customMotionDuration?: number | null;
  webappId?: string;
  onUploadCustomVideo: (
    dataUrl: string,
    fileName: string,
    file?: File | null,
    duration?: number
  ) => void;
}

export const MotionSelector: React.FC<MotionSelectorProps> = ({
  selectedMotion,
  onSelectMotion,
  customMotionUrl,
  customMotionFile,
  customMotionDuration,
  webappId = '2082796145605492738',
  onUploadCustomVideo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'tiktok'>('upload');
  const [tiktokUrl, setTiktokUrl] = useState<string>('');
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const isModel2 = webappId === '2098087538199212034';
  // Upload status: strictly true ONLY if user uploaded their own genuine file.
  // Presets and sample previews do NOT count as uploaded files.
  const isUserUploaded = Boolean(customMotionFile);
  const activeVideoUrl = isUserUploaded
    ? (customMotionUrl || '')
    : (selectedMotion?.videoUrl || DEFAULT_SAMPLE_VIDEO);
  const effectiveDuration = customMotionDuration || (isUserUploaded ? 15 : (selectedMotion?.duration || 21.8));
  const previousObjectUrlRef = useRef<string | null>(null);

  const handleProcessVideoFile = (file: File) => {
    setVideoError(null);
    if (!file.type.startsWith('video/')) {
      setVideoError('Mohon pilih file video yang valid (MP4, MOV, atau WEBM).');
      return;
    }

    // Revoke previous object URL if any
    if (previousObjectUrlRef.current && previousObjectUrlRef.current.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(previousObjectUrlRef.current);
      } catch {
        // ignore
      }
    }

    const objectUrl = URL.createObjectURL(file);
    previousObjectUrlRef.current = objectUrl;
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = objectUrl;

    tempVideo.onloadedmetadata = () => {
      const dur = Math.round(tempVideo.duration);
      if (isModel2 && dur > 29) {
        setVideoError(`Durasi video ${dur} detik. Pada Model MC2 STANDAR (WAN + SCAIL), batas durasi maksimal adalah 29 detik.`);
      } else if (dur > 30) {
        setVideoError(`Durasi video ${dur} detik. Disarankan maksimal 30 detik untuk hasil transfer optimal.`);
      }
      onUploadCustomVideo(objectUrl, file.name, file, dur);
    };

    tempVideo.onerror = () => {
      onUploadCustomVideo(objectUrl, file.name, file, 10);
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessVideoFile(file);
    }
  };

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
      handleProcessVideoFile(file);
    }
  };

  const handleClearCustom = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUploadCustomVideo('', '', null, undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyTikTokLink = async () => {
    if (!tiktokUrl.trim()) {
      setTiktokError('Masukkan link video terlebih dahulu.');
      return;
    }
    setTiktokError(null);

    const trimmed = tiktokUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setTiktokError('Format URL tidak valid. Gunakan format https://...');
      return;
    }

    if (trimmed.includes('tiktok.com') && !trimmed.includes('.mp4') && !trimmed.includes('.mov') && !trimmed.includes('.webm')) {
      setTiktokError('Untuk link TikTok, unduh video terlebih dahulu (misal via SnapTik / Savetik) lalu upload file .mp4 pada tab "Upload File", atau gunakan link langsung berkas MP4.');
      return;
    }

    onUploadCustomVideo(trimmed, 'Online Video', null, 15);
  };

  return (
    <div className="w-full space-y-3.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Segmented Switcher: Upload File / TikTok Link */}
      <div className="flex items-center justify-start">
        <div className="bg-[#e8e6de] p-1 rounded-2xl inline-flex items-center gap-1 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tiktok')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'tiktok'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            TikTok Link
          </button>
        </div>
      </div>

      {/* Tab Content 1: Upload File */}
      {activeTab === 'upload' ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative rounded-3xl border-2 transition-all p-5 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer select-none ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01]'
              : isUserUploaded
              ? 'border-indigo-500/60 bg-[#f8f9fc] hover:bg-[#f1f3fa]'
              : 'border-dashed border-stone-300 hover:border-stone-400 bg-[#f9f8f4] hover:bg-[#f4f3ec]'
          }`}
        >
          {/* Top Header inside Card */}
          <div className="w-full flex items-center justify-between gap-2 mb-3 px-1 min-h-[24px]">
            <div className="flex items-center gap-1.5" />

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-200/80 text-stone-700 border border-stone-300">
                {effectiveDuration}s
              </span>
            </div>
          </div>

          {/* Video Preview */}
          <div className="relative mb-3.5 group/preview">
            <div
              className={`w-40 h-28 sm:w-48 sm:h-32 rounded-2xl overflow-hidden shadow-md border-2 bg-black relative ${
                isUserUploaded ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-white'
              }`}
            >
              <video
                src={activeVideoUrl}
                poster={DEFAULT_SAMPLE_THUMBNAIL}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {isUserUploaded && (
              <button
                type="button"
                onClick={handleClearCustom}
                className="absolute -top-2 -right-2 p-1.5 rounded-full bg-stone-900 text-white hover:bg-red-600 shadow-md transition-colors"
                title="Hapus video dan kembali ke preview contoh"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Information & Simple Label */}
          <div className="space-y-1 mb-3.5 max-w-sm text-center">
            <p className="text-xs text-stone-600 font-medium">
              {isUserUploaded ? (
                <span className="text-indigo-700 font-semibold">
                  ✓ {customMotionFile?.name || 'Video gerakan Anda'} (Siap digunakan)
                </span>
              ) : (
                <span className="text-stone-600 font-medium">
                  contoh video bukan input
                </span>
              )}
            </p>
          </div>

          {videoError && (
            <div className="mb-3 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium animate-in fade-in max-w-xs">
              {videoError}
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
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUserUploaded ? 'Ganti Video Anda' : 'Unggah Video Gerakan Sendiri'}</span>
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
      ) : (
        /* Tab Content 2: TikTok Link Input Card */
        <div className="rounded-3xl border-2 border-dashed border-stone-300 bg-[#f9f8f4] p-6 sm:p-7 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-sm">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-stone-800 mb-1">
              Link Video TikTok / Shorts
            </h4>
            <p className="text-xs text-stone-500">
              Tempel link video TikTok sebagai referensi gerakan tari atau animasi
            </p>
          </div>

          <div className="w-full max-w-md space-y-2">
            <div className="flex gap-2">
              <input
                type="url"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@user/video/..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-800"
              />
              <button
                type="button"
                onClick={handleApplyTikTokLink}
                className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-all shadow-sm shrink-0"
              >
                Terapkan
              </button>
            </div>
            {tiktokError && (
              <p className="text-xs text-red-600 flex items-center gap-1 justify-center">
                <AlertCircle className="w-3 h-3" />
                <span>{tiktokError}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gallery Modal for Motion Presets - Visual Reference Only */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-[#fbfbfa] border border-stone-300 shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-800">
                    Galeri Gerakan Preset (Contoh Visual)
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

            {/* Grid of Preset Motions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 overflow-y-auto scrollbar-thin">
              {MOTION_PRESETS.map((mot) => {
                const isSelected = selectedMotion?.id === mot.id && !isUserUploaded;
                return (
                  <div
                    key={mot.id}
                    onClick={() => {
                      onSelectMotion(mot);
                      setIsGalleryOpen(false);
                    }}
                    className={`group relative rounded-2xl overflow-hidden cursor-pointer border-2 transition-all text-left bg-white shadow-sm ${
                      isSelected
                        ? 'border-stone-900 ring-2 ring-stone-900/20'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <div className="aspect-[3/4] w-full bg-stone-950 overflow-hidden relative">
                      <video
                        src={mot.videoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-stone-900 text-white flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-mono text-white">
                        {mot.duration}s
                      </div>
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-[11px] font-bold text-white truncate drop-shadow">
                          {mot.name}
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
