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
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.min(260, Math.max(180, Math.floor(edge * 0.75)));
              return {
                width: size,
                height: size,
              };
            },
            aspectRatio: 1.0,
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
    <div className="flex flex-col space-y-3">
      {/* Viewport Frame */}
      {isScanning && (status === "loading" || status === "active") && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-[#2E9E44] bg-black min-h-[260px] shadow-lg">
          <div id={containerId} className="w-full min-h-[260px]" />

          {/* Loading Overlay */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F9FAFB] p-6 text-center z-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44]">
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              </div>
              <p className="mt-3 font-poppins text-sm font-semibold text-[#0F2044]">
                Initializing Guard Scanner…
              </p>
              <p className="mt-1 text-xs text-[#7A8493]">
                Requesting rear camera access to scan customer exit passes.
              </p>
            </div>
          )}

          {/* Active Scanning HUD Reticles */}
          {status === "active" && (
            <>
              <div className="pointer-events-none absolute inset-5 qless-corner-pulse z-10" aria-hidden="true">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-[3.5px] border-l-[3.5px] border-[#2E9E44]" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-[3.5px] border-r-[3.5px] border-[#2E9E44]" />
              </div>

              {/* Scanning Laser Beam */}
              <div
                className="pointer-events-none absolute left-6 right-6 h-0.5 rounded-full qless-beam z-10"
                style={{
                  background: "linear-gradient(90deg, transparent, #2E9E44, transparent)",
                  boxShadow: "0 0 12px 2px rgba(46,158,68,0.7)",
                }}
                aria-hidden="true"
              />

              <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none z-10">
                <span className="rounded-full bg-black/60 backdrop-blur-xs px-3 py-1 text-[11px] font-semibold text-white">
                  Align customer phone QR within green frame
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Idle / Camera Off State */}
      {!isScanning && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#0F2044]/15 bg-[#F9FAFB] p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44] text-2xl shadow-xs">
            📷
          </div>
          <h4 className="mt-3 font-poppins text-sm font-bold text-[#0F2044]">
            Camera Scanner Inactive
          </h4>
          <p className="mt-1 text-xs text-[#7A8493] max-w-xs leading-relaxed">
            Click Start Scanner when the customer presents their Customer Exit QR Pass.
          </p>
          <button
            type="button"
            onClick={onStartScanning}
            className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2E9E44] px-5 font-poppins text-xs font-bold text-white shadow-md transition hover:bg-[#288B3B] active:scale-95"
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
