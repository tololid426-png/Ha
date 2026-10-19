import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  Check,
  Upload,
  FileText,
  Trash2,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Plus,
  AlertCircle,
  Edit2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  apiKeysPool?: string[];
  setApiKeysPool?: (keys: string[]) => void;
  webappId?: string;
  setWebappId?: (id: string) => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  apiKeysPool = [],
  setApiKeysPool,
  webappId = '2098087538199212034',
  setWebappId,
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'model'>('single');
  const [singleKey, setSingleKey] = useState<string>(apiKey);
  const [showSingleKey, setShowSingleKey] = useState<boolean>(false);
  const [savedSingle, setSavedSingle] = useState<boolean>(false);
  const [customWebappInput, setCustomWebappInput] = useState<string>(webappId);
  const [modelSavedNotice, setModelSavedNotice] = useState<string | null>(null);

  // Bulk state
  const [bulkRawText, setBulkRawText] = useState<string>('');
  const [parsedKeys, setParsedKeys] = useState<string[]>([]);
  const [importedSuccess, setImportedSuccess] = useState<boolean>(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Credit / Coin balance checking state
  const [keyBalanceMap, setKeyBalanceMap] = useState<Record<string, string>>({});
  const [checkingKeys, setCheckingKeys] = useState<Record<string, boolean>>({});

  const checkKeyBalance = async (targetKey: string) => {
    if (!targetKey || !targetKey.trim()) return;
    const clean = targetKey.trim();
    setCheckingKeys((prev) => ({ ...prev, [clean]: true }));

    try {
      const res = await fetch('/api/runninghub/check-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: clean }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const bal = data.balance !== null && data.balance !== undefined ? String(data.balance) : '0';
        setKeyBalanceMap((prev) => ({ ...prev, [clean]: bal }));
      } else {
        setKeyBalanceMap((prev) => ({ ...prev, [clean]: 'Tidak Valid' }));
      }
    } catch {
      setKeyBalanceMap((prev) => ({ ...prev, [clean]: 'Error' }));
    } finally {
      setCheckingKeys((prev) => ({ ...prev, [clean]: false }));
    }
  };

  const checkAllPoolBalances = async (keysList?: string[]) => {
    const list = keysList || apiKeysPool;
    const allKeys = Array.from(new Set([singleKey, ...list].map((k) => (k || '').trim()).filter(Boolean)));
    if (allKeys.length === 0) return;

    await Promise.all(allKeys.map((k) => checkKeyBalance(k)));
  };

  // Synchronize on modal open and auto-check all pool keys
  useEffect(() => {
    if (isOpen) {
      setSingleKey(apiKey);
      setBulkNotice(null);
      setImportedSuccess(false);
      checkAllPoolBalances(apiKeysPool);
    }
  }, [isOpen, apiKey]);

  // Parse text whenever bulkRawText changes
  useEffect(() => {
    if (!bulkRawText) {
      setParsedKeys([]);
      return;
    }

    const lines = bulkRawText.split(/\r?\n/);
    const validKeys: string[] = [];
    const seen = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // Skip empty lines
      if (!line) continue;
      // Skip comments starting with # or //
      if (line.startsWith('#') || line.startsWith('//')) continue;
      // Skip duplicates
      if (seen.has(line)) continue;

      seen.add(line);
      validKeys.push(line);
    }

    setParsedKeys(validKeys);
  }, [bulkRawText]);

  if (!isOpen) return null;

  // Handle single key save
  const handleSaveSingle = () => {
    const trimmed = singleKey.trim();
    setApiKey(trimmed);

    // Also add to pool if setApiKeysPool is provided and not already present
    if (trimmed && setApiKeysPool && !apiKeysPool.includes(trimmed)) {
      setApiKeysPool([...apiKeysPool, trimmed]);
    }

    setSavedSingle(true);
    setTimeout(() => {
      setSavedSingle(false);
      onClose();
    }, 600);
  };

  // Handle .txt file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      setBulkNotice('Mohon pilih file dengan format teks (.txt)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      setBulkRawText(content);
      setBulkNotice(null);
    };
    reader.onerror = () => {
      setBulkNotice('Gagal membaca file .txt');
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle remove individual parsed key
  const handleRemoveParsedKey = (indexToRemove: number) => {
    const updated = parsedKeys.filter((_, idx) => idx !== indexToRemove);
    setParsedKeys(updated);
    setBulkRawText(updated.join('\n'));
  };

  // Handle edit individual parsed key
  const handleEditParsedKey = (indexToEdit: number, newVal: string) => {
    const updated = [...parsedKeys];
    updated[indexToEdit] = newVal.trim();
    setParsedKeys(updated);
    setBulkRawText(updated.join('\n'));
  };

  // Handle Bulk Import
  const handleImportBulk = () => {
    if (parsedKeys.length === 0) {
      setBulkNotice('Tidak ada API Key valid yang siap diimport.');
      return;
    }

    const poolSet = new Set(apiKeysPool);
    let addedCount = 0;

    for (const key of parsedKeys) {
      const trimmed = key.trim();
      if (trimmed && !poolSet.has(trimmed)) {
        poolSet.add(trimmed);
        addedCount++;
      }
    }

    const newPool = Array.from(poolSet);

    if (setApiKeysPool) {
      setApiKeysPool(newPool);
    }

    // If active apiKey is empty, pick the first valid key
    if (!apiKey || apiKey.trim() === '') {
      if (parsedKeys.length > 0) {
        setApiKey(parsedKeys[0].trim());
        setSingleKey(parsedKeys[0].trim());
      }
    }

    setImportedSuccess(true);
    setBulkNotice(`Berhasil mengimport ${parsedKeys.length} key ke Account Pool (${addedCount} key baru).`);

    setTimeout(() => {
      setImportedSuccess(false);
      setBulkRawText('');
      setParsedKeys([]);
      setActiveTab('single');
    }, 1200);
  };

  // Handle delete key from active pool
  const handleDeleteFromPool = (keyToDelete: string) => {
    if (!setApiKeysPool) return;
    const updatedPool = apiKeysPool.filter((k) => k !== keyToDelete);
    setApiKeysPool(updatedPool);
    if (apiKey === keyToDelete) {
      const nextKey = updatedPool.length > 0 ? updatedPool[0] : '';
      setApiKey(nextKey);
      setSingleKey(nextKey);
    }
  };

  // Handle purging invalid/banned and 0 coin keys from active pool
  const handlePurgeBadKeys = async () => {
    if (!setApiKeysPool || apiKeysPool.length === 0) return;
    setBulkNotice('Mengecek dan menyingkirkan API Key yang diblokir atau koin 0...');

    try {
      const res = await fetch('/api/runninghub/check-keys-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: apiKeysPool }),
      });
      const data = await res.json();
      if (data.code === 0 && Array.isArray(data.data)) {
        const results = data.data;
        const validWithCoins = results.filter((r: any) => r.valid && r.balance > 0).map((r: any) => r.apiKey);
        const removedCount = apiKeysPool.length - validWithCoins.length;

        setApiKeysPool(validWithCoins);
        if (validWithCoins.length > 0 && (!validWithCoins.includes(apiKey))) {
          setApiKey(validWithCoins[0]);
          setSingleKey(validWithCoins[0]);
        }
        setBulkNotice(`Berhasil menyingkirkan ${removedCount} API Key yang terblokir / 0 koin.`);
      }
    } catch {
      setBulkNotice('Gagal memeriksa pool API Key.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-stone-300 bg-[#fbfbfa] shadow-2xl p-5 sm:p-6 text-left max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-900 text-amber-300 flex items-center justify-center shadow-xs">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">RunningHub API Key</h3>
              <p className="text-[11px] text-stone-500">
                Kelola kredensial akun & GPU pool
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: [Satu Key] [Bulk] [⭐ Model RunningHub] */}
        <div className="pt-3.5 pb-2 shrink-0">
          <div className="bg-[#e8e6de] p-1 rounded-2xl inline-flex items-center gap-1 shadow-inner w-full">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'single'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Satu Key</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'bulk'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bulk Pool</span>
              {apiKeysPool.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-800 font-mono">
                  {apiKeysPool.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('model')}
              className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'model'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Model & Endpoint</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="py-2 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {/* TAB 1: SATU KEY */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    API Key RunningHub Aktif
                  </label>
                  {singleKey.trim() && (
                    <button
                      type="button"
                      onClick={() => checkKeyBalance(singleKey)}
                      disabled={checkingKeys[singleKey.trim()]}
                      className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200/80 px-2.5 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                    >
                      {checkingKeys[singleKey.trim()] ? (
                        <span>Checking...</span>
                      ) : (
                        <>
                          <span>🪙 Cek Koin</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showSingleKey ? 'text' : 'password'}
                    value={singleKey}
                    onChange={(e) => setSingleKey(e.target.value)}
                    placeholder="Masukkan API Key RunningHub..."
                    className="w-full bg-white border border-stone-300 rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSingleKey(!showSingleKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition-colors"
                    title={showSingleKey ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showSingleKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Balance Badge Display */}
                {singleKey.trim() && keyBalanceMap[singleKey.trim()] && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <span>🪙</span>
                      <span>Status / Saldo Koin:</span>
                    </span>
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-amber-200/60 font-semibold text-amber-950">
                      {keyBalanceMap[singleKey.trim()] === 'Tidak Valid' || keyBalanceMap[singleKey.trim()] === 'Error'
                        ? keyBalanceMap[singleKey.trim()]
                        : `${keyBalanceMap[singleKey.trim()]} Koin`}
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">
                  API Key digunakan untuk menjalankan render gerakan di RunningHub GPU cluster secara otomatis.
                </p>
              </div>

              {/* Pool Quick Switcher if pool exists */}
              {apiKeysPool.length > 0 && (
                <div className="pt-2 border-t border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-stone-600" />
                      Account Pool ({apiKeysPool.length} Key Tersedia)
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => checkAllPoolBalances(apiKeysPool)}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-colors"
                      >
                        🔄 Cek Credit
                      </button>
                      <button
                        type="button"
                        onClick={handlePurgeBadKeys}
                        className="text-[11px] font-semibold text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1"
                        title="Menyingkirkan API Key yang terblokir atau koin 0"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Bersihkan 0 Koin</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('bulk')}
                        className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 underline ml-1"
                      >
                        + Bulk
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-0.5">
                    {apiKeysPool.map((pKey, idx) => {
                      const isSelected = singleKey.trim() === pKey.trim();
                      const rawBal = keyBalanceMap[pKey.trim()];
                      const isChecking = checkingKeys[pKey.trim()];

                      let balanceBadge = null;
                      if (isChecking) {
                        balanceBadge = (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-700 animate-pulse">
                            Checking...
                          </span>
                        );
                      } else if (rawBal !== undefined) {
                        if (rawBal === 'Tidak Valid') {
                          balanceBadge = (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-red-100 text-red-800 border border-red-200">
                              Tidak Valid
                            </span>
                          );
                        } else if (rawBal === '0' || rawBal === 'Habis') {
                          balanceBadge = (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-red-100 text-red-800 border border-red-200">
                              0 Koin (Habis)
                            </span>
                          );
                        } else {
                          balanceBadge = (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                isSelected
                                  ? 'bg-amber-400/30 text-amber-200 border border-amber-300/40'
                                  : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}
                            >
                              🪙 {rawBal} Koin
                            </span>
                          );
                        }
                      }

                      return (
                        <div
                          key={`${pKey}-${idx}`}
                          onClick={() => setSingleKey(pKey)}
                          className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                              : 'bg-white hover:bg-stone-50 text-stone-800 border-stone-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isSelected ? 'bg-amber-400' : 'bg-stone-300'
                              }`}
                            />
                            <span className="truncate">
                              {pKey.length > 20
                                ? `${pKey.slice(0, 8)}...${pKey.slice(-8)}`
                                : pKey}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {balanceBadge}
                            {isSelected && (
                              <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-white/20 text-white font-medium">
                                Aktif
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFromPool(pKey);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isSelected
                                  ? 'hover:bg-red-500/20 text-stone-300 hover:text-red-300'
                                  : 'hover:bg-red-50 text-stone-400 hover:text-red-600'
                              }`}
                              title="Hapus dari pool"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BULK IMPORT */}
          {activeTab === 'bulk' && (
            <div className="space-y-3.5">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Upload .txt Button Banner */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-400 bg-[#f9f8f4] hover:bg-[#f3f2eb] text-xs font-semibold text-stone-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  <Upload className="w-4 h-4 text-stone-600" />
                  <span>Upload File .txt (Banyak Key)</span>
                </button>
              </div>

              {/* Raw Textarea Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-stone-700">
                    Atau Paste Daftar API Key (1 Key per baris)
                  </label>
                  {bulkRawText && (
                    <button
                      type="button"
                      onClick={() => setBulkRawText('')}
                      className="text-[11px] text-stone-500 hover:text-red-600 transition-colors"
                    >
                      Bersihkan Input
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={bulkRawText}
                  onChange={(e) => setBulkRawText(e.target.value)}
                  placeholder={`557037b7acc443318ce466235a515a90\n# Komentar diabaikan\n88ab91c28f321908ce466235a515a11`}
                  className="w-full bg-white border border-stone-300 rounded-2xl p-3 text-xs font-mono text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-800 leading-relaxed"
                />
                <p className="text-[10px] text-stone-500 mt-1 leading-normal">
                  * Baris kosong, komentar diawali <code>#</code>, dan key duplikat otomatis diabaikan.
                </p>
              </div>

              {/* Notice / Feedback Banner */}
              {bulkNotice && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                    importedSuccess
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {importedSuccess ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span className="font-medium">{bulkNotice}</span>
                </div>
              )}

              {/* Parsed Keys Preview List (Editable before Import) */}
              {parsedKeys.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-stone-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-stone-600" />
                      Daftar Key Siap Diimport ({parsedKeys.length} Key Valid)
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                      Unik & Siap
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                    {parsedKeys.map((keyVal, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-stone-200 text-xs shadow-2xs"
                      >
                        <span className="text-[10px] font-mono font-bold text-stone-400 w-5 text-center">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={keyVal}
                          onChange={(e) => handleEditParsedKey(idx, e.target.value)}
                          className="flex-1 bg-transparent border-none text-xs font-mono text-stone-800 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveParsedKey(idx)}
                          className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Hapus key ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MODEL & ENDPOINT */}
          {activeTab === 'model' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-stone-100/80 border border-stone-200">
                <span className="text-xs font-bold text-stone-800 block">
                  Pilih Pipeline Motion Control RunningHub
                </span>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                  Semua pipeline berjalan via endpoint resmi RunningHub OpenAPI <code>/task/openapi/ai-app/run</code>.
                </p>
              </div>

              {modelSavedNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{modelSavedNotice}</span>
                </div>
              )}

              {/* Model 1 (MC1 PRO) Card - Primary Choice */}
              <div
                onClick={() => {
                  if (setWebappId) setWebappId('2082796145605492738');
                  setCustomWebappInput('2082796145605492738');
                  setModelSavedNotice('Model MC1 PRO (Motion Control HD 1080x1920) aktif dipilih!');
                  setTimeout(() => setModelSavedNotice(null), 2500);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465'
                    ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200/70 shadow-xs'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        ⚡ MC1 PRO {webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465' ? '· AKTIF' : ''}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-stone-900 mt-1">
                      MC1 PRO (Motion_control _HD_1080x1920)
                    </h4>
                    <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                      Mode Standar 24GB VRAM. Gerakan smooth & natural, konsistensi wajah tinggi. <strong>Node 30: Foto Karakter + Node 33: Video Gerakan &rarr; Output Master Node 490 (1080p Full HD)</strong>.
                    </p>
                    <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-mono text-stone-500">
                        ID: 2082796145605492738
                      </span>
                      <a
                        href="https://www.runninghub.ai/id/ai-detail-mobile/2082796145605492738"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1 cursor-pointer"
                        title="Buka link resmi di RunningHub"
                      >
                        <span>Cek Link Asli RunningHub</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465' ? (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-stone-300 bg-white" />
                    )}
                  </div>
                </div>
              </div>

              {/* Model 2 (MC2 STANDAR) Card */}
              <div
                onClick={() => {
                  if (setWebappId) setWebappId('2098087538199212034');
                  setCustomWebappInput('2098087538199212034');
                  setModelSavedNotice('Model MC2 STANDAR aktif dipilih!');
                  setTimeout(() => setModelSavedNotice(null), 2500);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  webappId === '2098087538199212034'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200/60 shadow-xs'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                        📹 MC2 STANDAR {webappId === '2098087538199212034' ? '· AKTIF' : ''}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-stone-900 mt-1">
                      MC2 STANDAR (Eposcents MC HD)
                    </h4>
                    <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                      Powered by WAN model + SCAIL (Output 736p HD). Node 30 (Image) + Node 33 (Video).
                    </p>
                    <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-mono text-stone-500">
                        ID: 2098087538199212034
                      </span>
                      <a
                        href="https://www.runninghub.ai/id/ai-detail-mobile/2098087538199212034"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer"
                        title="Buka link resmi di RunningHub"
                      >
                        <span>Cek Link Asli RunningHub</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {webappId === '2098087538199212034' ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-stone-300 bg-white" />
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Webapp ID */}
              <div className="p-3.5 rounded-2xl border border-stone-200 bg-white space-y-2">
                <span className="text-xs font-bold text-stone-800 flex items-center gap-1">
                  <Edit2 className="w-3.5 h-3.5 text-stone-500" />
                  Kustom Webapp ID RunningHub
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customWebappInput}
                    onChange={(e) => setCustomWebappInput(e.target.value.trim())}
                    placeholder="Contoh: 2082796145605492738"
                    className="flex-1 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customWebappInput && setWebappId) {
                        setWebappId(customWebappInput);
                        setModelSavedNotice(`Webapp ID ${customWebappInput} berhasil diterapkan!`);
                        setTimeout(() => setModelSavedNotice(null), 2500);
                      }
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-900 hover:bg-stone-800 text-white transition-colors"
                  >
                    Terapkan
                  </button>
                </div>
              </div>

              {/* Endpoint Documentation & cURL Card */}
              <div className="p-3.5 rounded-2xl border border-stone-800/10 bg-stone-900 text-stone-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      {webappId === '2098087538199212034'
                        ? 'ENDPOINT RESMI (MC2 STANDAR: EPOSCENTS MC HD · WAN+SCAIL)'
                        : webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465'
                        ? 'ENDPOINT RESMI (MC1 PRO: MOTION CONTROL HD 1080x1920)'
                        : `ENDPOINT RESMI (WEBAPP ID: ${webappId})`}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-stone-300">
                    POST
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="bg-black/40 rounded-xl p-2.5 border border-white/10 break-all select-all">
                    <div className="text-[10px] text-stone-400 font-sans font-medium mb-1">
                      1. Endpoint RunningHub Cloud:
                    </div>
                    <span className="text-emerald-400 font-bold">https://www.runninghub.ai/task/openapi/ai-app/run</span>
                    <div className="text-[9px] text-stone-400 mt-0.5">Mirror alternatif: https://www.runninghub.cn/task/openapi/ai-app/run</div>
                  </div>

                  <div className="bg-black/40 rounded-xl p-2.5 border border-white/10 break-all select-all">
                    <div className="text-[10px] text-stone-400 font-sans font-medium mb-1">
                      2. Endpoint Backend Aplikasi (Auto Queue & Simpan 48 Jam):
                    </div>
                    <span className="text-cyan-400 font-bold">POST /api/jobs/create</span>
                    <div className="text-[9px] text-stone-400 mt-0.5">Proxy langsung: POST /api/runninghub/run</div>
                  </div>
                </div>

                <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 space-y-1 text-[10px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400 font-sans block text-[10px]">
                      {webappId === '2098087538199212034'
                        ? 'Struktur Payload JSON MC2 STANDAR:'
                        : 'Struktur Payload JSON MC1 PRO (Resmi):'}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-sans">
                      {webappId === '2098087538199212034' ? 'Paket Hemat · 736p' : '1080p Full HD · 24GB VRAM'}
                    </span>
                  </div>
                  <pre className="text-stone-300 overflow-x-auto text-[10px] leading-tight">
{`curl -X POST https://www.runninghub.ai/task/openapi/ai-app/run \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "YOUR_API_KEY",
    "webappId": "${webappId || '2082796145605492738'}",
    "instanceType": "default",
    "nodeInfoList": [
      {
        "nodeId": "30",
        "fieldName": "image",
        "fieldValue": "${webappId === '2098087538199212034' ? 'foto.jpg' : '4f85666382f783be7f9f68e22078eeaa6c3308e5dee4cd81df4c11e58dad1483.png'}"
      },
      {
        "nodeId": "33",
        "fieldName": "video",
        "fieldValue": "${webappId === '2098087538199212034' ? 'video.mp4' : '86b118c3b25d10e6738c91b71872f414b9f713b705a00bd82adf55f469748e58.mp4'}"
      }
    ]
  }'`}
                  </pre>
                </div>

                {/* Node Murni Detail Card */}
                <div className="bg-black/60 rounded-xl p-2.5 border border-purple-500/30 space-y-2 text-[10px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-300 font-sans font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      Node Input Murni RunningHub (Webapp {webappId || '2082796145605492738'})
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-200 border border-purple-500/40 text-[9px]">
                      100% Murni
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800 space-y-0.5">
                      <div className="text-white font-bold font-sans">Node 30: LoadImage</div>
                      <div className="text-stone-400">fieldName: <span className="text-emerald-400 font-bold">image</span></div>
                      <div className="text-stone-400">fieldType: <span className="text-cyan-400 font-bold">IMAGE</span></div>
                      <div className="text-[9px] text-stone-500 truncate" title="4f85666382f783be7f9f68e22078eeaa6c3308e5dee4cd81df4c11e58dad1483.png">
                        default: 4f856663...1483.png
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-stone-900/90 border border-stone-800 space-y-0.5">
                      <div className="text-white font-bold font-sans">Node 33: VHS_LoadVideo</div>
                      <div className="text-stone-400">fieldName: <span className="text-emerald-400 font-bold">video</span></div>
                      <div className="text-stone-400">fieldType: <span className="text-cyan-400 font-bold">VIDEO</span></div>
                      <div className="text-[9px] text-stone-500 truncate" title="86b118c3b25d10e6738c91b71872f414b9f713b705a00bd82adf55f469748e58.mp4">
                        default: 86b118c3...8e58.mp4
                      </div>
                    </div>
                  </div>
                  <div className="text-[9px] text-stone-400 pt-0.5 border-t border-stone-800/80 flex items-center justify-between">
                    <span>Mode: <strong className="text-stone-200">Standard (24GB VRAM)</strong> · Output: <strong className="text-emerald-400">Node 490 (Master 1080p)</strong></span>
                    <a
                      href={`https://www.runninghub.ai/id/ai-detail-mobile/${webappId || '2082796145605492738'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-300 hover:text-white underline flex items-center gap-0.5"
                    >
                      <span>Buka di RunningHub</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-3.5 border-t border-stone-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            Batal
          </button>

          {activeTab === 'single' ? (
            <button
              type="button"
              onClick={handleSaveSingle}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5 transition-colors shadow-sm active:scale-95"
            >
              {savedSingle ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Tersimpan!</span>
                </>
              ) : (
                <span>Simpan</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleImportBulk}
              disabled={parsedKeys.length === 0}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 disabled:hover:bg-stone-900 text-white flex items-center gap-1.5 transition-colors shadow-sm active:scale-95"
            >
              {importedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Diimport!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Import ke Pool ({parsedKeys.length})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
