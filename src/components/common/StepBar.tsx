import { AppView } from "../../types";
import { IcCheck } from "./Icons";

const STEPS = [
  { id: 0, label: "Cart" },
  { id: 1, label: "Review" },
  { id: 2, label: "Payment" },
  { id: 3, label: "Receipt" },
];

export function StepBar({ current }: { current: AppView }) {
  let activeIndex = 0;
  if (current === "cart") {
    activeIndex = 0;
  } else if (current === "review-order") {
    activeIndex = 1;
  } else if (current === "payment" || current === "checkout") {
    activeIndex = 2;
  } else if (current === "payment-success" || current === "exit") {
    activeIndex = 3;
  }

  return (
    <div className="flex items-center justify-center gap-0 py-3 sm:py-4 select-none">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-6.5 w-6.5 sm:h-7 sm:w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                i < activeIndex
                  ? "bg-[#2E9E44] text-white"
                  : i === activeIndex
                  ? "bg-[#0F2044] text-white shadow-[0_4px_12px_rgba(15,32,68,0.22)]"
                  : "bg-[#E5E7EB] text-[#9AA3AF]"
              }`}
            >
              {i < activeIndex ? <IcCheck /> : i + 1}
            </div>
            <span
              className={`text-[9px] sm:text-[10px] font-semibold tracking-wide ${
                i <= activeIndex ? "text-[#0F2044]" : "text-[#9AA3AF]"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mb-4 mx-1 sm:mx-1.5 h-px w-6 sm:w-10 transition-all duration-300 ${
                i < activeIndex ? "bg-[#2E9E44]" : "bg-[#E5E7EB]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
