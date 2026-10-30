import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  LAUNCH_STORE,
  LAUNCH_STORE_CODE,
} from "../../config/storeConfig";
import { Html5Qrcode } from "html5-qrcode";

export function StoreEntranceGate() {
  const navigate = useNavigate();
  const { user, entranceSession, verifyEntrance, logout } = useAuth();

  const [inputCode, setInputCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qless-entrance-qr-scanner";

  // Check if there was a previous expired session
  const isExpired = Boolean(
    entranceSession?.expiresAt && new Date(entranceSession.expiresAt).getTime() <= Date.now()
  );

  // Initialize camera scanner when cameraActive is true
  useEffect(() => {
    if (!cameraActive) {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear();
            scannerRef.current = null;
          });
      }
      return;
    }

    let isMounted = true;
    setCameraError("");

    async function startCamera() {
      try {
        const html5QrCode = new Html5Qrcode(scannerContainerId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (w, h) => {
              const edge = Math.min(w, h);
              const size = Math.max(240, Math.min(380, Math.floor(edge * 0.75)));
              return {
                width: Math.min(size, Math.max(220, w - 24)),
                height: Math.min(size, Math.max(220, h - 24)),
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
            if (!isMounted) return;
            handleProcessVerification(decodedText);
            // Stop camera on decode
            html5QrCode.stop().catch(() => {});
            setCameraActive(false);
          },
          () => {
            // Scanning in progress
          }
        );
      } catch (err: unknown) {
        if (!isMounted) return;
        console.warn("Entrance camera start error:", err);
        setCameraError(
          "Camera access could not be initialized. Please use manual code entry below."
        );
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear();
            scannerRef.current = null;
          });
      }
    };
  }, [cameraActive]);

  const handleProcessVerification = async (codeOrPayload: string) => {
    setErrorMessage("");
    setSuccessMessage("");
    setIsVerifying(true);

    try {
      const res = await verifyEntrance(codeOrPayload);

      if (!res.success) {
        setErrorMessage(
          res.error ||
            `Invalid entrance token. Please scan the official entrance QR at QLess Mart (${LAUNCH_STORE_CODE}).`
        );
        return;
      }

      setSuccessMessage("Gate Turnstile Verified! Welcome to QLess Mart.");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during entrance verification."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setErrorMessage("Please enter an entrance pass code or scan the turnstile QR.");
      return;
    }
    handleProcessVerification(inputCode.trim());
  };

  return (
    <div className="flex flex-1 flex-col justify-center py-4 qless-fade-in text-[#0F2044]">
      {/* Top Store Badge */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs mb-2">
          <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
          <span>Turnstile Gate Check-In · {LAUNCH_STORE.name}</span>
        </div>
        <h1 className="font-poppins text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2044]">
          Store Entrance Required
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-[#7A8493] max-w-sm mx-auto leading-relaxed">
          Verify your physical store check-in to unlock the real-time shelf catalog, SmartFind rack
          locations, and self-checkout cart.
        </p>
      </div>

      {/* Main Verification Card */}
      <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-sm backdrop-blur-xl space-y-4">
        {/* Expired Session Warning */}
        {isExpired && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <span className="text-base shrink-0">⏰</span>
            <div>
              <p className="font-bold">In-Store Session Expired</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Your previous shopping session timed out (4-hour duration). Please scan the entrance
                turnstile pass again to resume.
              </p>
            </div>
          </div>
        )}

        {/* Demo Notice Disclaimer */}
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs text-blue-950 flex items-start gap-2.5">
          <span className="text-base shrink-0">ℹ️</span>
          <div>
            <p className="font-bold text-blue-900">Prototype Entrance Verification</p>
            <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
              In this frontend demo, verifying the store code simulates physical turnstile check-in.
              A production deployment requires cryptographically signed hardware tokens validated by
              the server.
            </p>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
            <span className="shrink-0">⛔</span>
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <span className="shrink-0">✅</span>
            <p className="font-bold leading-relaxed">{successMessage}</p>
          </div>
        )}

        {/* Camera Scanner View Area */}
        {cameraActive ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border-2 border-[#2E9E44]/70 bg-black min-h-[340px] sm:min-h-[420px] shadow-inner flex flex-col justify-center">
              <div
                id={scannerContainerId}
                className="w-full min-h-[340px] sm:min-h-[420px]"
              />

              {/* Corner indicators */}
              <div
                className="pointer-events-none absolute inset-6 sm:inset-10 qless-corner-pulse z-10 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="relative w-full h-full max-w-[340px] max-h-[340px] rounded-2xl border border-white/20">
                  <span className="absolute -left-1 -top-1 h-10 w-10 sm:h-12 sm:w-12 rounded-tl-2xl border-l-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -right-1 -top-1 h-10 w-10 sm:h-12 sm:w-12 rounded-tr-2xl border-r-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -left-1 h-10 w-10 sm:h-12 sm:w-12 rounded-bl-2xl border-b-[3.5px] border-l-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -right-1 h-10 w-10 sm:h-12 sm:w-12 rounded-br-2xl border-b-[3.5px] border-r-[3.5px] border-[#2E9E44]" />
                </div>
              </div>

              {/* Scan laser */}
              <div
                className="pointer-events-none absolute left-6 right-6 h-0.5 rounded-full qless-beam z-10"
                style={{
                  background: "linear-gradient(90deg, transparent, #2E9E44 50%, transparent)",
                  boxShadow: "0 0 12px 2px rgba(46,158,68,0.8)",
                }}
                aria-hidden="true"
              />

              {/* Guidance badge */}
              <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none z-10 px-4">
                <span className="inline-block rounded-xl bg-black/80 px-3.5 py-1 text-xs font-semibold text-white border border-white/10 shadow-sm">
                  Position Store Entrance QR Inside Frame
                </span>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setCameraActive(false)}
                className="rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#0F2044] hover:bg-slate-50 transition shadow-2xs active:scale-95"
              >
                Cancel Camera Scan
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {cameraError && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl p-2.5 border border-amber-200">
                {cameraError}
              </p>
            )}

            {/* Camera Trigger Button */}
            <button
              type="button"
              onClick={() => setCameraActive(true)}
              disabled={isVerifying}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-[#2E9E44]/30 bg-[#EEF8F0] py-3 px-4 font-poppins text-xs font-bold text-[#2E9E44] shadow-2xs hover:bg-[#E2F4E5] transition active:scale-[0.99]"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Scan Turnstile Gate QR with Camera</span>
            </button>

            <div className="relative flex items-center justify-center">
              <span className="w-full border-t border-black/10" />
              <span className="bg-white px-2 text-[10px] uppercase font-bold text-[#9AA3AF]">
                or enter code manually
              </span>
              <span className="w-full border-t border-black/10" />
            </div>

            {/* Manual Code Input Form */}
            <form onSubmit={handleManualSubmit} className="space-y-2.5" noValidate>
              <div>
                <label
                  htmlFor="entrance-code-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-[#7A8493] mb-1"
                >
                  Supermarket Entrance Code
                </label>
                <input
                  id="entrance-code-input"
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder={`e.g. ${LAUNCH_STORE_CODE}`}
                  disabled={isVerifying}
                  className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 text-xs font-mono font-bold text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full rounded-2xl bg-[#0F2044] py-3 px-4 font-poppins text-xs font-bold text-white shadow-sm hover:bg-[#1A3366] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Turnstile Pass…</span>
                  </>
                ) : (
                  <span>Verify Gate Pass &amp; Enter Supermarket →</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Switch Links */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#7A8493] px-2">
        <button
          type="button"
          onClick={() => navigate("/select-store")}
          className="hover:text-[#0F2044] font-medium transition"
        >
          ← Return to Store Selection
        </button>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-[11px]">
              Logged in as <strong className="text-[#0F2044]">{user.name}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/auth/login");
            }}
            className="text-red-600 hover:text-red-700 font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
