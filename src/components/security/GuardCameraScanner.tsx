import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { IcAlert, IcCamera } from "../common/Icons";

interface GuardCameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanning: boolean;
  onStartScanning: () => void;
  onStopScanning: () => void;
}

type CameraStatus = "idle" | "loading" | "active" | "denied" | "unavailable";

export function GuardCameraScanner({
  onScanSuccess,
  isScanning,
  onStartScanning,
  onStopScanning,
}: GuardCameraScannerProps) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTextRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const containerId = "qless-guard-camera-viewport";

  useEffect(() => {
    let isCancelled = false;

    if (!isScanning) {
      // Clean up camera when scanning is disabled
      if (scannerRef.current) {
        const instance = scannerRef.current;
        scannerRef.current = null;
        if (instance.isScanning) {
          instance
            .stop()
            .then(() => {
              try {
                instance.clear();
              } catch {}
            })
            .catch(() => {});
        } else {
          try {
            instance.clear();
          } catch {}
        }
      }
      setStatus("idle");
      return;
    }

    async function initCamera() {
      setStatus("loading");
      setErrorMessage("");

      // 1. Verify browser mediaDevices support
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        if (!isCancelled) {
          setStatus("unavailable");
          setErrorMessage("Camera access is not supported by this browser environment.");
        }
        return;
      }

      // 2. Allow element to mount in DOM
      await new Promise((res) => setTimeout(res, 80));
      if (isCancelled) return;

      const element = document.getElementById(containerId);
      if (!element) {
        if (!isCancelled) {
          setStatus("unavailable");
          setErrorMessage("Guard camera viewfinder viewport not found.");
        }
        return;
      }

      try {
        if (scannerRef.current) {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop().catch(() => {});
          }
          try {
            scannerRef.current.clear();
          } catch {}
          scannerRef.current = null;
        }

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight);
              // Large responsive scanning area (~75% of min dimension, up to 460px)
              const size = Math.max(260, Math.min(460, Math.floor(edge * 0.75)));
              return {
                width: Math.min(size, Math.max(240, viewfinderWidth - 24)),
                height: Math.min(size, Math.max(240, viewfinderHeight - 24)),
              };
            },
            aspectRatio: 1.333333,
            videoConstraints: {
              facingMode: "environment",
              width: { min: 640, ideal: 1280 },
              height: { min: 480, ideal: 720 },
            },
          },
          (decodedText) => {
            if (isCancelled) return;

            // Debounce identical scans within 3 seconds
            const now = Date.now();
            if (
              decodedText === lastScannedTextRef.current &&
              now - lastScannedTimeRef.current < 3000
            ) {
              return;
            }

            lastScannedTextRef.current = decodedText;
            lastScannedTimeRef.current = now;

            // Pause camera on successful decode to prevent rapid re-triggers
            if (scanner.isScanning) {
              try {
                scanner.pause(true);
              } catch {}
            }

            onScanSuccess(decodedText);
          },
          () => {
            // Non-match frame
          }
        );

        if (!isCancelled) {
          setStatus("active");
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        const errStr = String(err);
        const errName =
          err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";

        if (
          errName === "NotAllowedError" ||
          errName === "PermissionDeniedError" ||
          errStr.toLowerCase().includes("permission") ||
          errStr.toLowerCase().includes("denied")
        ) {
          setStatus("denied");
          setErrorMessage("Camera permission was denied. Please allow camera permissions in browser settings.");
        } else {
          setStatus("unavailable");
          setErrorMessage("No active camera hardware detected. Use the manual QR payload verification tab below.");
        }
      }
    }

    initCamera();

    return () => {
      isCancelled = true;
      if (scannerRef.current) {
        const instance = scannerRef.current;
        scannerRef.current = null;
        if (instance.isScanning) {
          instance
            .stop()
            .then(() => {
              try {
                instance.clear();
              } catch {}
            })
            .catch(() => {});
        } else {
          try {
            instance.clear();
          } catch {}
        }
      }
    };
  }, [isScanning, onScanSuccess]);

  return (
    <div className="flex flex-col space-y-3.5">
      {/* Viewport Frame */}
      {isScanning && (status === "loading" || status === "active") && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-[#2E9E44] bg-[#020617] min-h-[360px] sm:min-h-[440px] md:min-h-[500px] shadow-xl w-full">
          <div id={containerId} className="w-full min-h-[360px] sm:min-h-[440px] md:min-h-[500px]" />

          {/* Loading Overlay */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F9FAFB] p-6 text-center z-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44]">
                <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              </div>
              <p className="mt-3 font-poppins text-sm font-semibold text-[#0F2044]">
                Initializing Guard Turnstile Scanner…
              </p>
              <p className="mt-1 text-xs text-[#7A8493]">
                Starting rear camera feed for customer exit QR verification.
              </p>
            </div>
          )}

          {/* Active Scanning HUD Reticles & Guidance */}
          {status === "active" && (
            <>
              {/* Top Camera Status Indicator */}
              <div className="absolute top-3.5 inset-x-0 flex justify-center pointer-events-none z-10 px-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-black/75 backdrop-blur-md px-3.5 py-1 text-xs font-semibold text-white border border-white/15 shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="tracking-wide">LIVE CAMERA ACTIVE</span>
                </div>
              </div>

              {/* Large Scanning Alignment Frame & Corner Indicators */}
              <div className="pointer-events-none absolute inset-6 sm:inset-12 md:inset-16 qless-corner-pulse z-10 flex items-center justify-center" aria-hidden="true">
                <div className="relative w-full h-full max-w-[420px] max-h-[420px] rounded-2xl border border-white/20">
                  <span className="absolute -left-1 -top-1 h-12 w-12 sm:h-16 sm:w-16 rounded-tl-2xl border-l-[4px] border-t-[4px] border-[#2E9E44]" />
                  <span className="absolute -right-1 -top-1 h-12 w-12 sm:h-16 sm:w-16 rounded-tr-2xl border-r-[4px] border-t-[4px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -left-1 h-12 w-12 sm:h-16 sm:w-16 rounded-bl-2xl border-b-[4px] border-l-[4px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -right-1 h-12 w-12 sm:h-16 sm:w-16 rounded-br-2xl border-b-[4px] border-r-[4px] border-[#2E9E44]" />
                </div>
              </div>

              {/* Subtle Scanning Laser Beam */}
              <div
                className="pointer-events-none absolute left-8 right-8 h-0.5 rounded-full qless-beam z-10"
                style={{
                  background: "linear-gradient(90deg, transparent, #2E9E44 50%, transparent)",
                  boxShadow: "0 0 16px 3px rgba(46,158,68,0.85)",
                }}
                aria-hidden="true"
              />

              {/* Bottom Instruction Guidance */}
              <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none z-10 px-4">
                <div className="inline-flex flex-col items-center gap-1 rounded-2xl bg-black/80 backdrop-blur-md px-4 py-2 border border-white/15 text-white shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-sm">📱</span>
                    <span className="font-poppins text-xs sm:text-sm font-bold tracking-tight">
                      Position Customer Exit QR Inside Frame
                    </span>
                  </div>
                  <span className="text-[10.5px] text-slate-300">
                    Hold phone at a comfortable distance (1–2 ft)
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Idle / Camera Off State */}
      {!isScanning && (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#0F2044]/15 bg-white/80 p-8 sm:p-10 text-center shadow-xs">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44] text-3xl shadow-sm">
            📷
          </div>
          <h4 className="mt-4 font-poppins text-base font-bold text-[#0F2044]">
            Turnstile Camera Scanner
          </h4>
          <p className="mt-1.5 text-xs text-[#7A8493] max-w-sm leading-relaxed">
            Positioned at store exit. Ready to scan and verify customer exit QR passes.
          </p>
          <button
            type="button"
            onClick={onStartScanning}
            className="mt-5 flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2E9E44] px-6 py-2.5 font-poppins text-xs sm:text-sm font-bold text-white shadow-md transition hover:bg-[#288B3B] active:scale-95"
          >
            <IcCamera />
            <span>Start Camera Scanner</span>
          </button>
        </div>
      )}

      {/* Camera Denied or Unavailable Alert */}
      {isScanning && (status === "denied" || status === "unavailable") && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-center qless-scale-in">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
            <IcAlert />
          </div>
          <h4 className="mt-2 font-poppins text-xs font-bold text-amber-950">
            {status === "denied" ? "Camera Permission Denied" : "Camera Hardware Unavailable"}
          </h4>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed max-w-sm mx-auto">
            {errorMessage}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={onStopScanning}
              className="min-h-[44px] flex items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
            >
              Close Scanner
            </button>
            <button
              type="button"
              onClick={() => {
                onStopScanning();
                setTimeout(() => onStartScanning(), 100);
              }}
              className="min-h-[44px] flex items-center justify-center rounded-xl bg-[#2E9E44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#288B3B]"
            >
              Retry Camera
            </button>
          </div>
        </div>
      )}

      {/* Stop Scanner Action Button (when active) */}
      {isScanning && status === "active" && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onStopScanning}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] active:scale-95"
          >
            <span>⏹</span>
            <span>Stop Camera Scanner</span>
          </button>
        </div>
      )}
    </div>
  );
}
