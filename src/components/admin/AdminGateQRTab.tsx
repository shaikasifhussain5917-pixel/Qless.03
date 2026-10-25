import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  LAUNCH_STORE,
  LAUNCH_STORE_CODE,
  LAUNCH_STORE_ID,
  generateEntranceQRPayload,
  parseStoreEntranceQR,
} from "../../config/storeConfig";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { IcCheck } from "../common/Icons";

interface AdminGateQRTabProps {
  storeId?: string;
}

interface LiveStoreDetails {
  id: string;
  code: string;
  name: string;
  branch: string;
  address: string;
  timing: string;
  is_active: boolean;
  updated_at?: string;
}

export function AdminGateQRTab({ storeId = LAUNCH_STORE_ID }: AdminGateQRTabProps) {
  // Store Details state
  const [store, setStore] = useState<LiveStoreDetails>({
    id: LAUNCH_STORE.id,
    code: LAUNCH_STORE_CODE,
    name: LAUNCH_STORE.name,
    branch: LAUNCH_STORE.branch,
    address: LAUNCH_STORE.address,
    timing: LAUNCH_STORE.timing,
    is_active: LAUNCH_STORE.isOpen,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // QR Configuration state
  const [payloadMode, setPayloadMode] = useState<"json" | "plain">("json");
  const [qrSize, setQrSize] = useState<number>(240);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Kiosk / Fullscreen Mode
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>(() => new Date().toLocaleTimeString());

  // Ref to SVG element for PNG/SVG export
  const qrSvgRef = useRef<SVGSVGElement | null>(null);

  // 1. Fetch live store status from Supabase
  const fetchLiveStoreStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setDbError(null);

    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await (supabase.from("stores") as any)
          .select("id, code, name, branch, address, timing, is_active, updated_at")
          .eq("id", storeId)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        if (data) {
          const raw = data as Record<string, any>;
          setStore({
            id: String(raw.id || LAUNCH_STORE.id),
            code: String(raw.code || LAUNCH_STORE_CODE),
            name: String(raw.name || LAUNCH_STORE.name),
            branch: String(raw.branch || LAUNCH_STORE.branch),
            address: String(raw.address || LAUNCH_STORE.address),
            timing: String(raw.timing || LAUNCH_STORE.timing),
            is_active: Boolean(raw.is_active),
            updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to query live store status from Supabase.";
      setDbError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchLiveStoreStatus();
  }, [fetchLiveStoreStatus]);

  // Keep live clock updated for Kiosk display
  useEffect(() => {
    if (!isKioskMode) return;
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, [isKioskMode]);

  // Exit kiosk on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isKioskMode) {
        setIsKioskMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isKioskMode]);

  // Generate current payload string based on mode
  const currentQrPayload = payloadMode === "json"
    ? generateEntranceQRPayload(store.code)
    : store.code;

  // Verify that the generated payload is 100% compliant with existing customer scanner
  const parseValidation = parseStoreEntranceQR(currentQrPayload);

  // 2. Copy payload to clipboard
  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 3. Download QR as SVG
  const handleDownloadSvg = () => {
    if (!qrSvgRef.current) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(qrSvgRef.current);

    // Add namespaces if missing
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qless-mart-gate-qr-${store.code}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 4. Download QR as high-res PNG (1024x1024)
  const handleDownloadPng = () => {
    if (!qrSvgRef.current) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(qrSvgRef.current);

    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const exportDimension = 1024;
      canvas.width = exportDimension;
      canvas.height = exportDimension;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw pure white background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, exportDimension, exportDimension);

      // Draw QR code with generous 64px padding for scanning margin
      const padding = 64;
      ctx.drawImage(img, padding, padding, exportDimension - padding * 2, exportDimension - padding * 2);

      const pngUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `qless-mart-gate-qr-${store.code}-highres.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  // 5. Trigger browser print dialog for A4 Gate Poster
  const handlePrintPoster = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER / TOP STORE STATUS CARD ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2E9E44] text-white font-bold text-sm shadow-xs">
                🚪
              </span>
              <div>
                <h2 className="font-poppins text-base sm:text-lg font-extrabold text-[#0F2044] leading-tight">
                  Store Entrance Gate QR Pass
                </h2>
                <p className="text-xs text-[#7A8493]">
                  Turnstile signage and kiosk QR generation for {store.name} ({store.code} · {store.branch})
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Store Active/Paused Status Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                store.is_active
                  ? "bg-emerald-50 text-[#2E9E44] border-emerald-200"
                  : "bg-red-50 text-red-600 border-red-200"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${store.is_active ? "bg-[#2E9E44] animate-pulse" : "bg-red-500"}`} />
              <span>{store.is_active ? "STORE ACTIVE (ENTRANCE OPEN)" : "STORE PAUSED (ENTRY SESSIONS BLOCKED)"}</span>
            </div>

            <button
              type="button"
              onClick={() => fetchLiveStoreStatus(true)}
              disabled={isRefreshing || isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs disabled:opacity-60"
            >
              <span className={isRefreshing || isLoading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {dbError && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            ⚠️ <strong>Notice:</strong> Using local configuration ({dbError}).
          </div>
        )}

        {!store.is_active && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            🚨 <strong>Supermarket Currently Paused:</strong> STORE001 is set to <code>is_active = false</code> in Supabase.
            The server-side <code>validate_store_entrance_qr</code> RPC will reject entrance session creation with{" "}
            <em>"Invalid or inactive supermarket entrance QR"</em> until the store is reactivated.
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT GRID: QR DISPLAY & CONTROLS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 no-print">
        {/* Left Column: QR Card & Actions (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md flex flex-col items-center text-center space-y-4">
          <div className="w-full flex items-center justify-between border-b border-black/5 pb-3">
            <span className="text-xs font-bold text-[#0F2044] uppercase tracking-wider">
              Official Physical Gate Pass
            </span>
            <div className="flex items-center gap-1 bg-black/5 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setPayloadMode("json")}
                className={`px-2.5 py-1 rounded-md font-bold transition ${
                  payloadMode === "json"
                    ? "bg-white text-[#0F2044] shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                Official JSON
              </button>
              <button
                type="button"
                onClick={() => setPayloadMode("plain")}
                className={`px-2.5 py-1 rounded-md font-bold transition ${
                  payloadMode === "plain"
                    ? "bg-white text-[#0F2044] shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                Plain Code
              </button>
            </div>
          </div>

          {/* QR Render Canvas */}
          <div className="relative p-6 bg-white rounded-2xl border-2 border-slate-200 shadow-inner flex flex-col items-center">
            <QRCodeSVG
              ref={qrSvgRef}
              value={currentQrPayload}
              size={qrSize}
              level="H"
              includeMargin={true}
              fgColor="#0F2044"
              bgColor="#FFFFFF"
            />
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-mono font-extrabold text-[#0F2044] bg-slate-100 px-3 py-1 rounded-md border border-slate-200">
                {store.code} · {store.name}
              </span>
              {parseValidation.isValid ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2E9E44]">
                  <span className="w-3.5 h-3.5 flex items-center justify-center">
                    <IcCheck />
                  </span>
                  <span>Scanner Validated</span>
                </span>
              ) : (
                <span className="text-[11px] font-bold text-red-600">Format Error</span>
              )}
            </div>
          </div>

          {/* Size slider */}
          <div className="w-full flex items-center justify-between text-xs text-[#7A8493] px-4">
            <span>Display Scale:</span>
            <div className="flex items-center gap-2">
              {[180, 240, 300].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setQrSize(size)}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                    qrSize === size ? "bg-[#0F2044] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          {/* Export & Actions Toolbar */}
          <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-black/5">
            <button
              type="button"
              onClick={handlePrintPoster}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0F2044] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#1A3366] transition active:scale-95"
            >
              <span>🖨️</span>
              <span>Print Poster</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs"
            >
              <span>🖼️</span>
              <span>PNG (1024px)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadSvg}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs"
            >
              <span>📐</span>
              <span>SVG Vector</span>
            </button>

            <button
              type="button"
              onClick={() => setIsKioskMode(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#2E9E44] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#288B3B] transition active:scale-95"
            >
              <span>🖥️</span>
              <span>Kiosk Mode</span>
            </button>
          </div>
        </div>

        {/* Right Column: Payload Inspection & Security Guarantees (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Payload Inspector */}
          <div className="rounded-2xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F2044] uppercase tracking-wider">
                Turnstile QR Payload
              </span>
              <button
                type="button"
                onClick={() => handleCopy(currentQrPayload, "payload")}
                className="text-[11px] font-bold text-[#2E9E44] hover:underline"
              >
                {copiedField === "payload" ? "Copied! ✓" : "Copy Payload"}
              </button>
            </div>

            <pre className="rounded-xl bg-slate-900 text-slate-100 p-3 text-[11px] font-mono overflow-x-auto border border-slate-800 leading-relaxed whitespace-pre-wrap">
              {currentQrPayload}
            </pre>

            <div className="flex items-center justify-between text-xs border-t border-black/5 pt-2">
              <span className="text-[#7A8493]">Store Code:</span>
              <div className="flex items-center gap-1.5">
                <code className="font-bold text-[#0F2044]">{store.code}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(store.code, "code")}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {copiedField === "code" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#7A8493]">Store ID:</span>
              <div className="flex items-center gap-1.5">
                <code className="font-bold text-[#0F2044]">{store.id}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(store.id, "id")}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {copiedField === "id" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#7A8493]">Operating Hours:</span>
              <span className="font-semibold text-slate-700">{store.timing}</span>
            </div>
          </div>

          {/* Security & Verification Checklist */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm backdrop-blur-md space-y-2.5">
            <h3 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
              <span>🛡️</span>
              <span>Entrance Security Model</span>
            </h3>

            <ul className="space-y-2 text-xs text-emerald-900 leading-snug">
              <li className="flex items-start gap-1.5">
                <span className="text-[#2E9E44] font-bold">✓</span>
                <span>
                  <strong>Zero Client Secrets:</strong> Database signing salt (<code>entrance_qr_secret</code>) is
                  never transmitted or encoded in this QR.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#2E9E44] font-bold">✓</span>
                <span>
                  <strong>Authoritative Server RPC:</strong> Scanning triggers <code>validate_store_entrance_qr</code>,
                  which mandates customer authentication (<code>auth.uid()</code>).
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#2E9E44] font-bold">✓</span>
                <span>
                  <strong>Dynamic 4-Hour Sessions:</strong> The backend generates a random token (<code>SES-XXXX</code>)
                  with automatic 4-hour expiry.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#2E9E44] font-bold">✓</span>
                <span>
                  <strong>Live Pause Protection:</strong> If STORE001 is set to inactive, the RPC rejects all entrance
                  attempts instantly.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── FULLSCREEN KIOSK / TABLET MODE ── */}
      {isKioskMode && (
        <div className="fixed inset-0 z-50 bg-[#0F2044] text-white flex flex-col items-center justify-center p-6 qless-fade-in no-print">
          <div className="absolute top-6 right-6">
            <button
              type="button"
              onClick={() => setIsKioskMode(false)}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition active:scale-95"
            >
              Exit Kiosk (Esc) ✕
            </button>
          </div>

          <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-1 text-xs font-bold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>QLess Mart Gate Turnstile</span>
              </div>
              <h1 className="font-poppins text-3xl font-extrabold tracking-tight">
                Scan to Enter Store
              </h1>
              <p className="text-sm text-slate-300">
                {store.branch} · {currentTime}
              </p>
            </div>

            {/* Glowing High-Contrast QR Viewport */}
            <div className="relative p-7 bg-white rounded-3xl shadow-2xl border-4 border-emerald-400/30 flex flex-col items-center">
              <QRCodeSVG
                value={currentQrPayload}
                size={280}
                level="H"
                includeMargin={true}
                fgColor="#0F2044"
                bgColor="#FFFFFF"
              />
              <p className="mt-3 font-poppins text-sm font-extrabold text-[#0F2044]">
                {store.code} · QLESS MART
              </p>
            </div>

            {/* Instruction Stepper */}
            <div className="grid grid-cols-4 gap-2 w-full text-center text-[11px]">
              <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                <span className="block font-bold text-emerald-400 text-sm">1</span>
                <span>Open App</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                <span className="block font-bold text-emerald-400 text-sm">2</span>
                <span>Log In</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                <span className="block font-bold text-emerald-400 text-sm">3</span>
                <span>Scan QR</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                <span className="block font-bold text-emerald-400 text-sm">4</span>
                <span>Start Shopping</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINTABLE GATE POSTER (Only visible when printing or in print preview) ── */}
      <div className="hidden print:block printable-gate-poster bg-white text-black p-8 max-w-2xl mx-auto border-2 border-black rounded-3xl text-center space-y-6">
        {/* Brand Header */}
        <div className="border-b-2 border-black pb-4 space-y-1">
          <div className="inline-block bg-[#0F2044] text-white px-4 py-1 rounded-xl text-lg font-black tracking-wider uppercase">
            QLess Smart Shopping
          </div>
          <h1 className="font-poppins text-3xl font-extrabold text-black">
            {store.name}
          </h1>
          <p className="text-sm font-bold text-gray-700">
            {store.branch} · Store Code: {store.code}
          </p>
          <p className="text-xs text-gray-500">
            {store.address} · Operating: {store.timing}
          </p>
        </div>

        {/* Turnstile Action Callout */}
        <div className="space-y-1">
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#0F2044]">
            Scan at Turnstile Gate to Enter
          </h2>
          <p className="text-xs text-gray-600 font-semibold">
            Point your mobile camera or the QLess scanner at this official gate pass.
          </p>
        </div>

        {/* High-Resolution Printed QR Code */}
        <div className="flex justify-center p-4">
          <div className="p-4 border-4 border-black rounded-2xl inline-block bg-white">
            <QRCodeSVG
              value={currentQrPayload}
              size={300}
              level="H"
              includeMargin={true}
              fgColor="#000000"
              bgColor="#FFFFFF"
            />
          </div>
        </div>

        {/* 4 Standard Customer Instructions */}
        <div className="border-2 border-black rounded-2xl p-4 bg-gray-50">
          <p className="font-bold text-xs uppercase tracking-wider mb-3 text-black">
            4 Easy Steps to Shop &amp; Go
          </p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2 border border-gray-300 rounded-lg bg-white">
              <span className="block font-black text-base text-[#0F2044]">1</span>
              <span className="font-bold text-[11px]">Open App</span>
              <span className="block text-[9px] text-gray-500">Launch QLess on phone</span>
            </div>
            <div className="p-2 border border-gray-300 rounded-lg bg-white">
              <span className="block font-black text-base text-[#0F2044]">2</span>
              <span className="font-bold text-[11px]">Log In</span>
              <span className="block text-[9px] text-gray-500">Sign in to account</span>
            </div>
            <div className="p-2 border border-gray-300 rounded-lg bg-white">
              <span className="block font-black text-base text-[#0F2044]">3</span>
              <span className="font-bold text-[11px]">Scan QR</span>
              <span className="block text-[9px] text-gray-500">Scan this gate pass</span>
            </div>
            <div className="p-2 border border-gray-300 rounded-lg bg-white">
              <span className="block font-black text-base text-[#0F2044]">4</span>
              <span className="font-bold text-[11px]">Start Shopping</span>
              <span className="block text-[9px] text-gray-500">Scan items &amp; pay</span>
            </div>
          </div>
        </div>

        {/* Footer Support Info */}
        <div className="border-t border-gray-200 pt-3 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Need assistance? Ask our entrance store concierge.</span>
          <span>Official Gate Pass · STORE001</span>
        </div>
      </div>
    </div>
  );
}
