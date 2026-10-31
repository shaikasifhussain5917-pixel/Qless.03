import { AppView } from "../../types";
import { IcCheck } from "./Icons";

const STEPS = [
  { id: 0, label: "Cart" },
  { id: 1, label: "Review" },
  { id: 2, label: "Payment" },
  { id: 3, label: "Pass" },
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
    <nav
      aria-label="Checkout Progress"
      className="w-full max-w-[420px] mx-auto py-2.5 mb-3 select-none"
    >
      <ol className="flex items-center justify-between w-full">
        {STEPS.map((step, i) => (
          <li
            key={step.id}
            className="flex-1 flex items-center last:flex-none"
          >
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[11px] sm:text-xs font-bold transition-all duration-200 shrink-0 ${
                  i < activeIndex
                    ? "bg-[#16A36A] text-white shadow-2xs"
                    : i === activeIndex
                    ? "bg-[#101828] text-white shadow-sm ring-2 ring-slate-900/10"
                    : "bg-slate-100 text-slate-400 border border-slate-200/80"
                }`}
                aria-current={i === activeIndex ? "step" : undefined}
              >
                {i < activeIndex ? (
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    <IcCheck />
                  </span>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[10px] sm:text-[11px] font-semibold tracking-tight mt-1 text-center transition-colors ${
                  i <= activeIndex ? "text-[#101828]" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-1.5 sm:mx-3 -mt-4 transition-all duration-300 rounded-full ${
                  i < activeIndex ? "bg-[#16A36A]" : "bg-slate-200"
                }`}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
