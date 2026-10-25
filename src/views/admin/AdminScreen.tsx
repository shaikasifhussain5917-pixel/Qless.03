import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShopping } from "../../context/ShoppingContext";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { AdminTab, Product } from "../../types";
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
  const navigate = useNavigate();
  const { selectedStore, orderHistory } = useShopping();

  // Active navigation tab
  const [currentTab, setCurrentTab] = useState<AdminTab>("overview");

  // Persistent product catalog state
  const [catalog, setCatalog] = useState<Product[]>(() => getProductCatalog());

  // Persistent verification logs state
  const [verificationLogs, setVerificationLogs] = useState(() => getVerificationLogs());

  // Add Product modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);



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

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[1140px]"
      onBack={() => navigate("/auth/role")}
      backLabel="Exit Admin Portal"
    >
      <div className="flex flex-1 flex-col qless-fade-in pb-12 w-full space-y-4">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-black/5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F2044] text-white text-xs font-bold">
                Q
              </span>
              <h1 className="font-poppins text-lg sm:text-xl font-extrabold tracking-tight text-[#0F2044]">
                Supermarket Admin Portal
              </h1>
            </div>
            <p className="text-xs text-[#7A8493] mt-0.5">
              Enterprise management dashboard for {selectedStore?.name || "Store"} ({selectedStore?.branch || "Indiranagar"})
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-[#2E9E44]">
              ● POS ONLINE (DEMO)
            </span>
          </div>
        </div>

        {/* Main Dashboard Layout: Sidebar + Active Module Tab */}
        <div className="flex flex-col lg:flex-row items-start gap-4 w-full">
          {/* Responsive Sidebar */}
          <AdminSidebar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            selectedStore={selectedStore}
            lowStockCount={lowStockCount}
            totalOrdersCount={orderHistory.length}
            unresolvedDiscrepanciesCount={unresolvedDiscrepanciesCount}
          />

          {/* Active Module Content Area */}
          <main className="flex-1 w-full min-w-0">
            {currentTab === "overview" && (
              <AdminOverviewTab
                storeId={selectedStore?.id || "STORE001"}
                catalog={catalog}
                orderHistory={orderHistory}
                verificationLogs={verificationLogs}
                selectedStore={selectedStore}
                onNavigateTab={(tab) => setCurrentTab(tab)}
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
              />
            )}

            {currentTab === "locations" && (
              <AdminLocationsTab
                catalog={catalog}
                storeId={selectedStore?.id || "STORE001"}
              />
            )}

            {currentTab === "transactions" && (
              <AdminTransactionsTab
                storeId={selectedStore?.id || "STORE001"}
                orderHistory={orderHistory}
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
          </main>
        </div>
      </div>
    </CustomerLayout>
  );
}
