import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type Props = {
  onScan: (text: string) => void;
  cooldownMs?: number;
  active: boolean;
  onCameraDetected: (cameraLabel: string) => void;
  onError: (errorMsg: string) => void;
  onStop: () => void;
  scanStatus?: 'idle' | 'success' | 'error';
  scanStatusMessage?: string;
  hasActiveTrip: boolean;
  busNumber?: string;
};

type CameraDevice = { deviceId: string; label: string };

export default function DriverCameraScanner({
  onScan,
  cooldownMs = 2500,
  active,
  onCameraDetected,
  onError,
  onStop,
  scanStatus = 'idle',
  scanStatusMessage = '',
  hasActiveTrip,
  busNumber,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [currentLabel, setCurrentLabel] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState<string>('');


  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Enumerate cameras and select the best one
  const updateCameraDevices = async (shouldAutoSelect = false) => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('enumerateDevices not supported');
      }

      // Request temp stream for labels if empty
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const needsPermission = allDevices.some(d => d.kind === 'videoinput' && !d.label);
      if (needsPermission && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
          tempStream.getTracks().forEach(t => t.stop());
        } catch {}
      }

      const freshDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = freshDevices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));

      setDevices(videoDevices);

      if (videoDevices.length === 0) {
        setLocalError('No Camera Available');
        onError('No Camera Available');
        setReady(false);
        return;
      }

      // Auto-select logic
      if (shouldAutoSelect || !selectedDeviceId) {
        // Prefer USB or External webcam
        const usbWebcam = videoDevices.find(d => /usb|external|hd webcam/i.test(d.label));
        const selected = usbWebcam || videoDevices.find(d => !/integrated|internal|front|facetime/i.test(d.label)) || videoDevices[0];
        
        setSelectedDeviceId(selected.deviceId);
        setCurrentLabel(selected.label);
        onCameraDetected(selected.label);
      } else {
        // Check if currently selected camera was disconnected
        const stillExists = videoDevices.some(d => d.deviceId === selectedDeviceId);
        if (!stillExists) {
          // If we lost our selected USB device
          setLocalError('USB Webcam Disconnected');
          onError('USB Webcam Disconnected');
          setReady(false);
          onStop();
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Cannot list cameras';
      setLocalError(msg);
      onError(msg);
    }
  };

  // Setup devicechange listener
  useEffect(() => {
    const handleDeviceChange = () => {
      updateCameraDevices(false);
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [selectedDeviceId]);

  // Initial listing
  useEffect(() => {
    if (active) {
      updateCameraDevices(true);
    } else {
      stopCamera();
    }
  }, [active]);

  // Toggle selected camera
  useEffect(() => {
    if (active && selectedDeviceId) {
      const matched = devices.find(d => d.deviceId === selectedDeviceId);
      if (matched) {
        setCurrentLabel(matched.label);
        onCameraDetected(matched.label);
      }
      startCamera();
    }
  }, [selectedDeviceId, active]);

  const startCamera = async () => {
    setLocalError('');
    setReady(false);
    stopCamera();

    if (!active || !selectedDeviceId) return;

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: { deviceId: { exact: selectedDeviceId } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setReady(true);

        // Try to turn on camera torch/LED lights programmatically if supported
        try {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            const caps = (videoTrack as any).getCapabilities?.() || {};
            if (caps.torch) {
              await videoTrack.applyConstraints({
                advanced: [{ torch: true } as any]
              });
              console.log('[CAMERA LIGHT] Programmatic torch activated.');
            }
          }
        } catch (torchErr) {
          console.warn('Programmatic camera light activation unsupported:', torchErr);
        }

        startScanningLoop();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera error';
      let formattedMsg = msg;
      if (/Permission|NotAllowed/i.test(msg)) {
        formattedMsg = 'Camera Permission Required';
      } else if (/NotFound/i.test(msg)) {
        formattedMsg = 'No Camera Available';
      }
      setLocalError(formattedMsg);
      onError(formattedMsg);
      onStop();
    }
  };

  const stopCamera = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setReady(false);
  };

  const startScanningLoop = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !streamRef.current) {
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
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  // Webcam connection heartbeat
  useEffect(() => {
    if (!active || !ready) return;
    const interval = setInterval(() => {
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState === 'ended') {
          console.warn('Webcam heartbeat failure: track ended or missing.');
          setLocalError('USB Webcam Disconnected');
          onError('USB Webcam Disconnected');
          setReady(false);
          onStop();
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [active, ready, onError, onStop]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const borderClass = scanStatus === 'success' ? 'border-emerald-500' : scanStatus === 'error' ? 'border-rose-500' : 'border-blue-500';

  return (
    <div className="space-y-4">
      <div className={`relative overflow-hidden rounded-2xl border-4 ${borderClass} bg-black transition-colors duration-300`}>
        <video ref={videoRef} className="block w-full" style={{ aspectRatio: '4/3' }} muted playsInline />

        {/* Overlay styling for target scanner */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-2/3 w-2/3 max-w-sm">
            <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-blue-400" />
            <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-blue-400" />
            <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-blue-400" />
            <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-blue-400" />
            <span className="scan-line absolute left-0 right-0 h-0.5 bg-blue-400/80 shadow-[0_0_10px_rgba(59,130,246,0.9)]" />
          </div>
        </div>

        {!hasActiveTrip ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-400">
            <span className="text-4xl text-rose-500">🚫</span>
            <p className="mt-3 text-lg font-black text-rose-400">Scanner Status: DISABLED</p>
            <p className="mt-1 text-sm font-bold text-slate-300">Start a trip to enable scanning.</p>
          </div>
        ) : !active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-center text-slate-400">
            <span className="text-3xl">📷</span>
            <p className="mt-2 text-sm font-bold text-amber-500">Scanner Status: DISABLED</p>
            <p className="text-xs text-slate-500">Click Enable Scanner below to start</p>
          </div>
        ) : null}

        {active && !ready && !localError && hasActiveTrip && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white text-sm font-bold animate-pulse">
            Connecting camera...
          </div>
        )}

        {localError && hasActiveTrip && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 p-6 text-center text-white">
            <span className="text-3xl text-rose-500">⚠️</span>
            <p className="text-sm font-bold text-rose-400">{localError}</p>
          </div>
        )}

        {active && ready && hasActiveTrip && (
          <div className="absolute bottom-4 left-4 right-4 flex flex-col items-center justify-center rounded-xl bg-slate-900/85 p-3 text-center text-white backdrop-blur-sm shadow-lg transition-all duration-300 border border-slate-700/50">
            {scanStatus === 'idle' && (
              <div className="flex items-center gap-2 font-black text-amber-400">
                <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                <span>🟡 READY TO SCAN</span>
              </div>
            )}
            {scanStatus === 'success' && (
              <div className="space-y-1 font-black text-emerald-400">
                <p className="flex items-center justify-center gap-1.5 text-sm uppercase">✓ QR Detected</p>
                <p className="flex items-center justify-center gap-1.5 text-sm uppercase">✓ Attendance Recorded</p>
                <p className="flex items-center justify-center gap-1.5 text-sm uppercase">
                  ✓ {scanStatusMessage && scanStatusMessage.toLowerCase().includes('fail') ? 'SMS Failed' : scanStatusMessage && scanStatusMessage.toLowerCase().includes('deliver') ? 'SMS Delivered' : 'SMS Sent'}
                </p>
              </div>
            )}
            {scanStatus === 'error' && (
              <div className="space-y-1 font-black text-rose-400">
                <p className="text-sm uppercase">❌ SCAN FAILED</p>
                <p className="text-xs font-bold text-white max-w-xs break-words">{scanStatusMessage || 'Validation Failed'}</p>
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {active && devices.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-700">Scanner active: {currentLabel}</span>
          </div>

          {devices.length > 1 && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

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
