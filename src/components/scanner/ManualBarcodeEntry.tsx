import { useState, FormEvent } from "react";
import { Product } from "../../types";
import { useShopping } from "../../context/ShoppingContext";
import { IcAlert, IcBarcode, IcClose, IcSearch } from "../common/Icons";

interface ManualBarcodeEntryProps {
  onProductFound: (product: Product) => void;
  onOpenCatalog: () => void;
}

export function ManualBarcodeEntry({ onProductFound, onOpenCatalog }: ManualBarcodeEntryProps) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [errorBarcode, setErrorBarcode] = useState<string | null>(null);
  const [lookupErrorMessage, setLookupErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { lookupBarcode, catalog } = useShopping();

  const handleProcessBarcode = async (rawBarcode: string) => {
    const query = rawBarcode.trim();
    if (!query || isSubmitting) return;

    setIsSubmitting(true);
    setErrorBarcode(null);
    setLookupErrorMessage(null);

    try {
      const result = await lookupBarcode(query);
      if (
        (result.status === "found_in_stock" || result.status === "found_out_of_stock") &&
        result.product
      ) {
        onProductFound(result.product);
      } else if (result.status === "not_found") {
        setErrorBarcode(query);
      } else if (result.status === "error") {
        setLookupErrorMessage(result.error || "Failed to query store inventory");
      }
    } catch (err: unknown) {
      setLookupErrorMessage(err instanceof Error ? err.message : "Network error looking up barcode");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    handleProcessBarcode(barcodeInput);
  };

  const handleQuickFill = (sampleBarcode: string) => {
    setBarcodeInput(sampleBarcode);
    handleProcessBarcode(sampleBarcode);
  };

  // Sample items for quick customer convenience strictly from live catalog
  const sampleItems = catalog.slice(0, 4);

  return (
    <div className="flex flex-col py-2 qless-fade-in">
      {/* Header & Instructions */}
      <div className="mb-4">
        <h4 className="font-poppins text-base font-bold text-[#0F2044]">
          Enter Barcode Number
        </h4>
        <p className="mt-0.5 text-xs text-[#7A8493] leading-relaxed">
          Type the 8 to 13-digit number printed beneath the barcode stripes on the product packaging.
        </p>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7A8493]">
            <IcBarcode />
          </div>

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={barcodeInput}
            onChange={(e) => {
              setBarcodeInput(e.target.value);
              if (errorBarcode) setErrorBarcode(null);
            }}
            placeholder="e.g. 8901030874322"
            autoFocus
            className="w-full rounded-xl border-2 border-[#D8DDE3] bg-white py-3 pl-11 pr-11 font-mono text-base sm:text-sm font-semibold text-[#0F2044] placeholder-[#A0A8B4] transition focus:border-[#2E9E44] focus:outline-none focus:ring-2 focus:ring-[#2E9E44]/20"
          />

          {barcodeInput && (
            <button
              type="button"
              onClick={() => {
                setBarcodeInput("");
                setErrorBarcode(null);
              }}
              className="absolute inset-y-0 right-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#A0A8B4] hover:text-[#0F2044]"
            >
              <IcClose />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!barcodeInput.trim() || isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F2044] font-poppins text-sm font-semibold text-white shadow-sm transition hover:bg-[#1A3163] hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              <span>Checking Live Inventory…</span>
            </>
          ) : (
            <>
              <IcSearch />
              <span>Find Product</span>
            </>
          )}
        </button>
      </form>

      {/* Network / Query Error State */}
      {lookupErrorMessage && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 qless-scale-in">
          <div className="flex items-start gap-3">
            <span className="text-red-600 mt-0.5 shrink-0">
              <IcAlert />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-poppins text-xs font-bold text-red-900">
                Inventory Query Failed
              </p>
              <p className="mt-0.5 text-xs text-red-700 leading-relaxed">
                {lookupErrorMessage}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleProcessBarcode(barcodeInput)}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-800 transition"
                >
                  Retry Query
                </button>
                <button
                  type="button"
                  onClick={() => setLookupErrorMessage(null)}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-800 border border-red-200 shadow-xs hover:bg-red-50 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {errorBarcode && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 qless-scale-in">
          <div className="flex items-start gap-3">
            <span className="text-red-600 mt-0.5 shrink-0">
              <IcAlert />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-poppins text-xs font-bold text-red-900">
                No Product Found
              </p>
              <p className="mt-0.5 text-xs text-red-700 leading-relaxed">
                Barcode <span className="font-mono font-semibold underline">{errorBarcode}</span> does not match any product in this store's inventory.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput("");
                    setErrorBarcode(null);
                  }}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-800 border border-red-200 shadow-xs hover:bg-red-50 transition"
                >
                  Clear &amp; Try Again
                </button>
                <button
                  type="button"
                  onClick={onOpenCatalog}
                  className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-900 transition"
                >
                  Browse Catalog
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Test Barcode Helper */}
      <div className="mt-6 border-t border-black/5 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A94A3] mb-2.5">
          Tap to Test Sample Shelf Barcodes
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sampleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleQuickFill(item.barcode)}
              className="flex items-center gap-2 rounded-xl border border-black/5 bg-[#F9FAFB] p-2 text-left transition hover:bg-white hover:border-[#2E9E44]/40 hover:shadow-xs active:scale-95"
            >
              <span className="text-xl">{item.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-poppins text-xs font-semibold text-[#0F2044]">
                  {item.name}
                </p>
                <p className="font-mono text-[10px] text-[#7A8493] truncate">
                  {item.barcode}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
