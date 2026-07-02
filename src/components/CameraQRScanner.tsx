import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type Props = {
  onScan: (text: string) => void;
  /** Minimum ms between successful scans (debounce). Default 2500. */
  cooldownMs?: number;
  paused?: boolean;
  /** Change this value to reset duplicate-scan protection, e.g. when switching Board -> Drop-off */
  resetKey?: string;
};

type CameraDevice = { deviceId: string; label: string };

export default function CameraQRScanner({ onScan, cooldownMs = 2500, paused = false, resetKey = '' }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<string>('Point the camera at a QR code...');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    lastScanRef.current = null;
    setHint('Point the camera at a QR code...');
  }, [resetKey]);

  // Get list of cameras
  useEffect(() => {
    async function listCams() {
      try {
        // Need permission first before labels are exposed
        if (navigator.mediaDevices?.getUserMedia) {
          try {
            const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
            tmp.getTracks().forEach((t) => t.stop());
          } catch {}
        }
        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
        setDevices(cams);
        if (cams.length && !deviceId) {
          // Prefer back camera if label suggests so
          const back = cams.find((c) => /back|rear|environment/i.test(c.label));
          setDeviceId(back?.deviceId || cams[0].deviceId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cannot list cameras');
      }
    }
    listCams();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start / stop camera stream
  useEffect(() => {
    let cancelled = false;

    async function start() {
      setError('');
      setReady(false);
      stop();
      if (paused) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support camera access.');
        return;
      }
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: 'environment' } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
          setReady(true);
          tick();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera error';
        if (/Permission|NotAllowed/i.test(msg)) {
          setError('Camera permission denied. Please allow camera access in your browser settings and reload.');
        } else if (/NotFound/i.test(msg)) {
          setError('No camera found on this device.');
        } else {
          setError(msg);
        }
      }
    }

    function stop() {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            try {
              const imageData = ctx.getImageData(0, 0, w, h);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (code && code.data) {
                const now = Date.now();
                const last = lastScanRef.current;
                if (!last || last.value !== code.data || now - last.at > cooldownMs) {
                  lastScanRef.current = { value: code.data, at: now };
                  setHint(`✓ Detected: ${code.data}`);
                  try {
                    onScanRef.current(code.data);
                  } catch {}
                }
              }
            } catch {}
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [deviceId, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border-4 border-cyan-400/80 bg-black">
        <video ref={videoRef} className="block w-full" style={{ aspectRatio: '4/3' }} muted playsInline />
        {/* Targeting overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-2/3 w-2/3 max-w-sm">
            <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-cyan-300" />
            <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-cyan-300" />
            <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-cyan-300" />
            <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-cyan-300" />
            <span className="scan-line absolute left-0 right-0 h-0.5 bg-cyan-300/80 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
          </div>
        </div>
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm font-bold">
            Starting camera...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
            <span className="text-2xl">📷</span>
            <p className="text-sm font-bold text-rose-300">{error}</p>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`flex h-2.5 w-2.5 rounded-full ${ready ? 'bg-emerald-500 animate-pulse' : error ? 'bg-rose-500' : 'bg-amber-500'}`} />
        <span className="font-bold text-slate-700">{error ? 'Camera off' : ready ? hint : 'Connecting...'}</span>

        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        )}
      </div>

      <style>{`
        .scan-line {
          top: 0;
          animation: scanline 2.4s linear infinite;
        }
        @keyframes scanline {
          0%   { top: 0%;   opacity: 0.2; }
          10%  { opacity: 1; }
          50%  { top: 98%;  opacity: 1; }
          60%  { opacity: 0.2; }
          100% { top: 0%;   opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
