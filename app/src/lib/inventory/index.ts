/**
 * Inventory & POS Module
 * Epic 17: Inventory & POS
 *
 * Exports all inventory-related services and types.
 */

// Types
export * from './types';

// Product & Category Service
export {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getProductByBarcode,
  listProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  listCategoriesTree,
  listCategories,
  generateSku,
  generateSlug,
} from './product-service';

// Inventory Tracker
export {
  getProductStockLevels,
  getStockAtLocation,
  getAllStockLevels,
  adjustStock,
  transferStock,
  recordPurchase,
  recordSale,
  reverseSale,
  getMovementHistory,
} from './inventory-tracker';

// Barcode Utilities
export {
  validateBarcode,
  lookupBarcode,
  generateInternalBarcode,
  generateUPCA,
  calculateUPCACheckDigit,
  formatBarcodeForDisplay,
  parseBarcodeInput,
} from './barcode';

// Alert Service
export {
  getLowStockAlerts,
  getActiveAlertCount,
  getAlertsByProduct,
  acknowledgeAlert,
  ignoreAlert,
  resolveAlert,
  bulkAcknowledgeAlerts,
  generateLowStockAlerts,
  getAlertSummary,
} from './alerts';

// POS Service
export {
  createSale,
  completeSale,
  voidSale,
  getSale,
  listSales,
  buildCart,
  getSalesReportSummary,
  getProductSalesReport,
  getDailySalesReport,
  getTodaysSalesSummary,
} from './pos';

// Vendor Service
export {
  createVendor,
  updateVendor,
  deleteVendor,
  getVendor,
  listVendors,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  receivePurchaseOrderItems,
  cancelPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  getVendorProductInfo,
  linkProductToVendor,
  unlinkProductFromVendor,
} from './vendor-service';
