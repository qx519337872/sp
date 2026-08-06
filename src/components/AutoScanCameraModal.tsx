import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, Sparkles, AlertCircle, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64: string) => void;
}

export const AutoScanCameraModal: React.FC<Props> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [clarityScore, setClarityScore] = useState<number>(0);
  const [isStable, setIsStable] = useState<boolean>(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(true);
  const autoCaptureEnabledRef = useRef<boolean>(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stableCounterRef = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);

  // Keep autoCaptureEnabledRef in sync with state
  useEffect(() => {
    autoCaptureEnabledRef.current = autoCaptureEnabled;
    if (!autoCaptureEnabled) {
      stableCounterRef.current = 0;
      setCountdown(null);
      isCapturingRef.current = false;
    }
  }, [autoCaptureEnabled]);

  // Start Camera Stream
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    stopCamera();
    setIsCameraReady(false);
    setCameraError(null);
    setClarityScore(0);
    setIsStable(false);
    setCountdown(null);
    stableCounterRef.current = 0;
    isCapturingRef.current = false;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsCameraReady(true);
            startAnalyzer();
          }).catch((err) => {
            console.error('Play video error:', err);
            setCameraError('视频播放失败，请确认系统相机权限');
          });
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || '无法访问摄像头，请在手机浏览器中允许相机权限');
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleAutoCapture = () => {
    setAutoCaptureEnabled((prev) => {
      const next = !prev;
      if (!next) {
        stableCounterRef.current = 0;
        setCountdown(null);
        isCapturingRef.current = false;
      }
      return next;
    });
  };

  // Analyze video frame clarity and motion stability
  const startAnalyzer = () => {
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCanvas.width = 160;
    offCanvas.height = 120;

    let lastCheckTime = performance.now();

    const loop = () => {
      if (!isOpen || !videoRef.current || isCapturingRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();
      // Run analysis every ~150ms to save CPU
      if (now - lastCheckTime >= 150) {
        lastCheckTime = now;
        const video = videoRef.current;

        if (video.readyState >= 2 && offCtx) {
          offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
          const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
          const data = imageData.data;

          // Convert to grayscale & compute Laplacian variance for sharpness
          let graySum = 0;
          const grays = new Float32Array(data.length / 4);
          for (let i = 0; i < data.length; i += 4) {
            const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            grays[i / 4] = g;
            graySum += g;
          }

          // Laplacian high-frequency edge measure
          const w = offCanvas.width;
          const h = offCanvas.height;
          let lapVar = 0;
          let lapCount = 0;

          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = y * w + x;
              const val =
                -4 * grays[idx] +
                grays[idx - 1] +
                grays[idx + 1] +
                grays[idx - w] +
                grays[idx + w];
              lapVar += val * val;
              lapCount++;
            }
          }

          const meanLap = lapCount > 0 ? lapVar / lapCount : 0;
          // Scale meanLap to 0..100 percentage score
          const rawScore = Math.min(100, Math.round((meanLap / 180) * 100));

          // Compute motion diff from previous frame
          let motionDiff = 0;
          if (lastFrameDataRef.current && lastFrameDataRef.current.length === data.length) {
            const prev = lastFrameDataRef.current;
            let diffSum = 0;
            for (let i = 0; i < data.length; i += 16) {
              diffSum += Math.abs(data[i] - prev[i]);
            }
            motionDiff = diffSum / (data.length / 16);
          }
          lastFrameDataRef.current = new Uint8ClampedArray(data);

          const isFrameStable = motionDiff < 14;
          const isHighClarity = rawScore >= 45;

          setClarityScore(rawScore);
          setIsStable(isFrameStable);

          // Auto capture logic:
          // If auto capture is enabled, frame is sharp & hand is steady for 6 consecutive checks (~900ms)
          if (autoCaptureEnabledRef.current && isHighClarity && isFrameStable) {
            stableCounterRef.current += 1;
            if (stableCounterRef.current >= 6) {
              triggerSnap();
            }
          } else {
            stableCounterRef.current = Math.max(0, stableCounterRef.current - 1);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  };

  const triggerSnap = () => {
    if (!autoCaptureEnabledRef.current || isCapturingRef.current || !videoRef.current) return;
    isCapturingRef.current = true;

    // Gentle countdown: 3, 2, 1 (850ms per tick)
    let count = 3;
    setCountdown(count);

    const timer = setInterval(() => {
      if (!autoCaptureEnabledRef.current) {
        clearInterval(timer);
        setCountdown(null);
        isCapturingRef.current = false;
        return;
      }

      count -= 1;
      if (count <= 0) {
        clearInterval(timer);
        captureNow();
      } else {
        setCountdown(count);
      }
    }, 850);
  };

  const captureNow = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.92);

    stopCamera();
    onCapture(base64);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Top Header Bar */}
      <div className="flex items-center justify-end px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800 z-10">
        {/* Close modal */}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <p className="text-sm font-semibold mb-2">{cameraError}</p>
            <p className="text-xs text-slate-400 mb-6">您也可以使用手机原生拍照功能或选择相册照片</p>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-6 rounded-full bg-white text-slate-900 font-bold text-xs"
            >
              返回重试
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Target Viewfinder Overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Darkened vignette around target box */}
              <div className="w-[88%] max-w-md aspect-[3/4] border-2 border-white/60 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all">
                {/* 4 Corner Markers */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#34c759] rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#34c759] rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#34c759] rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#34c759] rounded-br-xl" />

                {/* Laser scan line effect */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#34c759] to-transparent animate-pulse absolute top-1/2 -translate-y-1/2 opacity-70" />

                {/* Countdown Overlay when locked */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs rounded-3xl animate-fade-in">
                    <span className="text-6xl font-black text-emerald-400 animate-ping">
                      {countdown}
                    </span>
                    <span className="text-sm font-bold mt-3 text-white">清晰对焦，即将拍照！</span>
                  </div>
                )}
              </div>
            </div>

            {/* Auto-focus Status Bar */}
            <div className="absolute top-4 inset-x-4 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className={`px-4 py-2 rounded-full backdrop-blur-md border text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                !autoCaptureEnabled
                  ? 'bg-slate-900/85 border-slate-700 text-slate-300'
                  : clarityScore >= 45 && isStable
                  ? 'bg-emerald-950/85 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900/85 border-amber-500/50 text-amber-300'
              }`}>
                {!autoCaptureEnabled ? (
                  <>
                    <Zap className="w-4 h-4 text-slate-400" />
                    <span>手动模式：对准账单后点击中间按钮拍照</span>
                  </>
                ) : clarityScore >= 45 && isStable ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-bounce" />
                    <span>画面清晰且稳定！准备自动拍照...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>请拿稳手机，正在检测清晰度 ({clarityScore}%)</span>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 z-10">
        {/* Left: Flip Camera */}
        <button
          type="button"
          onClick={flipCamera}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-xs font-bold text-slate-200 border border-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          <span>切换镜头</span>
        </button>

        {/* Center: Big Manual Shutter Button */}
        <button
          type="button"
          onClick={captureNow}
          disabled={!isCameraReady}
          className="w-16 h-16 rounded-full border-4 border-white bg-[#d6a5b5] active:scale-90 transition-all flex items-center justify-center shadow-lg disabled:opacity-50 shrink-0"
          title="手动拍照"
        >
          <div className="w-12 h-12 rounded-full bg-white shadow-inner" />
        </button>

        {/* Right: Toggle Auto Capture */}
        <button
          type="button"
          onClick={toggleAutoCapture}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
            autoCaptureEnabled
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>自动拍摄: {autoCaptureEnabled ? '开启' : '关闭'}</span>
        </button>
      </div>
    </div>
  );
};
