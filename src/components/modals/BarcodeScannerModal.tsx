import { useState, useEffect, Component, type ReactNode } from "react";
import { Product, ProductLocation } from "../../types";
import { useShopping } from "../../context/ShoppingContext";
import { ProductConfirmationModal } from "./ProductConfirmationModal";
import { ProductLocationModal } from "./ProductLocationModal";
import { CameraScannerTab } from "../scanner/CameraScannerTab";
import { ManualBarcodeEntry } from "../scanner/ManualBarcodeEntry";
import { ProductSearchTab } from "../scanner/ProductSearchTab";
import { ProductCatalogTab } from "../scanner/ProductCatalogTab";
import { IcAlert, IcCamera, IcCatalog, IcClose, IcKeypad, IcSearch } from "../common/Icons";

class ScannerErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("Scanner error caught:", err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export type DiscoveryTab = "scan" | "manual" | "search" | "catalog";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onItemScanned: (product: Product, quantity: number) => void;
  existingIds?: number[];
  initialTab?: DiscoveryTab;
}

export function BarcodeScannerModal({
  open,
  onClose,
  onItemScanned,
  initialTab = "scan",
}: BarcodeScannerModalProps) {
  const [activeTab, setActiveTab] = useState<DiscoveryTab>(initialTab);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { lookupBarcode, getLocation, catalogError, refreshCatalog } = useShopping();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationSource, setConfirmationSource] = useState("Scanned Barcode");
  const [unmatchedBarcode, setUnmatchedBarcode] = useState<string | null>(null);
  const [lastAddedFeedback, setLastAddedFeedback] = useState<string | null>(null);

  // Live lookup states
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [scanLookupError, setScanLookupError] = useState<string | null>(null);
  const [scannedBarcodeToRetry, setScannedBarcodeToRetry] = useState<string | null>(null);

  // SmartFind Product Location Modal State
  const [locationProduct, setLocationProduct] = useState<Product | null>(null);
  const [activeLocation, setActiveLocation] = useState<ProductLocation | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Sync initial tab when opened
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setSelectedProduct(null);
      setConfirmationOpen(false);
      setUnmatchedBarcode(null);
      setScanLookupError(null);
      setScannedBarcodeToRetry(null);
      setIsLookingUpBarcode(false);
      setLastAddedFeedback(null);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [open, initialTab]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmationOpen) {
          setConfirmationOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmationOpen, onClose]);

  if (!open) return null;

  // Handle decoded barcode from camera scanner with live Supabase query
  const handleBarcodeDecoded = async (barcode: string) => {
    setUnmatchedBarcode(null);
    setScanLookupError(null);
    setScannedBarcodeToRetry(barcode);
    setIsLookingUpBarcode(true);

    try {
      const result = await lookupBarcode(barcode);
      if (
        (result.status === "found_in_stock" || result.status === "found_out_of_stock") &&
        result.product
      ) {
        const loc = getLocation(result.product.id);
        setActiveLocation(loc ?? null);
        setSelectedProduct(result.product);
        setConfirmationSource("Scanned Barcode");
        setConfirmationOpen(true);
      } else if (result.status === "not_found") {
        setUnmatchedBarcode(barcode);
      } else if (result.status === "error") {
        setScanLookupError(result.error || "Unable to look up product inventory.");
      }
    } catch (err) {
      setScanLookupError(
        err instanceof Error ? err.message : "Failed to query live catalog from Supabase."
      );
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  // Handle product match from manual barcode entry
  const handleManualProductFound = (product: Product) => {
    const loc = getLocation(product.id);
    setActiveLocation(loc ?? null);
    setSelectedProduct(product);
    setConfirmationSource("Manual Barcode");
    setConfirmationOpen(true);
  };

  // Handle product selected from Search or Catalog
  const handleCatalogOrSearchSelected = (product: Product, source: string) => {
    const loc = getLocation(product.id);
    setActiveLocation(loc ?? null);
    setSelectedProduct(product);
    setConfirmationSource(source);
    setConfirmationOpen(true);
  };

  const handleViewLocation = (product: Product, location: ProductLocation | null) => {
    setLocationProduct(product);
    setActiveLocation(location);
    setLocationModalOpen(true);
  };

  // Handle confirmed product addition
  const handleConfirmAdd = (product: Product, quantity: number) => {
    setConfirmationOpen(false);
    onItemScanned(product, quantity);
    setLastAddedFeedback(`Added ${quantity} × ${product.name} to Cart`);
    setTimeout(() => {
      setLastAddedFeedback(null);
    }, 2800);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[#0F2044]/45 px-0 sm:px-4 backdrop-blur-sm qless-fade-in"
        onMouseDown={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scanner-dialog-title"
          className="flex flex-col w-full max-w-[500px] max-h-[92vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_-16px_60px_rgba(15,32,68,0.25)] sm:shadow-[0_24px_70px_rgba(15,32,68,0.2)] qless-scale-in overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Top handle on mobile */}
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-[#E5E7EB]" />
          </div>

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-black/5">
            <div>
              <h3 id="scanner-dialog-title" className="font-poppins text-lg font-bold text-[#0F2044]">
                Product Discovery &amp; Scanner
              </h3>
              <p className="text-xs text-[#7A8493] font-alegreya">
                Scan shelf barcodes or search store inventory
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close scanner"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[#7A8493] hover:bg-[#F6F7F8] hover:text-[#0F2044] transition"
            >
              <IcClose />
            </button>
          </div>

          {/* Barcode Query Loading Indicator */}
          {isLookingUpBarcode && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-xs text-blue-900 flex items-center gap-2.5 qless-fade-in">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent shrink-0" />
              <span className="font-semibold">Querying live Supabase inventory for barcode...</span>
            </div>
          )}

          {/* Barcode Query Failure with Retry */}
          {scanLookupError && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-800 flex items-center justify-between gap-2 qless-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-red-600 shrink-0"><IcAlert /></span>
                <span className="truncate">{scanLookupError}</span>
              </div>
              {scannedBarcodeToRetry && (
                <button
                  type="button"
                  onClick={() => { void handleBarcodeDecoded(scannedBarcodeToRetry); }}
                  className="shrink-0 px-2.5 py-1 rounded bg-red-600 text-white font-bold text-[11px] hover:bg-red-700 transition"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Live Catalog Sync Error Banner */}
          {catalogError && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-800 flex items-center justify-between gap-2 qless-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-red-600 shrink-0"><IcAlert /></span>
                <span>{catalogError}</span>
              </div>
              <button
                type="button"
                onClick={() => { refreshCatalog().catch(() => {}); }}
                className="shrink-0 px-2 py-1 rounded bg-red-600 text-white font-bold text-[11px] hover:bg-red-700 transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* Notification Toast if item added */}
          {lastAddedFeedback && (
            <div className="bg-[#2E9E44] px-4 py-2 text-white text-xs font-semibold flex items-center justify-between qless-fade-in">
              <span>✓ {lastAddedFeedback}</span>
              <button
                onClick={onClose}
                className="underline text-[11px] font-bold text-white hover:text-white/80"
              >
                View Cart
              </button>
            </div>
          )}

          {/* Unmatched Barcode Alert */}
          {unmatchedBarcode && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5 qless-fade-in">
              <span className="text-amber-700 mt-0.5 shrink-0">
                <IcAlert />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Scanned Barcode Not In System</p>
                <p className="mt-0.5 text-[11px] text-amber-800">
                  Barcode <span className="font-mono font-semibold">{unmatchedBarcode}</span> was not found in this supermarket's catalog.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("search")}
                    className="rounded bg-amber-800 text-white px-2 py-1 font-semibold text-[11px]"
                  >
                    Search by Name
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnmatchedBarcode(null)}
                    className="text-amber-800 underline text-[11px] font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-4 border-b border-black/5 bg-[#F8F9FA] p-1 gap-1 text-center select-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab("scan");
                setUnmatchedBarcode(null);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center min-h-[44px] gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-1 rounded-xl font-poppins text-[10.5px] sm:text-xs font-semibold transition-all active:scale-95 ${
                activeTab === "scan"
                  ? "bg-white text-[#0F2044] shadow-xs"
                  : "text-[#7A8493] hover:text-[#0F2044] hover:bg-white/60"
              }`}
            >
              <IcCamera />
              <span>Camera</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("manual");
                setUnmatchedBarcode(null);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center min-h-[44px] gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-1 rounded-xl font-poppins text-[10.5px] sm:text-xs font-semibold transition-all active:scale-95 ${
                activeTab === "manual"
                  ? "bg-white text-[#0F2044] shadow-xs"
                  : "text-[#7A8493] hover:text-[#0F2044] hover:bg-white/60"
              }`}
            >
              <IcKeypad />
              <span>Barcode</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("search");
                setUnmatchedBarcode(null);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center min-h-[44px] gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-1 rounded-xl font-poppins text-[10.5px] sm:text-xs font-semibold transition-all active:scale-95 ${
                activeTab === "search"
                  ? "bg-white text-[#0F2044] shadow-xs"
                  : "text-[#7A8493] hover:text-[#0F2044] hover:bg-white/60"
              }`}
            >
              <IcSearch />
              <span>Search</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("catalog");
                setUnmatchedBarcode(null);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center min-h-[44px] gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-1 rounded-xl font-poppins text-[10.5px] sm:text-xs font-semibold transition-all active:scale-95 ${
                activeTab === "catalog"
                  ? "bg-white text-[#0F2044] shadow-xs"
                  : "text-[#7A8493] hover:text-[#0F2044] hover:bg-white/60"
              }`}
            >
              <IcCatalog />
              <span>Catalog</span>
            </button>
          </div>

          {/* Active Tab Viewport */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {activeTab === "scan" && (
              <ScannerErrorBoundary
                fallback={
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                    <p className="font-poppins text-sm font-bold text-amber-950">
                      Camera Stream Offline
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Camera is unavailable in this environment. You can enter barcodes manually or browse the catalog.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("manual")}
                        className="rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs"
                      >
                        Enter Barcode
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("catalog")}
                        className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-semibold text-[#0F2044]"
                      >
                        Browse Catalog
                      </button>
                    </div>
                  </div>
                }
              >
                <CameraScannerTab
                  onBarcodeDecoded={handleBarcodeDecoded}
                  onSwitchToManual={() => setActiveTab("manual")}
                  onSwitchToCatalog={() => setActiveTab("catalog")}
                />
              </ScannerErrorBoundary>
            )}

            {activeTab === "manual" && (
              <ManualBarcodeEntry
                onProductFound={handleManualProductFound}
                onOpenCatalog={() => setActiveTab("catalog")}
              />
            )}

            {activeTab === "search" && (
              <ProductSearchTab
                onSelectProduct={(p) => handleCatalogOrSearchSelected(p, "Search Result")}
                onOpenCatalog={() => setActiveTab("catalog")}
                onViewLocation={handleViewLocation}
              />
            )}

            {activeTab === "catalog" && (
              <ProductCatalogTab
                onSelectProduct={(p) => handleCatalogOrSearchSelected(p, "Catalog Product")}
                onViewLocation={handleViewLocation}
              />
            )}
          </div>

          {/* Bottom Bar: Done & Return to Cart */}
          <div className="border-t border-black/5 bg-[#F9FAFB] px-5 py-3 flex items-center justify-between">
            <span className="text-[11px] text-[#7A8493]">
              Need help? Ask a store associate.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs transition hover:bg-[#1A3163]"
            >
              Return to Cart
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Panel */}
      <ProductConfirmationModal
        product={selectedProduct}
        location={activeLocation}
        open={confirmationOpen}
        onConfirm={handleConfirmAdd}
        onCancel={() => setConfirmationOpen(false)}
        sourceLabel={confirmationSource}
      />

      {/* SmartFind Product Location Modal */}
      <ProductLocationModal
        product={locationProduct}
        location={activeLocation}
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onAddToCart={(p) => {
          handleCatalogOrSearchSelected(p, "Location Map");
        }}
      />
    </>
  );
}
