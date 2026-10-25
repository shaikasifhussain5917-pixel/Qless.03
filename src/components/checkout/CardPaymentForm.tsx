import { ChangeEvent } from "react";

export interface CardFormData {
  cardholderName: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

interface CardPaymentFormProps {
  formData: CardFormData;
  onChange: (data: CardFormData) => void;
  errors: Partial<Record<keyof CardFormData, string>>;
}

export function CardPaymentForm({ formData, onChange, errors }: CardPaymentFormProps) {
  // Format Card Number (adds space every 4 digits, max 16 digits)
  const handleCardNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
    onChange({ ...formData, cardNumber: formatted });
  };

  // Format Expiry Date (MM/YY)
  const handleExpiryChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      raw = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    onChange({ ...formData, expiryDate: raw });
  };

  // Format CVV (max 4 digits)
  const handleCvvChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    onChange({ ...formData, cvv: raw });
  };

  // Quick fill with obviously fake demo values
  const handleQuickFillDemo = () => {
    onChange({
      cardholderName: "Priya Sharma (Demo)",
      cardNumber: "4532 8901 2345 6789",
      expiryDate: "12/28",
      cvv: "321",
    });
  };

  return (
    <div className="rounded-2xl border border-white/60 bg-white/95 p-5 shadow-[0_8px_24px_rgba(15,32,68,0.06)] qless-fade-in space-y-4">
      <div className="flex items-center justify-between border-b border-black/5 pb-3">
        <div>
          <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
            Credit or Debit Card
          </h4>
          <p className="text-[11px] text-[#7A8493]">
            Demonstration Card Authorization
          </p>
        </div>

        <button
          type="button"
          onClick={handleQuickFillDemo}
          className="rounded-xl border border-[#2E9E44]/40 bg-[#EEF8F0] px-2.5 py-1 text-[11px] font-bold text-[#2E9E44] transition hover:bg-[#E2F4E6] active:scale-95"
        >
          Fill Demo Card
        </button>
      </div>

      {/* Safety Notice */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-blue-900 leading-relaxed">
        <p className="font-bold flex items-center gap-1.5">
          <span>🔒</span> Strictly Simulated Sandbox
        </p>
        <p className="mt-0.5 text-blue-800">
          Do not enter genuine card details. Form entries are validated strictly in memory and are never saved or sent to any server.
        </p>
      </div>

      {/* Card Form */}
      <div className="space-y-3">
        {/* Cardholder Name */}
        <div>
          <label
            htmlFor="cardholder-name"
            className="block text-xs font-semibold text-[#0F2044] mb-1"
          >
            Cardholder Name
          </label>
          <input
            type="text"
            id="cardholder-name"
            value={formData.cardholderName}
            onChange={(e) => onChange({ ...formData, cardholderName: e.target.value })}
            placeholder="e.g. Priya Sharma"
            className={`w-full rounded-xl border bg-[#F9FAFB] py-2.5 px-3.5 text-xs font-semibold text-[#0F2044] placeholder-[#9AA3AF] transition focus:bg-white focus:outline-none focus:ring-2 ${
              errors.cardholderName
                ? "border-red-400 focus:ring-red-200"
                : "border-black/10 focus:border-[#2E9E44] focus:ring-[#2E9E44]/20"
            }`}
          />
          {errors.cardholderName && (
            <p role="alert" className="mt-1 text-[11px] text-red-600 font-medium">
              {errors.cardholderName}
            </p>
          )}
        </div>

        {/* Card Number */}
        <div>
          <label
            htmlFor="card-number"
            className="block text-xs font-semibold text-[#0F2044] mb-1"
          >
            Card Number
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              id="card-number"
              value={formData.cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4532 •••• •••• 6789"
              className={`w-full rounded-xl border bg-[#F9FAFB] py-2.5 px-3.5 font-mono text-xs font-bold text-[#0F2044] placeholder-[#9AA3AF] transition focus:bg-white focus:outline-none focus:ring-2 ${
                errors.cardNumber
                  ? "border-red-400 focus:ring-red-200"
                  : "border-black/10 focus:border-[#2E9E44] focus:ring-[#2E9E44]/20"
              }`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-bold text-[#7A8493]">
              VISA / MC / RUPAY
            </span>
          </div>
          {errors.cardNumber && (
            <p role="alert" className="mt-1 text-[11px] text-red-600 font-medium">
              {errors.cardNumber}
            </p>
          )}
        </div>

        {/* Expiry & CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="card-expiry"
              className="block text-xs font-semibold text-[#0F2044] mb-1"
            >
              Expiry Date
            </label>
            <input
              type="text"
              inputMode="numeric"
              id="card-expiry"
              value={formData.expiryDate}
              onChange={handleExpiryChange}
              placeholder="MM/YY"
              className={`w-full rounded-xl border bg-[#F9FAFB] py-2.5 px-3.5 font-mono text-xs font-bold text-[#0F2044] placeholder-[#9AA3AF] transition focus:bg-white focus:outline-none focus:ring-2 ${
                errors.expiryDate
                  ? "border-red-400 focus:ring-red-200"
                  : "border-black/10 focus:border-[#2E9E44] focus:ring-[#2E9E44]/20"
              }`}
            />
            {errors.expiryDate && (
              <p role="alert" className="mt-1 text-[11px] text-red-600 font-medium">
                {errors.expiryDate}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="card-cvv"
              className="block text-xs font-semibold text-[#0F2044] mb-1"
            >
              Security CVV
            </label>
            <input
              type="password"
              inputMode="numeric"
              id="card-cvv"
              value={formData.cvv}
              onChange={handleCvvChange}
              placeholder="•••"
              maxLength={4}
              className={`w-full rounded-xl border bg-[#F9FAFB] py-2.5 px-3.5 font-mono text-xs font-bold text-[#0F2044] placeholder-[#9AA3AF] transition focus:bg-white focus:outline-none focus:ring-2 ${
                errors.cvv
                  ? "border-red-400 focus:ring-red-200"
                  : "border-black/10 focus:border-[#2E9E44] focus:ring-[#2E9E44]/20"
              }`}
            />
            {errors.cvv && (
              <p role="alert" className="mt-1 text-[11px] text-red-600 font-medium">
                {errors.cvv}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
