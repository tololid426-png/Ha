import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import {
  initStorage,
  createJob,
  getJob,
  findJobByFileName,
  findJobByRemoteUrl,
  cancelJob,
  retryJob,
  deleteJob,
  clearFinishedJobs,
  getRecentJobs,
  getActiveQueueStats,
  STORAGE_DIR,
  VIDEOS_DIR,
  JOBS_DB_PATH,
} from './src/server/storageManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize persistent storage and automatic 48-hour cleanup worker
  initStorage();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB limit
    },
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Helper for safe JSON response from fetch
  const safeParseResponse = async (res: any) => {
    try {
      const text = await res.text();
      if (!text || text.trim().startsWith('<') || text.toLowerCase().includes('<!doctype')) {
        return { code: 502, msg: 'Gateway mengembalikan respon HTML (Server padat)' };
      }
      return JSON.parse(text);
    } catch (err: any) {
      return { code: 500, msg: err?.message || 'Gagal memproses respon server' };
    }
  };

  // Helper to stream local video file with accurate byte ranges (RFC 7233 compliant)
  const streamLocalVideo = (filePath: string, req: Request, res: Response) => {
    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          let start: number;
          let end: number;
          const startStr = match[1];
          const endStr = match[2];

          if (!startStr && endStr) {
            // Suffix range: bytes=-500 (last 500 bytes requested by Safari/Chrome)
            const suffixLength = parseInt(endStr, 10);
            start = Math.max(0, fileSize - suffixLength);
            end = fileSize - 1;
          } else if (startStr && !endStr) {
            // Prefix range: bytes=100- (from offset 100 to end)
            start = parseInt(startStr, 10);
            end = fileSize - 1;
          } else if (startStr && endStr) {
            // Standard range: bytes=100-200
            start = parseInt(startStr, 10);
            end = parseInt(endStr, 10);
          } else {
            start = 0;
            end = fileSize - 1;
          }

          if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
            res.writeHead(416, {
              'Content-Range': `bytes */${fileSize}`,
              'Content-Type': 'video/mp4',
            });
            res.end('Requested range not satisfiable');
            return;
          }

          end = Math.min(end, fileSize - 1);
          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(filePath, { start, end });
          const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          };

          res.writeHead(206, head);
          file.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) res.status(500).end();
          });
          file.pipe(res);
          return;
        }
      }

      // Non-range full request
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      };
      res.writeHead(200, head);
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        console.error('File stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } catch (streamErr) {
      console.error('Error streaming local video file:', streamErr);
      if (!res.headersSent) {
        res.status(500).send('Error streaming video file');
      }
    }
  };

  // Flawless byte-range video streaming endpoint (Safari / Chrome / iOS / Android support)
  app.get('/storage/videos/:filename', async (req: Request, res: Response) => {
    const filename = req.params.filename;
    const filePath = path.join(VIDEOS_DIR, filename);

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10240) {
      return streamLocalVideo(filePath, req, res);
    }

    // Auto-heal from known job if local file was missing
    const matchedJob = findJobByFileName(filename);
    if (matchedJob?.remoteVideoUrl) {
      try {
        const remoteRes = await fetch(matchedJob.remoteVideoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RunningHubClient/1.0',
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          },
        });

        if (remoteRes.ok || remoteRes.status === 206) {
          const contentType = remoteRes.headers.get('content-type') || 'video/mp4';
          const contentLength = remoteRes.headers.get('content-length');
          const contentRange = remoteRes.headers.get('content-range');
          const acceptRanges = remoteRes.headers.get('accept-ranges') || 'bytes';

          const forwardHeaders: Record<string, any> = {
            'Content-Type': contentType,
            'Accept-Ranges': acceptRanges,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          };
          if (contentLength) forwardHeaders['Content-Length'] = contentLength;
          if (contentRange) forwardHeaders['Content-Range'] = contentRange;

          res.writeHead(remoteRes.status, forwardHeaders);

          if (remoteRes.body) {
            const reader = remoteRes.body.getReader();
            let isClosed = false;
            const onClose = () => {
              isClosed = true;
              reader.cancel().catch(() => {});
            };
            req.on('close', onClose);

            try {
              while (!isClosed) {
                const { done, value } = await reader.read();
                if (done || isClosed) break;
                res.write(value);
              }
            } finally {
              req.off('close', onClose);
              if (!isClosed) {
                res.end();
              }
            }
          } else {
            res.end();
          }
          return;
        }
      } catch (err) {
        console.error('Auto-heal stream error:', err);
      }
    }

    res.status(404).send('Video not found');
  });

  // Serve persistent stored videos & thumbnails (Accessible for 48 hours)
  app.use(
    '/storage',
    express.static(STORAGE_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mp4')) {
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Accept-Ranges', 'bytes');
        }
      },
    })
  );

  // === BACKEND QUEUE & 48-HOUR STORAGE ENDPOINTS ===

  // 1. Submit Generation Job to Queue (Max 10 Concurrent, Job 11+ WAITING)
  app.post('/api/jobs/create', (req: Request, res: Response) => {
    try {
      const { apiKey, apiKeysPool, webappId, nodeInfoList, jobTitle, characterImageUrl } = req.body;
      if (!apiKey || String(apiKey).trim() === '') {
        res.status(400).json({ code: 400, msg: 'API Key wajib diisi' });
        return;
      }

      const targetWebapp = webappId ? String(webappId).trim() : '2082796145605492738';

      const job = createJob({
        apiKey: String(apiKey).trim(),
        apiKeysPool: Array.isArray(apiKeysPool) ? apiKeysPool.map((k) => String(k).trim()).filter(Boolean) : [],
        webappId: targetWebapp,
        jobTitle: jobTitle ? String(jobTitle).trim() : undefined,
        nodeInfoList: Array.isArray(nodeInfoList) ? nodeInfoList : [],
        characterImageUrl: characterImageUrl ? String(characterImageUrl) : undefined,
      });

      res.json({
        code: 0,
        msg: 'Job berhasil ditambahkan ke antrian',
        data: job,
      });
    } catch (err: any) {
      console.error('Error creating job:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Gagal membuat job' });
    }
  });

  // 2. Poll Job Status (WAITING, RUNNING, SUCCESS, FAILED, CANCELLED)
  app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      res.status(404).json({ code: 404, msg: 'Job tidak ditemukan atau file telah kedaluwarsa (> 48 jam)' });
      return;
    }

    res.json({
      code: 0,
      msg: 'success',
      data: job,
    });
  });

  // 3. Cancel Job (Batalkan Generate)
  app.post('/api/jobs/:jobId/cancel', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = cancelJob(jobId);

    if (!job) {
      res.status(404).json({ code: 404, msg: 'Job tidak ditemukan' });
      return;
    }

    res.json({
      code: 0,
      msg: 'Job berhasil dibatalkan',
      data: job,
    });
  });

  // 4. Retry Job (Ulangi Job yang gagal/dibatalkan)
  app.post('/api/jobs/:jobId/retry', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = retryJob(jobId);
    if (!job) {
      res.status(404).json({ code: 404, msg: 'Job tidak ditemukan' });
      return;
    }
    res.json({
      code: 0,
      msg: 'Job berhasil diantrikan ulang',
      data: job,
    });
  });

  // 4. Delete Job (Hapus job dari riwayat)
  app.delete('/api/jobs/:jobId', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const success = deleteJob(jobId);
    if (!success) {
      res.status(404).json({ code: 404, msg: 'Job tidak ditemukan' });
      return;
    }
    res.json({
      code: 0,
      msg: 'Job berhasil dihapus',
    });
  });

  // 5. Clear all finished/cancelled/failed jobs
  app.post('/api/jobs/clear-finished', (_req: Request, res: Response) => {
    const deletedCount = clearFinishedJobs();
    res.json({
      code: 0,
      msg: `${deletedCount} job riwayat dibersihkan`,
      deletedCount,
    });
  });

  // 6. Get list of recent jobs (supports ?limit=50)
  app.get('/api/jobs', (req: Request, res: Response) => {
    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
    const jobs = getRecentJobs(limit);
    res.json({
      code: 0,
      msg: 'success',
      data: jobs,
    });
  });

  // 6b. Direct Video Download for a specific Job ID
  app.get('/api/jobs/:jobId/download', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const filename = (req.query.filename as string) || `motion_studio_${jobId}.mp4`;
    const job = getJob(jobId);

    if (!job) {
      res.status(404).send('Job tidak ditemukan');
      return;
    }

    try {
      // 1. Check if local video file exists and is valid
      if (job.videoFileName) {
        const localPath = path.join(VIDEOS_DIR, job.videoFileName);
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10240) {
          const stat = fs.statSync(localPath);
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Access-Control-Allow-Origin', '*');
          fs.createReadStream(localPath).pipe(res);
          return;
        }
      }

      // 2. Fallback to remote RunningHub video URL
      if (job.remoteVideoUrl) {
        const remoteRes = await fetch(job.remoteVideoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!remoteRes.ok) {
          res.status(remoteRes.status).send('Gagal mengunduh berkas video dari RunningHub');
          return;
        }

        const contentLength = remoteRes.headers.get('content-length');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (contentLength) res.setHeader('Content-Length', contentLength);

        const arrayBuffer = await remoteRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Auto-heal local file
        if (buffer.length > 10240) {
          const saveName = job.videoFileName || `video_${job.id}.mp4`;
          fs.writeFileSync(path.join(VIDEOS_DIR, saveName), buffer);
        }

        res.end(buffer);
        return;
      }

      res.status(404).send('Berkas video belum siap atau tidak ditemukan');
    } catch (err: any) {
      console.error('Job download error:', err);
      if (!res.headersSent) {
        res.status(500).send('Gagal mengunduh video');
      }
    }
  });

  // 7. Queue Statistics (Running & Waiting Counts)
  app.get('/api/jobs/stats/active', (_req: Request, res: Response) => {
    const stats = getActiveQueueStats();
    res.json({
      code: 0,
      msg: 'success',
      data: stats,
    });
  });

  // === RUNNINGHUB PROXY ENDPOINTS ===

  // Live Webapp Info parser directly from RunningHub page
  app.get('/api/runninghub/webapp-info/:webappId', async (req: Request, res: Response) => {
    const { webappId } = req.params;
    try {
      const targetUrl = `https://www.runninghub.ai/ai-detail/${webappId}`;
      const htmlRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const html = await htmlRes.text();
      const match = html.match(/id="__NUXT_DATA__">([\s\S]*?)<\/script>/i);
      if (match) {
        try {
          const arr = JSON.parse(match[1]);
          const unflatten = (data: any[]) => {
            const memo = new Map();
            const resolve = (idx: any): any => {
              if (typeof idx !== 'number' || idx < 0 || idx >= data.length) return idx;
              if (memo.has(idx)) return memo.get(idx);
              const val = data[idx];
              if (val === null || typeof val !== 'object') return val;
              if (Array.isArray(val)) {
                const r: any[] = [];
                memo.set(idx, r);
                for (const item of val) r.push(resolve(item));
                return r;
              } else {
                const r: Record<string, any> = {};
                memo.set(idx, r);
                for (const [k, v] of Object.entries(val)) r[k] = resolve(v);
                return r;
              }
            };
            return resolve(0);
          };
          const hydrated = unflatten(arr);
          const detailKey = Object.keys(hydrated[1]?.data[1] || {}).find((k) => k.includes(webappId));
          if (detailKey && hydrated[1].data[1][detailKey]?.detail) {
            res.json({
              code: 0,
              msg: 'success',
              data: hydrated[1].data[1][detailKey].detail,
            });
            return;
          }
        } catch {
          // fallback below
        }
      }

      // Verified schema for 2082796145605492738 (MC1 PRO: Motion_control _HD_1080x1920) and backwards compatible
      if (webappId === '2082796145605492738' || webappId === '2101901146469191682' || webappId === '2083908699113918465') {
        res.json({
          code: 0,
          msg: 'success',
          data: {
            id: '2082796145605492738',
            name: 'MC1 PRO (Motion_control _HD_1080x1920)',
            description: '<p>⚡ <strong>MC1 PRO · Motion Control HD 1080x1920</strong></p><p>Mode Standar 24GB VRAM. Gerakan halus, konsistensi wajah tinggi, dan output Full HD.</p><p><strong>Node 30:</strong> LoadImage (Foto Karakter)<br/><strong>Node 33:</strong> VHS_LoadVideo (Video Gerakan)<br/><strong>Output Video:</strong> Node 490 (Master Full HD 1080p)</p>',
            inputNodes: [
              {
                nodeId: '30',
                nodeName: 'LoadImage',
                fieldName: 'image',
                fieldValue: '4f85666382f783be7f9f68e22078eeaa6c3308e5dee4cd81df4c11e58dad1483.png',
                fieldData: '[["example.png", "None", "keep_this_dic"], {"image_upload": true}]',
                fieldType: 'IMAGE',
                description: 'Foto Karakter (LoadImage)',
              },
              {
                nodeId: '33',
                nodeName: 'VHS_LoadVideo',
                fieldName: 'video',
                fieldValue: '86b118c3b25d10e6738c91b71872f414b9f713b705a00bd82adf55f469748e58.mp4',
                fieldData: '["STRING", {"default": "None", "vhs_path_extensions": ["webm", "mp4", "mkv", "gif", "mov"]}]',
                fieldType: 'VIDEO',
                description: 'Video Gerakan (VHS_LoadVideo)',
              },
            ],
          },
        });
        return;
      }

      // Verified schema for 2098087538199212034
      if (webappId === '2098087538199212034') {
        res.json({
          code: 0,
          msg: 'success',
          data: {
            id: '2098087538199212034',
            name: 'Eposcents MC Motion Control HD',
            description: 'Motion Control / Motion Transfer = INPUT >> Image Photo + Video reff. ( max 29 sec )\nPowered by WAN model + SCAIL\nOutput: 736p HD , For saving cost ( Paket Hemat )',
            inputNodes: [
              {
                nodeId: '30',
                nodeName: 'LoadImage',
                fieldName: 'image',
                fieldValue: '516c954a2e3816ee6ea440210b090ef25af59b46fdfbfa1ea44d794f0741bf4d.jpg',
                fieldData: '[["example.png", "None", "keep_this_dic"], {"image_upload": true}]',
                fieldType: 'IMAGE',
                description: 'Target Character Image (Foto Karakter)',
              },
              {
                nodeId: '33',
                nodeName: 'VHS_LoadVideo',
                fieldName: 'video',
                fieldValue: '0b25c4f60ba991aa54883e3f9e46efe4786e6a1144f9c1dde150e8f5117f7d58.mp4',
                fieldData: '["STRING", {"default": "None", "vhs_path_extensions": ["webm", "mp4", "mkv", "gif", "mov"]}]',
                fieldType: 'VIDEO',
                description: 'Driving Motion Reference Video (Video Gerakan Max 29 detik)',
              },
            ],
          },
        });
        return;
      }

      res.status(404).json({ code: 404, msg: 'Webapp detail not found on RunningHub' });
    } catch (err: any) {
      console.error('Error fetching webapp info:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Error parsing webapp detail' });
    }
  });

  // API Proxy to RunningHub for uploading resource (Image or Video)
  app.post('/api/runninghub/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { apiKey, fileType } = req.body;
      const file = req.file;

      if (!apiKey || !String(apiKey).trim()) {
        res.status(400).json({ code: 400, msg: 'API Key wajib diisi untuk upload berkas ke RunningHub' });
        return;
      }

      if (!file) {
        res.status(400).json({ code: 400, msg: 'Tidak ada berkas yang diterima untuk diunggah' });
        return;
      }

      let uploadBuffer: Buffer = file.buffer;
      let uploadMime = file.mimetype || 'image/jpeg';
      let uploadName = file.originalname || 'upload.jpg';

      // Auto-normalize image resolution to prevent ComfyUI / NVVFX Super-Resolution code -7 crash
      if (fileType === 'image' || (!fileType && (file.mimetype?.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.originalname)))) {
        try {
          const rand = Math.random().toString(36).slice(2);
          const tmpIn = path.join(os.tmpdir(), `up_in_${Date.now()}_${rand}.tmp`);
          const tmpOut = path.join(os.tmpdir(), `up_out_${Date.now()}_${rand}.jpg`);
          fs.writeFileSync(tmpIn, file.buffer);

          // Scale image so max width <= 1080, maintaining aspect ratio with guaranteed EVEN dimensions
          execSync(`ffmpeg -y -i "${tmpIn}" -vf "scale='min(1080,iw)':-2" -q:v 2 "${tmpOut}"`, { stdio: 'ignore' });
          if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 1024) {
            uploadBuffer = fs.readFileSync(tmpOut);
            uploadMime = 'image/jpeg';
            uploadName = uploadName.replace(/\.[^.]+$/, '.jpg');
            console.log(`[Upload Auto-Normalize] Gambar karakter dinormalisasi ke 1080p (${uploadBuffer.length} bytes): ${uploadName}`);
            try { fs.unlinkSync(tmpOut); } catch {}
          }
          try { fs.unlinkSync(tmpIn); } catch {}
        } catch (normErr) {
          console.warn('[Upload Auto-Normalize] Fallback ke gambar asli:', normErr);
        }
      }

      const mirrors = [
        'https://www.runninghub.ai/task/openapi/upload',
        'https://www.runninghub.cn/task/openapi/upload',
      ];

      let lastParsed: any = null;

      for (const mirrorUrl of mirrors) {
        try {
          // Re-create fresh FormData per mirror request to prevent consumed stream errors
          const form = new FormData();
          form.append('apiKey', String(apiKey).trim());
          form.append('fileType', fileType || 'image');
          const blob = new Blob([new Uint8Array(uploadBuffer)], { type: uploadMime });
          form.append('file', blob, uploadName);

          const rhResponse = await fetch(mirrorUrl, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'RunningHubClient/1.0',
            },
            body: form,
          });

          const data = await safeParseResponse(rhResponse);
          lastParsed = data;

          if (data && (data.code === 0 || data.code === 200) && data.data?.fileName) {
            res.json(data);
            return;
          }

          // If specific error from RunningHub (e.g. invalid API key or account status)
          if (data && data.code !== 502 && data.code !== 500 && data.code !== 404) {
            res.json(data);
            return;
          }
        } catch (mirrorErr) {
          console.warn(`[Upload Mirror Error] ${mirrorUrl}:`, mirrorErr);
        }
      }

      res.json(lastParsed || { code: 502, msg: 'Server RunningHub sedang padat. Silakan coba unggah beberapa saat lagi.' });
    } catch (err: any) {
      console.error('Error in /api/runninghub/upload proxy:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Gagal mengunggah berkas ke server RunningHub' });
    }
  });

  // API Proxy to RunningHub for submitting AI App task
  app.post('/api/runninghub/run', async (req: Request, res: Response) => {
    const { apiKey, webappId, nodeInfoList } = req.body;

    if (!apiKey) {
      res.status(400).json({ code: 400, msg: 'API Key is required to call RunningHub' });
      return;
    }

    try {
      const targetWebapp = String(webappId || '2082796145605492738').trim();
      const mappedNodes = (Array.isArray(nodeInfoList) ? nodeInfoList : []).map((item: any) => {
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
        apiKey: String(apiKey).trim(),
        webappId: targetWebapp,
        instanceType: req.body.instanceType || 'default',
        nodeInfoList: mappedNodes,
      };

      let response = await fetch('https://www.runninghub.ai/task/openapi/ai-app/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'RunningHubClient/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status >= 500) {
        response = await fetch('https://www.runninghub.cn/task/openapi/ai-app/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'RunningHubClient/1.0',
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await safeParseResponse(response);
      res.json(data);
    } catch (err: any) {
      console.error('Error in ai-app/run proxy:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Failed to submit task to RunningHub' });
    }
  });

  // API Proxy to stream remote video from RunningHub with full video/mp4 headers and CORS
  app.get('/api/runninghub/proxy-video', async (req: Request, res: Response) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      res.status(400).send('Missing video URL');
      return;
    }

    try {
      // 1. Check if this remote URL matches a video already cached on local disk
      const matchingJob = findJobByRemoteUrl(videoUrl) || findJobByFileName(path.basename(videoUrl));

      if (matchingJob && matchingJob.videoFileName) {
        const localPath = path.join(VIDEOS_DIR, matchingJob.videoFileName);
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10240) {
          return streamLocalVideo(localPath, req, res);
        }
      }

      // 2. Stream directly from upstream with Range forwarding to prevent high memory usage
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RunningHubClient/1.0',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const upstreamRes = await fetch(videoUrl, { headers });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        res.status(upstreamRes.status).send('Failed to fetch remote video');
        return;
      }

      const status = upstreamRes.status;
      const contentType = upstreamRes.headers.get('content-type') || 'video/mp4';
      const contentLength = upstreamRes.headers.get('content-length');
      const contentRange = upstreamRes.headers.get('content-range');
      const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

      const forwardHeaders: Record<string, any> = {
        'Content-Type': contentType,
        'Accept-Ranges': acceptRanges,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      };
      if (contentLength) forwardHeaders['Content-Length'] = contentLength;
      if (contentRange) forwardHeaders['Content-Range'] = contentRange;

      res.writeHead(status, forwardHeaders);

      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        let isClosed = false;
        const onClose = () => {
          isClosed = true;
          reader.cancel().catch(() => {});
        };
        req.on('close', onClose);

        try {
          while (!isClosed) {
            const { done, value } = await reader.read();
            if (done || isClosed) break;
            res.write(value);
          }
        } finally {
          req.off('close', onClose);
          if (!isClosed) {
            res.end();
          }
        }
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Error streaming proxy video:', err);
      if (!res.headersSent) {
        res.status(500).send('Proxy video streaming error');
      }
    }
  });

  // API Download endpoint with Content-Disposition header for seamless mobile & desktop download
  app.get('/api/download', async (req: Request, res: Response) => {
    const videoUrl = req.query.url as string;
    const filename = (req.query.filename as string) || `motion_video_${Date.now()}.mp4`;

    if (!videoUrl) {
      res.status(400).send('Missing video URL');
      return;
    }

    try {
      // 1. If it's a local storage file
      if (videoUrl.startsWith('/storage/videos/')) {
        const localFileName = path.basename(videoUrl);
        const localPath = path.join(VIDEOS_DIR, localFileName);
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10240) {
          const stat = fs.statSync(localPath);
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Access-Control-Allow-Origin', '*');
          fs.createReadStream(localPath).pipe(res);
          return;
        }

        // Try to heal from matching Job in memory/disk
        const matchedJob = findJobByFileName(localFileName);
        if (matchedJob?.remoteVideoUrl) {
          const remoteRes = await fetch(matchedJob.remoteVideoUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });
          if (remoteRes.ok) {
            const arrayBuffer = await remoteRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer.length > 10240) {
              fs.writeFileSync(localPath, buffer);
              res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
              res.setHeader('Content-Type', 'video/mp4');
              res.setHeader('Content-Length', buffer.length);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(buffer);
              return;
            }
          }
        }

        res.status(404).send('Berkas video lokal tidak ditemukan atau telah kedaluwarsa');
        return;
      }

      // 2. If it's a proxy or remote URL
      let targetUrl = videoUrl;
      if (videoUrl.startsWith('/api/runninghub/proxy-video?url=')) {
        targetUrl = decodeURIComponent(videoUrl.split('url=')[1] || '');
      }

      const remoteRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!remoteRes.ok) {
        res.status(remoteRes.status).send('Gagal mengunduh berkas video dari server');
        return;
      }

      const contentLength = remoteRes.headers.get('content-length');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', remoteRes.headers.get('content-type') || 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      if (remoteRes.body) {
        const reader = remoteRes.body.getReader();
        let isClosed = false;
        const onClose = () => {
          isClosed = true;
          reader.cancel().catch(() => {});
        };
        req.on('close', onClose);

        try {
          while (!isClosed) {
            const { done, value } = await reader.read();
            if (done || isClosed) break;
            res.write(value);
          }
        } finally {
          req.off('close', onClose);
          if (!isClosed) {
            res.end();
          }
        }
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    }
  });

  // API Proxy to RunningHub for checking API Key status and coin/credit balance
  app.post('/api/runninghub/check-key', async (req: Request, res: Response) => {
    const { apiKey } = req.body;

    if (!apiKey || !String(apiKey).trim()) {
      res.status(400).json({ code: 400, msg: 'API Key required' });
      return;
    }

    const cleanKey = String(apiKey).trim();

    try {
      // 1. Query the official accountStatus endpoint directly from RunningHub
      let testRes = await fetch('https://www.runninghub.ai/uc/openapi/accountStatus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'RunningHubClient/1.0',
        },
        body: JSON.stringify({ apikey: cleanKey }),
      });

      if (!testRes.ok && testRes.status >= 500) {
        testRes = await fetch('https://www.runninghub.cn/uc/openapi/accountStatus', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'RunningHubClient/1.0',
          },
          body: JSON.stringify({ apikey: cleanKey }),
        });
      }

      const testData = await safeParseResponse(testRes);
      const code = Number(testData?.code);
      const msg = String(testData?.msg || '').toUpperCase();

      const isInvalid =
        code === 806 ||
        code === 401 ||
        code === 403 ||
        code === 802 ||
        msg.includes('APIKEY_USER_NOT_FOUND') ||
        msg.includes('APIKEY_NOT_EXIST') ||
        msg.includes('INVALID') ||
        msg.includes('UNAUTHORIZED');

      if (isInvalid) {
        res.json({
          code: 401,
          valid: false,
          balance: null,
          msg: 'API Key tidak valid atau tidak terdaftar di RunningHub',
        });
        return;
      }

      // Read real remainCoins directly from RunningHub response
      let balanceStr = '0';
      let balanceNum = 0;
      if (testData?.data && typeof testData.data === 'object') {
        const remain = testData.data.remainCoins;
        if (remain !== undefined && remain !== null) {
          balanceStr = String(remain);
          balanceNum = Number(remain) || 0;
        }
      }

      res.json({
        code: 0,
        valid: true,
        balance: balanceStr,
        balanceNum: balanceNum,
        msg: 'API Key valid & aktif',
      });
    } catch (err: any) {
      console.error('Error in check-key:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Gagal memeriksa status API Key' });
    }
  });

  // API Proxy to RunningHub for checking multiple API Keys in bulk concurrently
  app.post('/api/runninghub/check-keys-bulk', async (req: Request, res: Response) => {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length === 0) {
      res.status(400).json({ code: 400, msg: 'Keys array required' });
      return;
    }

    const cleanKeys = Array.from(new Set(keys.map((k) => String(k).trim()).filter(Boolean)));

    const results = await Promise.all(
      cleanKeys.map(async (key) => {
        try {
          let testRes = await fetch('https://www.runninghub.ai/uc/openapi/accountStatus', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'RunningHubClient/1.0',
            },
            body: JSON.stringify({ apikey: key }),
          });

          if (!testRes.ok && testRes.status >= 500) {
            testRes = await fetch('https://www.runninghub.cn/uc/openapi/accountStatus', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'RunningHubClient/1.0',
              },
              body: JSON.stringify({ apikey: key }),
            });
          }

          const testData = await safeParseResponse(testRes);
          const code = Number(testData?.code);
          const msg = String(testData?.msg || '').toUpperCase();

          const isInvalid =
            code === 806 ||
            code === 401 ||
            code === 403 ||
            code === 802 ||
            msg.includes('APIKEY_USER_NOT_FOUND') ||
            msg.includes('APIKEY_NOT_EXIST') ||
            msg.includes('INVALID') ||
            msg.includes('UNAUTHORIZED');

          if (isInvalid) {
            return { apiKey: key, valid: false, balance: 0, balanceStr: 'Banned', msg: 'API Key diblokir / tidak valid' };
          }

          let balanceNum = 0;
          let balanceStr = '0';
          if (testData?.data && typeof testData.data === 'object') {
            const remain = testData.data.remainCoins;
            if (remain !== undefined && remain !== null) {
              balanceStr = String(remain);
              balanceNum = Number(remain) || 0;
            }
          }

          return {
            apiKey: key,
            valid: true,
            balance: balanceNum,
            balanceStr: balanceStr,
            msg: balanceNum > 0 ? 'Aktif' : 'Koin Habis (0)',
          };
        } catch {
          return { apiKey: key, valid: false, balance: 0, balanceStr: 'Error', msg: 'Gagal terhubung' };
        }
      })
    );

    res.json({ code: 0, data: results });
  });

  // API Proxy to RunningHub for querying outputs
  app.post('/api/runninghub/outputs', async (req: Request, res: Response) => {
    const { apiKey, taskId } = req.body;

    if (!apiKey || !taskId) {
      res.status(400).json({ code: 400, msg: 'Missing apiKey or taskId' });
      return;
    }

    try {
      const payload = {
        apiKey: String(apiKey).trim(),
        taskId: String(taskId).trim(),
      };

      let response = await fetch('https://www.runninghub.ai/task/openapi/outputs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'RunningHubClient/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status >= 500) {
        response = await fetch('https://www.runninghub.cn/task/openapi/outputs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'RunningHubClient/1.0',
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await safeParseResponse(response);
      res.json(data);
    } catch (err: any) {
      console.error('Error in outputs proxy:', err);
      res.status(500).json({ code: 500, msg: err?.message || 'Failed to fetch outputs from RunningHub' });
    }
  });

  // Serve public static directory
  app.use(express.static(path.join(__dirname, 'public')));

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
