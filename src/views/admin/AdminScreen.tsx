import { useState, useMemo } from "react";
import { useShopping } from "../../context/ShoppingContext";
import { AdminTab, Product, StockFilter } from "../../types";
import {
  addProduct,
  deleteProduct,
  getProductCatalog,
  updateProduct,
} from "../../utils/productStorage";
import {
  clearVerificationLogs,
  getVerificationLogs,
} from "../../utils/securityStorage";
import { AdminTopNav } from "../../components/admin/AdminTopNav";
import { AdminSidebar } from "../../components/admin/AdminSidebar";
import { AdminOverviewTab } from "../../components/admin/AdminOverviewTab";
import { AdminProductsTab } from "../../components/admin/AdminProductsTab";
import { AdminInventoryTab } from "../../components/admin/AdminInventoryTab";
import { AdminLocationsTab } from "../../components/admin/AdminLocationsTab";
import { AdminTransactionsTab } from "../../components/admin/AdminTransactionsTab";
import { AdminSecurityTab } from "../../components/admin/AdminSecurityTab";
import { AdminGateQRTab } from "../../components/admin/AdminGateQRTab";
import { AdminStockImportTab } from "../../components/admin/AdminStockImportTab";

export function AdminScreen() {
  const { selectedStore, orderHistory } = useShopping();

  // Active navigation tab
  const [currentTab, setCurrentTab] = useState<AdminTab>("overview");

  // Filter persistence across tab transitions
  const [inventoryFilter, setInventoryFilter] = useState<StockFilter>("all");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState<string>("all");

  const handleNavigateTab = (
    tab: AdminTab,
    options?: { stockFilter?: StockFilter; orderStatusFilter?: string }
  ) => {
    if (options?.stockFilter) {
      setInventoryFilter(options.stockFilter);
    } else if (tab === "inventory") {
      setInventoryFilter("all");
    }

    if (options?.orderStatusFilter) {
      setTransactionStatusFilter(options.orderStatusFilter);
    } else if (tab === "transactions") {
      setTransactionStatusFilter("all");
    }

    setCurrentTab(tab);
  };

  // Persistent product catalog state
  const [catalog, setCatalog] = useState<Product[]>(() => getProductCatalog());

  // Persistent verification logs state
  const [verificationLogs, setVerificationLogs] = useState(() => getVerificationLogs());

  // Add Product modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Mobile drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);



  // Synchronize on catalog mutations
  const handleAddProduct = (data: Omit<Product, "id"> & { id?: number }) => {
    const res = addProduct(data);
    if (res.success && res.product) {
      setCatalog(getProductCatalog());
    }
    return res;
  };

  const handleUpdateProduct = (id: number, updates: Partial<Product>) => {
    const res = updateProduct(id, updates);
    if (res.success && res.product) {
      setCatalog(getProductCatalog());
    }
    return res;
  };

  const handleDeleteProduct = (id: number) => {
    const res = deleteProduct(id);
    if (res.success) {
      setCatalog(getProductCatalog());
    }
    return res;
  };




  const handleClearSecurityLogs = () => {
    clearVerificationLogs();
    setVerificationLogs([]);
  };

  // Summary counts for badges
  const lowStockCount = useMemo(() => {
    return catalog.filter((p) => (p.stockQuantity ?? 25) <= 10).length;
  }, [catalog]);

  const unresolvedDiscrepanciesCount = useMemo(() => {
    return verificationLogs.filter((v) => v.hasDiscrepancy).length;
  }, [verificationLogs]);

  // Pending orders count from active state for badge
  const pendingOrdersCount = useMemo(() => {
    return orderHistory.filter((o) => (o.paymentStatus || "PENDING").toUpperCase() === "PENDING").length;
  }, [orderHistory]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50/70 text-[#0F2044] antialiased flex flex-col lg:flex-row">
      {/* Left Column: Fixed Sidebar on Desktop & Mobile Drawer */}
      <AdminSidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          handleNavigateTab(tab);
          setIsMobileSidebarOpen(false);
        }}
        selectedStore={selectedStore}
        lowStockCount={lowStockCount}
        totalOrdersCount={orderHistory.length}
        unresolvedDiscrepanciesCount={unresolvedDiscrepanciesCount}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Right Column: TopNav + Independent Scrollable Content */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        <div className="p-3 sm:p-5 pb-0 shrink-0 relative z-30">
          <AdminTopNav
            currentTab={currentTab}
            selectedStore={selectedStore}
            lowStockCount={lowStockCount}
            pendingOrdersCount={pendingOrdersCount}
            onRefresh={() => {
              setCatalog(getProductCatalog());
              setVerificationLogs(getVerificationLogs());
            }}
            onSearch={(query) => {
              if (query.trim() && currentTab !== "products") {
                setCurrentTab("products");
              }
            }}
            onNavigateTab={(tab) => handleNavigateTab(tab)}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          />
        </div>

        {/* Scrollable Content Workspace */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 pt-3 w-full">
          <div className="max-w-[1400px] mx-auto pb-12">
            {currentTab === "overview" && (
              <AdminOverviewTab
                storeId={selectedStore?.id || "STORE001"}
                catalog={catalog}
                orderHistory={orderHistory}
                verificationLogs={verificationLogs}
                selectedStore={selectedStore}
                onNavigateTab={handleNavigateTab}
                onOpenAddProductModal={() => {
                  setCurrentTab("products");
                  setIsAddModalOpen(true);
                }}
              />
            )}

            {currentTab === "products" && (
              <AdminProductsTab
                storeId={selectedStore?.id || "STORE001"}
                catalog={catalog}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                isAddModalOpen={isAddModalOpen}
                onOpenAddModal={() => setIsAddModalOpen(true)}
                onCloseAddModal={() => setIsAddModalOpen(false)}
              />
            )}

            {currentTab === "inventory" && (
              <AdminInventoryTab
                storeId={selectedStore?.id || "STORE001"}
                initialStockFilter={inventoryFilter}
                onReturnToDashboard={() => setCurrentTab("overview")}
              />
            )}

            {currentTab === "locations" && (
              <AdminLocationsTab
                catalog={catalog}
                storeId={selectedStore?.id || "STORE001"}
                onReturnToDashboard={() => setCurrentTab("overview")}
              />
            )}

            {currentTab === "transactions" && (
              <AdminTransactionsTab
                storeId={selectedStore?.id || "STORE001"}
                orderHistory={orderHistory}
                initialStatusFilter={transactionStatusFilter}
                onReturnToDashboard={() => setCurrentTab("overview")}
              />
            )}

            {currentTab === "security" && (
              <AdminSecurityTab
                storeId={selectedStore?.id || "STORE001"}
                verificationLogs={verificationLogs}
                onClearLogs={handleClearSecurityLogs}
              />
            )}

            {currentTab === "gate-qr" && (
              <AdminGateQRTab
                storeId={selectedStore?.id || "STORE001"}
              />
            )}

            {currentTab === "stock-import" && (
              <AdminStockImportTab
                storeId={selectedStore?.id || "STORE001"}
                storeCode={selectedStore?.code || "QLM001"}
                storeName={selectedStore?.name || "QLess Mart"}
                branchName={selectedStore?.branch || "HSR Layout Flagship"}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
