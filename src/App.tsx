import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CharacterSelector } from './components/CharacterSelector';
import { MotionSelector } from './components/MotionSelector';
import { VideoPlayerPreview, JobItem } from './components/VideoPlayerPreview';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { CHARACTER_PRESETS, MOTION_PRESETS } from './data/presets';
import { CharacterItem, MotionPreset } from './types/motion';
import { AlertTriangle, CheckCircle2, XCircle, Layers, Zap, Video, ExternalLink, Download, Loader2, Check } from 'lucide-react';
import { isRunningAsExtension, downloadExtensionBreZip } from './utils/extensionStandaloneEngine';

export default function App() {
  const isExtension = isRunningAsExtension();
  const [isDownloadingBreZip, setIsDownloadingBreZip] = useState(false);
  const [breDownloadPct, setBreDownloadPct] = useState(0);
  const [breZipSizeText, setBreZipSizeText] = useState<string | null>(null);
  // Input 1: Character Foto (Default to null for clean empty standby card)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterItem | null>(null);
  const [customCharacterUrl, setCustomCharacterUrl] = useState<string | null>(null);
  const [customCharacterFile, setCustomCharacterFile] = useState<File | null>(null);

  // Input 2: Video Gerakan (Default to null for clean empty standby card)
  const [selectedMotion, setSelectedMotion] = useState<MotionPreset | null>(null);
  const [customMotionUrl, setCustomMotionUrl] = useState<string | null>(null);
  const [customMotionFile, setCustomMotionFile] = useState<File | null>(null);
  const [customMotionDuration, setCustomMotionDuration] = useState<number | null>(null);

  // Webapp Model Config (MC1: 2082796145605492738 | MC2: 2098087538199212034)
  const MC1_WEBAPP_ID = '2082796145605492738';
  const MC2_WEBAPP_ID = '2098087538199212034';
  const [webappId, setWebappId] = useState<string>(() => {
    const saved = localStorage.getItem('rh_webapp_id');
    if (saved === '2083908699113918465' || saved === '2101901146469191682') return MC1_WEBAPP_ID;
    return saved || MC1_WEBAPP_ID;
  });

  useEffect(() => {
    localStorage.setItem('rh_webapp_id', webappId);
  }, [webappId]);

  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('rh_api_key') || '');
  const [apiKeysPool, setApiKeysPool] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('rh_api_keys_pool');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState<boolean>(false);

  // Multi-Job Queue State
  const [jobsList, setJobsList] = useState<JobItem[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Active Job specific display states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Job Timers (tracks elapsed seconds per job)
  const [jobElapsedMap, setJobElapsedMap] = useState<Record<string, number>>({});

  // Active API Key balance / coins state
  const [keyBalance, setKeyBalance] = useState<string | null>(null);

  // Check active key balance whenever apiKey changes
  useEffect(() => {
    if (!apiKey || !apiKey.trim()) {
      setKeyBalance(null);
      return;
    }

    const checkBalance = async () => {
      try {
        const res = await fetch('/api/runninghub/check-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        });
        const data = await res.json();
        if (data.code === 0 && data.balance !== null && data.balance !== undefined) {
          setKeyBalance(String(data.balance));
        } else {
          setKeyBalance(null);
        }
      } catch {
        setKeyBalance(null);
      }
    };

    checkBalance();
  }, [apiKey]);

  // Sync apiKey & apiKeysPool to localStorage
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('rh_api_key', apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('rh_api_keys_pool', JSON.stringify(apiKeysPool));
  }, [apiKeysPool]);

  // Initial load of recent jobs from backend
  useEffect(() => {
    const fetchInitialJobs = async () => {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        if (data.code === 0 && Array.isArray(data.data) && data.data.length > 0) {
          const loaded = data.data.map((j: JobItem) => ({
            ...j,
            characterImageUrl:
              j.characterImageUrl ||
              localStorage.getItem(`rh_thumb_${j.id}`) ||
              undefined,
          }));
          setJobsList(loaded);
          setActiveJobId(loaded[0].id);
        }
      } catch {
        // silent fail on initial load
      }
    };
    fetchInitialJobs();
  }, []);

  // Background ticker for elapsed seconds on running/waiting jobs
  useEffect(() => {
    const interval = setInterval(() => {
      setJobElapsedMap((prev) => {
        const updated = { ...prev };
        for (const job of jobsList) {
          if (job.status === 'RUNNING' || job.status === 'WAITING') {
            const runningSeconds = Math.max(0, Math.floor((Date.now() - job.createdAt) / 1000));
            updated[job.id] = runningSeconds;
          }
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [jobsList]);

  // Background poller for all active jobs (RUNNING / WAITING)
  useEffect(() => {
    const hasActiveJobs = jobsList.some(
      (j) => j.status === 'RUNNING' || j.status === 'WAITING'
    );

    if (!hasActiveJobs) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        if (data.code === 0 && Array.isArray(data.data)) {
          setJobsList((prev) => {
            const prevMap = new Map(prev.map((j) => [j.id, j]));
            return data.data.map((j: JobItem) => ({
              ...j,
              characterImageUrl:
                j.characterImageUrl ||
                prevMap.get(j.id)?.characterImageUrl ||
                localStorage.getItem(`rh_thumb_${j.id}`) ||
                undefined,
            }));
          });
        }
      } catch {
        // Ignore network blips
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [jobsList]);

  // Auto-dismiss success notice banner automatically after 2 seconds
  useEffect(() => {
    if (!successNotice) return;

    const timer = setTimeout(() => {
      setSuccessNotice(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [successNotice]);

  // Derive active job details
  const activeJob = jobsList.find((j) => j.id === activeJobId) || null;
  const activeElapsed = activeJob ? jobElapsedMap[activeJob.id] || 0 : 0;

  // Derive preview status
  const generationStatus: 'idle' | 'generating' | 'success' | 'failed' | 'cancelled' = activeJob
    ? activeJob.status === 'RUNNING' || activeJob.status === 'WAITING'
      ? 'generating'
      : activeJob.status === 'SUCCESS'
      ? 'success'
      : activeJob.status === 'CANCELLED'
      ? 'cancelled'
      : 'failed'
    : 'idle';

  const isGenerating = generationStatus === 'generating' || isSubmitting;
  const generationStep = activeJob ? activeJob.step : isSubmitting ? 'Memproses permintaan...' : 'Standby';
  const generatedVideoUrl = activeJob?.remoteVideoUrl || activeJob?.videoUrl || null;
  const activeErrorMessage = activeJob?.errorMessage || errorNotice;

  // Handle Cancel Active Job
  const handleCancelJob = async (jobIdToCancel?: string) => {
    const targetId = jobIdToCancel || activeJobId;
    if (!targetId) return;

    try {
      const res = await fetch(`/api/jobs/${targetId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.code === 0 && data.data) {
        setJobsList((prev) =>
          prev.map((j) => (j.id === targetId ? { ...j, ...data.data, status: 'CANCELLED' } : j))
        );
        setSuccessNotice('Generate berhasil dibatalkan. Anda dapat membuat job baru kapan saja.');
      }
    } catch {
      setErrorNotice('Gagal membatalkan generate.');
    }
  };

  // Handle Delete Single Job
  const handleDeleteJob = async (jobIdToDelete: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.code === 0) {
        setJobsList((prev) => prev.filter((j) => j.id !== jobIdToDelete));
        if (activeJobId === jobIdToDelete) {
          const remaining = jobsList.filter((j) => j.id !== jobIdToDelete);
          setActiveJobId(remaining.length > 0 ? remaining[0].id : null);
        }
        setSuccessNotice('Job riwayat berhasil dihapus.');
      }
    } catch {
      setErrorNotice('Gagal menghapus job.');
    }
  };

  // Handle Retry Job
  const handleRetryJobById = async (jobIdToRetry: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobIdToRetry}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.code === 0 && data.data) {
        setJobsList((prev) =>
          prev.map((j) => (j.id === jobIdToRetry ? data.data : j))
        );
        setActiveJobId(jobIdToRetry);
        setSuccessNotice('Job berhasil diantrikan ulang (Retry)!');
      }
    } catch {
      setErrorNotice('Gagal mengantrikan ulang job.');
    }
  };

  // Handle Clear Completed/Finished Jobs
  const handleClearCompletedJobs = async () => {
    try {
      const res = await fetch('/api/jobs/clear-finished', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.code === 0) {
        setJobsList((prev) => prev.filter((j) => j.status === 'RUNNING' || j.status === 'WAITING'));
        const stillActive = jobsList.find((j) => j.status === 'RUNNING' || j.status === 'WAITING');
        setActiveJobId(stillActive ? stillActive.id : null);
        setSuccessNotice(`${data.deletedCount || 0} job riwayat telah dibersihkan.`);
      }
    } catch {
      setErrorNotice('Gagal membersihkan riwayat.');
    }
  };

  // Helper to convert base64 dataUrl directly to File object without network fetch
  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // Helper to convert dataUrl or URL to File object
  const urlToFile = async (url: string, filename: string, mimeType: string): Promise<File> => {
    if (url.startsWith('data:')) {
      return dataUrlToFile(url, filename);
    }
    try {
      let fetchTarget = url;
      // If URL is external http/https and not on same origin, proxy through /api/download in Web Mode
      if (
        !isExtension &&
        (url.startsWith('http://') || url.startsWith('https://')) &&
        !url.startsWith(window.location.origin)
      ) {
        fetchTarget = `/api/download?url=${encodeURIComponent(url)}`;
      }

      const res = await fetch(fetchTarget);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const blob = await res.blob();
      if (blob.type && blob.type.includes('text/html')) {
        throw new Error('URL mengembalikan halaman web (HTML), bukan file gambar/video langsung.');
      }
      return new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });
    } catch (err: any) {
      console.warn(`[urlToFile] Error reading file from URL (${url}):`, err);
      throw new Error(`Gagal membaca berkas dari URL: ${err.message || 'Network error'}`);
    }
  };

  // Helper to upload file to RunningHub with automatic key rotation, purging bad keys, and auto-retry
  const uploadToRunningHub = async (
    file: File,
    fileType: 'image' | 'video',
    targetApiKey: string
  ): Promise<{ fileName: string; usedApiKey: string }> => {
    const candidateKeys = Array.from(
      new Set([targetApiKey, apiKey, ...apiKeysPool].map((k) => k.trim()).filter(Boolean))
    );

    let lastErrorMsg = '';

    for (const currentKey of candidateKeys) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const formData = new FormData();
          formData.append('apiKey', currentKey);
          formData.append('fileType', fileType);
          formData.append('file', file);

          const upRes = await fetch('/api/runninghub/upload', {
            method: 'POST',
            body: formData,
          });
          const upText = await upRes.text();
          let upData: any = {};
          try {
            upData = JSON.parse(upText);
          } catch {
            lastErrorMsg = `Server RunningHub sibuk (HTML response). Mencoba lagi (${attempt}/2)...`;
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }

          if ((upData.code === 0 || upData.code === 200) && upData.data?.fileName) {
            return { fileName: upData.data.fileName, usedApiKey: currentKey };
          }

          const msg = String(upData.msg || '');
          const lowerMsg = msg.toLowerCase();
          const isApiKeyFailed =
            upData.code === -1 ||
            upData.code === 401 ||
            upData.code === 806 ||
            lowerMsg.includes('apikey') ||
            lowerMsg.includes('verification failed') ||
            lowerMsg.includes('key_invalid') ||
            lowerMsg.includes('unauthorized') ||
            lowerMsg.includes('banned');

          if (isApiKeyFailed) {
            console.warn(`[Upload Auto-Purge] Key ${currentKey.slice(0, 6)}... tidak valid/banned (${msg}). Menyingkirkan dari pool...`);
            lastErrorMsg = 'API Key RunningHub tidak valid atau telah diblokir/banned';
            // Auto-purge bad key from active pool
            if (setApiKeysPool) {
              setApiKeysPool(apiKeysPool.filter((k) => k.trim() !== currentKey));
            }
            break;
          }

          lastErrorMsg = msg || 'Gagal mengunggah berkas';
        } catch (err: any) {
          lastErrorMsg = err.message || 'Gagal mengunggah berkas';
        }

        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    if (!lastErrorMsg) {
      lastErrorMsg = 'Gagal terhubung ke server RunningHub';
    }

    if (lastErrorMsg.includes('ApiKey verification failed') || lastErrorMsg.includes('API Key')) {
      throw new Error(`Gagal upload ${fileType === 'image' ? 'foto' : 'video'}: ${lastErrorMsg}. Silakan ganti API Key Anda pada tombol API Key di kanan atas.`);
    } else {
      throw new Error(`Gagal upload ${fileType === 'image' ? 'foto' : 'video'}: ${lastErrorMsg}`);
    }
  };

  // Smart helper to check pool keys, purge banned & 0-coin keys, and auto-select key with HIGHEST coin balance
  const pickBestApiKey = async (defaultKey: string): Promise<string> => {
    const candidatePool = Array.from(new Set([defaultKey, ...apiKeysPool].map((k) => k.trim()).filter(Boolean)));
    if (candidatePool.length === 0) return defaultKey.trim();

    try {
      // 1. Query live account status and coin balance for all keys in parallel
      const checkRes = await fetch('/api/runninghub/check-keys-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: candidatePool }),
      });

      if (!checkRes.ok) throw new Error('Endpoint bulk check tidak merespon');
      const resData = await checkRes.json();
      const results: Array<{ apiKey: string; valid: boolean; balance: number; balanceStr: string; msg: string }> =
        resData.data || [];

      // Identify invalid keys (banned/unauthorized) and 0-coin keys
      const invalidKeys = new Set(results.filter((r) => !r.valid).map((r) => r.apiKey));
      const zeroCoinKeys = new Set(results.filter((r) => r.valid && r.balance <= 0).map((r) => r.apiKey));
      const badKeys = new Set([...Array.from(invalidKeys), ...Array.from(zeroCoinKeys)]);

      // Auto-purge bad/banned/0-coin keys from active pool
      if (badKeys.size > 0 && setApiKeysPool) {
        const cleanedPool = apiKeysPool.filter((k) => !badKeys.has(k.trim()));
        setApiKeysPool(cleanedPool);
        console.log(`[Auto-Purge] Eliminasi ${badKeys.size} API Key yang terblokir atau koin habis (0 Koin).`);
      }

      // Filter only VALID keys with SUFFICIENT COINS (> 0 koin)
      const validWithCoins = results
        .filter((r) => r.valid && r.balance > 0)
        .sort((a, b) => b.balance - a.balance); // Sort by HIGHEST coin balance first!

      if (validWithCoins.length === 0) {
        // If no keys in pool have coins > 0, throw explicit error
        if (badKeys.size > 0) {
          throw new Error('Semua API Key di pool Anda telah diblokir atau koinnya habis (0 Koin). Silakan masukkan/import API Key RunningHub baru yang berisi koin.');
        }
        return defaultKey.trim();
      }

      // Determine keys currently running or waiting in UI
      const activeKeysInUse = new Set(
        jobsList.filter((j) => j.status === 'RUNNING' || j.status === 'WAITING').map((j) => (j.apiKey || '').trim())
      );

      // Prefer candidate key with HIGHEST COIN BALANCE that is NOT currently busy on another task
      const freeBestKey = validWithCoins.find((r) => !activeKeysInUse.has(r.apiKey));

      if (freeBestKey) {
        console.log(`[Smart Pick] Memilih API Key ${freeBestKey.apiKey.slice(0, 6)}... dengan saldo koin tertinggi (${freeBestKey.balance} Koin).`);
        if (freeBestKey.apiKey !== apiKey) {
          setApiKey(freeBestKey.apiKey);
        }
        return freeBestKey.apiKey;
      }

      // If all valid keys with coins are currently busy, pick the valid key with highest coin balance
      const topKey = validWithCoins[0].apiKey;
      if (topKey !== apiKey) {
        setApiKey(topKey);
      }
      return topKey;
    } catch (err: any) {
      if (err.message && err.message.includes('Semua API Key')) {
        throw err;
      }
      console.warn('[pickBestApiKey] Error during bulk check, fallback to candidate key:', err);
      return defaultKey.trim();
    }
  };

  // Handle Generate New Job
  const handleGenerate = async () => {
    // Resolve active key from apiKey or pool
    const effectiveApiKey = apiKey.trim() || (apiKeysPool.length > 0 ? apiKeysPool[0].trim() : '');

    if (!effectiveApiKey) {
      setErrorNotice('Silakan masukkan RunningHub API Key Anda terlebih dahulu pada tombol API Key di pojok kanan atas.');
      setIsApiSettingsOpen(true);
      return;
    }

    // Validasi: Pengguna wajib mengunggah gambar karakter dan video gerakan sendiri sebelum generate.
    // Preview contoh dan preset tidak dihitung sebagai upload.
    const hasCharacter = Boolean(customCharacterFile);
    const hasMotion = Boolean(customMotionFile);

    if (!hasCharacter || !hasMotion) {
      if (!hasCharacter && !hasMotion) {
        setErrorNotice('⚠️ Unggah foto karakter dan video referensi dulu, BRE!');
      } else if (!hasCharacter) {
        setErrorNotice('⚠️ Unggah foto karakter dulu, BRE!');
      } else {
        setErrorNotice('⚠️ Unggah video referensi dulu, BRE!');
      }
      return;
    }

    setIsSubmitting(true);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      // Smart pick key with highest credit balance automatically
      let keyForThisJob = await pickBestApiKey(effectiveApiKey);
      // Default RunningHub webapp assets per model
      const isMC1Model =
        webappId === MC1_WEBAPP_ID ||
        webappId === '2082796145605492738' ||
        webappId === '2101901146469191682' ||
        webappId === '2083908699113918465';
      let imageFileName = isMC1Model
        ? '4f85666382f783be7f9f68e22078eeaa6c3308e5dee4cd81df4c11e58dad1483.png'
        : '516c954a2e3816ee6ea440210b090ef25af59b46fdfbfa1ea44d794f0741bf4d.jpg';
      let videoFileName = isMC1Model
        ? '86b118c3b25d10e6738c91b71872f414b9f713b705a00bd82adf55f469748e58.mp4'
        : 'f43e5cbb4fa85cbe98c36cf0daeb8e2a3aa5ff84766be18d360ef3c67d1e8ef0.mp4';

      // 1. Process Character Image (Node #30)
      if (customCharacterFile) {
        const upRes = await uploadToRunningHub(customCharacterFile, 'image', keyForThisJob);
        imageFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      } else if (customCharacterUrl) {
        const fileFromUrl = await urlToFile(customCharacterUrl, 'character_custom.png', 'image/png');
        const upRes = await uploadToRunningHub(fileFromUrl, 'image', keyForThisJob);
        imageFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      } else if (selectedCharacter?.rhFileName) {
        // Use pre-uploaded RunningHub static file instantly! No wait!
        imageFileName = selectedCharacter.rhFileName;
      } else if (selectedCharacter?.imageUrl) {
        const presetImgFile = await urlToFile(selectedCharacter.imageUrl, `${selectedCharacter.id}.jpg`, 'image/jpeg');
        const upRes = await uploadToRunningHub(presetImgFile, 'image', keyForThisJob);
        imageFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      }

      // 2. Process Motion Video (Node #33)
      if (customMotionFile) {
        const upRes = await uploadToRunningHub(customMotionFile, 'video', keyForThisJob);
        videoFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      } else if (customMotionUrl) {
        const fileFromUrl = await urlToFile(customMotionUrl, 'motion_custom.mp4', 'video/mp4');
        const upRes = await uploadToRunningHub(fileFromUrl, 'video', keyForThisJob);
        videoFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      } else if (selectedMotion?.rhFileName) {
        // Use pre-uploaded RunningHub static file instantly! No wait!
        videoFileName = selectedMotion.rhFileName;
      } else if (selectedMotion?.videoUrl) {
        const presetVidFile = await urlToFile(selectedMotion.videoUrl, `${selectedMotion.id}.mp4`, 'video/mp4');
        const upRes = await uploadToRunningHub(presetVidFile, 'video', keyForThisJob);
        videoFileName = upRes.fileName;
        keyForThisJob = upRes.usedApiKey;
      }

      // 3. Dispatch Job to Backend Queue (Up to 10 Jobs in Queue)
      const jobIndex = jobsList.length + 1;
      const characterLabel = customCharacterFile ? 'Foto Kustom' : selectedCharacter?.name || 'Contoh Foto';
      const motionLabel = customMotionFile ? 'Video Kustom' : selectedMotion?.name || 'Contoh Video';
      const jobTitle = `Job #${jobIndex} (${characterLabel} + ${motionLabel})`;

      // Optimal 8 sampler steps for Motion Control 1080p pipeline
      const stepsValue = '8';
      const randomSeed = String(Math.floor(Math.random() * 1000000000));

      // Determine node mapping depending on model
      // Nomor 1: Motion Control 1080HD & Nomor 2: Eposcents MC HD
      // Both RunningHub workflows use Node 30 for Image (LoadImage) and Node 33 for Video (VHS_LoadVideo)
      const nodeInfoList = [
        { nodeId: '30', fieldName: 'image', fieldValue: imageFileName },
        { nodeId: '33', fieldName: 'video', fieldValue: videoFileName },
      ];

      const payload = {
        apiKey: keyForThisJob.trim(),
        apiKeysPool,
        webappId,
        jobTitle,
        nodeInfoList,
        characterImageUrl: customCharacterUrl || '',
      };

      const createRes = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const createData = await createRes.json();

      if (createData.code !== 0 || !createData.data?.id) {
        throw new Error(createData.msg || 'Gagal memasukkan task ke antrian backend.');
      }

      const newJob: JobItem = {
        ...createData.data,
        characterImageUrl: createData.data.characterImageUrl || customCharacterUrl || undefined,
      };

      if (customCharacterUrl) {
        try {
          localStorage.setItem(`rh_thumb_${newJob.id}`, customCharacterUrl);
        } catch {}
      }

      // Add new job to list and make it active
      setJobsList((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
      setActiveJobId(newJob.id);
      setIsSubmitting(false);
      setSuccessNotice(`Job #${jobIndex} berhasil ditambahkan ke antrian! Anda bisa membuat job berikutnya kapan saja.`);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorNotice(err.message || 'Gagal memproses render video.');
    }
  };

  // Handle Create New Job (prepare new inputs)
  const handlePrepareNewJob = () => {
    setActiveJobId(null);
    setErrorNotice(null);
    setCustomCharacterUrl(null);
    setCustomCharacterFile(null);
    setCustomMotionUrl(null);
    setCustomMotionFile(null);
    setCustomMotionDuration(null);
    setSelectedCharacter(null);
    setSelectedMotion(null);
    setSuccessNotice('Siap membuat job baru. Upload atau pilih foto & video gerakan.');
  };

  return (
    <div className="min-h-screen bg-[#f4f3ec] text-stone-900 flex flex-col antialiased selection:bg-stone-300 selection:text-stone-900">
      {/* Clean Global Header */}
      <Header
        hasApiKey={Boolean((apiKey && apiKey.trim().length > 0) || apiKeysPool.length > 0)}
        onOpenApiSettings={() => setIsApiSettingsOpen(true)}
        keyBalance={keyBalance}
        poolCount={apiKeysPool.length}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* BRE Extension Status / Download Banner */}
        {isExtension ? (
          <div className="rounded-3xl bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-slate-900/90 border border-emerald-500/30 p-4 shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-wide">Mode Aplikasi Extension BRE Aktif</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase font-mono">
                    Direct RunningHub Engine v2.0
                  </span>
                </div>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Terhubung langsung ke server GPU RunningHub tanpa perantara. Upload karakter & gerakan, pantau antrian live, preview video, dan unduh MP4 langsung dari ekstensi ini!
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const chromeObj = (window as any).chrome;
                if (chromeObj?.tabs?.create && chromeObj?.runtime?.getURL) {
                  chromeObj.tabs.create({ url: chromeObj.runtime.getURL('index.html') });
                } else {
                  window.open(window.location.href, '_blank');
                }
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka di Tab Penuh</span>
            </button>
          </div>
        ) : (
          <div className="rounded-3xl bg-gradient-to-r from-indigo-900/90 via-purple-900/90 to-slate-900/90 border border-indigo-500/30 p-4 shadow-lg text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-wide">Ekstensi Browser (BRE) Motion Studio AI</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase font-mono">
                    Full App Standalone v2.0
                  </span>
                </div>
                <p className="text-xs text-indigo-200/90 mt-0.5">
                  Unduh paket file ZIP ekstensi browser (Kiwi Browser Android / Chrome / Edge / Brave). Berisi aplikasi penuh yang terhubung langsung ke RunningHub hingga preview & download video MP4!
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                disabled={isDownloadingBreZip}
                onClick={async () => {
                  if (isDownloadingBreZip) return;
                  setIsDownloadingBreZip(true);
                  setBreDownloadPct(0);
                  setErrorNotice(null);
                  try {
                    const res = await downloadExtensionBreZip((pct) => setBreDownloadPct(pct));
                    const mb = (res.sizeBytes / (1024 * 1024)).toFixed(2);
                    setBreZipSizeText(`${mb} MB`);
                    setSuccessNotice(`✓ File ${res.fileName} (${mb} MB) berhasil diunduh 100% lengkap & terverifikasi! Silakan pasang di Kiwi Browser / Chrome.`);
                  } catch (err: any) {
                    setErrorNotice(`Gagal mengunduh via verifikasi otomatis (${err.message}). Membuka link unduhan langsung...`);
                    window.location.href = '/api/extension/download-zip';
                  } finally {
                    setIsDownloadingBreZip(false);
                  }
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-75 text-stone-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {isDownloadingBreZip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                    <span>Mengunduh ZIP Lengkap ({breDownloadPct}%)...</span>
                  </>
                ) : breZipSizeText ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3] text-stone-950" />
                    <span>Terunduh Lengkap ({breZipSizeText}) · Unduh Lagi</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>Unduh Extension BRE (.zip) Lengkap</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Model Motion Pipeline Selector */}
        <div className="rounded-3xl bg-[#0b0d13] border border-stone-800/90 p-3 sm:p-3.5 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 font-mono">
                PILIHAN MOTION PIPELINE
              </span>
            </div>
            <div className="flex items-center gap-2">
              {webappId !== MC1_WEBAPP_ID && webappId !== '2101901146469191682' && webappId !== '2083908699113918465' && webappId !== MC2_WEBAPP_ID && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Kustom: {webappId.slice(0, 8)}...
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsApiSettingsOpen(true)}
                className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-lg hover:bg-stone-800/60"
                title="Atur Webapp ID & API Key"
              >
                <span>⚙️</span>
                <span className="hidden sm:inline">Pengaturan</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* 1. MC1 PRO Card */}
            <button
              type="button"
              onClick={() => setWebappId(MC1_WEBAPP_ID)}
              className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer relative overflow-hidden group ${
                webappId === MC1_WEBAPP_ID || webappId === '2101901146469191682' || webappId === '2083908699113918465'
                  ? 'bg-[#201d3b] border-2 border-[#818cf8] ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-950/40'
                  : 'bg-[#181628]/90 border border-stone-800/90 hover:border-indigo-900/60 hover:bg-[#1e1b36] opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`p-2.5 rounded-xl transition-colors ${
                  webappId === MC1_WEBAPP_ID || webappId === '2101901146469191682' || webappId === '2083908699113918465'
                    ? 'bg-indigo-500/20 text-[#c4b5fd]'
                    : 'bg-white/5 text-[#a78bfa]/70 group-hover:text-[#c4b5fd]'
                }`}>
                  <Zap className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base sm:text-lg font-bold text-white tracking-tight">
                      MC1 PRO
                    </span>
                    {(webappId === MC1_WEBAPP_ID || webappId === '2101901146469191682' || webappId === '2083908699113918465') && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                        AKTIF
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#392d64] text-[#c084fc] border border-purple-500/30">
                  PRO · 1080p
                </span>
              </div>
            </button>

            {/* 2. MC2 STANDAR Card */}
            <button
              type="button"
              onClick={() => setWebappId('2098087538199212034')}
              className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer relative overflow-hidden group ${
                webappId === '2098087538199212034'
                  ? 'bg-[#122e26] border-2 border-[#34d399] ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-950/40'
                  : 'bg-[#0f1f1a]/90 border border-stone-800/90 hover:border-emerald-900/60 hover:bg-[#132822] opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`p-2.5 rounded-xl transition-colors ${
                  webappId === '2098087538199212034'
                    ? 'bg-emerald-500/20 text-[#34d399]'
                    : 'bg-white/5 text-[#34d399]/70 group-hover:text-[#34d399]'
                }`}>
                  <Video className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base sm:text-lg font-bold text-white tracking-tight">
                      MC2 STANDAR
                    </span>
                    {webappId === '2098087538199212034' && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                        AKTIF
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#0f3d2f] text-[#34d399] border border-emerald-500/30">
                  HEMAT
                </span>
              </div>
            </button>
          </div>
        </div>
        {/* Notice Alerts */}
        {errorNotice && (
          <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-medium">{errorNotice}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {(errorNotice.includes('NOT_ENOUGH_BALANCE') ||
                errorNotice.includes('API Key') ||
                errorNotice.includes('Koin') ||
                errorNotice.includes('Saldo')) && (
                <button
                  onClick={() => setIsApiSettingsOpen(true)}
                  className="text-xs px-3 py-1 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold transition-colors shadow-xs"
                >
                  ⚙️ Ganti / Tambah API Key
                </button>
              )}
              <button
                onClick={() => setErrorNotice(null)}
                className="text-xs px-2.5 py-1 rounded-xl bg-red-200/80 hover:bg-red-300 text-red-900 font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {successNotice && (
          <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{successNotice}</span>
            </div>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-200/80 hover:bg-emerald-300 text-emerald-900 font-medium"
            >
              Tutup
            </button>
          </div>
        )}

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Input Steps & Multi-Job Generate Actions (6 cols) */}
          <div className="lg:col-span-6 space-y-4">

            {/* 1. Karakter Foto (Matches Top Box in Image) */}
            <CharacterSelector
              selectedCharacter={selectedCharacter}
              onSelectCharacter={(char) => {
                setSelectedCharacter(char);
                setCustomCharacterUrl(null);
                setCustomCharacterFile(null);
                if (char.pairedMotionId) {
                  const matchedMot = MOTION_PRESETS.find((m) => m.id === char.pairedMotionId);
                  if (matchedMot) {
                    setSelectedMotion(matchedMot);
                    setCustomMotionUrl(null);
                    setCustomMotionFile(null);
                    setCustomMotionDuration(null);
                  }
                }
              }}
              customCharacterUrl={customCharacterUrl}
              customCharacterFile={customCharacterFile}
              onUploadCustomImage={(url, file) => {
                setCustomCharacterUrl(url || null);
                setCustomCharacterFile(file || null);
              }}
            />

            {/* 2. Video Gerakan (Matches Segmented Switcher & Bottom Box in Image) */}
            <MotionSelector
              selectedMotion={selectedMotion}
              onSelectMotion={(mot) => {
                setSelectedMotion(mot);
                setCustomMotionUrl(null);
                setCustomMotionFile(null);
                setCustomMotionDuration(null);
                if (mot.pairedCharacterId) {
                  const matchedChar = CHARACTER_PRESETS.find((c) => c.id === mot.pairedCharacterId);
                  if (matchedChar) {
                    setSelectedCharacter(matchedChar);
                    setCustomCharacterUrl(null);
                    setCustomCharacterFile(null);
                  }
                }
              }}
              customMotionUrl={customMotionUrl}
              customMotionFile={customMotionFile}
              customMotionDuration={customMotionDuration}
              webappId={webappId}
              onUploadCustomVideo={(url, _fileName, file, dur) => {
                setCustomMotionUrl(url || null);
                setCustomMotionFile(file || null);
                setCustomMotionDuration(dur ?? null);
              }}
            />

            {/* Generate & Cancel Action Area */}
            <div className="space-y-2.5 pt-1">
              <div className="flex gap-2.5">
                {/* Generate Button (Green mixed with White) */}
                <button
                  onClick={handleGenerate}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 px-8 rounded-full font-bold text-base text-white bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border-2 border-white shadow-[0_0_24px_rgba(16,185,129,0.5),0_0_12px_rgba(255,255,255,0.4)] hover:shadow-[0_0_32px_rgba(52,211,153,0.7),0_0_16px_rgba(255,255,255,0.6)] active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:pointer-events-none group relative overflow-hidden"
                >
                  {/* Subtle white sheen across green button */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/10 pointer-events-none" />

                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin relative z-10" />
                      <span className="tracking-wide text-white font-extrabold relative z-10 drop-shadow-sm">
                        Memproses Job...
                      </span>
                    </>
                  ) : (
                    <>
                      {/* Crisp White Star Icon */}
                      <svg
                        className="w-5 h-5 text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-transform group-hover:scale-110 relative z-10"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2l2.4 6.6 6.6 2.4-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
                      </svg>
                      <span className="tracking-wide font-extrabold text-white text-base relative z-10 drop-shadow-sm">
                        {jobsList.length > 0 ? '+ Generate Job Baru' : 'Generate'}
                      </span>
                    </>
                  )}
                </button>

                {/* Cancel Button if active job is running / waiting */}
                {activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'WAITING') && (
                  <button
                    onClick={() => handleCancelJob(activeJob.id)}
                    className="px-5 py-3.5 rounded-full font-bold text-xs text-red-600 bg-red-950/20 hover:bg-red-950/30 border border-red-500/40 transition-all flex items-center gap-1.5 shadow-xs active:scale-95 shrink-0"
                    title="Batalkan proses render job yang sedang aktif"
                  >
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span>Batalkan</span>
                  </button>
                )}
              </div>


            </div>
          </div>

          {/* Right Column: Video Preview, Multi-Job Switcher & Live Render (6 cols) */}
          <div className="lg:col-span-6 sticky top-20">
            <VideoPlayerPreview
              character={selectedCharacter}
              customCharacterUrl={customCharacterUrl}
              motion={selectedMotion}
              customMotionUrl={customMotionUrl}
              customMotionDuration={customMotionDuration}
              webappId={webappId}
              isGenerating={isGenerating}
              generationStatus={generationStatus}
              generationStep={generationStep}
              elapsedSeconds={activeElapsed}
              errorMessage={activeErrorMessage}
              generatedVideoUrl={generatedVideoUrl}
              onRetry={handleGenerate}
              onCancel={() => handleCancelJob(activeJobId || undefined)}
              onNewJob={handlePrepareNewJob}
              jobsList={jobsList}
              activeJobId={activeJobId}
              onSelectJob={(id) => setActiveJobId(id)}
              onCancelJobById={(id) => handleCancelJob(id)}
              onDeleteJob={(id) => handleDeleteJob(id)}
              onRetryJob={(id) => handleRetryJobById(id)}
              onClearCompleted={handleClearCompletedJobs}
            />
          </div>
        </div>
      </main>

      {/* API Settings Modal */}
      <ApiSettingsModal
        isOpen={isApiSettingsOpen}
        onClose={() => setIsApiSettingsOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        apiKeysPool={apiKeysPool}
        setApiKeysPool={setApiKeysPool}
        webappId={webappId}
        setWebappId={setWebappId}
      />
    </div>
  );
}
