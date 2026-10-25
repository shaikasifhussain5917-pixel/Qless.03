import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../../components/auth/AuthLayout";

export function EmailVerificationScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "shopper@example.com";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const next = [...otp];
    next[index] = val;
    setOtp(next);

    // Auto-focus next input
    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleSimulateVerify = async () => {
    setError("");
    const entered = otp.join("");
    if (entered.length < 6) {
      setError("Please enter the complete 6-digit verification code (e.g. 123456).");
      return;
    }

    setIsVerifying(true);
    await new Promise((res) => setTimeout(res, 500));
    setIsVerifying(false);
    setIsVerified(true);
  };

  const handleQuickAutofill = () => {
    setOtp(["1", "2", "3", "4", "5", "6"]);
    setError("");
  };

  return (
    <AuthLayout
      title="Email Verification"
      subtitle={`Verify ownership of ${email}`}
      roleBadge={{ label: "Demo Verification", colorClass: "bg-blue-100 text-blue-800" }}
      onBack={() => navigate("/auth/login")}
    >
      {isVerified ? (
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-2xl shadow-xs">
            ✓
          </div>

          <div>
            <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
              Simulated Verification Complete
            </h2>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              Your demonstration account email has been marked as verified in local browser storage.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-50/80 p-3 text-left text-xs text-blue-900">
            <p className="font-bold">PROTOTYPE NOTE:</p>
            <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
              In production, a real cryptographic token is sent via email and verified by the
              authentication backend.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/scan-store")}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98]"
          >
            Start Shopping Now →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-50/80 p-3 text-xs text-blue-900 flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-blue-950">Simulated 6-Digit OTP</p>
              <p className="text-[11px] text-blue-800">Demo verification code: 123456</p>
            </div>
            <button
              type="button"
              onClick={handleQuickAutofill}
              className="rounded-xl bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition"
            >
              Fill 123456
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 6 Digit OTP inputs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-2 text-center">
              Enter 6-Digit Code
            </label>
            <div className="flex justify-center gap-2">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  className="h-12 w-11 text-center rounded-xl border border-black/10 bg-black/5 text-lg font-bold font-mono text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSimulateVerify}
            disabled={isVerifying}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verifying…</span>
              </>
            ) : (
              <span>Simulate Verify Email</span>
            )}
          </button>

          <p className="text-center text-xs text-[#7A8493]">
            Did not receive code?{" "}
            <button
              type="button"
              onClick={handleQuickAutofill}
              className="font-bold text-[#2E9E44] hover:underline"
            >
              Simulate Resend
            </button>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
