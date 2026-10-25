import { JobItem } from '../components/VideoPlayerPreview';

const STORAGE_KEY = 'rh_ext_jobs_db_v1';
const MAX_CONCURRENT_JOBS = 10;
const RETENTION_HOURS = 48;
const RETENTION_MS = RETENTION_HOURS * 60 * 60 * 1000;

export interface ExtensionJobRecord extends JobItem {
  apiKeysPool?: string[];
  nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: string }>;
  videoFileName?: string;
  thumbnailFileName?: string;
  totalRunningCount?: number;
   "totalWaitingInQueue"?: number;
}

export function isRunningAsExtension(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  return (
    proto === 'chrome-extension:' ||
    proto === 'moz-extension:' ||
    proto === 'safari-web-extension:' ||
    proto === 'ms-browser-extension:'
  );
}

/**
 * Verified Full-File Blob Downloader for Motion_Studio_AI_Extension_BRE.zip
 * Downloads the complete ZIP into memory first with live progress and verifies
 * both the PK\x03\x04 header and PK\x05\x06 End-of-Central-Directory signature
 * so mobile browsers / iframes never save an incomplete or truncated .zip file.
 */
export async function downloadExtensionBreZip(
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void
): Promise<{ sizeBytes: number; fileName: string }> {
  const endpoints = ['/api/extension/download-zip', '/Motion_Studio_AI_Extension_BRE.zip'];
  let lastError: Error | null = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/zip, application/octet-stream, */*',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLengthHeader = response.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

      let fullBuffer: Uint8Array;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loadedBytes += value.byteLength;
            if (onProgress) {
              const pct = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 50;
              onProgress(pct, loadedBytes, totalBytes);
            }
          }
        }

        fullBuffer = new Uint8Array(loadedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          fullBuffer.set(chunk, offset);
          offset += chunk.byteLength;
        }
      } else {
        const ab = await response.arrayBuffer();
        fullBuffer = new Uint8Array(ab);
      }

      // 1. Verify minimum realistic size (> 200 KB for full compiled app)
      if (fullBuffer.byteLength < 200 * 1024) {
        throw new Error(`Ukuran file ZIP terlalu kecil (${fullBuffer.byteLength} bytes), mengulang...`);
      }

      // 2. Verify Content-Length match if header was provided
      if (totalBytes > 0 && fullBuffer.byteLength !== totalBytes) {
        throw new Error(`Unduhan terputus (${fullBuffer.byteLength} dari ${totalBytes} bytes).`);
      }

      // 3. Verify ZIP Local File Header (PK\x03\x04)
      if (
        fullBuffer[0] !== 0x50 ||
        fullBuffer[1] !== 0x4b ||
        fullBuffer[2] !== 0x03 ||
        fullBuffer[3] !== 0x04
      ) {
        throw new Error('File bukan arsip ZIP yang valid (Header PK tidak ditemukan).');
      }

      // 4. Verify ZIP End of Central Directory (PK\x05\x06) near the end of the archive
      let hasEocd = false;
      const searchStart = Math.max(0, fullBuffer.byteLength - 65557);
      for (let i = fullBuffer.byteLength - 22; i >= searchStart; i--) {
        if (
          fullBuffer[i] === 0x50 &&
          fullBuffer[i + 1] === 0x4b &&
          fullBuffer[i + 2] === 0x05 &&
          fullBuffer[i + 3] === 0x06
        ) {
          hasEocd = true;
          break;
        }
      }

      if (!hasEocd) {
        throw new Error('Arsip ZIP belum lengkap (End of Central Directory tidak ditemukan).');
      }

      if (onProgress) {
        onProgress(100, fullBuffer.byteLength, fullBuffer.byteLength);
      }

      const fileName = 'Motion_Studio_AI_Extension_BRE.zip';
      const blob = new Blob([fullBuffer.buffer as ArrayBuffer], { type: 'application/zip' });
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 15000);

      return { sizeBytes: fullBuffer.byteLength, fileName };
    } catch (err: any) {
      lastError = err;
      console.warn(`[downloadExtensionBreZip] Percobaan dari ${url} gagal:`, err);
    }
  }

  throw lastError || new Error('Gagal mengunduh file ZIP ekstensi BRE.');
}

function formatDateIndo(date: Date): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Safe JSON fetcher directly to RunningHub OpenAPI with mirror failover & background worker fallback
 */
export async function safeFetchRunningHubJson(endpointPath: string, payload: any): Promise<any> {
  const hosts = ['https://www.runninghub.ai', 'https://www.runninghub.cn'];

  for (const host of hosts) {
    const url = `${host}${endpointPath}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const trimmed = (text || '').trim();
      if (
        !trimmed ||
        trimmed.startsWith('<') ||
        trimmed.toLowerCase().includes('<!doctype') ||
        trimmed.toLowerCase().includes('<html')
      ) {
        continue;
      }

      return JSON.parse(trimmed);
    } catch (err) {
      // Fallback via Chrome Extension background service worker if available
      const chromeObj = typeof window !== 'undefined' ? (window as any).chrome : null;
      if (chromeObj?.runtime?.sendMessage) {
        try {
          const bgRes: any = await new Promise((resolve) => {
            chromeObj.runtime.sendMessage(
              {
                action: 'RH_FETCH_JSON',
                url,
                payload,
              },
              (resp: any) => resolve(resp)
            );
          });
          if (bgRes && bgRes.ok && bgRes.data) {
            return bgRes.data;
          }
        } catch {
          // ignore and try next mirror
        }
      }
    }
  }

  return null;
}

/**
 * Normalize image on HTML5 Canvas to max 1080p with guaranteed EVEN width/height
 * Prevents ComfyUI ImageResizeKJv2 / NvVFX Super-Resolution code -7 crash
 */
async function normalizeImageBlob(file: File | Blob, fileName: string): Promise<{ blob: Blob; name: string }> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let w = img.naturalWidth || img.width || 720;
        let h = img.naturalHeight || img.height || 1280;
        const maxW = 1080;
        const maxH = 1920;

        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // Force even dimensions divisible by 2
        w = Math.max(2, Math.floor(w / 2) * 2);
        h = Math.max(2, Math.floor(h / 2) * 2);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, name: fileName });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (outBlob) => {
            if (outBlob && outBlob.size > 1024) {
              const cleanName = (fileName || 'character.jpg').replace(/\.[^.]+$/, '.jpg');
              resolve({ blob: outBlob, name: cleanName });
            } else {
              resolve({ blob: file, name: fileName });
            }
          },
          'image/jpeg',
          0.95
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve({ blob: file, name: fileName });
      };
      img.src = objUrl;
    } catch {
      resolve({ blob: file, name: fileName });
    }
  });
}

/**
 * Upload file (image or video) directly to RunningHub OpenAPI
 */
async function uploadFileDirectToRunningHub(
  apiKey: string,
  file: File | Blob,
  fileType: string
): Promise<any> {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    return { code: 400, msg: 'API Key wajib diisi untuk upload berkas ke RunningHub' };
  }

  let uploadBlob: Blob = file;
  let uploadName = (file as File).name || (fileType === 'video' ? 'motion.mp4' : 'character.jpg');

  if (
    fileType === 'image' ||
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp)$/i.test(uploadName)
  ) {
    const normalized = await normalizeImageBlob(file, uploadName);
    uploadBlob = normalized.blob;
    uploadName = normalized.name;
  }

  const mirrors = [
    'https://www.runninghub.ai/task/openapi/upload',
    'https://www.runninghub.cn/task/openapi/upload',
  ];

  let lastParsed: any = null;

  for (const mirrorUrl of mirrors) {
    try {
      const form = new FormData();
      form.append('apiKey', cleanKey);
      form.append('fileType', fileType || 'image');
      form.append('file', uploadBlob, uploadName);

      const res = await fetch(mirrorUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: form,
      });

      const text = await res.text();
      if (!text || text.trim().startsWith('<') || text.toLowerCase().includes('<!doctype')) {
        lastParsed = { code: 502, msg: 'Gateway RunningHub sibuk (HTML response)' };
        continue;
      }

      const data = JSON.parse(text);
      lastParsed = data;

      if (data && (data.code === 0 || data.code === 200) && data.data?.fileName) {
        return data;
      }

      if (data && data.code !== 502 && data.code !== 500 && data.code !== 404) {
        return data;
      }
    } catch (err: any) {
      lastParsed = { code: 500, msg: err?.message || 'Gagal mengunggah ke RunningHub' };
    }
  }

  return lastParsed || { code: 502, msg: 'Server RunningHub sedang padat. Silakan coba lagi.' };
}

interface KeyMeta {
  apiKey: string;
  balance: number;
  valid: boolean;
  msg: string;
  lastChecked: number;
}

const keyMetaMap = new Map<string, KeyMeta>();

async function checkKeyStatus(apiKey: string): Promise<KeyMeta> {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    return { apiKey: '', balance: 0, valid: false, msg: 'API Key kosong', lastChecked: Date.now() };
  }

  const cached = keyMetaMap.get(cleanKey);
  if (cached && Date.now() - cached.lastChecked < 45000) {
    return cached;
  }

  const data = await safeFetchRunningHubJson('/uc/openapi/accountStatus', { apikey: cleanKey });
  if (!data) {
    return { apiKey: cleanKey, balance: 0, valid: false, msg: 'Gagal terhubung ke RunningHub', lastChecked: Date.now() };
  }

  const code = Number(data?.code);
  const msg = String(data?.msg || '').toUpperCase();

  const isInvalid =
    code === 806 ||
    code === 401 ||
    code === 403 ||
    code === 802 ||
    code === 333 ||
    msg.includes('APIKEY_USER_NOT_FOUND') ||
    msg.includes('APIKEY_NOT_EXIST') ||
    msg.includes('INVALID') ||
    msg.includes('BANNED') ||
    msg.includes('UNAUTHORIZED');

  if (isInvalid) {
    const meta: KeyMeta = {
      apiKey: cleanKey,
      balance: 0,
      valid: false,
      msg: 'Banned / Tidak Valid',
      lastChecked: Date.now(),
    };
    keyMetaMap.set(cleanKey, meta);
    return meta;
  }

  let remain = 0;
  if (data?.data && typeof data.data === 'object' && data.data.remainCoins !== undefined) {
    remain = Number(data.data.remainCoins) || 0;
  }

  const meta: KeyMeta = {
    apiKey: cleanKey,
    balance: remain,
    valid: true,
    msg: remain > 0 ? 'Aktif' : 'Koin Habis (0)',
    lastChecked: Date.now(),
  };
  keyMetaMap.set(cleanKey, meta);
  return meta;
}

function invalidateKey(apiKey: string, reason: 'banned' | 'empty') {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) return;
  keyMetaMap.set(cleanKey, {
    apiKey: cleanKey,
    balance: 0,
    valid: reason !== 'banned',
    msg: reason === 'banned' ? 'Banned / Tidak Valid' : 'Koin Habis (0)',
    lastChecked: Date.now(),
  });
}

async function getBestFreshApiKey(
  candidateKeys: string[],
  activeKeysInUse: Set<string> = new Set()
): Promise<{ bestKey: string; validPool: string[] }> {
  const uniqueKeys = Array.from(new Set(candidateKeys.map((k) => (k || '').trim()).filter(Boolean)));
  if (uniqueKeys.length === 0) {
    return { bestKey: '', validPool: [] };
  }

  const metas = await Promise.all(uniqueKeys.map((k) => checkKeyStatus(k)));
  const validWithCoins = metas.filter((m) => m.valid && m.balance > 0);
  const validPool = validWithCoins.map((m) => m.apiKey);

  if (validWithCoins.length === 0) {
    return { bestKey: uniqueKeys[0], validPool: [] };
  }

  validWithCoins.sort((a, b) => b.balance - a.balance);
  const freshKey = validWithCoins.find((m) => !activeKeysInUse.has(m.apiKey));

  return {
    bestKey: freshKey ? freshKey.apiKey : validWithCoins[0].apiKey,
    validPool,
  };
}

function parseOutputStatus(outData: any): {
  isRunning: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  url: string | null;
  errorMsg: string | null;
} {
  if (!outData || typeof outData !== 'object') {
    return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
  }

  const code = outData.code !== undefined && outData.code !== null ? Number(outData.code) : NaN;
  const msg = String(outData.msg || '').toUpperCase();

  if (
    code === 804 ||
    code === 421 ||
    code === 1001 ||
    code === 101 ||
    msg.includes('TASK_IS_RUNNING') ||
    msg.includes('QUEUE') ||
    msg.includes('RUNNING') ||
    msg.includes('PROCESS')
  ) {
    return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
  }

  if (code !== 0 && code !== 200 && !isNaN(code)) {
    let errorMsg = String(outData.msg || `RunningHub Error (Code ${code})`);
    if (outData.data?.failedReason) {
      const fr = outData.data.failedReason;
      const nodeName = fr.node_name || (fr.node_id ? `Node #${fr.node_id}` : 'GPU Node');
      const excMsg = fr.exception_message || fr.exception_type || '';
      if (excMsg.includes('NvVFX') || excMsg.includes('ImageResize') || excMsg.includes('-7')) {
        errorMsg = `Gagal pada tahap Super-Resolution (${nodeName}). Resolusi foto/video input telah dinormalisasi. Silakan klik Retry.`;
      } else if (excMsg) {
        errorMsg = `Gagal di ${nodeName}: ${excMsg}`;
      }
    } else if (
      code === 402 ||
      msg.includes('NOT_ENOUGH_BALANCE') ||
      msg.includes('BALANCE_NOT_ENOUGH') ||
      msg.includes('INSUFFICIENT_BALANCE') ||
      msg.includes('COIN_NOT_ENOUGH')
    ) {
      errorMsg = 'Saldo / Koin RunningHub pada API Key ini tidak mencukupi (NOT_ENOUGH_BALANCE).';
    }

    return {
      isRunning: false,
      isSuccess: false,
      isFailed: true,
      url: null,
      errorMsg,
    };
  }

  const d = outData.data;
  if (d === undefined || d === null) {
    return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
  }

  if (Array.isArray(d)) {
    if (d.length === 0) {
      return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
    }

    for (const item of d) {
      if (typeof item === 'object' && item !== null) {
        const rawStatus = String(item.taskStatus || item.status || '').toUpperCase();
        if (rawStatus === 'FAILED' || rawStatus === 'ERROR') {
          return {
            isRunning: false,
            isSuccess: false,
            isFailed: true,
            url: null,
            errorMsg: String(item.error || item.msg || 'Eksekusi GPU gagal'),
          };
        }
      }
    }

    interface VideoCandidate {
      url: string;
      nodeId?: string;
      isMaster: boolean;
      isPreview: boolean;
    }

    const videoCandidates: VideoCandidate[] = [];

    for (const item of d) {
      let candidateUrl: string | null = null;
      let nodeId: string | undefined = undefined;

      if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
        candidateUrl = item;
      } else if (typeof item === 'object' && item !== null) {
        nodeId = item.nodeId ? String(item.nodeId) : undefined;
        candidateUrl =
          (typeof item.fileUrl === 'string' ? item.fileUrl : null) ||
          (typeof item.url === 'string' ? item.url : null) ||
          (typeof item.downloadUrl === 'string' ? item.downloadUrl : null) ||
          (typeof item.path === 'string' ? item.path : null) ||
          (typeof item.videoUrl === 'string' ? item.videoUrl : null);
      }

      if (candidateUrl && (candidateUrl.startsWith('http://') || candidateUrl.startsWith('https://'))) {
        const lower = candidateUrl.toLowerCase();
        const isVideo =
          lower.includes('.mp4') ||
          lower.includes('.mov') ||
          lower.includes('.webm') ||
          lower.includes('.mkv') ||
          lower.includes('download') ||
          lower.includes('file') ||
          lower.includes('output') ||
          lower.includes('oss') ||
          lower.includes('s3') ||
          lower.includes('runninghub') ||
          lower.includes('xiaoyaoyou') ||
          lower.includes('aws');

        if (isVideo) {
          const isPreview = lower.includes('preview') || lower.includes('draft') || nodeId === '8';
          const isMaster =
            nodeId === '490' ||
            lower.includes('1080') ||
            lower.includes('master') ||
            lower.includes('kling') ||
            lower.includes('zenohub');

          videoCandidates.push({
            url: candidateUrl,
            nodeId,
            isMaster,
            isPreview,
          });
        }
      }
    }

    videoCandidates.sort((a, b) => {
      if (a.isMaster && !b.isMaster) return -1;
      if (!a.isMaster && b.isMaster) return 1;
      if (!a.isPreview && b.isPreview) return -1;
      if (a.isPreview && !b.isPreview) return 1;
      return 0;
    });

    const finalUrl =
      videoCandidates.length > 0
        ? videoCandidates[0].url
        : typeof d[0] === 'string' && d[0].startsWith('http')
        ? d[0]
        : null;

    if (finalUrl) {
      return { isRunning: false, isSuccess: true, isFailed: false, url: finalUrl, errorMsg: null };
    }

    return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
  }

  if (typeof d === 'object') {
    const rawStatus = String(d.taskStatus || d.status || '').toUpperCase();
    if (rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      return {
        isRunning: false,
        isSuccess: false,
        isFailed: true,
        url: null,
        errorMsg: String(d.errorMsg || d.msg || 'Eksekusi GPU gagal'),
      };
    }

    const candidates: string[] = [];
    if (Array.isArray(d.fileUrlList)) {
      candidates.push(...d.fileUrlList.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
    }
    if (Array.isArray(d.outputs)) {
      for (const o of d.outputs) {
        if (typeof o === 'string' && o.startsWith('http')) candidates.push(o);
        else if (o && typeof o.fileUrl === 'string' && o.fileUrl.startsWith('http')) candidates.push(o.fileUrl);
        else if (o && typeof o.url === 'string' && o.url.startsWith('http')) candidates.push(o.url);
      }
    }
    if (typeof d.fileUrl === 'string' && d.fileUrl.startsWith('http')) candidates.push(d.fileUrl);
    if (typeof d.url === 'string' && d.url.startsWith('http')) candidates.push(d.url);
    if (typeof d.downloadUrl === 'string' && d.downloadUrl.startsWith('http')) candidates.push(d.downloadUrl);
    if (typeof d.videoUrl === 'string' && d.videoUrl.startsWith('http')) candidates.push(d.videoUrl);

    if (candidates.length > 0) {
      return { isRunning: false, isSuccess: true, isFailed: false, url: candidates[0], errorMsg: null };
    }

    return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
  }

  if (typeof d === 'string' && (d.startsWith('http://') || d.startsWith('https://'))) {
    return { isRunning: false, isSuccess: true, isFailed: false, url: d, errorMsg: null };
  }

  return { isRunning: true, isSuccess: false, isFailed: false, url: null, errorMsg: null };
}

// In-memory jobs map synced with localStorage & chrome.storage.local
const jobsMap = new Map<string, ExtensionJobRecord>();
const activeWorkerJobIds = new Set<string>();
let isProcessingQueue = false;
let initialized = false;

function loadJobsFromStorage() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list: ExtensionJobRecord[] = JSON.parse(raw);
      const now = Date.now();
      for (const job of list) {
        if (job.expiresAt && now >= job.expiresAt) continue;
        if (now - job.createdAt > RETENTION_MS) continue;
        if (job.status === 'RUNNING') {
          job.status = 'WAITING';
          job.step = job.runninghubTaskId
            ? 'Melanjutkan pemantauan render GPU RunningHub...'
            : 'Melanjutkan antrian...';
        }
        if (job.status === 'SUCCESS' && job.remoteVideoUrl) {
          job.videoUrl = job.remoteVideoUrl;
        }
        jobsMap.set(job.id, job);
      }
    }
  } catch (err) {
    console.warn('[BRE Engine] Failed to load jobs from localStorage:', err);
  }
}

function saveJobsToStorage() {
  try {
    const list = Array.from(jobsMap.values());
    const serialized = JSON.stringify(list);
    localStorage.setItem(STORAGE_KEY, serialized);
    const chromeObj = typeof window !== 'undefined' ? (window as any).chrome : null;
    if (chromeObj?.storage?.local) {
      chromeObj.storage.local.set({ [STORAGE_KEY]: list });
    }
  } catch (err) {
    console.warn('[BRE Engine] Failed to save jobs:', err);
  }
}

function getJobWithQueueInfo(jobId: string): ExtensionJobRecord | null {
  const job = jobsMap.get(jobId);
  if (!job) return null;

  const allJobs = Array.from(jobsMap.values());
  const runningJobs = allJobs.filter((j) => j.status === 'RUNNING');
  const waitingJobs = allJobs
    .filter((j) => j.status === 'WAITING')
    .sort((a, b) => a.createdAt - b.createdAt);

  job.totalRunningCount = runningJobs.length;
  job.totalWaitingInQueue = waitingJobs.length;

  if (job.status === 'WAITING') {
    const pos = waitingJobs.findIndex((j) => j.id === jobId);
    job.queuePosition = pos >= 0 ? pos + 1 : 1;
  } else {
    job.queuePosition = undefined;
  }

  if (job.status === 'SUCCESS' && job.remoteVideoUrl) {
    job.videoUrl = job.remoteVideoUrl;
  }

  return { ...job };
}

function isCancelled(jobId: string): boolean {
  return jobsMap.get(jobId)?.status === 'CANCELLED';
}

async function processQueue() {
  loadJobsFromStorage();
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const allJobs = Array.from(jobsMap.values());
    const runningJobs = allJobs.filter((j) => j.status === 'RUNNING');
    const waitingJobs = allJobs
      .filter((j) => j.status === 'WAITING')
      .sort((a, b) => a.createdAt - b.createdAt);

    if (waitingJobs.length === 0) {
      return;
    }

    const activeApiKeys = new Set(runningJobs.map((j) => (j.apiKey || '').trim()).filter(Boolean));
    let availableSlots = MAX_CONCURRENT_JOBS - runningJobs.length;

    for (const job of waitingJobs) {
      if (availableSlots <= 0) break;
      if (job.status === 'CANCELLED' || activeWorkerJobIds.has(job.id)) continue;

      const candidateKeys = Array.from(
        new Set([job.apiKey || '', ...(job.apiKeysPool || [])].map((k) => k.trim()).filter(Boolean))
      );

      if (candidateKeys.length > 0 && !job.runninghubTaskId) {
        const { bestKey, validPool } = await getBestFreshApiKey(candidateKeys, activeApiKeys);
        if (bestKey) job.apiKey = bestKey;
        if (validPool.length > 0) job.apiKeysPool = validPool;
      }

      if (job.apiKey && activeApiKeys.has(job.apiKey) && !job.runninghubTaskId) {
        continue;
      }

      job.status = 'RUNNING';
      job.step = job.runninghubTaskId
        ? 'Memantau hasil render GPU RunningHub...'
        : 'Mengirim permintaan ke GPU RunningHub...';
      if (job.apiKey) activeApiKeys.add(job.apiKey);
      availableSlots--;
      saveJobsToStorage();

      activeWorkerJobIds.add(job.id);
      executeJob(job)
        .catch((err) => {
          console.error(`[BRE Queue Worker] Error on job ${job.id}:`, err);
        })
        .finally(() => {
          activeWorkerJobIds.delete(job.id);
          processQueue();
        });
    }
  } finally {
    isProcessingQueue = false;
  }
}

async function executeJob(job: ExtensionJobRecord) {
  try {
    if (isCancelled(job.id)) return;

    const targetWebapp = (job.webappId || '2082796145605492738').trim();
    const mappedNodes = (job.nodeInfoList || []).map((item: any) => {
      if (item.fieldName === 'image' || String(item.nodeId) === '32' || String(item.nodeId) === '30') {
        return { nodeId: '30', fieldName: 'image', fieldValue: String(item.fieldValue) };
      }
      if (item.fieldName === 'video' || String(item.nodeId) === '33') {
        return { nodeId: '33', fieldName: 'video', fieldValue: String(item.fieldValue) };
      }
      return {
        nodeId: String(item.nodeId),
        fieldName: String(item.fieldName),
        fieldValue: String(item.fieldValue),
      };
    });

    const payload = {
      apiKey: job.apiKey || '',
      webappId: targetWebapp,
      instanceType: 'default',
      nodeInfoList: mappedNodes,
    };

    let taskId: string | null = job.runninghubTaskId || null;

    if (!taskId) {
      let submitAttempts = 0;
      const maxSubmitAttempts = 1200;

      while (submitAttempts < maxSubmitAttempts && !taskId) {
        if (isCancelled(job.id)) return;
        submitAttempts++;
        job.step =
          submitAttempts === 1
            ? 'Mengirim task ke RunningHub OpenAPI...'
            : `Antrian GPU padat, mencoba antre otomatis (${submitAttempts})...`;
        saveJobsToStorage();

        const data = await safeFetchRunningHubJson('/task/openapi/ai-app/run', payload);
        if (isCancelled(job.id)) return;

        if (!data) {
          job.step = `Menghubungkan ke gateway RunningHub (${submitAttempts})...`;
          saveJobsToStorage();
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        const msg = String(data.msg || '').toUpperCase();
        const code = Number(data.code);

        if (code === 0 || code === 200) {
          taskId =
            typeof data.data === 'string'
              ? data.data
              : data.data?.taskId || data.data?.id || data.data?.task_id;
          break;
        }

        if (code === 804 || msg.includes('TASK_IS_RUNNING') || msg.includes('TASK_RUNNING')) {
          taskId = data.data?.taskId || 'latest';
          break;
        }

        const isKeyBusy =
          code === 421 ||
          msg.includes('TASK_QUEUE_MAXED') ||
          msg.includes('QUEUE_MAXED') ||
          msg.includes('TASK_MAXED');

        if (isKeyBusy) {
          const pool = job.apiKeysPool || [];
          const remainingKeys = pool.map((k) => k.trim()).filter((k) => k && k !== job.apiKey);
          if (remainingKeys.length > 0) {
            const nextKey = remainingKeys[0];
            job.apiKey = nextKey;
            job.apiKeysPool = remainingKeys;
            payload.apiKey = nextKey;
            job.step = `Key sibuk (421), beralih otomatis ke key ${nextKey.slice(0, 6)}...`;
            saveJobsToStorage();
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          job.step = `Menunggu slot GPU kosong (${submitAttempts})...`;
          saveJobsToStorage();
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        const isBalanceInsufficient =
          code === 402 ||
          code === 605 ||
          msg.includes('NOT_ENOUGH_BALANCE') ||
          msg.includes('BALANCE_NOT_ENOUGH') ||
          msg.includes('INSUFFICIENT_BALANCE') ||
          msg.includes('COIN_NOT_ENOUGH');

        const isApiKeyInvalid =
          code === 401 ||
          code === 403 ||
          code === 802 ||
          code === 333 ||
          msg.includes('UNAUTHORIZED') ||
          msg.includes('BANNED') ||
          msg.includes('INVALID') ||
          msg.includes('APIKEY_NOT_EXIST');

        if (isBalanceInsufficient || isApiKeyInvalid) {
          const badKey = job.apiKey || '';
          invalidateKey(badKey, isApiKeyInvalid ? 'banned' : 'empty');
          const pool = job.apiKeysPool || [];
          const remainingKeys = pool.map((k) => k.trim()).filter((k) => k && k !== badKey);

          if (remainingKeys.length > 0) {
            const { bestKey, validPool } = await getBestFreshApiKey(remainingKeys, new Set());
            const nextKey = bestKey || remainingKeys[0];
            job.apiKey = nextKey;
            job.apiKeysPool = validPool.length > 0 ? validPool : remainingKeys;
            payload.apiKey = nextKey;
            job.step = `Key sebelumnya ${isApiKeyInvalid ? 'tidak valid' : 'koin habis'}, beralih ke key ${nextKey.slice(0, 6)}...`;
            saveJobsToStorage();
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          job.apiKeysPool = [];
          saveJobsToStorage();
          throw new Error(
            isApiKeyInvalid
              ? 'API Key RunningHub tidak valid atau telah diblokir/banned. Silakan ganti API Key.'
              : 'Saldo / Koin RunningHub pada API Key Anda habis (0 Koin). Silakan isi ulang atau ganti API Key.'
          );
        }

        const isNodeError =
          code === 803 ||
          msg.includes('NODE_INFO_MISMATCH') ||
          msg.includes('NODE_NOT_FOUND') ||
          msg.includes('PARAMETER_ERROR');

        if (isNodeError) {
          throw new Error(`Ketidakcocokan parameter Node RunningHub: ${data.msg || code}`);
        }

        job.step = `Server RunningHub padat (${submitAttempts}), mencoba ulang...`;
        saveJobsToStorage();
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (isCancelled(job.id)) return;
      if (!taskId) {
        throw new Error('Antrian GPU RunningHub sedang sangat padat. Silakan coba lagi.');
      }

      job.runninghubTaskId = taskId;
      saveJobsToStorage();
    }

    if (isCancelled(job.id)) return;
    job.step = 'GPU RunningHub sedang merender video...';
    saveJobsToStorage();

    let attempts = 0;
    const maxAttempts = 1200;
    let remoteVideoUrl: string | null = null;

    while (attempts < maxAttempts && !remoteVideoUrl) {
      if (isCancelled(job.id)) return;
      attempts++;
      await new Promise((r) => setTimeout(r, 3500));
      if (isCancelled(job.id)) return;

      const currentOutData = await safeFetchRunningHubJson('/task/openapi/outputs', {
        apiKey: job.apiKey,
        taskId,
      });

      if (isCancelled(job.id)) return;
      if (!currentOutData) continue;

      const parsed = parseOutputStatus(currentOutData);
      if (parsed.isFailed) {
        throw new Error(parsed.errorMsg || 'Eksekusi render gagal di GPU RunningHub.');
      }

      if (parsed.isSuccess && parsed.url) {
        remoteVideoUrl = parsed.url;
        break;
      }

      const elapsedSec = Math.max(1, Math.floor((Date.now() - job.createdAt) / 1000));
      job.elapsedSeconds = elapsedSec;
      job.step = `GPU sedang merender gerakan (${elapsedSec}s)...`;
      saveJobsToStorage();
    }

    if (isCancelled(job.id)) return;

    if (!remoteVideoUrl) {
      throw new Error('Waktu tunggu render GPU melebihi batas (Timeout).');
    }

    const finishedNow = Date.now();
    const expiresAt = finishedNow + RETENTION_MS;
    job.status = 'SUCCESS';
    job.remoteVideoUrl = remoteVideoUrl;
    job.videoUrl = remoteVideoUrl;
    job.expiresAt = expiresAt;
    job.expires_at_formatted = formatDateIndo(new Date(expiresAt));
    job.elapsedSeconds = Math.max(1, Math.floor((finishedNow - job.createdAt) / 1000));
    job.step = 'Selesai! Video berhasil dirender dari RunningHub';
    job.errorMessage = null;
    saveJobsToStorage();
  } catch (err: any) {
    if (isCancelled(job.id)) return;
    job.status = 'FAILED';
    job.step = 'Gagal';
    job.errorMessage = err?.message || 'Gagal merender video di RunningHub';
    saveJobsToStorage();
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle any /api/* request directly inside the Browser Extension (or as fallback)
 */
async function handleLocalApiRequest(urlStr: string, init?: RequestInit): Promise<Response | null> {
  const parsedUrl = new URL(urlStr, window.location.origin);
  const pathname = parsedUrl.pathname;
  const method = (init?.method || 'GET').toUpperCase();

  loadJobsFromStorage();

  // 1. POST /api/runninghub/check-key
  if (pathname === '/api/runninghub/check-key' && method === 'POST') {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const meta = await checkKeyStatus(body.apiKey || '');
    if (!meta.valid) {
      return jsonResponse({
        code: 401,
        valid: false,
        balance: null,
        msg: 'API Key tidak valid atau tidak terdaftar di RunningHub',
      });
    }
    return jsonResponse({
      code: 0,
      valid: true,
      balance: String(meta.balance),
      balanceNum: meta.balance,
      msg: 'API Key valid & aktif',
    });
  }

  // 2. POST /api/runninghub/check-keys-bulk
  if (pathname === '/api/runninghub/check-keys-bulk' && method === 'POST') {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const keys: string[] = Array.isArray(body.keys) ? body.keys : [];
    const cleanKeys = Array.from(new Set(keys.map((k) => String(k).trim()).filter(Boolean)));
    const results = await Promise.all(
      cleanKeys.map(async (k) => {
        const m = await checkKeyStatus(k);
        return {
          apiKey: k,
          valid: m.valid,
          balance: m.balance,
          balanceStr: m.valid ? String(m.balance) : 'Banned',
          msg: m.msg,
        };
      })
    );
    return jsonResponse({ code: 0, data: results });
  }

  // 3. POST /api/runninghub/upload
  if (pathname === '/api/runninghub/upload' && method === 'POST') {
    const formData = init?.body as FormData;
    if (!formData || typeof formData.get !== 'function') {
      return jsonResponse({ code: 400, msg: 'FormData tidak valid' }, 400);
    }
    const apiKey = String(formData.get('apiKey') || '');
    const fileType = String(formData.get('fileType') || 'image');
    const file = formData.get('file') as File | Blob;
    if (!file) {
      return jsonResponse({ code: 400, msg: 'Tidak ada berkas yang diunggah' }, 400);
    }
    const upResult = await uploadFileDirectToRunningHub(apiKey, file, fileType);
    return jsonResponse(upResult);
  }

  // 4. POST /api/jobs/create
  if (pathname === '/api/jobs/create' && method === 'POST') {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const { apiKey, apiKeysPool, webappId, nodeInfoList, jobTitle, characterImageUrl } = body;
    if (!apiKey || !String(apiKey).trim()) {
      return jsonResponse({ code: 400, msg: 'API Key wajib diisi' }, 400);
    }

    const now = Date.now();
    const jobId = `job_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const targetWebapp = webappId ? String(webappId).trim() : '2082796145605492738';
    const normalizedNodes = (Array.isArray(nodeInfoList) ? nodeInfoList : []).map((n: any) => {
      if (n.fieldName === 'image' || String(n.nodeId) === '32' || String(n.nodeId) === '30') {
        return { ...n, nodeId: '30', fieldName: 'image' };
      }
      if (n.fieldName === 'video' || String(n.nodeId) === '33') {
        return { ...n, nodeId: '33', fieldName: 'video' };
      }
      return n;
    });

    const job: ExtensionJobRecord = {
      id: jobId,
      jobTitle: jobTitle || `Job #${jobsMap.size + 1}`,
      status: 'WAITING',
      createdAt: now,
      expiresAt: null,
      created_at_formatted: formatDateIndo(new Date(now)),
      step: 'Menunggu antrian...',
      apiKey: String(apiKey).trim(),
      apiKeysPool: Array.isArray(apiKeysPool) ? apiKeysPool : [],
      webappId: targetWebapp,
      nodeInfoList: normalizedNodes,
      characterImageUrl: characterImageUrl || undefined,
      thumbnailUrl: characterImageUrl || undefined,
    };

    jobsMap.set(jobId, job);
    saveJobsToStorage();
    processQueue();

    return jsonResponse({
      code: 0,
      msg: 'Job berhasil ditambahkan ke antrian',
      data: getJobWithQueueInfo(jobId),
    });
  }

  // 5. GET /api/jobs
  if (pathname === '/api/jobs' && method === 'GET') {
    const allJobs = Array.from(jobsMap.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((j) => getJobWithQueueInfo(j.id)!);
    // Ensure any waiting jobs are processed
    processQueue();
    return jsonResponse({ code: 0, msg: 'success', data: allJobs });
  }

  // 6. POST /api/jobs/clear-finished
  if (pathname === '/api/jobs/clear-finished' && method === 'POST') {
    let deletedCount = 0;
    for (const [id, job] of Array.from(jobsMap.entries())) {
      if (job.status === 'FAILED' || job.status === 'CANCELLED') {
        jobsMap.delete(id);
        deletedCount++;
      }
    }
    saveJobsToStorage();
    return jsonResponse({
      code: 0,
      msg: `${deletedCount} job riwayat dibersihkan`,
      deletedCount,
    });
  }

  // 7. GET /api/jobs/stats/active
  if (pathname === '/api/jobs/stats/active' && method === 'GET') {
    let runningCount = 0;
    let waitingCount = 0;
    for (const j of jobsMap.values()) {
      if (j.status === 'RUNNING') runningCount++;
      if (j.status === 'WAITING') waitingCount++;
    }
    return jsonResponse({
      code: 0,
      msg: 'success',
      data: { runningCount, waitingCount, maxConcurrent: MAX_CONCURRENT_JOBS, retentionHours: RETENTION_HOURS },
    });
  }

  // 8. Dynamic /api/jobs/:jobId routes
  const jobActionMatch = pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(cancel|retry|download))?$/);
  if (jobActionMatch) {
    const jobId = decodeURIComponent(jobActionMatch[1]);
    const subAction = jobActionMatch[2];
    const job = jobsMap.get(jobId);

    if (!subAction && method === 'GET') {
      if (!job) return jsonResponse({ code: 404, msg: 'Job tidak ditemukan' }, 404);
      return jsonResponse({ code: 0, msg: 'success', data: getJobWithQueueInfo(jobId) });
    }

    if (!subAction && method === 'DELETE') {
      if (!job) return jsonResponse({ code: 404, msg: 'Job tidak ditemukan' }, 404);
      jobsMap.delete(jobId);
      saveJobsToStorage();
      return jsonResponse({ code: 0, msg: 'Job berhasil dihapus' });
    }

    if (subAction === 'cancel' && method === 'POST') {
      if (!job) return jsonResponse({ code: 404, msg: 'Job tidak ditemukan' }, 404);
      job.status = 'CANCELLED';
      job.step = 'Dibatalkan oleh pengguna';
      job.errorMessage = 'Generate dibatalkan oleh pengguna';
      saveJobsToStorage();
      processQueue();
      return jsonResponse({ code: 0, msg: 'Job berhasil dibatalkan', data: getJobWithQueueInfo(jobId) });
    }

    if (subAction === 'retry' && method === 'POST') {
      if (!job) return jsonResponse({ code: 404, msg: 'Job tidak ditemukan' }, 404);
      job.status = 'WAITING';
      job.step = 'Antri untuk diulang (Retry)...';
      job.errorMessage = null;
      job.runninghubTaskId = undefined;
      job.videoUrl = undefined;
      job.remoteVideoUrl = undefined;
      saveJobsToStorage();
      processQueue();
      return jsonResponse({ code: 0, msg: 'Job berhasil diantrikan ulang', data: getJobWithQueueInfo(jobId) });
    }
  }

  // 9. GET /api/download?url=...
  if (pathname === '/api/download' && method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
      return fetch(targetUrl);
    }
  }

  return null;
}

/**
 * Install the transparent fetch interceptor so the React App works 100% standalone
 * inside Chrome / Kiwi Browser Extensions AND falls back gracefully if backend is offline.
 */
export function initExtensionStandaloneEngine() {
  if (typeof window === 'undefined') return;
  if ((window as any).__rhExtensionEngineInstalled) return;
  (window as any).__rhExtensionEngineInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const inExtension = isRunningAsExtension();

  if (inExtension) {
    loadJobsFromStorage();
    processQueue();
    setInterval(() => {
      processQueue();
    }, 3000);
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr = '';
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else if (input && typeof input.url === 'string') {
      urlStr = input.url;
    }

    const isApiCall =
      urlStr.startsWith('/api/') ||
      urlStr.includes(`${window.location.origin}/api/`);

    if (isApiCall && !urlStr.includes('/api/extension/download-zip')) {
      if (inExtension) {
        const extRes = await handleLocalApiRequest(urlStr, init);
        if (extRes) return extRes;
      } else {
        try {
          const netRes = await originalFetch(input, init);
          if (netRes.status !== 404 && netRes.status !== 502 && netRes.status !== 503) {
            return netRes;
          }
        } catch {
          // If backend server unreachable, fallback to local engine
          const fallbackRes = await handleLocalApiRequest(urlStr, init);
          if (fallbackRes) return fallbackRes;
        }
      }
    }

    return originalFetch(input, init);
  };
}
