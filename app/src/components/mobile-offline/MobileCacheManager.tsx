'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Database,
  Download,
  Trash2,
  RefreshCw,
  Calendar,
  Users,
  FileText,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface CachedEntityType {
  type: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  sizeBytes: number;
  lastUpdated: Date | null;
  isEnabled: boolean;
}

interface MobileCacheManagerProps {
  deviceId: string;
  onFullSync?: () => Promise<void>;
  onClearCache?: () => Promise<void>;
  onToggleEntityType?: (entityType: string, enabled: boolean) => Promise<void>;
  className?: string;
}

export function MobileCacheManager({
  deviceId,
  onFullSync,
  onClearCache,
  onToggleEntityType,
  className = '',
}: MobileCacheManagerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [entityTypes, setEntityTypes] = useState<CachedEntityType[]>([
    {
      type: 'schedule',
      label: 'Schedule',
      icon: Calendar,
      count: 7,
      sizeBytes: 256 * 1024,
      lastUpdated: new Date(),
      isEnabled: true,
    },
    {
      type: 'patient',
      label: 'Patients',
      icon: Users,
      count: 45,
      sizeBytes: 2 * 1024 * 1024,
      lastUpdated: new Date(Date.now() - 3600000),
      isEnabled: true,
    },
    {
      type: 'appointment',
      label: 'Appointments',
      icon: Clock,
      count: 120,
      sizeBytes: 512 * 1024,
      lastUpdated: new Date(Date.now() - 1800000),
      isEnabled: true,
    },
    {
      type: 'encounter',
      label: 'Encounters',
      icon: FileText,
      count: 30,
      sizeBytes: 1.5 * 1024 * 1024,
      lastUpdated: new Date(Date.now() - 7200000),
      isEnabled: true,
    },
  ]);

  const totalSize = entityTypes.reduce((sum, et) => sum + et.sizeBytes, 0);
  const totalCount = entityTypes.reduce((sum, et) => sum + et.count, 0);
  const maxCacheSize = 50 * 1024 * 1024; // 50MB limit

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  };

  const handleFullSync = async () => {
    setIsLoading(true);
    setSyncProgress(0);

    try {
      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        setSyncProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (onFullSync) {
        await onFullSync();
      }

      // Update entity types with new timestamps
      setEntityTypes((prev) =>
        prev.map((et) => ({
          ...et,
          lastUpdated: new Date(),
        }))
      );
    } catch (error) {
      console.error('Full sync failed:', error);
    } finally {
      setIsLoading(false);
      setSyncProgress(0);
    }
  };

  const handleClearCache = async () => {
    setIsLoading(true);
    try {
      if (onClearCache) {
        await onClearCache();
      }

      // Reset entity types
      setEntityTypes((prev) =>
        prev.map((et) => ({
          ...et,
          count: 0,
          sizeBytes: 0,
          lastUpdated: null,
        }))
      );
    } catch (error) {
      console.error('Clear cache failed:', error);
    } finally {
      setIsLoading(false);
      setShowClearDialog(false);
    }
  };

  const handleToggleEntityType = async (type: string) => {
    const entityType = entityTypes.find((et) => et.type === type);
    if (!entityType) return;

    const newEnabled = !entityType.isEnabled;

    if (onToggleEntityType) {
      await onToggleEntityType(type, newEnabled);
    }

    setEntityTypes((prev) =>
      prev.map((et) => (et.type === type ? { ...et, isEnabled: newEnabled } : et))
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Overview Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Offline Cache
              </CardTitle>
              <CardDescription>
                Manage data stored for offline access
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {formatBytes(totalSize)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Storage Usage */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Storage Used</span>
              <span className="font-medium">
                {formatBytes(totalSize)} / {formatBytes(maxCacheSize)}
              </span>
            </div>
            <Progress value={(totalSize / maxCacheSize) * 100} className="h-2" />
            {totalSize > maxCacheSize * 0.8 && (
              <p className="text-xs text-amber-600">
                Cache is nearly full. Consider clearing old data.
              </p>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Items Cached</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{entityTypes.filter((et) => et.isEnabled).length}</p>
              <p className="text-xs text-muted-foreground">Types Enabled</p>
            </div>
          </div>

          {/* Sync Progress */}
          {isLoading && syncProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Syncing offline data...
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleFullSync}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading && syncProgress > 0 ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Full Sync
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(true)}
              disabled={isLoading || totalCount === 0}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entity Types */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cached Data Types</CardTitle>
          <CardDescription>
            Choose which data to keep available offline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {entityTypes.map((entityType) => {
            const Icon = entityType.icon;
            return (
              <div
                key={entityType.type}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{entityType.label}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{entityType.count} items</span>
                      <span>-</span>
                      <span>{formatBytes(entityType.sizeBytes)}</span>
                      {entityType.lastUpdated && (
                        <>
                          <span>-</span>
                          <span>{formatDate(entityType.lastUpdated)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={entityType.isEnabled}
                  onCheckedChange={() => handleToggleEntityType(entityType.type)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Offline data is automatically refreshed when you connect to the internet.
          You can work offline and changes will sync when you're back online.
        </AlertDescription>
      </Alert>

      {/* Clear Cache Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Clear Offline Cache
            </DialogTitle>
            <DialogDescription>
              This will remove all cached data from your device. You'll need an internet
              connection to access patient and appointment data until you sync again.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Items to remove:</span>
                <span className="font-medium">{totalCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Space to free:</span>
                <span className="font-medium">{formatBytes(totalSize)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearCache} disabled={isLoading}>
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Cache
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
