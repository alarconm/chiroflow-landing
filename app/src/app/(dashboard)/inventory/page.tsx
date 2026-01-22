'use client';

/**
 * Inventory & POS Page
 * Epic 17: Inventory & POS
 *
 * Main page for inventory management and point of sale operations.
 */

import { InventoryDashboard } from '@/components/inventory';

export default function InventoryPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory & POS</h2>
          <p className="text-muted-foreground">
            Manage products, track inventory, and process sales
          </p>
        </div>
      </div>

      <InventoryDashboard />
    </div>
  );
}
