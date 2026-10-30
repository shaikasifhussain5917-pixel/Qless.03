import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { fmt } from "../../utils/formatters";
import {
  lookupProductByBarcode,
  submitBatchReceiveStock,
  registerAndReceiveProduct,
  associateAndReceiveProduct,
  BarcodeLookupResult,
  BatchReceivingItem,
  BatchSubmitResult,
} from "../../services/adminStockImportService";
import { STORE_AISLES } from "../../data/mockStoreLayout";
import { ProductCategory } from "../../types";
import { ProductImage } from "../common/ProductImage";
import {
  discoverProductByBarcode,
  DiscoveredProduct,
} from "../../services/productImageDiscoveryService";
import {
  validateImageFile,
  uploadProductImageFile,
} from "../../services/productImageStorageService";

interface AdminStockImportTabProps {
  storeId?: string;
  storeCode?: string;
  storeName?: string;
  branchName?: string;
}

const CATEGORIES: ProductCategory[] = [
  "Dairy",
  "Fruits and Vegetables",
  "Snacks",
  "Beverages",
  "Bakery",
  "Personal Care",
  "Household",
];

export function AdminStockImportTab({
  storeId = "STORE001",
  storeCode = "QLM001",
  storeName = "QLess Mart",
  branchName = "HSR Layout Flagship",
}: AdminStockImportTabProps) {
  // ── Input & Scanner States ──
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [autoFocusInput, setAutoFocusInput] = useState(true);

  // ── Lookup Result & Staging ──
  const [activeLookup, setActiveLookup] = useState<BarcodeLookupResult | null>(null);
  const [lookupQuantity, setLookupQuantity] = useState<number>(1);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // ── Online Product Image Discovery States ──
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredCandidate, setDiscoveredCandidate] = useState<DiscoveredProduct | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isCandidateConfirmed, setIsCandidateConfirmed] = useState(false);
  const [candidateImageUrl, setCandidateImageUrl] = useState<string | null>(null);
  const [candidateImageSource, setCandidateImageSource] = useState<string>("Open Food Facts");
  const [regDescription, setRegDescription] = useState("");

  // ── Photo Upload Modal State ──
  const [isPhotoUploadModalOpen, setIsPhotoUploadModalOpen] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // ── Staged Batch Items ──
  const [batchItems, setBatchItems] = useState<BatchReceivingItem[]>([]);
  const [recentFlashBarcode, setRecentFlashBarcode] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: "success" | "info" | "warning" | "error"; message: string } | null>(null);

  // ── Registration Form (For Unknown Barcode) ──
  const [regName, setRegName] = useState("");
  const [regBrand, setRegBrand] = useState("");
  const [regCategory, setRegCategory] = useState<ProductCategory>("Snacks");
  const [regUnitSize, setRegUnitSize] = useState("1 unit");
  const [regPrice, setRegPrice] = useState<number | "">("");
  const [regMrp, setRegMrp] = useState<number | "">("");
  const [regQuantity, setRegQuantity] = useState<number>(10);
  const [regAisle, setRegAisle] = useState("");
  const [regRack, setRegRack] = useState("");
  const [regShelf, setRegShelf] = useState("S1");
  const [regEmoji, setRegEmoji] = useState("🛍️");
  const [regError, setRegError] = useState<string | null>(null);

  // ── Master-Only Association Form ──
  const [assocPrice, setAssocPrice] = useState<number | "">("");
  const [assocMrp, setAssocMrp] = useState<number | "">("");
  const [assocQuantity, setAssocQuantity] = useState<number>(10);
  const [assocAisle, setAssocAisle] = useState("");
  const [assocRack, setAssocRack] = useState("");
  const [assocShelf, setAssocShelf] = useState("S1");
  const [assocError, setAssocError] = useState<string | null>(null);

  // ── Confirmation Modal & Submission ──
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<BatchSubmitResult | null>(null);

  // ── Refs ──
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraContainerId = "qless-stock-import-camera-viewport";

  // USB Scanner keystroke buffer
  const usbBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // ── USB Barcode Scanner Global Hardware Listener ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if currently focusing another input element other than our barcode input
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      const isOurBarcodeInput = target === manualInputRef.current;

      // Allow USB scanner to type directly or globally
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const buffered = usbBufferRef.current.trim();
        usbBufferRef.current = "";

        if (buffered.length >= 4) {
          // Hardware USB scan detected!
          e.preventDefault();
          setBarcodeInput(buffered);
          executeLookup(buffered);
        } else if (isOurBarcodeInput && barcodeInput.trim()) {
          // User hit Enter inside manual input
          e.preventDefault();
          executeLookup(barcodeInput.trim());
        }
        return;
      }

      // Filter printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // If the user is manually typing into another form field at normal human speed (> 50ms), ignore
        if (isInput && !isOurBarcodeInput && timeDiff > 50) {
          usbBufferRef.current = "";
          return;
        }

        // Barcode scanners type very rapidly (< 45ms per character)
        if (timeDiff > 70 && !isOurBarcodeInput) {
          // Reset buffer if this was manual keyboard typing
          usbBufferRef.current = e.key;
        } else {
          usbBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [barcodeInput]);

  // Keep input focused if autoFocus is active
  useEffect(() => {
    if (autoFocusInput && !isConfirmModalOpen && !isCameraActive) {
      manualInputRef.current?.focus();
    }
  }, [autoFocusInput, isConfirmModalOpen, isCameraActive, activeLookup]);

  // ── Camera Scanner Lifecycle ──
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn("[StockImport] Error stopping camera scanner:", err);
      } finally {
        scannerRef.current = null;
        setIsCameraActive(false);
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraActive(true);

    // Wait for container to mount
    setTimeout(async () => {
      try {
        if (scannerRef.current) {
          await stopCamera();
        }

        const scanner = new Html5Qrcode(cameraContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (w, h) => {
              const edge = Math.min(w, h);
              return {
                width: Math.min(360, Math.max(220, Math.floor(edge * 0.85))),
                height: Math.min(220, Math.max(140, Math.floor(edge * 0.55))),
              };
            },
            aspectRatio: 1.333333,
            videoConstraints: {
              facingMode: "environment",
              width: { min: 640, ideal: 1280 },
              height: { min: 480, ideal: 720 },
            },
          },
          (decodedBarcode) => {
            if (decodedBarcode) {
              const clean = decodedBarcode.trim();
              setBarcodeInput(clean);
              stopCamera();
              executeLookup(clean);
            }
          },
          () => {
            // Frame scan failure (benign, scanning in progress)
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to initialize camera scanner.";
        setCameraError(msg);
        setIsCameraActive(false);
      }
    }, 150);
  }, [stopCamera]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // ── Barcode Lookup ──
  const executeLookup = async (barcodeToSearch: string) => {
    const clean = barcodeToSearch.trim();
    if (!clean) return;

    setIsSearching(true);
    setLookupError(null);
    setActiveLookup(null);
    setLookupQuantity(1);

    try {
      // Check if product is already in the batch list!
      const existingInBatch = batchItems.find((it) => it.barcode === clean);
      if (existingInBatch) {
        // Predictable behavior: Auto-increment quantity by 1 and flash
        setBatchItems((prev) =>
          prev.map((it) => {
            if (it.barcode === clean) {
              const updatedQty = it.quantityReceived + 1;
              return {
                ...it,
                quantityReceived: updatedQty,
                projectedStock: it.currentStock + updatedQty,
              };
            }
            return it;
          })
        );

        setRecentFlashBarcode(clean);
        setTimeout(() => setRecentFlashBarcode(null), 1800);
        setStatusNotice({
          type: "info",
          message: `Product "${existingInBatch.name}" already in batch! Increased quantity to ${existingInBatch.quantityReceived + 1} units.`,
        });
        setBarcodeInput("");
        return;
      }

      // Query database/local catalog for the product
      const res = await lookupProductByBarcode(clean, storeId);
      setActiveLookup(res);

      if (res.status === "STORE_ITEM") {
        setLookupQuantity(1);
      } else if (res.status === "UNKNOWN_BARCODE") {
        // Automatically start online product discovery for unknown barcode!
        startOnlineDiscovery(clean);
      } else if (res.status === "MASTER_ONLY") {
        // Pre-fill association form with reasonable defaults
        setAssocPrice(100);
        setAssocMrp(100);
        setAssocQuantity(10);
        setAssocAisle(STORE_AISLES[0].code);
        setAssocRack(STORE_AISLES[0].racks[0] || "R01");
        setAssocShelf("S1");
        setAssocError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error looking up barcode.";
      setLookupError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  // ── Automatic Online Discovery Runner ──
  const startOnlineDiscovery = async (barcodeToSearch: string) => {
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveredCandidate(null);
    setIsCandidateConfirmed(false);
    setCandidateImageUrl(null);
    setCandidateImageSource("Open Food Facts");
    setRegDescription("");

    try {
      const res = await discoverProductByBarcode(barcodeToSearch);
      if (res.success && res.product) {
        setDiscoveredCandidate(res.product);
        setCandidateImageUrl(res.product.imageUrl || null);
        setCandidateImageSource(res.product.source);
        // Pre-fill registration fields with discovered online attributes
        setRegName(res.product.name);
        setRegBrand(res.product.brand);
        setRegCategory(res.product.suggestedCategory);
        setRegUnitSize(res.product.unitSize);
        setRegDescription(res.product.description || "");
        setRegPrice("");
        setRegMrp("");
        setRegQuantity(10);
      } else {
        setDiscoveryError(res.error || "No online catalog match found.");
        setRegName("");
        setRegBrand("");
        setRegCategory("Snacks");
        setRegUnitSize("1 unit");
        setRegDescription("");
        setRegPrice("");
        setRegMrp("");
        setRegQuantity(10);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Online discovery error.";
      setDiscoveryError(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  // ── Verification Action Handlers ──
  const handleConfirmDiscoveredCandidate = () => {
    if (!discoveredCandidate) return;
    setIsCandidateConfirmed(true);
    setStatusNotice({
      type: "info",
      message: `Verified product "${discoveredCandidate.name}". Please review or enter selling price, MRP, and initial stock quantity.`,
    });
  };

  const handleSearchAgain = () => {
    if (activeLookup && activeLookup.status === "UNKNOWN_BARCODE") {
      startOnlineDiscovery(activeLookup.barcode);
    } else if (barcodeInput.trim()) {
      startOnlineDiscovery(barcodeInput.trim());
    }
  };

  const handleOpenPhotoUpload = () => {
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoUploadError(null);
    setIsPhotoUploadModalOpen(true);
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setPhotoUploadError(validation.error || "Invalid image file.");
      setSelectedPhotoFile(null);
      setPhotoPreviewUrl(null);
      return;
    }

    setPhotoUploadError(null);
    setSelectedPhotoFile(file);
    const preview = URL.createObjectURL(file);
    setPhotoPreviewUrl(preview);
  };

  const handleConfirmPhotoUpload = async () => {
    if (!selectedPhotoFile) {
      setPhotoUploadError("Please select an image file first.");
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoUploadError(null);

    try {
      const barcode =
        activeLookup?.status === "UNKNOWN_BARCODE"
          ? activeLookup.barcode
          : activeLookup?.status === "STORE_ITEM" || activeLookup?.status === "MASTER_ONLY"
          ? activeLookup.product.barcode
          : barcodeInput.trim() || "UNKNOWN";
      const uploadRes = await uploadProductImageFile(selectedPhotoFile, barcode);
      if (uploadRes.success && uploadRes.publicUrl) {
        setCandidateImageUrl(uploadRes.publicUrl);
        setCandidateImageSource(uploadRes.source);
        setIsCandidateConfirmed(true);
        setIsPhotoUploadModalOpen(false);
        setStatusNotice({
          type: "info",
          message: "Product photo successfully attached! Please enter selling price and stock quantity.",
        });
      } else {
        setPhotoUploadError(uploadRes.error || "Failed to attach photo.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error uploading photo.";
      setPhotoUploadError(msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // ── Handle Adding Existing Store Item to Batch ──
  const handleAddStoreItemToBatch = () => {
    if (!activeLookup || activeLookup.status !== "STORE_ITEM") return;

    if (lookupQuantity <= 0 || !Number.isInteger(lookupQuantity)) {
      setLookupError("Received quantity must be a positive whole number.");
      return;
    }

    const { product, inventory } = activeLookup;
    const existingIndex = batchItems.findIndex((it) => it.barcode === product.barcode);

    if (existingIndex >= 0) {
      // Predictably increment existing row
      setBatchItems((prev) =>
        prev.map((it, idx) => {
          if (idx === existingIndex) {
            const updated = it.quantityReceived + lookupQuantity;
            return {
              ...it,
              quantityReceived: updated,
              projectedStock: it.currentStock + updated,
            };
          }
          return it;
        })
      );
    } else {
      // Append new row to batch
      const newItem: BatchReceivingItem = {
        id: `batch-${Date.now()}-${product.id}`,
        productId: product.id,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unitSize: product.unitSize,
        emoji: product.emoji,
        imageUrl: product.imageUrl || undefined,
        imageSource: "QLess Store Catalog",
        currentStock: inventory.currentStock,
        quantityReceived: lookupQuantity,
        projectedStock: inventory.currentStock + lookupQuantity,
        price: inventory.price,
        mrp: inventory.mrp,
        status: "EXISTING_ITEM",
        expectedUpdatedAt: inventory.updatedAt,
      };

      setBatchItems((prev) => [newItem, ...prev]);
    }

    setStatusNotice({
      type: "info",
      message: `Added ${lookupQuantity} units of "${product.name}" to receiving list (staged locally).`,
    });

    // Reset lookup staging
    setActiveLookup(null);
    setBarcodeInput("");
    setLookupError(null);
  };

  // ── Handle Registering New Product (Unknown Barcode) ──
  const handleRegisterNewProduct = () => {
    if (!activeLookup || activeLookup.status !== "UNKNOWN_BARCODE") return;

    setRegError(null);

    // Validations
    if (!regName.trim()) {
      setRegError("Product Name is required.");
      return;
    }
    if (!regBrand.trim()) {
      setRegError("Brand Name is required.");
      return;
    }
    const numPrice = Number(regPrice);
    const numMrp = Number(regMrp);

    if (!numPrice || numPrice <= 0) {
      setRegError("Selling Price must be a valid positive number.");
      return;
    }
    if (!numMrp || numMrp < numPrice) {
      setRegError("MRP must be greater than or equal to the selling price.");
      return;
    }
    if (!regQuantity || regQuantity <= 0 || !Number.isInteger(regQuantity)) {
      setRegError("Initial quantity must be a positive whole number.");
      return;
    }

    // Check if barcode already exists in current batch
    if (batchItems.some((it) => it.barcode === activeLookup.barcode)) {
      setRegError("This barcode is already in your current receiving batch.");
      return;
    }

    // Create staged item for batch
    const newItem: BatchReceivingItem = {
      id: `new-${Date.now()}`,
      productId: 0, // Will be assigned during server registration
      barcode: activeLookup.barcode,
      name: regName.trim(),
      brand: regBrand.trim(),
      category: regCategory,
      unitSize: regUnitSize.trim() || "1 unit",
      emoji: regEmoji || "🛍️",
      imageUrl: candidateImageUrl || undefined,
      imageSource: candidateImageSource || undefined,
      currentStock: 0,
      quantityReceived: regQuantity,
      projectedStock: regQuantity,
      price: numPrice,
      mrp: numMrp,
      status: "NEW_REGISTRATION",
      location: regAisle
        ? {
            aisleCode: regAisle,
            rackCode: regRack,
            shelfCode: regShelf,
          }
        : undefined,
    };

    setBatchItems((prev) => [newItem, ...prev]);
    setStatusNotice({
      type: "info",
      message: `Added "${newItem.name}" to receiving list (staged locally — will be registered in Supabase upon batch submission).`,
    });

    setActiveLookup(null);
    setDiscoveredCandidate(null);
    setIsCandidateConfirmed(false);
    setCandidateImageUrl(null);
    setCandidateImageSource("Open Food Facts");
    setBarcodeInput("");
  };

  // ── Handle Associating Master Product to Store ──
  const handleAssociateProduct = () => {
    if (!activeLookup || activeLookup.status !== "MASTER_ONLY") return;

    setAssocError(null);

    const numPrice = Number(assocPrice);
    const numMrp = Number(assocMrp);

    if (!numPrice || numPrice <= 0) {
      setAssocError("Store Selling Price must be a valid positive number.");
      return;
    }
    if (!numMrp || numMrp < numPrice) {
      setAssocError("MRP must be greater than or equal to the selling price.");
      return;
    }
    if (!assocQuantity || assocQuantity <= 0 || !Number.isInteger(assocQuantity)) {
      setAssocError("Quantity received must be a positive whole number.");
      return;
    }

    const { product } = activeLookup;

    const newItem: BatchReceivingItem = {
      id: `assoc-${Date.now()}-${product.id}`,
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      category: product.category,
      unitSize: product.unitSize,
      emoji: product.emoji,
      currentStock: 0,
      quantityReceived: assocQuantity,
      projectedStock: assocQuantity,
      price: numPrice,
      mrp: numMrp,
      status: "STORE_ASSOCIATION",
      location: assocAisle
        ? {
            aisleCode: assocAisle,
            rackCode: assocRack,
            shelfCode: assocShelf,
          }
        : undefined,
    };

    setBatchItems((prev) => [newItem, ...prev]);
    setStatusNotice({
      type: "info",
      message: `Added "${product.name}" to receiving list (staged locally — will be associated with ${storeName} upon batch submission).`,
    });

    setActiveLookup(null);
    setBarcodeInput("");
  };

  // ── Batch Table Item Quantity Adjusters ──
  const handleUpdateItemQuantity = (id: string, delta: number) => {
    setBatchItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const newQty = Math.max(1, it.quantityReceived + delta);
          return {
            ...it,
            quantityReceived: newQty,
            projectedStock: it.currentStock + newQty,
          };
        }
        return it;
      })
    );
  };

  const handleSetItemQuantity = (id: string, qty: number) => {
    const validQty = Math.max(1, Math.floor(qty) || 1);
    setBatchItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          return {
            ...it,
            quantityReceived: validQty,
            projectedStock: it.currentStock + validQty,
          };
        }
        return it;
      })
    );
  };

  const handleRemoveFromBatch = (id: string) => {
    setBatchItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearBatch = () => {
    if (window.confirm("Clear all items from the current receiving batch?")) {
      setBatchItems([]);
      setActiveLookup(null);
      setBarcodeInput("");
      setStatusNotice(null);
    }
  };

  // ── Batch Summary Calculations ──
  const batchSummary = useMemo(() => {
    const totalUnits = batchItems.reduce((acc, it) => acc + it.quantityReceived, 0);
    const totalValue = batchItems.reduce((acc, it) => acc + it.quantityReceived * it.price, 0);
    return {
      skuCount: batchItems.length,
      totalUnits,
      totalValue,
    };
  }, [batchItems]);

  // ── Confirm and Submit Batch Receiving ──
  const handleSubmitBatch = async () => {
    if (batchItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitResult(null);
    setStatusNotice(null);

    // Unique client idempotency key to prevent double intake
    const idempotencyKey = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    try {
      // 1. Separate new registrations, associations, and existing items
      const existingItems = batchItems.filter((it) => it.status === "EXISTING_ITEM");
      const newItems = batchItems.filter((it) => it.status === "NEW_REGISTRATION");
      const assocItems = batchItems.filter((it) => it.status === "STORE_ASSOCIATION");

      const processedLog: Array<{
        productId: number;
        barcode: string;
        name: string;
        previousStock: number;
        quantityReceived: number;
        newStock: number;
      }> = [];

      // Step A: Register brand new products
      for (const item of newItems) {
        const regRes = await registerAndReceiveProduct(
          storeId,
          {
            barcode: item.barcode,
            name: item.name,
            brand: item.brand,
            category: item.category,
            unitSize: item.unitSize,
            price: item.price,
            mrp: item.mrp,
            quantity: item.quantityReceived,
            emoji: item.emoji,
            imageUrl: item.imageUrl || undefined,
            imageSource: item.imageSource || undefined,
            aisleCode: item.location?.aisleCode,
            rackCode: item.location?.rackCode,
            shelfCode: item.location?.shelfCode,
          },
          `${idempotencyKey}-REG-${item.barcode}`
        );

        if (!regRes.success) {
          throw new Error(`Failed to register product "${item.name}": ${regRes.error}`);
        }

        processedLog.push({
          productId: regRes.product?.id || 0,
          barcode: item.barcode,
          name: item.name,
          previousStock: 0,
          quantityReceived: item.quantityReceived,
          newStock: item.quantityReceived,
        });
      }

      // Step B: Associate master products
      for (const item of assocItems) {
        const assocRes = await associateAndReceiveProduct(
          storeId,
          {
            productId: item.productId,
            price: item.price,
            mrp: item.mrp,
            quantity: item.quantityReceived,
            aisleCode: item.location?.aisleCode,
            rackCode: item.location?.rackCode,
            shelfCode: item.location?.shelfCode,
          },
          `${idempotencyKey}-ASSOC-${item.productId}`
        );

        if (!assocRes.success) {
          throw new Error(`Failed to associate product "${item.name}": ${assocRes.error}`);
        }

        processedLog.push({
          productId: item.productId,
          barcode: item.barcode,
          name: item.name,
          previousStock: 0,
          quantityReceived: item.quantityReceived,
          newStock: item.quantityReceived,
        });
      }

      // Step C: Atomically receive stock for existing items
      if (existingItems.length > 0) {
        const batchRes = await submitBatchReceiveStock(
          storeId,
          existingItems,
          idempotencyKey,
          `Batch stock import: ${existingItems.length} SKUs received by Store Admin`
        );

        if (!batchRes.success) {
          throw new Error(batchRes.error || "Batch stock submission failed on server.");
        }

        if (batchRes.items) {
          processedLog.push(...batchRes.items);
        }
      }

      // Batch Success!
      setSubmitResult({
        success: true,
        batchReference: idempotencyKey,
        processedCount: processedLog.length,
        items: processedLog,
      });

      // Clear the receiving batch table upon success
      setBatchItems([]);
      setActiveLookup(null);
      setIsConfirmModalOpen(false);
      setStatusNotice({
        type: "success",
        message: `Successfully saved to Supabase: Received ${batchSummary.totalUnits} units across ${processedLog.length} products!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during stock intake.";
      setSubmitResult({
        success: false,
        error: msg,
      });
      setIsConfirmModalOpen(false);
      setStatusNotice({
        type: "error",
        message: `Failed to save to Supabase: ${msg}`,
      });
      // Do NOT clear batchItems on failure so user doesn't lose data
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 qless-fade-in text-xs">
      {/* ── HEADER BANNER ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F2044] text-lg text-white shadow-xs">
            📥
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-base font-extrabold text-[#0F2044]">
                Smart Stock Import &amp; Receiving
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                Authorized Admin
              </span>
            </div>
            <p className="text-[11px] text-[#7A8493] mt-0.5">
              Rapid barcode intake for {storeName} ({storeCode} • {branchName}). Scan barcodes to receive stock or register new items.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[10px] font-bold text-blue-700 flex items-center gap-1.5 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span>⚡ USB Scanner Active</span>
          </span>
        </div>
      </div>

      {/* ── TOAST / STATUS NOTICES ── */}
      {statusNotice && (
        <div
          className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
            statusNotice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : statusNotice.type === "error"
              ? "border-red-200 bg-red-50 text-red-950"
              : statusNotice.type === "info"
              ? "border-blue-200 bg-blue-50 text-blue-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>
              {statusNotice.type === "success"
                ? "✅"
                : statusNotice.type === "error"
                ? "❌"
                : statusNotice.type === "info"
                ? "📋"
                : "⚠️"}
            </span>
            <span className="font-medium text-xs">{statusNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[11px] font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── SUBMISSION RESULT BANNER ── */}
      {submitResult && (
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            submitResult.success
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
              : "border-red-200 bg-red-50 text-red-950"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">{submitResult.success ? "🎉" : "❌"}</span>
                <h3 className="font-poppins font-bold text-sm">
                  {submitResult.success
                    ? `Stock Intake Successful (Batch Ref: ${submitResult.batchReference})`
                    : "Stock Intake Failed"}
                </h3>
              </div>
              <p className="text-xs">
                {submitResult.success
                  ? `Successfully received stock for ${submitResult.processedCount} items in Supabase.`
                  : submitResult.error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitResult(null)}
              className="text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>

          {submitResult.success && submitResult.items && submitResult.items.length > 0 && (
            <div className="mt-3 border-t border-emerald-200/80 pt-3">
              <p className="font-bold text-[11px] uppercase tracking-wider mb-2 text-emerald-900">
                Updated Inventory Ledger:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {submitResult.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-emerald-300 bg-white p-2.5 shadow-2xs text-[11px]"
                  >
                    <p className="font-bold text-[#0F2044] truncate">{it.name}</p>
                    <p className="font-mono text-[10px] text-[#7A8493]">{it.barcode}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-[#7A8493]">
                        {it.previousStock} → <strong className="text-emerald-700">{it.newStock} units</strong>
                      </span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                        +{it.quantityReceived}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BARCODE SCANNER & ENTRY CONTROLS ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={manualInputRef}
                id="stock-import-manual-barcode"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcodeInput.trim()) {
                    e.preventDefault();
                    executeLookup(barcodeInput.trim());
                  }
                }}
                placeholder="Scan with USB barcode scanner, or type barcode (e.g. 8904091129461)..."
                className="w-full rounded-xl border border-black/15 bg-white px-3.5 py-2.5 font-mono text-xs font-semibold text-[#0F2044] placeholder:font-sans placeholder:text-[#8A94A3] focus:border-[#2E9E44] focus:outline-hidden focus:ring-2 focus:ring-[#2E9E44]/20 shadow-2xs"
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput("");
                    manualInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8A94A3] hover:text-[#0F2044]"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => executeLookup(barcodeInput)}
              disabled={isSearching || !barcodeInput.trim()}
              className="rounded-xl bg-[#0F2044] px-4 py-2.5 font-poppins text-xs font-bold text-white hover:bg-[#1A3366] transition active:scale-95 shadow-xs disabled:opacity-40 shrink-0"
            >
              {isSearching ? "Searching..." : "Lookup Barcode"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isCameraActive ? stopCamera : startCamera}
              className={`rounded-xl px-4 py-2.5 font-poppins text-xs font-bold transition active:scale-95 shadow-xs shrink-0 flex items-center gap-1.5 ${
                isCameraActive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              <span>{isCameraActive ? "⏹️ Close Camera" : "📷 Open Camera Scanner"}</span>
            </button>

            <label className="flex items-center gap-1.5 text-[11px] text-[#7A8493] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFocusInput}
                onChange={(e) => setAutoFocusInput(e.target.checked)}
                className="rounded border-gray-300 text-[#2E9E44] focus:ring-[#2E9E44]"
              />
              <span>Auto-Focus for USB Gun</span>
            </label>
          </div>
        </div>

        {/* Camera Viewport Container */}
        {isCameraActive && (
          <div className="rounded-2xl border-2 border-[#2E9E44]/70 bg-black/95 p-4 shadow-md qless-fade-in space-y-3">
            <div className="flex items-center justify-between text-white text-xs">
              <span className="font-bold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Active Stock Intake Camera Scanner</span>
              </span>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-xl bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25 transition"
              >
                Close Camera
              </button>
            </div>
            <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-2xl bg-black min-h-[340px] sm:min-h-[420px] shadow-lg flex flex-col justify-center">
              <div
                id={cameraContainerId}
                className="w-full min-h-[340px] sm:min-h-[420px]"
              />

              {/* Viewfinder corner brackets */}
              <div
                className="pointer-events-none absolute inset-6 sm:inset-10 qless-corner-pulse z-10 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="relative w-full h-full max-w-[360px] max-h-[220px] rounded-2xl border border-white/20">
                  <span className="absolute -left-1 -top-1 h-8 w-8 sm:h-10 sm:w-10 rounded-tl-xl border-l-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -right-1 -top-1 h-8 w-8 sm:h-10 sm:w-10 rounded-tr-xl border-r-[3.5px] border-t-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -left-1 h-8 w-8 sm:h-10 sm:w-10 rounded-bl-xl border-b-[3.5px] border-l-[3.5px] border-[#2E9E44]" />
                  <span className="absolute -bottom-1 -right-1 h-8 w-8 sm:h-10 sm:w-10 rounded-br-xl border-b-[3.5px] border-r-[3.5px] border-[#2E9E44]" />
                </div>
              </div>

              {/* Laser beam */}
              <div
                className="pointer-events-none absolute left-6 right-6 h-0.5 rounded-full qless-beam z-10"
                style={{
                  background: "linear-gradient(90deg, transparent, #2E9E44, transparent)",
                  boxShadow: "0 0 10px 2px rgba(46,158,68,0.5)",
                }}
                aria-hidden="true"
              />

              {/* Guidance pill */}
              <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none z-10 px-4">
                <span className="inline-block rounded-xl bg-black/80 px-3 py-1 text-xs font-semibold text-white border border-white/10 shadow-sm">
                  Align product barcode inside viewfinder
                </span>
              </div>
            </div>
            {cameraError && (
              <p className="mt-2 text-center text-xs font-semibold text-red-400">
                Camera Error: {cameraError}
              </p>
            )}
          </div>
        )}

        {/* Lookup Error Banner */}
        {lookupError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 flex items-center justify-between">
            <span>{lookupError}</span>
            <button
              type="button"
              onClick={() => setLookupError(null)}
              className="text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── ACTIVE LOOKUP RESULT WORKFLOW ── */}
      {activeLookup && (
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-4 qless-fade-in">
          {/* CASE A: Product exists in Store Inventory */}
          {activeLookup.status === "STORE_ITEM" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-black/5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-black/5">
                    <ProductImage
                      src={activeLookup.product.imageUrl}
                      alt={activeLookup.product.name}
                      fallbackEmoji={activeLookup.product.emoji || "🛍️"}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        STORE ITEM VERIFIED
                      </span>
                      <span className="font-mono text-xs text-[#7A8493]">
                        {activeLookup.product.barcode}
                      </span>
                    </div>
                    <h3 className="font-poppins text-base font-extrabold text-[#0F2044] mt-0.5">
                      {activeLookup.product.name}
                    </h3>
                    <p className="text-xs text-[#7A8493]">
                      Brand: <strong className="text-[#0F2044]">{activeLookup.product.brand}</strong> • Category: <strong className="text-[#0F2044]">{activeLookup.product.category}</strong> • Size: <strong className="text-[#0F2044]">{activeLookup.product.unitSize}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-poppins text-sm font-extrabold text-[#0F2044]">
                    {fmt(activeLookup.inventory.price)}
                  </p>
                  <p className="text-[11px] text-[#7A8493] line-through">
                    MRP {fmt(activeLookup.inventory.mrp)}
                  </p>
                </div>
              </div>

              {/* Stock Intake Projection Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-[#F9FAFB] p-3.5 rounded-xl border border-black/5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                    Current Authoritative Stock
                  </span>
                  <p className="font-poppins text-lg font-extrabold text-[#0F2044]">
                    {activeLookup.inventory.currentStock} units
                  </p>
                  <p className="text-[10px] text-[#7A8493]">
                    In store {storeId} ({activeLookup.inventory.isAvailable ? "Available" : "Unavailable"})
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                    Quantity Received
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLookupQuantity((q) => Math.max(1, q - 1))}
                      className="h-8 w-8 rounded-lg bg-white border border-black/10 font-bold hover:bg-gray-100 flex items-center justify-center text-sm"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={lookupQuantity}
                      onChange={(e) => setLookupQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-8 w-20 text-center font-bold text-sm rounded-lg border border-black/15 bg-white text-[#0F2044]"
                    />
                    <button
                      type="button"
                      onClick={() => setLookupQuantity((q) => q + 1)}
                      className="h-8 w-8 rounded-lg bg-white border border-black/10 font-bold hover:bg-gray-100 flex items-center justify-center text-sm"
                    >
                      +
                    </button>

                    <div className="flex gap-1 ml-1">
                      {[5, 10, 25, 50].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => setLookupQuantity((q) => q + inc)}
                          className="rounded bg-white border border-black/10 px-2 py-1 text-[10px] font-bold hover:bg-emerald-50 text-[#0F2044]"
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Projected Stock After Batch
                  </span>
                  <p className="font-poppins text-lg font-extrabold text-emerald-800">
                    {activeLookup.inventory.currentStock + lookupQuantity} units
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    +{lookupQuantity} added without overwriting
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLookup(null);
                    setBarcodeInput("");
                  }}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddStoreItemToBatch}
                  className="rounded-xl bg-[#2E9E44] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#288B3B] transition active:scale-95 shadow-xs flex items-center gap-1.5"
                >
                  <span>📥 Add to Receiving List (+{lookupQuantity} units)</span>
                </button>
              </div>
            </div>
          )}

          {/* CASE B: Barcode is Unknown in Database - Online Product Image Discovery Workflow */}
          {activeLookup.status === "UNKNOWN_BARCODE" && (
            <div className="space-y-4">
              {/* State 1: Online Discovery in progress */}
              {isDiscovering && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 text-center space-y-3 qless-fade-in">
                  <div className="inline-block animate-spin text-3xl">🔍</div>
                  <h4 className="font-poppins font-bold text-sm text-[#0F2044]">
                    Searching Online Product Catalogs...
                  </h4>
                  <p className="text-xs text-[#7A8493] max-w-md mx-auto">
                    Looking up barcode <span className="font-mono font-bold text-[#0F2044]">{activeLookup.barcode}</span> in Open Food Facts and verified open product databases...
                  </p>
                </div>
              )}

              {/* State 2: Discovery complete, awaiting Store Admin verification */}
              {!isDiscovering && !isCandidateConfirmed && discoveredCandidate && (
                <div className="rounded-2xl border-2 border-emerald-400 bg-white p-5 shadow-sm space-y-4 qless-fade-in">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-black/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <h4 className="font-poppins font-bold text-sm text-[#0F2044]">
                        Online Product Candidate Discovered
                      </h4>
                    </div>
                    <div>
                      {discoveredCandidate.matchType === "EXACT_BARCODE" ? (
                        <span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1 shadow-2xs">
                          <span>🎯</span> Exact Barcode Match
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1 shadow-2xs">
                          <span>⚠️</span> Unverified Suggestion — Confirm Carefully
                        </span>
                      )}
                    </div>
                  </div>

                  {discoveredCandidate.matchType !== "EXACT_BARCODE" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <strong>Attention Store Admin:</strong> The external catalog returned a candidate for barcode <code className="font-mono">{activeLookup.barcode}</code>. Because it is an unverified suggestion, please verify that this image and product match your physical stock before accepting.
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 py-2">
                    {/* Large Product Image Preview */}
                    <div className="h-52 w-52 rounded-2xl overflow-hidden bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0 p-2 shadow-inner">
                      <ProductImage
                        src={candidateImageUrl}
                        alt={discoveredCandidate.name}
                        fallbackEmoji="🛍️"
                        className="h-full w-full object-contain"
                      />
                    </div>

                    {/* Candidate Details */}
                    <div className="flex-1 space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                          Product Name
                        </span>
                        <p className="font-poppins text-base font-extrabold text-[#0F2044]">
                          {discoveredCandidate.name}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Brand
                          </span>
                          <p className="font-semibold text-[#0F2044]">{discoveredCandidate.brand || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Size / Net Qty
                          </span>
                          <p className="font-semibold text-[#0F2044]">{discoveredCandidate.unitSize || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Scanned Barcode
                          </span>
                          <p className="font-mono font-semibold text-[#0F2044]">{discoveredCandidate.barcode}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Data Source
                          </span>
                          <p className="text-[#0F2044] font-medium flex items-center gap-1">
                            <span>🌐</span> {discoveredCandidate.source}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Image Status
                          </span>
                          <p className="text-[#0F2044] font-medium">
                            {candidateImageUrl ? "✅ Discovered via Open Catalog" : "⚠️ No Online Image (Can Upload Photo)"}
                          </p>
                        </div>
                      </div>

                      {discoveredCandidate.description && (
                        <div className="pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                            Description
                          </span>
                          <p className="text-[#7A8493] line-clamp-2 text-[11px]">
                            {discoveredCandidate.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Three Actions: A, B, C */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-black/5">
                    <div className="flex items-center gap-2">
                      {/* Action B: Search Again */}
                      <button
                        type="button"
                        id="btn-discovery-search-again"
                        onClick={handleSearchAgain}
                        className="rounded-xl border border-black/15 bg-white px-3.5 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95 shadow-2xs flex items-center gap-1.5"
                      >
                        <span>🔄</span>
                        <span>SEARCH AGAIN</span>
                      </button>

                      {/* Action C: Upload Photo */}
                      <button
                        type="button"
                        id="btn-discovery-upload-photo"
                        onClick={handleOpenPhotoUpload}
                        className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 font-poppins text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition active:scale-95 shadow-2xs flex items-center gap-1.5"
                      >
                        <span>📷</span>
                        <span>UPLOAD PHOTO</span>
                      </button>
                    </div>

                    {/* Action A: Yes, This is the Correct Product */}
                    <button
                      type="button"
                      id="btn-discovery-confirm"
                      onClick={handleConfirmDiscoveredCandidate}
                      className="rounded-xl bg-[#2E9E44] px-5 py-2.5 font-poppins text-xs font-extrabold text-white hover:bg-[#288B3B] transition active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                    >
                      <span>✅</span>
                      <span>YES, THIS IS THE CORRECT PRODUCT</span>
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: Discovery found no match or encountered error, awaiting admin decision */}
              {!isDiscovering && !isCandidateConfirmed && !discoveredCandidate && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 space-y-4 qless-fade-in">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="space-y-1">
                      <h4 className="font-poppins font-bold text-xs text-amber-950">
                        No Online Catalog Match Found for Barcode <span className="font-mono">{activeLookup.barcode}</span>
                      </h4>
                      <p className="text-[11px] text-amber-800">
                        {discoveryError || "The product was not found in Open Food Facts or secondary open product registries."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={handleSearchAgain}
                      className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 font-poppins text-xs font-bold text-amber-950 hover:bg-amber-100/50 transition active:scale-95 shadow-2xs flex items-center gap-1.5"
                    >
                      <span>🔄</span>
                      <span>SEARCH AGAIN</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenPhotoUpload}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 font-poppins text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition active:scale-95 shadow-2xs flex items-center gap-1.5"
                    >
                      <span>📷</span>
                      <span>UPLOAD PHOTO</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsCandidateConfirmed(true);
                        setStatusNotice({
                          type: "info",
                          message: "Please enter product details, pricing, and initial stock manually.",
                        });
                      }}
                      className="rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-bold text-white hover:bg-[#1A3366] transition active:scale-95 shadow-xs flex items-center gap-1.5"
                    >
                      <span>✏️</span>
                      <span>ENTER DETAILS MANUALLY</span>
                    </button>
                  </div>
                </div>
              )}

              {/* State 4: Candidate confirmed (or manual entry selected), Registration Form rendered */}
              {!isDiscovering && isCandidateConfirmed && (
                <div className="space-y-4 qless-fade-in">
                  {/* Confirmed Candidate Preview Header */}
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl overflow-hidden bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                        <ProductImage
                          src={candidateImageUrl}
                          alt={regName || "Candidate"}
                          fallbackEmoji={regEmoji || "🛍️"}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                            CONFIRMED CANDIDATE
                          </span>
                          <span className="text-[10px] text-[#7A8493]">
                            Source: <strong>{candidateImageSource}</strong>
                          </span>
                        </div>
                        <p className="font-poppins font-bold text-xs text-[#0F2044]">
                          {regName || "New Product"} {regBrand ? `(${regBrand})` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenPhotoUpload}
                        className="text-[11px] font-bold text-indigo-700 hover:underline flex items-center gap-1"
                      >
                        <span>📷</span>
                        <span>{candidateImageUrl ? "Replace Photo" : "Attach Photo"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCandidateConfirmed(false)}
                        className="text-[11px] font-bold text-[#7A8493] hover:text-[#0F2044]"
                      >
                        Re-verify
                      </button>
                    </div>
                  </div>

                  {regError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 text-xs font-medium">
                      {regError}
                    </div>
                  )}

                  {/* Registration Form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Barcode (Locked)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={activeLookup.barcode}
                        className="w-full rounded-xl border border-black/10 bg-gray-100 px-3 py-2 font-mono text-xs font-bold text-[#0F2044]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Product Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Brit Organic Oat Milk"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Brand *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Brit Naturals"
                        value={regBrand}
                        onChange={(e) => setRegBrand(e.target.value)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Category *
                      </label>
                      <select
                        value={regCategory}
                        onChange={(e) => setRegCategory(e.target.value as ProductCategory)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Unit Size *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1L or 500g"
                        value={regUnitSize}
                        onChange={(e) => setRegUnitSize(e.target.value)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Emoji Icon
                      </label>
                      <input
                        type="text"
                        value={regEmoji}
                        onChange={(e) => setRegEmoji(e.target.value)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Selling Price (₹) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 150 (Enter Store Price)"
                        value={regPrice}
                        onChange={(e) => setRegPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        MRP (₹) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 165"
                        value={regMrp}
                        onChange={(e) => setRegMrp(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Initial Stock Received *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={regQuantity}
                        onChange={(e) => setRegQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Optional Description */}
                  {regDescription && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                        Discovered Description (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={regDescription}
                        onChange={(e) => setRegDescription(e.target.value)}
                        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-[#0F2044] focus:border-[#2E9E44] focus:outline-hidden"
                      />
                    </div>
                  )}

                  {/* Optional Location Placement */}
                  <div className="rounded-xl bg-[#F9FAFB] p-3 border border-black/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-2">
                      Store Floor Plan Location (Optional SmartFind Placement)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-[#7A8493] block mb-0.5">Aisle Gondola</label>
                        <select
                          value={regAisle}
                          onChange={(e) => {
                            const a = e.target.value;
                            setRegAisle(a);
                            const found = STORE_AISLES.find((asl) => asl.code === a);
                            setRegRack(found?.racks[0] || "R01");
                          }}
                          className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-[#0F2044]"
                        >
                          <option value="">None (Unassigned)</option>
                          {STORE_AISLES.map((asl) => (
                            <option key={asl.code} value={asl.code}>
                              {asl.code} - {asl.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-[#7A8493] block mb-0.5">Rack Code</label>
                        <input
                          type="text"
                          placeholder="e.g. R01"
                          value={regRack}
                          onChange={(e) => setRegRack(e.target.value)}
                          className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-[#0F2044]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#7A8493] block mb-0.5">Shelf Level</label>
                        <select
                          value={regShelf}
                          onChange={(e) => setRegShelf(e.target.value)}
                          className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-[#0F2044]"
                        >
                          <option value="S1">S1 (Eye-Level / Prime)</option>
                          <option value="S2">S2 (Middle Tier)</option>
                          <option value="S3">S3 (Reach-In Tier)</option>
                          <option value="S4">S4 (Bottom / Bulk)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLookup(null);
                        setDiscoveredCandidate(null);
                        setIsCandidateConfirmed(false);
                        setCandidateImageUrl(null);
                        setCandidateImageSource("Open Food Facts");
                        setBarcodeInput("");
                      }}
                      className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRegisterNewProduct}
                      className="rounded-xl bg-[#0F2044] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#1A3366] transition active:scale-95 shadow-xs"
                    >
                      Add to Receiving List (Stage for Registration • {regQuantity} units)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CASE C: Barcode exists in Master Catalog, but not associated with STORE001 */}
          {activeLookup.status === "MASTER_ONLY" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 flex items-start gap-3">
                <span className="text-xl">ℹ️</span>
                <div>
                  <h4 className="font-poppins font-bold text-xs text-indigo-950">
                    Product In Master Catalog: <span className="font-mono">{activeLookup.product.barcode}</span>
                  </h4>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    This product is registered in the master catalog ({activeLookup.product.name}), but has not yet been assigned to {storeName} ({storeId}). Associate it now to stock it at this branch.
                  </p>
                </div>
              </div>

              {assocError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 text-xs font-medium">
                  {assocError}
                </div>
              )}

              <div className="p-3 bg-white rounded-xl border border-black/5 flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-black/5">
                  <ProductImage
                    src={activeLookup.product.imageUrl}
                    alt={activeLookup.product.name}
                    fallbackEmoji={activeLookup.product.emoji || "🛍️"}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <p className="font-bold text-[#0F2044]">{activeLookup.product.name}</p>
                  <p className="text-[11px] text-[#7A8493]">
                    Brand: {activeLookup.product.brand} • Category: {activeLookup.product.category} • Size: {activeLookup.product.unitSize}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                    Store Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assocPrice}
                    onChange={(e) => setAssocPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                    Store MRP (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assocMrp}
                    onChange={(e) => setAssocMrp(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
                    Quantity Received *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assocQuantity}
                    onChange={(e) => setAssocQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLookup(null);
                    setBarcodeInput("");
                  }}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssociateProduct}
                  className="rounded-xl bg-indigo-700 px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-indigo-800 transition active:scale-95 shadow-xs"
                >
                  Add to Receiving List (Stage for Association • {assocQuantity} units)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BATCH RECEIVING LIST TABLE ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-black/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
              Batch Receiving List ({batchItems.length} SKUs staged)
            </h3>
            {batchItems.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                Ready to commit
              </span>
            )}
          </div>

          {batchItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearBatch}
                className="text-[11px] font-semibold text-red-600 hover:underline"
              >
                Clear List
              </button>
            </div>
          )}
        </div>

        {batchItems.length === 0 ? (
          <div className="p-8 text-center text-[#7A8493] space-y-2">
            <span className="text-3xl block">📦</span>
            <p className="font-semibold text-xs text-[#0F2044]">Receiving list is currently empty</p>
            <p className="text-[11px] max-w-md mx-auto">
              Scan product barcodes using your USB handheld scanner, camera, or manual input box above to stage items into this intake batch.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                    <th className="pb-2">Product Name</th>
                    <th className="pb-2">Barcode</th>
                    <th className="pb-2 text-center">Current Stock</th>
                    <th className="pb-2 text-center">Qty Received</th>
                    <th className="pb-2 text-center">Projected Stock</th>
                    <th className="pb-2 text-right">Selling Price</th>
                    <th className="pb-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {batchItems.map((item) => {
                    const isFlashed = item.barcode === recentFlashBarcode;
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isFlashed ? "bg-amber-100/70 font-semibold" : "hover:bg-[#F9FAFB]"
                        }`}
                      >
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-black/5">
                              <ProductImage
                                src={item.imageUrl}
                                alt={item.name}
                                fallbackEmoji={item.emoji || "🛍️"}
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-[#7A8493]">
                                <span>{item.brand}</span>
                                <span>•</span>
                                <span className="rounded bg-gray-100 px-1 py-0.2 text-[9px] font-mono">
                                  {item.status === "EXISTING_ITEM"
                                    ? "EXISTING"
                                    : item.status === "NEW_REGISTRATION"
                                    ? "NEW SKU"
                                    : "ASSOCIATION"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 font-mono text-[11px] text-[#7A8493]">
                          {item.barcode}
                        </td>

                        <td className="py-2.5 text-center font-bold text-[#0F2044]">
                          {item.currentStock}
                        </td>

                        <td className="py-2.5 text-center">
                          <div className="inline-flex items-center gap-1 bg-white border border-black/10 rounded-lg p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQuantity(item.id, -1)}
                              className="h-6 w-6 rounded hover:bg-gray-100 font-bold text-xs"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantityReceived}
                              onChange={(e) =>
                                handleSetItemQuantity(item.id, parseInt(e.target.value) || 1)
                              }
                              className="w-12 text-center font-bold text-xs border-0 p-0 text-[#0F2044] focus:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQuantity(item.id, 1)}
                              className="h-6 w-6 rounded hover:bg-gray-100 font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 text-center">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                            {item.projectedStock} units
                          </span>
                        </td>

                        <td className="py-2.5 text-right font-semibold text-[#0F2044]">
                          {fmt(item.price)}
                        </td>

                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFromBatch(item.id)}
                            className="rounded p-1 text-[#8A94A3] hover:text-red-600 transition"
                            title="Remove item from batch"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Batch Metrics Summary Box */}
            <div className="rounded-xl bg-[#F9FAFB] border border-black/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="grid grid-cols-3 gap-6 text-left">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                    Total SKUs
                  </span>
                  <p className="font-poppins text-base font-extrabold text-[#0F2044]">
                    {batchSummary.skuCount} items
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                    Total Units
                  </span>
                  <p className="font-poppins text-base font-extrabold text-[#2E9E44]">
                    +{batchSummary.totalUnits} units
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                    Estimated Intake Value
                  </span>
                  <p className="font-poppins text-base font-extrabold text-[#0F2044]">
                    {fmt(batchSummary.totalValue)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                className="w-full sm:w-auto rounded-xl bg-[#2E9E44] px-6 py-3 font-poppins text-xs font-extrabold text-white hover:bg-[#288B3B] transition active:scale-95 shadow-md flex items-center justify-center gap-2"
              >
                <span>📦 Confirm &amp; Receive Stock ({batchSummary.totalUnits} Units)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CONFIRMATION MODAL ── */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl border border-black/10 space-y-4 qless-fade-in">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📥</span>
                <h3 className="font-poppins text-sm font-extrabold text-[#0F2044]">
                  Confirm Batch Stock Receiving
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="text-xs font-bold text-[#8A94A3] hover:text-[#0F2044]"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-950 space-y-1">
              <p className="font-bold">
                Store Destination: {storeName} ({storeId} • {branchName})
              </p>
              <p className="text-[11px] text-emerald-800">
                You are about to receive <strong>{batchSummary.totalUnits} units</strong> across{" "}
                <strong>{batchSummary.skuCount} products</strong>.
              </p>
              <p className="text-[10px] text-emerald-700 font-mono">
                Existing stock will NOT be overwritten. Intake quantities will be atomically added to current store inventory.
              </p>
            </div>

            {/* Item Preview List */}
            <div className="max-h-52 overflow-y-auto divide-y divide-black/5 border border-black/5 rounded-xl p-2 text-xs">
              {batchItems.map((it) => (
                <div key={it.id} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <div className="h-8 w-8 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0 border border-black/5">
                      <ProductImage
                        src={it.imageUrl}
                        alt={it.name}
                        fallbackEmoji={it.emoji || "🛍️"}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#0F2044] truncate">{it.name}</p>
                      <p className="text-[10px] font-mono text-[#7A8493]">{it.barcode}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-[#0F2044]">
                      {it.currentStock} + {it.quantityReceived} ={" "}
                      <strong className="text-emerald-700">{it.projectedStock} units</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
              >
                Review Items
              </button>
              <button
                type="button"
                onClick={handleSubmitBatch}
                disabled={isSubmitting}
                className="rounded-xl bg-[#2E9E44] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#288B3B] transition active:scale-95 shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin inline-block">⏳</span>
                    <span>Processing Intake...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm &amp; Receive ({batchSummary.totalUnits} units)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── PHOTO UPLOAD MODAL ── */}
      {isPhotoUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-black/10 space-y-4 qless-fade-in">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📷</span>
                <h3 className="font-poppins text-sm font-extrabold text-[#0F2044]">
                  Upload Product Photo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoUploadModalOpen(false)}
                disabled={isUploadingPhoto}
                className="text-xs font-bold text-[#8A94A3] hover:text-[#0F2044]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-[#7A8493]">
                Upload a clear photo of the physical product packaging for barcode{" "}
                <span className="font-mono font-bold text-[#0F2044]">
                  {activeLookup && "barcode" in activeLookup
                    ? activeLookup.barcode
                    : activeLookup?.status === "STORE_ITEM" || activeLookup?.status === "MASTER_ONLY"
                    ? activeLookup.product.barcode
                    : barcodeInput.trim() || "Item"}
                </span>
                .
              </p>

              {/* Upload Drop Zone / Picker */}
              <div className="rounded-2xl border-2 border-dashed border-gray-300 p-4 text-center hover:border-[#2E9E44] transition bg-gray-50/50">
                <input
                  type="file"
                  id="admin-stock-photo-upload-input"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoFileChange}
                  className="hidden"
                />
                {photoPreviewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={photoPreviewUrl}
                      alt="Selected preview"
                      className="h-40 w-auto max-w-full mx-auto object-contain rounded-xl border border-black/10 shadow-xs"
                    />
                    <label
                      htmlFor="admin-stock-photo-upload-input"
                      className="cursor-pointer text-[11px] font-bold text-indigo-600 hover:underline inline-block"
                    >
                      Choose Different Photo
                    </label>
                  </div>
                ) : (
                  <label
                    htmlFor="admin-stock-photo-upload-input"
                    className="cursor-pointer block space-y-1.5 py-4"
                  >
                    <span className="text-3xl block">📸</span>
                    <span className="font-poppins text-xs font-bold text-[#0F2044] block">
                      Click to Browse Photo
                    </span>
                    <span className="text-[10px] text-[#8A94A3] block">
                      JPEG, PNG, or WebP • Max 5MB
                    </span>
                  </label>
                )}
              </div>

              {photoUploadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-900 font-medium">
                  {photoUploadError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5">
              <button
                type="button"
                onClick={() => setIsPhotoUploadModalOpen(false)}
                disabled={isUploadingPhoto}
                className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-bold text-[#0F2044] hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-photo-upload"
                onClick={handleConfirmPhotoUpload}
                disabled={!selectedPhotoFile || isUploadingPhoto}
                className="rounded-xl bg-[#0F2044] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#1A3366] transition active:scale-95 shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isUploadingPhoto ? (
                  <>
                    <span className="animate-spin inline-block">⏳</span>
                    <span>Validating &amp; Uploading...</span>
                  </>
                ) : (
                  <>
                    <span>Attach Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
