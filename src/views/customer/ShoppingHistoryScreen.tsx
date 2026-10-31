import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { fmt } from "../../utils/formatters";
import { IcBack } from "../../components/common/Icons";
import { EmptyState } from "../../components/common/EmptyState";

export function ShoppingHistoryScreen() {
  const navigate = useNavigate();
  const { orderHistory, setSelectedHistoryOrder } = useShopping();
  const { user } = useAuth();

  const isStaff = Boolean(
    user &&
    (user.role === "CASHIER" ||
      user.role === "STORE_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "SECURITY_GUARD" ||
      (user.role as string)?.toUpperCase() === "CASHIER" ||
      (user.role as string)?.toUpperCase() === "STORE_ADMIN" ||
      (user.role as string)?.toUpperCase() === "ADMIN" ||
      (user.role as string)?.toUpperCase() === "SECURITY_GUARD" ||
      user.email?.toLowerCase().includes("cashier") ||
      user.email?.toLowerCase().includes("guard") ||
      user.email?.toLowerCase().includes("admin"))
  );

  // Automatically redirect staff to their operational workstation desk
  useEffect(() => {
    if (isStaff) {
      if (user?.role === "CASHIER" || user?.email?.toLowerCase().includes("cashier")) {
        navigate("/cashier", { replace: true });
      } else if (user?.role === "SECURITY_GUARD" || user?.email?.toLowerCase().includes("guard")) {
        navigate("/security", { replace: true });
      } else {
        navigate("/admin", { replace: true });
      }
    }
  }, [isStaff, user, navigate]);

  const handleBack = () => {
    if (user?.role === "CASHIER") navigate("/cashier");
    else if (user?.role === "ADMIN" || user?.role === "STORE_ADMIN") navigate("/admin");
    else if (user?.role === "SECURITY_GUARD") navigate("/security");
    else navigate("/shop");
  };

  const handleViewReceipt = (orderId: string) => {
    const order = orderHistory.find((o) => o.orderId === orderId);
    if (order) {
      setSelectedHistoryOrder(order);
    }
    navigate(`/receipt/${orderId}`);
  };

  const handleViewExitPass = (orderId: string) => {
    const order = orderHistory.find((o) => o.orderId === orderId);
    if (order) {
      setSelectedHistoryOrder(order);
    }
    navigate(`/exit-pass/${orderId}`);
  };

  const returnLabel =
    user?.role === "CASHIER" || user?.email?.toLowerCase().includes("cashier")
      ? "Cashier Desk"
      : user?.role === "ADMIN" || user?.role === "STORE_ADMIN" || user?.email?.toLowerCase().includes("admin")
      ? "Admin Console"
      : user?.role === "SECURITY_GUARD" || user?.email?.toLowerCase().includes("guard")
      ? "Security Desk"
      : "Shop";

  const emptyStateProps =
    user?.role === "CASHIER"
      ? {
          emoji: "🧾",
          title: "Cashier Terminal Active",
          description: "Customer settlements and cash register payments are processed directly at your cashier desk.",
          action: {
            label: "Return to Cashier Desk",
            onClick: () => navigate("/cashier"),
          },
        }
      : user?.role === "ADMIN" || user?.role === "STORE_ADMIN"
      ? {
          emoji: "📊",
          title: "Admin Console Active",
          description: "Store performance, inventory levels, and transaction logs are managed inside the Admin Console.",
          action: {
            label: "Return to Admin Console",
            onClick: () => navigate("/admin"),
          },
        }
      : user?.role === "SECURITY_GUARD"
      ? {
          emoji: "🛡️",
          title: "Security Terminal Active",
          description: "Customer exit passes and physical turnstile clearances are verified at the security gate.",
          action: {
            label: "Return to Security Desk",
            onClick: () => navigate("/security"),
          },
        }
      : {
          emoji: "🛍️",
          title: "No Shopping History Yet",
          description: "When you complete a self-checkout payment, your receipts and exit passes will appear here.",
          action: {
            label: "Start Shopping",
            onClick: () => navigate("/shop"),
          },
        };

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[520px]"
      showCustomerNav={true}
      activeNav="history"
      onBack={handleBack}
      backLabel={returnLabel}
    >
      <div className="flex flex-1 flex-col qless-fade-in pb-12 w-full">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7A8493] transition hover:text-[#0F2044]"
          >
            <IcBack />
            <span>Return to {returnLabel}</span>
          </button>

          <span className="rounded-full bg-white border border-black/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0F2044]">
            {orderHistory.length} {orderHistory.length === 1 ? "Trip" : "Trips"}
          </span>
        </div>

        <div>
          <h2 className="font-poppins text-2xl font-bold tracking-tight text-[#0F2044]">
            {isStaff ? "Store Transactions & Receipts" : "Shopping History"}
          </h2>
          <p className="mt-0.5 text-xs text-[#7A8493]">
            {isStaff
              ? "Verified self-checkout receipts and customer exit passes"
              : "Verified self-checkout receipts and stored exit passes"}
          </p>
        </div>

        {/* Standardized Empty State */}
        {orderHistory.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              emoji={emptyStateProps.emoji}
              title={emptyStateProps.title}
              description={emptyStateProps.description}
              action={emptyStateProps.action}
            />
          </div>
        ) : (
          /* List of Historical Orders */
          <div className="mt-4 space-y-3.5">
            {orderHistory.map((order) => {
              const paymentMethodName =
                order.paymentMethod === "upi"
                  ? "UPI"
                  : order.paymentMethod === "card"
                  ? "Card"
                  : "Wallet";

              return (
                <article
                  key={order.orderId}
                  className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_4px_16px_rgba(15,32,68,0.06)] backdrop-blur-md transition hover:border-[#2E9E44]/40 hover:shadow-md space-y-3"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-black/5 pb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: order.store?.brandColor || "#2E9E44" }}
                        />
                        <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
                          {order.store?.name || "Supermarket"}
                        </h4>
                      </div>
                      <p className="text-[11px] text-[#7A8493] mt-0.5">
                        {order.store?.branch || "Indiranagar"} · {order.paidAt}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-poppins text-base font-extrabold text-[#0F2044]">
                        {fmt(order.finalTotal)}
                      </span>
                      <span className="block text-[10px] font-bold text-[#2E9E44]">
                        PAID · {order.itemCount} items
                      </span>
                    </div>
                  </div>

                  {/* Order Reference & Method Tag */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] font-semibold text-[#7A8493]">
                      Ref: {order.orderId}
                    </span>
                    <span className="rounded-md bg-[#F0F2F5] px-2 py-0.5 text-[10px] font-bold text-[#0F2044]">
                      {paymentMethodName} ({order.paymentReference})
                    </span>
                  </div>

                  {/* Actions: View Receipt / View Exit Pass */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/5">
                    <button
                      type="button"
                      onClick={() => handleViewReceipt(order.orderId)}
                      className="flex min-h-[44px] h-11 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-[#F9FAFB] font-poppins text-xs font-semibold text-[#0F2044] hover:bg-white shadow-2xs transition active:scale-95"
                    >
                      <span>🧾</span>
                      <span>View Receipt</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleViewExitPass(order.orderId)}
                      className="flex min-h-[44px] h-11 items-center justify-center gap-1.5 rounded-xl bg-[#2E9E44] font-poppins text-xs font-semibold text-white hover:bg-[#288B3B] shadow-2xs transition active:scale-95"
                    >
                      <span>📱</span>
                      <span>Exit QR Pass</span>
                    </button>
                  </div>
                </article>
              );
            })}

            {/* Back to Shopping Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate("/shop")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F2044] font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#1A3163] transition active:scale-98"
              >
                <span>🛒</span>
                <span>Return to Active Cart</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
