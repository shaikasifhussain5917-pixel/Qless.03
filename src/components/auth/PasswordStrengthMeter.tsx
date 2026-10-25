interface PasswordStrengthMeterProps {
  password: string;
}

export function calculatePasswordStrength(pass: string): {
  score: number; // 0 to 4
  label: string;
  colorClass: string;
} {
  if (!pass) {
    return { score: 0, label: "", colorClass: "bg-gray-200" };
  }

  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass) && /[A-Z]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", colorClass: "bg-red-500" };
  if (score === 2) return { score: 2, label: "Fair", colorClass: "bg-amber-500" };
  if (score === 3) return { score: 3, label: "Good", colorClass: "bg-blue-500" };
  return { score: 4, label: "Strong", colorClass: "bg-emerald-500" };
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const { score, label, colorClass } = calculatePasswordStrength(password);

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step <= score ? colorClass : "bg-black/10"
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between items-center text-[11px]">
        <span className="text-[#7A8493]">Password Strength</span>
        <span className="font-semibold text-[#0F2044]">{label}</span>
      </div>
    </div>
  );
}
