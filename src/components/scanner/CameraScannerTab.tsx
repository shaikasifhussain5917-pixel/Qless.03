import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { IcAlert, IcCamera, IcCatalog, IcKeypad } from "../common/Icons";

interface CameraScannerTabProps {
  onBarcodeDecoded: (barcode: string) => void;
  onSwitchToManual: () => void;
  onSwitchToCatalog: () => void;
}

type CameraStatus = "loading" | "active" | "denied" | "unavailable";

export function CameraScannerTab({
  onBarcodeDecoded,
  onSwitchToManual,
  onSwitchToCatalog,
}: CameraScannerTabProps) {
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qless-html5-camera-view";

  // Prevent duplicate camera frames from triggering repeated scan requests
  const isProcessingRef = useRef<boolean>(false);
  const lastBarcodeRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    let isCancelled = false;

    async function initScanner() {
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
          setErrorMessage(
            "Camera access is not supported in this browser environment. Please use manual barcode entry."
          );
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
          setErrorMessage("Camera viewport container could not be attached.");
        }
        return;
      }

      try {
        // Clean up any stale scanner instance
        if (scannerRef.current) {
          const oldInstance = scannerRef.current;
          scannerRef.current = null;
          if (oldInstance.isScanning) {
            await oldInstance.stop().catch(() => {});
          }
          try {
            oldInstance.clear();
          } catch {}
        }

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight);
              return {
                width: Math.min(260, Math.max(180, Math.floor(edge * 0.85))),
                height: Math.min(180, Math.max(120, Math.floor(edge * 0.6))),
              };
            },
            aspectRatio: 1.333333,
          },
          (decodedText) => {
            if (isCancelled) return;

            // Debounce: prevent duplicate scans while camera remains pointed at the item
            const now = Date.now();
            if (isProcessingRef.current) return;
            if (
              decodedText === lastBarcodeRef.current &&
              now - lastScanTimeRef.current < 2500
            ) {
              return;
            }

            isProcessingRef.current = true;
            lastBarcodeRef.current = decodedText;
            lastScanTimeRef.current = now;

            // Stop camera stream safely before reporting the decoded barcode
            if (scanner.isScanning) {
              scanner
                .stop()
                .catch(() => {})
                .finally(() => {
                  onBarcodeDecoded(decodedText);
                  setTimeout(() => {
                    isProcessingRef.current = false;
                  }, 1000);
                });
            } else {
              onBarcodeDecoded(decodedText);
              setTimeout(() => {
                isProcessingRef.current = false;
              }, 1000);
            }
          },
          () => {
            // Scanning frames in progress
          }
        );

        if (!isCancelled) {
          setStatus("active");
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        const errStr = String(err);
        const errName =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: string }).name)
            : "";

        if (
          errName === "NotAllowedError" ||
          errName === "PermissionDeniedError" ||
          errStr.toLowerCase().includes("permission") ||
          errStr.toLowerCase().includes("denied")
        ) {
          setStatus("denied");
          setErrorMessage(
            "Camera permission was denied. Please allow camera permissions in your browser address bar and click Retry Camera, or use Manual Barcode Entry."
          );
        } else {
          setStatus("unavailable");
          setErrorMessage(
            "No active camera device was detected on this device. You can enter the physical barcode manually below."
          );
        }
      }
    }

    initScanner();

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
  }, [onBarcodeDecoded, retryTrigger]);

  const handleRetryCamera = () => {
    setStatus("loading");
    setRetryTrigger((c) => c + 1);
  };

  return (
    <div className="flex flex-col py-2 qless-fade-in">
      {/* ── LIVE CAMERA CONTAINER (renders during loading & active states) ── */}
      {(status === "loading" || status === "active") && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-[#2E9E44]/70 bg-black min-h-[220px] shadow-inner">
          {/* html5-qrcode video viewport */}
          <div id={containerId} className="w-full min-h-[220px]" />

          {/* Loading Overlay */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F9FAFB] p-6 text-center z-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44]">
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                  />
                </svg>
              </div>
              <p className="mt-3 font-poppins text-sm font-semibold text-[#0F2044]">
                Starting Real Device Camera…
              </p>
              <p className="mt-1 text-xs text-[#7A8493]">
                Requesting rear camera permission to scan physical supermarket barcodes.
              </p>
            </div>
          )}

          {/* Active HUD: Target Reticle Brackets */}
          {status === "active" && (
            <>
              <div
                className="pointer-events-none absolute inset-4 qless-corner-pulse z-10"
                aria-hidden="true"
              >
                <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-xl border-l-[3px] border-t-[3px] border-[#2E9E44]" />
                <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-xl border-r-[3px] border-t-[3px] border-[#2E9E44]" />
                <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-xl border-b-[3px] border-l-[3px] border-[#2E9E44]" />
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-xl border-b-[3px] border-r-[3px] border-[#2E9E44]" />
              </div>

              {/* Scanning Laser Beam */}
              <div
                className="pointer-events-none absolute left-6 right-6 h-0.5 rounded-full qless-beam z-10"
                style={{
                  background: "linear-gradient(90deg, transparent, #2E9E44, transparent)",
                  boxShadow: "0 0 10px 2px rgba(46,158,68,0.5)",
                }}
                aria-hidden="true"
              />
            </>
          )}
        </div>
      )}

      {/* Instructions when live camera is running */}
      {status === "active" && (
        <div className="mt-3 text-center">
          <p className="font-poppins text-xs font-bold text-[#0F2044]">
            Position barcode (EAN-13, EAN-8, UPC) inside the green frame
          </p>
          <p className="mt-0.5 text-[11px] text-[#7A8493]">
            Camera uses autofocus to decode physical retail product barcodes.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={onSwitchToManual}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition"
            >
              <IcKeypad />
              <span>Enter Barcode Manually</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToCatalog}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition"
            >
              <IcCatalog />
              <span>Browse Catalog</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CAMERA UNAVAILABLE OR PERMISSION DENIED STATE ── */}
      {(status === "denied" || status === "unavailable") && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center qless-scale-in">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <IcAlert />
          </div>
          <h4 className="mt-3 font-poppins text-sm font-bold text-amber-950">
            {status === "denied" ? "Camera Access Denied" : "Camera Device Unavailable"}
          </h4>
          <p className="mx-auto mt-1 max-w-[340px] text-xs text-amber-800 leading-relaxed">
            {errorMessage}
          </p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleRetryCamera}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-xs font-bold text-white shadow-sm transition hover:bg-[#288B3B] active:scale-95"
            >
              <IcCamera />
              <span>Retry Camera Permission</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSwitchToManual}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-black/5 bg-white font-poppins text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition"
              >
                <IcKeypad />
                <span>Enter Barcode</span>
              </button>

              <button
                type="button"
                onClick={onSwitchToCatalog}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-black/5 bg-white font-poppins text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition"
              >
                <IcCatalog />
                <span>Browse Store</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
