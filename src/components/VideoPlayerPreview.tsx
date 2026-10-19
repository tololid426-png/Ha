import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Clapperboard,
  History,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  XCircle,
  Volume2,
  VolumeX,
  Eye,
  X,
  ExternalLink,
  Film,
} from 'lucide-react';
import { MotionPreset } from '../types/motion';

export interface JobItem {
  id: string;
  jobTitle?: string;
  status: 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  createdAt: number;
  expiresAt: number | null;
  created_at_formatted: string;
  expires_at_formatted?: string;
  step: string;
  elapsedSeconds?: number;
  queuePosition?: number;
  totalWaitingInQueue?: number;
  apiKey?: string;
  videoUrl?: string;
  remoteVideoUrl?: string;
  webappId?: string;
  consumeCoins?: number;
  errorMessage?: string | null;
  characterImageUrl?: string;
  thumbnailUrl?: string;
  runninghubTaskId?: string;
}

interface VideoPlayerPreviewProps {
  motion?: MotionPreset | null;
  customMotionDuration?: number | null;
  isGenerating: boolean;
  generationStatus: 'idle' | 'generating' | 'success' | 'failed' | 'cancelled';
  generationStep: string;
  elapsedSeconds: number;
  errorMessage: string | null;
  generatedVideoUrl: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onNewJob?: () => void;
  // Multi-job queue management
  jobsList?: JobItem[];
  activeJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
  onCancelJobById?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onRetryJob?: (jobId: string) => void;
  onClearCompleted?: () => void;
  webappId?: string;
  character?: any;
  customCharacterUrl?: string | null;
  customMotionUrl?: string | null;
}

const CARDS_PER_PAGE = 4;

// Format seconds into MM:SS
function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Single Job Card Component
interface JobCardProps {
  job: JobItem | null;
  slotIndex: number;
  isActive: boolean;
  activeElapsed: number;
  onSelect?: () => void;
  onCancel?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onPreviewModal?: (job: JobItem) => void;
  customCharacterUrl?: string | null;
}

const JobCard: React.FC<JobCardProps> = ({
  job,
  slotIndex,
  isActive,
  activeElapsed,
  onSelect,
  onCancel,
  onDelete,
  onRetry,
  onPreviewModal,
  customCharacterUrl,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [fallbackProxyTried, setFallbackProxyTried] = useState<boolean>(false);

  // Standby / Empty Slot
  if (!job) {
    return (
      <div className="bg-[#0c0d12] border border-stone-800/80 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-between text-center aspect-[9/16] min-h-[220px] select-none opacity-60 shadow-xs box-border">
        {/* Top Badge */}
        <div className="w-full flex items-center justify-between">
          <span className="bg-stone-800/90 text-stone-400 border border-stone-700/60 text-[9px] font-mono px-2 py-0.5 rounded-full">
            Standby
          </span>
          <span className="text-[10px] font-mono text-stone-600">
            #{slotIndex + 1}
          </span>
        </div>

        {/* Circular Placeholder */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-stone-800 flex items-center justify-center text-stone-600 text-xs font-mono">
          --
        </div>

        {/* Text Below */}
        <div className="w-full space-y-0.5">
          <div className="text-[11px] font-semibold text-stone-400">
            Slot Kosong
          </div>
          <div className="text-[9px] text-stone-600 font-mono">
            Siap Generate
          </div>
        </div>
      </div>
    );
  }

  const isMC1 =
    job.webappId === '2082796145605492738' ||
    job.webappId === '2101901146469191682' ||
    job.webappId === '2083908699113918465';
  const effectiveCharacterImage =
    job.characterImageUrl ||
    job.thumbnailUrl ||
    (typeof window !== 'undefined' ? localStorage.getItem(`rh_thumb_${job.id}`) : null) ||
    (isActive && customCharacterUrl ? customCharacterUrl : null);

  // Compute elapsed time
  const currentElapsed =
    job.status === 'RUNNING' || job.status === 'WAITING'
      ? activeElapsed > 0
        ? activeElapsed
        : job.elapsedSeconds || 0
      : job.elapsedSeconds || 0;

  // Percentage for running state
  const percent =
    job.status === 'SUCCESS'
      ? 100
      : job.status === 'RUNNING'
      ? Math.min(98, Math.max(8, Math.floor((currentElapsed / 75) * 100)))
      : 0;

  // Multi-tier candidate sources for video playback: local faststart stream -> remote RunningHub -> proxy
  const candidateCardSources = [
    job.videoUrl,
    job.remoteVideoUrl,
    job.remoteVideoUrl ? `/api/runninghub/proxy-video?url=${encodeURIComponent(job.remoteVideoUrl)}` : null,
  ].filter(Boolean) as string[];

  const [cardSourceIdx, setCardSourceIdx] = useState<number>(0);
  const videoSrc = candidateCardSources[cardSourceIdx] || '';

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVideoError = () => {
    if (cardSourceIdx + 1 < candidateCardSources.length) {
      setCardSourceIdx((prev) => prev + 1);
    } else {
      setVideoError(true);
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-2xl flex flex-col justify-between aspect-[9/16] min-h-[220px] transition-all duration-200 cursor-pointer relative overflow-hidden group select-none shadow-sm box-border ${
        isActive
          ? isMC1
            ? 'border-2 border-purple-500 shadow-lg shadow-purple-950/50 ring-2 ring-purple-500/20'
            : 'border-2 border-emerald-500 shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500/20'
          : 'border border-stone-800/90 hover:border-stone-700 bg-[#0c0d12]'
      }`}
    >
      {/* 1. BACKGROUND THUMBNAIL LAYER: Foto Karakter Asli Milik Job */}
      {effectiveCharacterImage ? (
        <img
          src={effectiveCharacterImage}
          alt={job.jobTitle || 'Foto Karakter'}
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-[#0c0d12]" />
      )}

      {/* 2. MEDIA LAYER FOR SUCCESS: Tampilkan Video Hasil Asli pada Area Thumbnail Kartu yang Sama */}
      {job.status === 'SUCCESS' && videoSrc && !videoError && (
        <video
          key={videoSrc}
          ref={videoRef}
          src={videoSrc}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          onError={handleVideoError}
          className="absolute inset-0 w-full h-full object-cover z-5 pointer-events-none"
        />
      )}

      {/* 3. OVERLAYS BASED ON STATE */}

      {/* CASE A: DIPROSES (RUNNING / WAITING) */}
      {(job.status === 'RUNNING' || job.status === 'WAITING') && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[1px] flex flex-col items-center justify-center p-2.5 z-10 text-center">
          {/* Progress Indicator Ring */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-1">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="#27272a"
                strokeWidth="5"
                className="opacity-70"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke={isMC1 ? '#c084fc' : '#34d399'}
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={
                  2 * Math.PI * 26 - (percent / 100) * (2 * Math.PI * 26)
                }
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span
                className={`text-[10px] sm:text-xs font-mono font-extrabold ${
                  isMC1 ? 'text-purple-300' : 'text-emerald-300'
                }`}
              >
                {job.status === 'WAITING' ? '0%' : `${percent}%`}
              </span>
            </div>
          </div>

          {/* Prominent Timer MM:SS */}
          <div className="bg-black/85 px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-300 font-mono text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-sm mb-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{formatTime(currentElapsed)}</span>
          </div>

          {/* Status Label */}
          <div className="text-[10px] font-bold text-white tracking-wide">
            {job.status === 'WAITING'
              ? `Antri #${job.queuePosition || 1}`
              : 'Sedang Merender...'}
          </div>
          <div className="text-[9px] text-stone-400 font-mono truncate max-w-[130px]">
            {job.step || 'Memproses di GPU'}
          </div>
        </div>
      )}

      {/* CASE B: GAGAL ATAU DIBATALKAN */}
      {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-2.5 z-10 text-center space-y-1">
          {job.status === 'FAILED' ? (
            <>
              <div className="w-8 h-8 rounded-full bg-red-950/90 border border-red-500/50 flex items-center justify-center text-red-400 mb-0.5">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="text-[11px] font-bold text-red-300">
                Gagal Render
              </div>
              <p className="text-[9px] text-red-200/80 line-clamp-2 px-1">
                {job.errorMessage || 'Gangguan koneksi'}
              </p>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-stone-900/90 border border-stone-600/50 flex items-center justify-center text-stone-400 mb-0.5">
                <XCircle className="w-4 h-4" />
              </div>
              <div className="text-[11px] font-bold text-stone-300">
                Dibatalkan
              </div>
              <p className="text-[9px] text-stone-400">
                Dihentikan pengguna
              </p>
            </>
          )}
        </div>
      )}

      {/* CASE C: SUKSES (Hover controls & subtle bottom gradient) */}
      {job.status === 'SUCCESS' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
          <div className="h-12 bg-gradient-to-b from-black/85 via-black/40 to-transparent" />
          <div className="h-14 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        </div>
      )}

      {/* 4. TOP ROW (Z-20): Badges & Action Buttons */}
      <div className="w-full flex items-center justify-between p-2 z-20 relative gap-1">
        {/* Model Badge */}
        {isMC1 ? (
          <span className="bg-[#392d64]/95 text-[#c084fc] border border-purple-500/50 backdrop-blur-md text-[9px] font-extrabold uppercase tracking-tight px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>MC1</span>
          </span>
        ) : (
          <span className="bg-[#0f3d2f]/95 text-[#34d399] border border-emerald-500/50 backdrop-blur-md text-[9px] font-extrabold uppercase tracking-tight px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>MC2</span>
          </span>
        )}

        {/* Right Action / Coin Cost / Cancel button */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Biaya Koin RH */}
          <span className="bg-black/80 text-amber-300 border border-amber-500/30 backdrop-blur-md text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-xs">
            🪙{job.consumeCoins !== undefined && job.consumeCoins !== null ? job.consumeCoins : 8}
          </span>

          {/* Tombol Batalkan untuk Job yang sedang diproses */}
          {(job.status === 'RUNNING' || job.status === 'WAITING') && onCancel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(job.id);
              }}
              className="px-1.5 py-0.5 rounded-full bg-red-950/90 hover:bg-red-900 border border-red-700/80 text-red-200 text-[9px] font-bold flex items-center gap-0.5 transition-all shadow-xs cursor-pointer active:scale-95 pointer-events-auto"
              title="Batalkan Job"
            >
              <XCircle className="w-3 h-3 text-red-400" />
              <span>Batal</span>
            </button>
          )}

          {/* Retry Button untuk Job Gagal atau Dibatalkan */}
          {(job.status === 'FAILED' || job.status === 'CANCELLED') && onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(job.id);
              }}
              className="p-1 rounded-full bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 transition-colors shadow-xs cursor-pointer pointer-events-auto"
              title="Ulangi Job (Retry)"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}

          {/* Delete Button untuk Job Selesai/Gagal */}
          {(job.status === 'SUCCESS' ||
            job.status === 'FAILED' ||
            job.status === 'CANCELLED') &&
            onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(job.id);
                }}
                className="p-1 rounded-full bg-black/70 hover:bg-red-900/80 border border-stone-700/60 text-stone-300 hover:text-red-200 transition-colors shadow-xs cursor-pointer pointer-events-auto"
                title="Hapus Job Ini"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
        </div>
      </div>

      {/* 5. CENTER PLAY/PAUSE OVERLAY FOR SUCCESS VIDEO */}
      {job.status === 'SUCCESS' && videoSrc && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-10 h-10 rounded-full bg-black/75 hover:bg-black/95 border border-white/40 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 pointer-events-auto cursor-pointer"
            title={isPlaying ? 'Jeda' : 'Putar'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
      )}

      {/* 6. BOTTOM ROW (Z-20): Status / Video Controls */}
      <div className="w-full flex items-center justify-between p-2 z-20 relative gap-1">
        {job.status === 'SUCCESS' ? (
          <>
            {/* Status Selesai */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 backdrop-blur-md text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Selesai</span>
              </span>
            </div>

            {/* Quick Controls: Audio & Preview */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-1.5 rounded-full bg-black/80 hover:bg-black border border-stone-700/60 text-stone-200 transition-colors cursor-pointer pointer-events-auto shadow-xs"
                title={isMuted ? 'Nyalakan Suara' : 'Bisukan Suara'}
              >
                {isMuted ? (
                  <VolumeX className="w-3 h-3 text-stone-400" />
                ) : (
                  <Volume2 className="w-3 h-3 text-emerald-400" />
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPreviewModal) {
                    onPreviewModal(job);
                  } else if (onSelect) {
                    onSelect();
                  }
                }}
                className="p-1.5 rounded-full bg-black/80 hover:bg-black border border-stone-700/60 text-stone-200 hover:text-emerald-300 transition-colors cursor-pointer pointer-events-auto shadow-xs"
                title="Lihat / Putar Video"
              >
                <Eye className="w-3 h-3" />
              </button>

              {/* Tombol Preview Langsung RunningHub AI */}
              {(job.runninghubTaskId || job.remoteVideoUrl) && (
                <a
                  href={
                    job.runninghubTaskId
                      ? `https://www.runninghub.ai/task/${job.runninghubTaskId}`
                      : job.remoteVideoUrl || '#'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-2 py-1 rounded-full bg-purple-950/90 hover:bg-purple-800 border border-purple-500/80 text-purple-200 hover:text-white transition-all cursor-pointer pointer-events-auto shadow-xs flex items-center gap-1 text-[9px] font-bold"
                  title="Preview Langsung di RunningHub AI"
                >
                  <ExternalLink className="w-2.5 h-2.5 text-purple-300" />
                  <span>Preview RH</span>
                </a>
              )}
            </div>
          </>
        ) : job.status === 'RUNNING' || job.status === 'WAITING' ? (
          <div className="w-full flex items-center justify-between">
            <span className="text-[9px] font-mono text-stone-400">
              #{slotIndex + 1}
            </span>
            <div className="flex items-center gap-1.5">
              {job.runninghubTaskId && (
                <a
                  href={`https://www.runninghub.ai/task/${job.runninghubTaskId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-1.5 py-0.5 rounded-full bg-purple-950/90 border border-purple-500/60 text-purple-200 text-[8px] font-bold flex items-center gap-0.5 pointer-events-auto hover:bg-purple-900 transition-colors"
                  title="Cek Progress Langsung di RunningHub AI"
                >
                  <ExternalLink className="w-2.5 h-2.5 text-purple-300" />
                  <span>Cek RH</span>
                </a>
              )}
              <span className="text-[9px] font-mono text-amber-300 animate-pulse font-bold">
                ● PROSES
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full flex items-center justify-between">
            <span className="text-[9px] font-mono text-stone-400">
              #{slotIndex + 1}
            </span>
            <span className="text-[9px] font-mono text-stone-400 font-medium">
              {job.status === 'FAILED' ? 'GAGAL' : 'BATAL'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const VideoPlayerPreview: React.FC<VideoPlayerPreviewProps> = ({
  jobsList = [],
  activeJobId = null,
  elapsedSeconds,
  onSelectJob,
  onCancelJobById,
  onDeleteJob,
  onRetryJob,
  onClearCompleted,
  customCharacterUrl,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [previewModalJob, setPreviewModalJob] = useState<JobItem | null>(null);
  const totalPages = Math.max(1, Math.ceil(jobsList.length / CARDS_PER_PAGE));

  // Auto-sync page to show active job whenever activeJobId changes
  useEffect(() => {
    if (activeJobId && jobsList.length > 0) {
      const activeIdx = jobsList.findIndex((j) => j.id === activeJobId);
      if (activeIdx !== -1) {
        const targetPage = Math.floor(activeIdx / CARDS_PER_PAGE) + 1;
        setCurrentPage(targetPage);
      }
    }
  }, [activeJobId, jobsList.length]);

  // Clamp current page within bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Slice jobs for current page and pad to always render 4 cards in 2x2 grid
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
  const pageJobs = jobsList.slice(startIndex, startIndex + CARDS_PER_PAGE);
  const displaySlots: (JobItem | null)[] = [...pageJobs];
  while (displaySlots.length < CARDS_PER_PAGE) {
    displaySlots.push(null);
  }

  const [modalSourceIdx, setModalSourceIdx] = useState<number>(0);

  // Reset modal source when active modal job changes
  useEffect(() => {
    setModalSourceIdx(0);
  }, [previewModalJob?.id]);

  const modalSources = previewModalJob
    ? [
        previewModalJob.remoteVideoUrl,
        previewModalJob.videoUrl,
        previewModalJob.remoteVideoUrl
          ? `/api/runninghub/proxy-video?url=${encodeURIComponent(previewModalJob.remoteVideoUrl)}`
          : null,
      ].filter(Boolean) as string[]
    : [];

  const activeModalVideoSrc = modalSources[modalSourceIdx] || modalSources[0] || '';

  return (
    <>
      <div className="rounded-3xl border border-stone-300/80 bg-white/95 p-3.5 sm:p-4 flex flex-col shadow-sm space-y-3 box-border">
        {/* Top Header: Clapperboard Icon, Title & History Icon with Pagination */}
        <div className="flex items-center justify-between pb-2.5 border-b border-stone-200 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clapperboard className="w-4 h-4 text-amber-500 stroke-[2.2] shrink-0" />
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider truncate">
              Hasil Video Render
            </h3>
            <span className="text-[9px] font-mono text-stone-500 font-semibold px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 shrink-0">
              {jobsList.length} Job
            </span>
          </div>

          {/* History Icon & Pagination Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1 text-stone-500 text-xs font-medium mr-1">
              <History className="w-3.5 h-3.5 text-stone-500" />
              <span className="text-[11px]">Riwayat</span>
            </div>

            {/* Pagination buttons (< Hal 1/2 >) */}
            <div className="flex items-center gap-1 bg-[#f4f3ec] border border-stone-200/90 rounded-xl px-1.5 py-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded-lg text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-600 hover:bg-stone-200/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[10px] font-bold text-stone-700 px-1">
                {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded-lg text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:text-stone-600 hover:bg-stone-200/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 4 CARDS GRID (2x2) - 10-12px gap (gap-3), 9:16 aspect ratio */}
        <div className="grid grid-cols-2 gap-3 box-border">
          {displaySlots.map((job, slotIdx) => {
            const actualIndex = startIndex + slotIdx;
            const slotKey = job ? job.id : `slot-${actualIndex}`;
            const isActive = job ? activeJobId === job.id : false;

            return (
              <JobCard
                key={slotKey}
                job={job}
                slotIndex={actualIndex}
                isActive={isActive}
                activeElapsed={elapsedSeconds}
                onSelect={() => {
                  if (job && onSelectJob) {
                    onSelectJob(job.id);
                  }
                }}
                onCancel={onCancelJobById}
                onDelete={onDeleteJob}
                onRetry={onRetryJob}
                onPreviewModal={(targetJob) => {
                  if (targetJob) {
                    if (onSelectJob) onSelectJob(targetJob.id);
                    setPreviewModalJob(targetJob);
                  }
                }}
                customCharacterUrl={customCharacterUrl}
              />
            );
          })}
        </div>
      </div>

      {/* VIDEO PREVIEW MODAL POPUP */}
      {previewModalJob && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in box-border">
          <div className="bg-[#121318] border border-stone-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-900/60">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                    previewModalJob.webappId === '2082796145605492738' ||
                    previewModalJob.webappId === '2101901146469191682' ||
                    previewModalJob.webappId === '2083908699113918465'
                      ? 'bg-purple-950 text-purple-300 border border-purple-500/50'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                  }`}
                >
                  {previewModalJob.webappId === '2082796145605492738' ||
                  previewModalJob.webappId === '2101901146469191682' ||
                  previewModalJob.webappId === '2083908699113918465'
                    ? 'Job MC1 PRO'
                    : 'Job MC2 STANDAR'}
                </span>
                <span className="text-xs font-mono text-stone-300 font-bold truncate max-w-[200px]">
                  {previewModalJob.jobTitle || `Job #${previewModalJob.id.slice(-6)}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalJob(null)}
                className="p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer"
                title="Tutup Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Source Switcher Tabs (RunningHub Direct vs Local Server) */}
            {modalSources.length > 1 && (
              <div className="flex items-center justify-between px-4 py-1.5 bg-black/60 border-b border-stone-800/80 text-[10px] font-mono">
                <span className="text-stone-400">Pilih Sumber Video:</span>
                <div className="flex items-center gap-1.5">
                  {modalSources.map((src, idx) => {
                    const isRemote = src.includes('runninghub') || src.includes('xiaoyaoyou');
                    const isProxy = src.includes('proxy-video');
                    const label = isProxy ? 'Proxy RH' : isRemote ? '⚡ RunningHub CDN' : '💾 Server Lokal';
                    const isSelected = activeModalVideoSrc === src;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setModalSourceIdx(idx)}
                        className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Video Container */}
            <div className="relative w-full aspect-[9/16] max-h-[65vh] bg-black flex items-center justify-center overflow-hidden">
              {activeModalVideoSrc ? (
                <video
                  key={activeModalVideoSrc}
                  src={activeModalVideoSrc}
                  controls
                  autoPlay
                  loop
                  playsInline
                  onError={() => {
                    if (modalSourceIdx + 1 < modalSources.length) {
                      console.warn(`[Modal Preview] Video source #${modalSourceIdx + 1} gagal, beralih ke sumber cadangan...`);
                      setModalSourceIdx((prev) => prev + 1);
                    }
                  }}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-stone-400 text-xs font-mono">Video tidak tersedia</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between px-4 py-3 border-t border-stone-800 bg-stone-900/60 gap-2">
              <div className="text-[11px] font-mono text-stone-400">
                {previewModalJob.runninghubTaskId ? `Task: ${previewModalJob.runninghubTaskId}` : (previewModalJob.created_at_formatted || 'Baru saja')}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Tombol Preview Langsung RunningHub AI */}
                {previewModalJob.runninghubTaskId && (
                  <a
                    href={`https://www.runninghub.ai/task/${previewModalJob.runninghubTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                    title="Buka Halaman Task Resmi Langsung di RunningHub AI"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Preview Langsung RunningHub</span>
                  </a>
                )}
                {previewModalJob.remoteVideoUrl && (
                  <a
                    href={previewModalJob.remoteVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    title="Buka Video Langsung dari URL CDN RunningHub"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">CDN RH</span>
                  </a>
                )}
                {activeModalVideoSrc && (
                  <a
                    href={activeModalVideoSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    download="render_video.mp4"
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewModalJob(null)}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
