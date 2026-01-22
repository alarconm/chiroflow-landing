'use client';

/**
 * BarcodeScanner Component
 * Epic 17: Inventory & POS
 *
 * Mock barcode scanner interface for product lookup.
 * In production, this would integrate with actual barcode scanning hardware.
 */

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface BarcodeScannerProps {
  onProductFound?: (productId: string, productName: string) => void;
  autoFocus?: boolean;
}

export function BarcodeScanner({ onProductFound, autoFocus = true }: BarcodeScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState('');
  const [lastScanned, setLastScanned] = useState<{
    barcode: string;
    productName?: string;
    isValid: boolean;
    error?: string;
  } | null>(null);

  const validateMutation = trpc.inventory.validateBarcode.useMutation();
  const lookupMutation = trpc.inventory.lookupBarcode.useMutation();

  // Auto-focus input
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleScan = async () => {
    if (!barcode.trim()) {
      toast.error('Please enter a barcode');
      return;
    }

    const cleanBarcode = barcode.trim().replace(/\s+/g, '');

    try {
      // First validate the barcode format
      const validation = await validateMutation.mutateAsync({ barcode: cleanBarcode });

      if (!validation.valid) {
        setLastScanned({
          barcode: cleanBarcode,
          isValid: false,
          error: validation.error || 'Invalid barcode format',
        });
        toast.error(validation.error || 'Invalid barcode format');
        return;
      }

      // Then look up the product
      const result = await lookupMutation.mutateAsync({ barcode: cleanBarcode });

      if (result.found && result.product) {
        setLastScanned({
          barcode: cleanBarcode,
          productName: result.product.name,
          isValid: true,
        });
        toast.success(`Found: ${result.product.name}`);
        onProductFound?.(result.product.id, result.product.name);
      } else {
        setLastScanned({
          barcode: cleanBarcode,
          isValid: true,
          error: 'Product not found in inventory',
        });
        toast.error('Product not found in inventory');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan failed';
      setLastScanned({
        barcode: cleanBarcode,
        isValid: false,
        error: message,
      });
      toast.error(message);
    }

    setBarcode('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan();
    }
  };

  const isLoading = validateMutation.isPending || lookupMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Barcode Scanner</CardTitle>
        <CardDescription>
          Enter or scan a barcode to look up products. Supports UPC-A, UPC-E, EAN-13, EAN-8,
          and internal codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode</Label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter or scan barcode..."
              className="flex-1 font-mono"
              autoComplete="off"
            />
            <Button onClick={handleScan} disabled={isLoading}>
              {isLoading ? 'Scanning...' : 'Lookup'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter or click Lookup to search
          </p>
        </div>

        {/* Mock Scanner Visual */}
        <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
          <div className="text-muted-foreground mb-2">
            <svg
              className="w-12 h-12 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
            Position barcode in scanner area
          </div>
          <p className="text-xs text-muted-foreground">
            (This is a mock interface - type barcode manually or use USB scanner)
          </p>
        </div>

        {/* Last Scan Result */}
        {lastScanned && (
          <div
            className={`p-4 rounded-lg ${
              lastScanned.productName
                ? 'bg-green-50 border border-green-200'
                : lastScanned.isValid
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">Last Scan</div>
                <div className="font-mono text-lg">{lastScanned.barcode}</div>
                {lastScanned.productName && (
                  <div className="mt-1 font-semibold text-green-700">
                    {lastScanned.productName}
                  </div>
                )}
                {lastScanned.error && (
                  <div className="mt-1 text-sm text-red-600">{lastScanned.error}</div>
                )}
              </div>
              <Badge
                variant={
                  lastScanned.productName
                    ? 'default'
                    : lastScanned.isValid
                    ? 'outline'
                    : 'destructive'
                }
              >
                {lastScanned.productName
                  ? 'Found'
                  : lastScanned.isValid
                  ? 'Valid Format'
                  : 'Invalid'}
              </Badge>
            </div>
          </div>
        )}

        {/* Sample Barcodes for Testing */}
        <div className="pt-4 border-t">
          <div className="text-sm font-medium mb-2">Test Barcodes</div>
          <div className="flex flex-wrap gap-2">
            {['012345678901', '5901234123457', 'INT-SUP-001', '04963406'].map(
              (code) => (
                <Button
                  key={code}
                  variant="outline"
                  size="sm"
                  onClick={() => setBarcode(code)}
                  className="font-mono text-xs"
                >
                  {code}
                </Button>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Click a sample barcode to test the scanner
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
