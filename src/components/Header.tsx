import React, { useState } from 'react';
import { KeyRound, Puzzle, ExternalLink, Check, Loader2 } from 'lucide-react';
import { isRunningAsExtension, downloadExtensionBreZip } from '../utils/extensionStandaloneEngine';

interface HeaderProps {
  hasApiKey: boolean;
  onOpenApiSettings: () => void;
  keyBalance?: string | null;
  poolCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  hasApiKey,
  onOpenApiSettings,
  keyBalance,
  poolCount = 0,
}) => {
  const inExtension = isRunningAsExtension();
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number>(0);
  const [downloadDone, setDownloadDone] = useState(false);

  const handleOpenFullTab = () => {
    const chromeObj = typeof window !== 'undefined' ? (window as any).chrome : null;
    if (chromeObj?.tabs?.create && chromeObj?.runtime?.getURL) {
      chromeObj.tabs.create({ url: chromeObj.runtime.getURL('index.html?tab=1') });
    } else {
      window.open(window.location.href, '_blank');
    }
  };

  const handleDownloadBre = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloadingZip) return;
    setIsDownloadingZip(true);
    setDownloadPct(0);
    setDownloadDone(false);
    try {
      await downloadExtensionBreZip((pct) => setDownloadPct(pct));
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 4000);
    } catch {
      window.location.href = '/api/extension/download-zip';
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-[#f4f3ec]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/motion-logo.png"
            alt="Motion Studio AI"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-xl object-cover shadow-xs border border-stone-200/60"
          />
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-stone-900 tracking-tight">
              Motion Studio AI
            </h1>
            {inExtension && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-mono font-bold">
                BRE Aktif
              </span>
            )}
          </div>
        </div>

        {/* API Key Settings Button & Credit Badge & Extension BRE Download */}
        <div className="flex items-center gap-2">
          {keyBalance && (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-mono font-semibold">
              <span>🪙</span>
              <span>{keyBalance.includes('Aktif') ? 'Credit: Valid' : `${keyBalance} Koin`}</span>
            </div>
          )}

          {inExtension ? (
            <button
              type="button"
              onClick={handleOpenFullTab}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Buka Aplikasi di Tab Browser Penuh"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Tab Penuh</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadBre}
              disabled={isDownloadingZip}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white transition-all shadow-xs active:scale-95 cursor-pointer"
              title="Unduh Paket Ekstensi Browser BRE (.zip) Lengkap & Terverifikasi"
            >
              {isDownloadingZip ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Unduh {downloadPct}%</span>
                </>
              ) : downloadDone ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Terunduh 100%!</span>
                </>
              ) : (
                <>
                  <Puzzle className="w-3.5 h-3.5" />
                  <span>Unduh BRE (.zip)</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onOpenApiSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-stone-600" />
            <span>API Key</span>
            {poolCount > 0 && (
              <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded-full border border-stone-200 font-semibold">
                {poolCount}
              </span>
            )}
            <span
              className={`w-2 h-2 rounded-full ${
                hasApiKey ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-amber-500 ring-2 ring-amber-200'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
