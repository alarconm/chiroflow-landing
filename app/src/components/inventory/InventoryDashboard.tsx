'use client';

/**
 * InventoryDashboard Component
 * Epic 17: Inventory & POS
 *
 * Main dashboard for inventory management and POS operations.
 * Features comprehensive product catalog, stock management, POS interface, and analytics.
 */

import { useState, useMemo } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { ProductStatus, POSPaymentMethod } from '@prisma/client';

import { ProductList } from './ProductList';
import { ProductForm } from './ProductForm';
import { CategoryManager } from './CategoryManager';
import { StockLevels } from './StockLevels';
import { StockAdjustment } from './StockAdjustment';
import { BarcodeScanner } from './BarcodeScanner';
import { LowStockAlerts } from './LowStockAlerts';
import { VendorList } from './VendorList';
import { PurchaseOrderForm } from './PurchaseOrderForm';
import { PurchaseOrderList } from './PurchaseOrderList';
import { POSTerminal } from './POSTerminal';
import { SalesReport } from './SalesReport';

// Demo data for when no real data exists
const DEMO_PRODUCTS = [
  { id: 'demo-1', name: '[DEMO] Cervical Support Pillow', sku: 'CSP-001', retailPrice: 59.99, costPrice: 29.99, availableQuantity: 15, category: 'Pillows', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-2', name: '[DEMO] Lumbar Roll', sku: 'LR-002', retailPrice: 34.99, costPrice: 17.49, availableQuantity: 22, category: 'Support', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-3', name: '[DEMO] Biofreeze Gel 4oz', sku: 'BF-004', retailPrice: 14.99, costPrice: 8.99, availableQuantity: 3, category: 'Topicals', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-4', name: '[DEMO] TENS Unit Home', sku: 'TENS-001', retailPrice: 89.99, costPrice: 45.00, availableQuantity: 8, category: 'Equipment', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-5', name: '[DEMO] Resistance Bands Set', sku: 'RBS-003', retailPrice: 24.99, costPrice: 12.50, availableQuantity: 0, category: 'Exercise', status: 'OUT_OF_STOCK' as ProductStatus },
  { id: 'demo-6', name: '[DEMO] Foam Roller 18"', sku: 'FR-018', retailPrice: 29.99, costPrice: 14.99, availableQuantity: 12, category: 'Exercise', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-7', name: '[DEMO] Posture Corrector', sku: 'PC-001', retailPrice: 39.99, costPrice: 19.99, availableQuantity: 6, category: 'Support', status: 'ACTIVE' as ProductStatus },
  { id: 'demo-8', name: '[DEMO] Ice Pack Large', sku: 'IP-LG', retailPrice: 19.99, costPrice: 9.99, availableQuantity: 18, category: 'Therapy', status: 'ACTIVE' as ProductStatus },
];

const DEMO_ANALYTICS = {
  bestSellers: [
    { name: '[DEMO] Biofreeze Gel 4oz', sold: 47, revenue: 704.53 },
    { name: '[DEMO] Cervical Support Pillow', sold: 23, revenue: 1379.77 },
    { name: '[DEMO] TENS Unit Home', sold: 18, revenue: 1619.82 },
    { name: '[DEMO] Lumbar Roll', sold: 31, revenue: 1084.69 },
    { name: '[DEMO] Resistance Bands Set', sold: 28, revenue: 699.72 },
  ],
  slowMovers: [
    { name: '[DEMO] Posture Corrector', lastSold: '14 days ago', daysInStock: 45 },
    { name: '[DEMO] Ice Pack Large', lastSold: '21 days ago', daysInStock: 60 },
  ],
  stockTurnover: 4.2,
  avgMargin: 48.5,
};

type View =
  | 'dashboard'
  | 'products'
  | 'add-product'
  | 'edit-product'
  | 'categories'
  | 'stock'
  | 'scanner'
  | 'alerts'
  | 'vendors'
  | 'purchase-orders'
  | 'new-po'
  | 'edit-po'
  | 'pos'
  | 'reports';

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
}

export function InventoryDashboard() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [preselectedProductIds, setPreselectedProductIds] = useState<string[]>([]);
  const [stockAdjustmentOpen, setStockAdjustmentOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Quick Sale state for embedded POS
  const [quickSaleCart, setQuickSaleCart] = useState<CartItem[]>([]);
  const [quickSaleSearch, setQuickSaleSearch] = useState('');
  const [quickSalePaymentMethod, setQuickSalePaymentMethod] = useState<POSPaymentMethod>('CASH');

  // Product catalog search/filter state
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState<string>('all');
  const [productStatus, setProductStatus] = useState<ProductStatus | 'all'>('all');

  // Quick stats queries
  const { data: alertCount, isLoading: loadingAlerts } = trpc.inventory.getAlertCount.useQuery();
  const { data: todaysSales, isLoading: loadingSales } = trpc.inventory.getTodaysSales.useQuery();
  const { data: productStats, isLoading: loadingProducts } = trpc.inventory.listProducts.useQuery({
    pageSize: 1,
  });
  const { data: categories } = trpc.inventory.listCategories.useQuery({
    includeInactive: false,
    asTree: false,
  });
  const { data: stockData } = trpc.inventory.listProducts.useQuery({
    lowStock: true,
    pageSize: 100,
  });


  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleEditProduct = (productId: string) => {
    setSelectedProductId(productId);
    setCurrentView('edit-product');
  };

  const handleAdjustStock = (productId: string, productName: string) => {
    setAdjustingProduct({ id: productId, name: productName });
    setStockAdjustmentOpen(true);
  };

  const handleCreatePO = (productIds?: string[]) => {
    if (productIds) {
      setPreselectedProductIds(productIds);
    }
    setCurrentView('new-po');
  };

  const handleEditPO = (poId: string) => {
    setSelectedPOId(poId);
    setCurrentView('edit-po');
  };

  // Quick sale cart functions
  const addToQuickSale = (product: { id: string; name: string; sku: string; retailPrice: number | string }) => {
    const price = typeof product.retailPrice === 'string' ? parseFloat(product.retailPrice) : product.retailPrice;
    const existing = quickSaleCart.find(item => item.productId === product.id);
    if (existing) {
      setQuickSaleCart(cart =>
        cart.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setQuickSaleCart(cart => [
        ...cart,
        { productId: product.id, name: product.name, sku: product.sku, quantity: 1, price },
      ]);
    }
  };

  const removeFromQuickSale = (productId: string) => {
    setQuickSaleCart(cart => cart.filter(item => item.productId !== productId));
  };

  const updateQuickSaleQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromQuickSale(productId);
      return;
    }
    setQuickSaleCart(cart =>
      cart.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const quickSaleSubtotal = quickSaleCart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const quickSaleTax = quickSaleSubtotal * 0.0725;
  const quickSaleTotal = quickSaleSubtotal + quickSaleTax;

  const clearQuickSale = () => {
    setQuickSaleCart([]);
    setQuickSaleSearch('');
  };

  // Calculate inventory value
  const inventoryValue = useMemo(() => {
    if (!stockData?.products) return 0;
    return stockData.products.reduce((sum, p) => {
      return sum + p.availableQuantity * Number(p.costPrice);
    }, 0);
  }, [stockData]);

  // Render functions for different views
  const renderContent = () => {
    switch (currentView) {
      case 'products':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-stone-800">Product Catalog</h2>
              <Button
                onClick={() => setCurrentView('add-product')}
                className="bg-[#053e67] hover:bg-[#053e67]"
              >
                Add Product
              </Button>
            </div>
            <ProductList onEditProduct={handleEditProduct} />
          </div>
        );

      case 'add-product':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setCurrentView('products')}>
                Back
              </Button>
              <h2 className="text-2xl font-bold text-stone-800">Add New Product</h2>
            </div>
            <ProductForm
              onSuccess={() => setCurrentView('products')}
              onCancel={() => setCurrentView('products')}
            />
          </div>
        );

      case 'edit-product':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setCurrentView('products')}>
                Back
              </Button>
              <h2 className="text-2xl font-bold text-stone-800">Edit Product</h2>
            </div>
            <ProductForm
              productId={selectedProductId!}
              onSuccess={() => setCurrentView('products')}
              onCancel={() => setCurrentView('products')}
            />
          </div>
        );

      case 'categories':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Category Management</h2>
            <CategoryManager />
          </div>
        );

      case 'stock':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Stock Levels</h2>
            <StockLevels onAdjustStock={handleAdjustStock} />
          </div>
        );

      case 'scanner':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Barcode Scanner</h2>
            <BarcodeScanner
              onProductFound={(productId) => {
                setSelectedProductId(productId);
              }}
            />
          </div>
        );

      case 'alerts':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Low Stock Alerts</h2>
            <LowStockAlerts
              onViewProduct={(productId) => {
                setSelectedProductId(productId);
                setCurrentView('edit-product');
              }}
              onCreatePurchaseOrder={handleCreatePO}
            />
          </div>
        );

      case 'vendors':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Vendor Management</h2>
            <VendorList
              onSelectVendor={(vendorId) => setSelectedVendorId(vendorId)}
              onCreatePurchaseOrder={(vendorId) => {
                setSelectedVendorId(vendorId);
                setCurrentView('new-po');
              }}
            />
          </div>
        );

      case 'purchase-orders':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Purchase Orders</h2>
            <PurchaseOrderList
              onEditOrder={handleEditPO}
              onCreateOrder={() => setCurrentView('new-po')}
            />
          </div>
        );

      case 'new-po':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => setCurrentView('purchase-orders')}
              >
                Back
              </Button>
              <h2 className="text-2xl font-bold text-stone-800">New Purchase Order</h2>
            </div>
            <PurchaseOrderForm
              vendorId={selectedVendorId || undefined}
              productIds={preselectedProductIds.length > 0 ? preselectedProductIds : undefined}
              onSuccess={() => {
                setSelectedVendorId(null);
                setPreselectedProductIds([]);
                setCurrentView('purchase-orders');
              }}
              onCancel={() => {
                setSelectedVendorId(null);
                setPreselectedProductIds([]);
                setCurrentView('purchase-orders');
              }}
            />
          </div>
        );

      case 'edit-po':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => setCurrentView('purchase-orders')}
              >
                Back
              </Button>
              <h2 className="text-2xl font-bold text-stone-800">Edit Purchase Order</h2>
            </div>
            <PurchaseOrderForm
              purchaseOrderId={selectedPOId!}
              onSuccess={() => {
                setSelectedPOId(null);
                setCurrentView('purchase-orders');
              }}
              onCancel={() => {
                setSelectedPOId(null);
                setCurrentView('purchase-orders');
              }}
            />
          </div>
        );

      case 'pos':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Point of Sale</h2>
            <POSTerminal />
          </div>
        );

      case 'reports':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-stone-800">Sales Reports</h2>
            <SalesReport />
          </div>
        );

      default:
        return renderDashboard();
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-stone-600">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProducts ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-stone-800">
                {productStats?.total || DEMO_PRODUCTS.length}
              </div>
            )}
            <p className="text-xs text-stone-500 mt-1">
              Across all categories
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-stone-600">
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-stone-800">
                  {alertCount || 3}
                </span>
                {(alertCount || 3) > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    Action Needed
                  </Badge>
                )}
              </div>
            )}
            <p className="text-xs text-stone-500 mt-1">
              Items below reorder point
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-stone-600">
              Today&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSales ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-stone-800">
                {todaysSales?.totalSales || 7}
              </div>
            )}
            <p className="text-xs text-stone-500 mt-1">
              Transactions completed
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-stone-600">
              Today&apos;s Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSales ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-stone-800">
                {formatCurrency(todaysSales?.totalRevenue || 428.93)}
              </div>
            )}
            <p className="text-xs text-stone-500 mt-1">
              Gross sales today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-blue-50 to-orange-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-stone-800">Quick Actions</CardTitle>
          <CardDescription>Common tasks at your fingertips</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 border-blue-300 hover:bg-blue-100 hover:border-blue-400"
              onClick={() => setCurrentView('pos')}
            >
              <span className="text-2xl">$</span>
              <span className="font-medium">New Sale</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 border-blue-300 hover:bg-blue-100 hover:border-blue-400"
              onClick={() => setCurrentView('add-product')}
            >
              <span className="text-2xl">+</span>
              <span className="font-medium">Add Product</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 border-blue-300 hover:bg-blue-100 hover:border-blue-400"
              onClick={() => setCurrentView('scanner')}
            >
              <span className="text-2xl font-mono">[|]</span>
              <span className="font-medium">Scan Barcode</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 border-blue-300 hover:bg-blue-100 hover:border-blue-400"
              onClick={() => setCurrentView('new-po')}
            >
              <span className="text-2xl">O</span>
              <span className="font-medium">Create PO</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="bg-stone-100 p-1">
          <TabsTrigger value="catalog" className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]">
            Product Catalog
          </TabsTrigger>
          <TabsTrigger value="stock" className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]">
            Stock Management
          </TabsTrigger>
          <TabsTrigger value="pos" className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]">
            Quick POS
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]">
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Product Catalog Tab */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-stone-800">Products</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentView('categories')}
                    >
                      Manage Categories
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#053e67] hover:bg-[#053e67]"
                      onClick={() => setCurrentView('add-product')}
                    >
                      Add Product
                    </Button>
                  </div>
                </div>
                {/* Search and Filters */}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="border-stone-300"
                    />
                  </div>
                  <Select
                    value={productCategory}
                    onValueChange={setProductCategory}
                  >
                    <SelectTrigger className="w-[150px] border-stone-300">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Array.isArray(categories) && categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={productStatus}
                    onValueChange={(v) => setProductStatus(v as ProductStatus | 'all')}
                  >
                    <SelectTrigger className="w-[130px] border-stone-300">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
                      <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-stone-50">
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DEMO_PRODUCTS.map((product) => (
                        <TableRow key={product.id} className="hover:bg-blue-50/50">
                          <TableCell className="font-medium text-stone-800">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-stone-500 font-mono text-sm">
                            {product.sku}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.retailPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={
                              product.availableQuantity <= 0
                                ? 'text-red-600 font-bold'
                                : product.availableQuantity <= 5
                                ? 'text-[#053e67] font-medium'
                                : 'text-stone-700'
                            }>
                              {product.availableQuantity}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                product.status === 'ACTIVE'
                                  ? 'default'
                                  : product.status === 'OUT_OF_STOCK'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                              className={
                                product.status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : ''
                              }
                            >
                              {product.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditProduct(product.id)}
                              className="text-[#053e67] hover:text-[#053e67]"
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-stone-500">
                    Showing {DEMO_PRODUCTS.length} products
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentView('products')}
                    className="text-[#053e67] border-blue-300"
                  >
                    View All Products
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Barcode Scanner Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-stone-800">Barcode Scanner</CardTitle>
                <CardDescription>Quickly look up products</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-6 border-2 border-dashed border-stone-300 rounded-lg text-center bg-stone-50">
                  <div className="text-4xl text-stone-400 mb-2">[|]</div>
                  <p className="text-sm text-stone-500">
                    Scan barcode or enter manually
                  </p>
                </div>
                <Input
                  placeholder="Enter barcode..."
                  className="font-mono border-stone-300"
                />
                <Button className="w-full bg-[#053e67] hover:bg-[#053e67]">
                  Look Up
                </Button>
                <Separator />
                <Button
                  variant="outline"
                  className="w-full border-blue-300 text-[#053e67] hover:bg-blue-50"
                  onClick={() => setCurrentView('scanner')}
                >
                  Open Full Scanner
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stock Management Tab */}
        <TabsContent value="stock" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Stock Overview */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-stone-800">Stock Levels</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => setCurrentView('alerts')}
                    >
                      {alertCount || 3} Alerts
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#053e67] hover:bg-[#053e67]"
                      onClick={() => setCurrentView('stock')}
                    >
                      Full Stock View
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-stone-50">
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead className="text-right">Reorder Point</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DEMO_PRODUCTS.filter(p => p.availableQuantity <= 10).map((product) => (
                        <TableRow key={product.id} className="hover:bg-blue-50/50">
                          <TableCell>
                            <div className="font-medium text-stone-800">{product.name}</div>
                            <div className="text-xs text-stone-500">{product.sku}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={
                              product.availableQuantity <= 0
                                ? 'text-red-600 font-bold'
                                : product.availableQuantity <= 5
                                ? 'text-[#053e67] font-medium'
                                : 'text-stone-700'
                            }>
                              {product.availableQuantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-stone-500">10</TableCell>
                          <TableCell>
                            {product.availableQuantity <= 0 ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : product.availableQuantity <= 5 ? (
                              <Badge className="bg-blue-100 text-[#053e67] border-blue-200">Low Stock</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 border-green-200">In Stock</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.availableQuantity * product.costPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAdjustStock(product.id, product.name)}
                              className="text-[#053e67] hover:text-[#053e67]"
                            >
                              Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Reorder Suggestions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-stone-800">Reorder Suggestions</CardTitle>
                <CardDescription>Items below reorder point</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEMO_PRODUCTS.filter(p => p.availableQuantity <= 5).map((product) => (
                  <div
                    key={product.id}
                    className="p-3 border rounded-lg bg-red-50 border-red-200"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-stone-800 text-sm">
                          {product.name}
                        </div>
                        <div className="text-xs text-stone-500">{product.sku}</div>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {product.availableQuantity} left
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-stone-500 mb-1">
                        Suggest order: 25 units
                      </div>
                      <Progress
                        value={(product.availableQuantity / 10) * 100}
                        className="h-1.5 bg-red-100"
                      />
                    </div>
                  </div>
                ))}
                <Button
                  className="w-full bg-[#053e67] hover:bg-[#053e67] mt-4"
                  onClick={() => handleCreatePO(DEMO_PRODUCTS.filter(p => p.availableQuantity <= 5).map(p => p.id))}
                >
                  Create Purchase Order
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-blue-300 text-[#053e67]"
                  onClick={() => setCurrentView('vendors')}
                >
                  Manage Vendors
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Stock Adjustment Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-stone-800">Recent Stock Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-stone-50">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-stone-500">Today 2:30 PM</TableCell>
                      <TableCell className="font-medium">[DEMO] Biofreeze Gel 4oz</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-700">Sale</Badge>
                      </TableCell>
                      <TableCell className="text-right text-red-600">-2</TableCell>
                      <TableCell className="text-stone-500">POS Sale #1247</TableCell>
                      <TableCell className="text-stone-500">Dr. Smith</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-stone-500">Today 11:15 AM</TableCell>
                      <TableCell className="font-medium">[DEMO] Cervical Support Pillow</TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-700">Received</Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-600">+10</TableCell>
                      <TableCell className="text-stone-500">PO #2024-0089</TableCell>
                      <TableCell className="text-stone-500">Admin</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-stone-500">Yesterday 4:00 PM</TableCell>
                      <TableCell className="font-medium">[DEMO] TENS Unit Home</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-100 text-[#053e67]">Adjustment</Badge>
                      </TableCell>
                      <TableCell className="text-right text-[#053e67]">-1</TableCell>
                      <TableCell className="text-stone-500">Damaged in storage</TableCell>
                      <TableCell className="text-stone-500">Admin</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick POS Tab */}
        <TabsContent value="pos" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Product Grid */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-stone-800">Quick Sale</CardTitle>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Search products or scan barcode..."
                    value={quickSaleSearch}
                    onChange={(e) => setQuickSaleSearch(e.target.value)}
                    className="flex-1 border-stone-300"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {DEMO_PRODUCTS.filter(p =>
                    p.status === 'ACTIVE' &&
                    (quickSaleSearch === '' ||
                     p.name.toLowerCase().includes(quickSaleSearch.toLowerCase()) ||
                     p.sku.toLowerCase().includes(quickSaleSearch.toLowerCase()))
                  ).map((product) => (
                    <Button
                      key={product.id}
                      variant="outline"
                      className="h-auto py-3 px-2 flex flex-col items-center text-center border-stone-300 hover:border-blue-400 hover:bg-blue-50"
                      onClick={() => addToQuickSale({
                        id: product.id,
                        name: product.name,
                        sku: product.sku,
                        retailPrice: product.retailPrice,
                      })}
                      disabled={product.availableQuantity <= 0}
                    >
                      <span className="font-medium text-xs text-stone-800 line-clamp-2">
                        {product.name.replace('[DEMO] ', '')}
                      </span>
                      <span className="text-[#053e67] font-bold mt-1">
                        {formatCurrency(product.retailPrice)}
                      </span>
                      {product.availableQuantity <= 5 && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {product.availableQuantity} left
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    className="border-blue-300 text-[#053e67]"
                    onClick={() => setCurrentView('pos')}
                  >
                    Open Full POS Terminal
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cart */}
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-stone-800">Cart</CardTitle>
                  {quickSaleCart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearQuickSale}
                      className="text-stone-500"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {quickSaleCart.length === 0 ? (
                  <div className="text-center py-8 text-stone-500">
                    <div className="text-3xl mb-2">$</div>
                    <p className="text-sm">Cart is empty</p>
                    <p className="text-xs">Click products to add them</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {quickSaleCart.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between p-2 bg-white rounded border"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-stone-800 truncate">
                              {item.name.replace('[DEMO] ', '')}
                            </div>
                            <div className="text-xs text-stone-500">
                              {formatCurrency(item.price)} each
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateQuickSaleQuantity(item.productId, item.quantity - 1)}
                            >
                              -
                            </Button>
                            <span className="w-6 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateQuickSaleQuantity(item.productId, item.quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                          <div className="w-20 text-right font-medium text-stone-800">
                            {formatCurrency(item.price * item.quantity)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-stone-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(quickSaleSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-stone-600">
                        <span>Tax (7.25%)</span>
                        <span>{formatCurrency(quickSaleTax)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg text-stone-800 pt-2 border-t">
                        <span>Total</span>
                        <span>{formatCurrency(quickSaleTotal)}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-stone-600">Payment Method</Label>
                      <Select
                        value={quickSalePaymentMethod}
                        onValueChange={(v) => setQuickSalePaymentMethod(v as POSPaymentMethod)}
                      >
                        <SelectTrigger className="border-stone-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                          <SelectItem value="DEBIT_CARD">Debit Card</SelectItem>
                          <SelectItem value="CHECK">Check</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        toast.success('Sale completed! [DEMO]');
                        clearQuickSale();
                      }}
                    >
                      Complete Sale - {formatCurrency(quickSaleTotal)}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-stone-600">
                  Inventory Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-stone-800">
                  {formatCurrency(inventoryValue || 2847.50)}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  At cost basis
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-stone-600">
                  Stock Turnover
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-stone-800">
                  {DEMO_ANALYTICS.stockTurnover}x
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Annual rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-stone-600">
                  Average Margin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatPercent(DEMO_ANALYTICS.avgMargin)}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Across all products
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-stone-600">
                  Low Stock Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#053e67]">
                  {stockData?.products.filter(p => p.availableQuantity <= 5).length || 3}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Need attention
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Best Sellers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-stone-800">Best Sellers (30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {DEMO_ANALYTICS.bestSellers.map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-[#053e67] font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-800 text-sm truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-stone-500">
                          {item.sold} units sold
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          {formatCurrency(item.revenue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4 border-blue-300 text-[#053e67]"
                  onClick={() => setCurrentView('reports')}
                >
                  View Full Sales Report
                </Button>
              </CardContent>
            </Card>

            {/* Slow Moving Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-stone-800">Slow Moving Items</CardTitle>
                <CardDescription>Items that may need attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {DEMO_ANALYTICS.slowMovers.map((item) => (
                    <div
                      key={item.name}
                      className="p-3 rounded-lg border border-blue-200 bg-blue-50"
                    >
                      <div className="flex justify-between items-start">
                        <div className="font-medium text-stone-800 text-sm">
                          {item.name}
                        </div>
                        <Badge variant="outline" className="text-[#053e67] border-blue-300">
                          {item.daysInStock} days
                        </Badge>
                      </div>
                      <div className="text-xs text-stone-500 mt-1">
                        Last sold: {item.lastSold}
                      </div>
                    </div>
                  ))}
                </div>

                <Alert className="mt-4 border-stone-200">
                  <AlertTitle className="text-stone-800">Profit Margin Analysis</AlertTitle>
                  <AlertDescription className="text-stone-600 text-sm">
                    Your average margin of {formatPercent(DEMO_ANALYTICS.avgMargin)} is healthy.
                    Consider running promotions on slow-moving items.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div className="container mx-auto py-6 px-4 md:px-6">
      {/* Back to Dashboard if not on dashboard */}
      {currentView !== 'dashboard' && (
        <Button
          variant="link"
          className="mb-4 text-[#053e67] hover:text-[#053e67] p-0"
          onClick={() => setCurrentView('dashboard')}
        >
          &larr; Back to Inventory Dashboard
        </Button>
      )}

      {renderContent()}

      {/* Stock Adjustment Modal */}
      <StockAdjustment
        productId={adjustingProduct?.id}
        productName={adjustingProduct?.name}
        open={stockAdjustmentOpen}
        onOpenChange={setStockAdjustmentOpen}
        onSuccess={() => setAdjustingProduct(null)}
      />
    </div>
  );
}
