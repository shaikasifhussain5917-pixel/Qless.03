import { useEffect, useState } from "react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { IcClose } from "../common/Icons";

export function ShareModal({
  open,
  sessionId,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/20 px-5 backdrop-blur-md qless-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-session-title"
        className="w-full max-w-[340px] rounded-2xl border border-black/5 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,32,68,0.18)] qless-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="h-10 w-10" />
          <h2 id="share-session-title" className="font-poppins text-xl font-semibold text-[#0F2044]">Share Session</h2>
          <button
            onClick={onClose}
            aria-label="Close share session modal"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#7A8493] hover:bg-[#F6F7F8] hover:text-[#0F2044] transition-all hover:scale-[1.02]"
          >
            <IcClose />
          </button>
        </div>
        <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border border-black/5 bg-white p-3 shadow-inner">
          <QRCode
            value={`session_${sessionId}`}
            size={180}
            fgColor="#0F2044"
            bgColor="#FFFFFF"
            title={`QLESS session ${sessionId}`}
          />
        </div>
        <p className="mt-5 text-sm font-medium text-[#7A8493]">Session ID: #{sessionId}</p>
        <button
          onClick={handleCopy}
          className="mx-auto mt-5 flex h-11 items-center justify-center rounded-xl bg-[#0F2044] px-6 font-poppins text-sm font-semibold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {copied ? "Copied!" : "Copy ID"}
        </button>
        <button
          onClick={onClose}
          className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-[#7A8493] transition-all hover:bg-[#F6F7F8] hover:text-[#0F2044]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
