import { useMemo } from "react";
import { CompletedOrder } from "../../../types";

interface OrderStatusDistributionProps {
  orders: CompletedOrder[];
  onSelectStatusFilter?: (status: string) => void;
}

export function OrderStatusDistribution({
  orders,
  onSelectStatusFilter,
}: OrderStatusDistributionProps) {
  const confirmedOrders = useMemo(() => {
    return orders.filter(
      (o) => (o.paymentStatus || "").toUpperCase() === "CONFIRMED"
    );
  }, [orders]);

  const pendingOrders = useMemo(() => {
    return orders.filter(
      (o) => (o.paymentStatus || "PENDING").toUpperCase() === "PENDING"
    );
  }, [orders]);

  const otherOrders = useMemo(() => {
    return orders.filter((o) => {
      const s = (o.paymentStatus || "").toUpperCase();
      return s !== "CONFIRMED" && s !== "PENDING";
    });
  }, [orders]);

  const total = orders.length;

  const confirmedPct = total > 0 ? Math.round((confirmedOrders.length / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.round((pendingOrders.length / total) * 100) : 0;
  const otherPct = total > 0 ? Math.round((otherOrders.length / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
              ⚖️
            </span>
            <h3 className="font-poppins text-sm font-bold text-[#0F2044]">
              Order Status Distribution
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Self-checkout checkout conversion and settlement status breakdown
          </p>
        </div>
      </div>

      {/* Stacked Progress Bar */}
      <div className="py-4 space-y-3">
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
          {total === 0 ? (
            <div className="h-full w-full bg-slate-200" />
          ) : (
            <>
              {confirmedOrders.length > 0 && (
                <div
                  style={{ width: `${(confirmedOrders.length / total) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`Confirmed: ${confirmedOrders.length} (${confirmedPct}%)`}
                />
              )}
              {pendingOrders.length > 0 && (
                <div
                  style={{ width: `${(pendingOrders.length / total) * 100}%` }}
                  className="bg-amber-400 h-full transition-all duration-500"
                  title={`Pending: ${pendingOrders.length} (${pendingPct}%)`}
                />
              )}
              {otherOrders.length > 0 && (
                <div
                  style={{ width: `${(otherOrders.length / total) * 100}%` }}
                  className="bg-slate-400 h-full transition-all duration-500"
                  title={`Other: ${otherOrders.length} (${otherPct}%)`}
                />
              )}
            </>
          )}
        </div>

        {/* Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {/* Confirmed */}
          <button
            type="button"
            onClick={() => onSelectStatusFilter && onSelectStatusFilter("CONFIRMED")}
            className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 transition text-left cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Confirmed
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="font-poppins text-lg font-extrabold text-emerald-950 mt-1">
              {confirmedOrders.length}
            </p>
            <p className="text-[10px] text-emerald-700 mt-0.5">{confirmedPct}% cleared</p>
          </button>

          {/* Pending */}
          <button
            type="button"
            onClick={() => onSelectStatusFilter && onSelectStatusFilter("PENDING")}
            className="p-3 rounded-xl border border-amber-100 bg-amber-50/40 hover:bg-amber-50 transition text-left cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Pending
              </span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <p className="font-poppins text-lg font-extrabold text-amber-950 mt-1">
              {pendingOrders.length}
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">{pendingPct}% awaiting cash</p>
          </button>

          {/* Other / Cancelled */}
          <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-left col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Other / Void
              </span>
              <span className="h-2 w-2 rounded-full bg-slate-400" />
            </div>
            <p className="font-poppins text-lg font-extrabold text-[#0F2044] mt-1">
              {otherOrders.length}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{otherPct}% exceptions</p>
          </div>
        </div>
      </div>
    </div>
  );
}

