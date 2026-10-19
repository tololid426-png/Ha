import React from 'react';
import { KeyRound } from 'lucide-react';

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
  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-[#f4f3ec]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src="/src/assets/images/motion_robot_logo_1791840520052.jpg"
            alt="Motion Studio AI"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-xl object-cover shadow-xs border border-stone-200/60"
          />
          <div>
            <h1 className="text-sm font-bold text-stone-900 tracking-tight">
              Motion Studio AI
            </h1>
          </div>
        </div>

        {/* API Key Settings Button & Credit Badge */}
        <div className="flex items-center gap-2">
          {keyBalance && (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-mono font-semibold">
              <span>🪙</span>
              <span>{keyBalance.includes('Aktif') ? 'Credit: Valid' : `${keyBalance} Koin`}</span>
            </div>
          )}

          <button
            onClick={onOpenApiSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 transition-all shadow-sm active:scale-95"
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
