import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../../context/AuthContext";
import { useShopping } from "../../context/ShoppingContext";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import {
  LAUNCH_STORE,
  LAUNCH_STORE_CODE,
  LAUNCH_STORE_ID,
  generateEntranceQRPayload,
} from "../../config/storeConfig";
import { IcBack, IcCamera } from "../../components/common/Icons";

export function StoreQRScanScreen() {
  const navigate = useNavigate();
  const { user, entranceSession, hasValidEntrance, verifyEntrance, logout } = useAuth();
  const { setSelectedStore, refreshCatalog } = useShopping();

  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // In-flight request lock to prevent repeated simultaneous QR validation requests
  const isVerifyingRef = useRef<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qless-store-entrance-scanner";

  // Check if there was a previous expired session
  const isExpired = Boolean(
    entranceSession?.expiresAt && new Date(entranceSession.expiresAt).getTime() <= Date.now()
  );

  // Active entrance session info (if customer already has a valid check-in)
  const remainingMinutes = entranceSession?.expiresAt
    ? Math.max(0, Math.round((new Date(entranceSession.expiresAt).getTime() - Date.now()) / (60 * 1000)))
    : 0;

  // Initialize camera scanner
  useEffect(() => {
    if (!cameraActive) {
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
      return;
    }

    let isMounted = true;
    setCameraError(null);

    async function startCamera() {
      // 1. Check navigator.mediaDevices support
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        if (!isMounted) return;
        setCameraError(
          "Camera access is not supported in this browser environment. You can verify store entry using manual code entry."
        );
        setCameraActive(false);
        return;
      }

      // 2. Allow container to mount in DOM
      await new Promise((res) => setTimeout(res, 80));
      if (!isMounted) return;

      const element = document.getElementById(scannerContainerId);
      if (!element) {
        if (!isMounted) return;
        setCameraError("Camera viewport container could not be attached.");
        setCameraActive(false);
        return;
      }

      try {
        if (scannerRef.current) {
          const old = scannerRef.current;
          scannerRef.current = null;
          if (old.isScanning) {
            await old.stop().catch(() => {});
          }
          try {
            old.clear();
          } catch {}
        }

        const html5QrCode = new Html5Qrcode(scannerContainerId, { verbose: false });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!isMounted) return;
            handleProcessVerification(decodedText);
            // Stop camera on decode
            if (html5QrCode.isScanning) {
              html5QrCode.stop().catch(() => {});
            }
            setCameraActive(false);
          },
          () => {
            // Scanning in progress
          }
        );
      } catch (err: unknown) {
        if (!isMounted) return;
        console.warn("[QLess Entrance Scanner] Camera initialization error:", err);
        setCameraError(
          "Camera access is not permitted or unsupported by your device. You can verify store entry using the manual store code entry below."
        );
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      isMounted = false;
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
  }, [cameraActive]);

  /**
   * Authoritative backend validation of Store Entrance QR
   */
  const handleProcessVerification = async (codeOrPayload: string) => {
    // Prevent repeated simultaneous QR validation requests
    if (isVerifyingRef.current) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    isVerifyingRef.current = true;
    setIsVerifying(true);

    try {
      const res = await verifyEntrance(codeOrPayload);

      if (!res.success) {
        setErrorMessage(
          res.error ||
            `Invalid store QR. Please scan the official entrance QR at QLess Mart (${LAUNCH_STORE_CODE}).`
        );
        isVerifyingRef.current = false;
        setIsVerifying(false);
        return;
      }

      // Valid QR verified by Supabase RPC
      setSuccessMessage("Store Entrance Verified! Unlocking live catalog…");
      setSelectedStore(LAUNCH_STORE);

      // Refresh catalog for STORE001 in background
      refreshCatalog().catch(() => {});

      // Navigate to product shopping page
      setTimeout(() => {
        isVerifyingRef.current = false;
        navigate("/shop", { replace: true });
      }, 500);
    } catch (err: unknown) {
      isVerifyingRef.current = false;
      setIsVerifying(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "A network error occurred while contacting the store entrance gate. Please retry."
      );
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setErrorMessage("Please enter an official store entrance code or scan the gate QR.");
      return;
    }
    handleProcessVerification(inputCode.trim());
  };

  const handleDemoAutoScan = () => {
    const officialPayload = generateEntranceQRPayload(LAUNCH_STORE_CODE);
    handleProcessVerification(officialPayload);
  };

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={false}
      maxWidthClass="max-w-[500px]"
      onBack={() => navigate("/")}
      backLabel="Home"
    >
      <div className="flex flex-1 flex-col justify-center py-2 sm:py-4 qless-fade-in text-[#0F2044]">
        {/* Top Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>Turnstile Check-In · {LAUNCH_STORE.name} ({LAUNCH_STORE_CODE})</span>
          </div>
          <h1 className="font-poppins text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2044]">
            Scan Your Store QR Code
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-[#7A8493] max-w-sm mx-auto leading-relaxed">
            Please scan the official store entrance QR code located at the supermarket entrance
            turnstile to verify check-in and unlock live inventory.
          </p>
        </div>

        {/* Verification Card */}
        <div className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-sm backdrop-blur-xl space-y-4">
          {/* Active Existing Session Notice */}
          {hasValidEntrance && !isExpired && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 text-xs text-emerald-900 flex items-start justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0">🎫</span>
                <div>
                  <p className="font-bold">Active Store Session Found</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Verified check-in at <strong>{LAUNCH_STORE.name}</strong> · Session expires in ~{remainingMinutes}m.
                  </p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    Scan the entrance QR code again below to refresh your 4-hour session.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStore(LAUNCH_STORE);
                  navigate("/shop");
                }}
                className="shrink-0 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-poppins text-xs font-bold px-3 py-1.5 transition active:scale-95 shadow-2xs"
              >
                Resume Trip →
              </button>
            </div>
          )}

          {/* Expired Session Alert */}
          {isExpired && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <span className="text-base shrink-0">⏰</span>
              <div>
                <p className="font-bold">In-Store Shopping Session Expired</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Your previous shopping session timed out (4-hour duration). Please scan the
                  supermarket entrance QR code again to resume.
                </p>
              </div>
            </div>
          )}

          {/* Error Message & Retry */}
          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 space-y-2">
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-base">⛔</span>
                <p className="leading-relaxed font-medium">{errorMessage}</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setCameraActive(true);
                  }}
                  className="rounded-xl bg-red-700 text-white px-3 py-1 font-poppins text-[11px] font-semibold hover:bg-red-800 transition shadow-2xs active:scale-95"
                >
                  Retry Scan
                </button>
              </div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
              <span className="shrink-0">✅</span>
              <p className="font-bold leading-relaxed">{successMessage}</p>
            </div>
          )}

          {/* Camera Scanner Viewport */}
          {cameraActive ? (
            <div className="rounded-2xl border-2 border-dashed border-[#2E9E44] bg-black/5 p-3 text-center space-y-3">
              <div
                id={scannerContainerId}
                className="mx-auto w-full max-w-[280px] overflow-hidden rounded-xl bg-black min-h-[240px] flex items-center justify-center text-white/50 text-xs"
              >
                Initializing camera…
              </div>
              <p className="text-[11px] text-[#7A8493] font-medium">
                Point your camera steadily at the entrance gate QR poster.
              </p>
              <button
                type="button"
                onClick={() => setCameraActive(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#0F2044] hover:bg-slate-50 transition shadow-2xs active:scale-95"
              >
                Use Manual Code Instead
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cameraError && (
                <div className="text-[11px] text-amber-800 bg-amber-50 rounded-xl p-3 border border-amber-200 leading-relaxed">
                  <p className="font-bold mb-0.5">Camera Permission Notice</p>
                  <p>{cameraError}</p>
                </div>
              )}

              {/* Re-open Camera Button */}
              <button
                type="button"
                onClick={() => setCameraActive(true)}
                disabled={isVerifying}
                className="w-full flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[#2E9E44]/30 bg-[#EEF8F0] py-3 px-4 font-poppins text-xs font-bold text-[#2E9E44] shadow-2xs hover:bg-[#E2F4E5] transition active:scale-[0.99] disabled:opacity-60"
              >
                <IcCamera />
                <span>Open Camera Scanner</span>
              </button>

              <div className="relative flex items-center justify-center my-2">
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
                    Supermarket Store Code
                  </label>
                  <input
                    id="entrance-code-input"
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder={`e.g. ${LAUNCH_STORE_CODE}`}
                    disabled={isVerifying}
                    className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-base sm:text-xs font-mono font-bold text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full min-h-[48px] rounded-2xl bg-[#0F2044] py-3 px-4 font-poppins text-xs font-bold text-white shadow-sm hover:bg-[#1A3366] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying with Store Server…</span>
                    </>
                  ) : (
                    <span>Verify Store Code &amp; Enter Supermarket →</span>
                  )}
                </button>
              </form>

              {/* Sandbox Quick Test Button */}
              <div className="pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={handleDemoAutoScan}
                  disabled={isVerifying}
                  className="w-full min-h-[44px] rounded-2xl border border-emerald-400 bg-emerald-50/80 py-2.5 px-3 font-poppins text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <span>⚡</span>
                  <span>[Sandbox Test] Auto-Scan Entrance QR ({LAUNCH_STORE_CODE})</span>
                </button>
                <p className="mt-1 text-center text-[10px] text-[#9AA3AF]">
                  Executes authentic Supabase entrance validation for {LAUNCH_STORE.name} ({LAUNCH_STORE_ID}).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation & User Status */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#7A8493] px-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="hover:text-[#0F2044] font-medium transition flex items-center gap-1"
          >
            <IcBack />
            <span>Return to Welcome Page</span>
          </button>

          <div className="flex items-center gap-3">
            {user && (
              <span className="text-[11px]">
                Signed in as <strong className="text-[#0F2044]">{user.name}</strong>
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
    </CustomerLayout>
  );
}
