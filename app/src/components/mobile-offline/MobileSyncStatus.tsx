'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CloudOff,
  Cloud,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface SyncStatusSummary {
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflicts: number;
  lastSyncAt: string | null;
  isOnline: boolean;
  deviceState?: {
    lastFullSyncAt: string | null;
    lastIncrementalSyncAt: string | null;
    pendingOperations: number;
    failedOperations: number;
    conflictCount: number;
    cacheSize: number;
    cachedEntities: number;
  } | null;
}

interface MobileSyncStatusProps {
  deviceId: string;
  onSyncTriggered?: () => void;
  onViewConflicts?: () => void;
  className?: string;
}

export function MobileSyncStatus({
  deviceId,
  onSyncTriggered,
  onViewConflicts,
  className = '',
}: MobileSyncStatusProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncMessage, setLastSyncMessage] = useState<string>('');

  // Simulate fetching sync status (would use tRPC in real implementation)
  const fetchSyncStatus = useCallback(async () => {
    // In real implementation: const status = await trpc.offline.getSyncStatus.query({ deviceId });
    // For now, use mock data structure
    const mockStatus: SyncStatusSummary = {
      pending: 0,
      syncing: 0,
      completed: 10,
      failed: 0,
      conflicts: 0,
      lastSyncAt: new Date().toISOString(),
      isOnline: navigator.onLine,
      deviceState: {
        lastFullSyncAt: new Date(Date.now() - 86400000).toISOString(),
        lastIncrementalSyncAt: new Date().toISOString(),
        pendingOperations: 0,
        failedOperations: 0,
        conflictCount: 0,
        cacheSize: 1024 * 1024 * 5, // 5MB
        cachedEntities: 45,
      },
    };
    setSyncStatus(mockStatus);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastSyncMessage('Back online - syncing changes...');
      handleSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLastSyncMessage('Offline - changes will sync when connected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  const handleSync = async () => {
    if (!isOnline) {
      setLastSyncMessage('Cannot sync while offline');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);

    try {
      // Simulate sync progress
      for (let i = 0; i <= 100; i += 20) {
        setSyncProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // In real implementation: await trpc.offline.triggerSync.mutate({ deviceId });
      setLastSyncMessage('Sync completed successfully');
      await fetchSyncStatus();
      onSyncTriggered?.();
    } catch (error) {
      setLastSyncMessage('Sync failed - will retry automatically');
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTotalPending = () => {
    return (
      (syncStatus?.pending || 0) +
      (syncStatus?.syncing || 0) +
      (syncStatus?.deviceState?.pendingOperations || 0)
    );
  };

  const hasConflicts = () => {
    return (syncStatus?.conflicts || 0) + (syncStatus?.deviceState?.conflictCount || 0) > 0;
  };

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isOnline ? (
              <Cloud className="h-5 w-5 text-green-600" />
            ) : (
              <CloudOff className="h-5 w-5 text-gray-400" />
            )}
            Sync Status
          </CardTitle>
          <Badge variant={isOnline ? 'default' : 'secondary'} className="flex items-center gap-1">
            {isOnline ? (
              <>
                <Wifi className="h-3 w-3" /> Online
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" /> Offline
              </>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sync Progress */}
        {isSyncing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Syncing...
            </div>
            <Progress value={syncProgress} className="h-2" />
          </div>
        )}

        {/* Last Sync Message */}
        {lastSyncMessage && (
          <Alert variant={lastSyncMessage.includes('failed') ? 'destructive' : 'default'}>
            <AlertDescription className="text-sm">{lastSyncMessage}</AlertDescription>
          </Alert>
        )}

        {/* Status Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Last Sync</p>
              <p className="text-sm font-medium">{formatLastSync(syncStatus?.lastSyncAt || null)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-sm font-medium">{getTotalPending()} changes</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Download className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Cached</p>
              <p className="text-sm font-medium">
                {syncStatus?.deviceState?.cachedEntities || 0} items
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Cache Size</p>
              <p className="text-sm font-medium">
                {formatBytes(syncStatus?.deviceState?.cacheSize || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Conflicts Warning */}
        {hasConflicts() && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {(syncStatus?.conflicts || 0) + (syncStatus?.deviceState?.conflictCount || 0)}{' '}
                conflicts need resolution
              </span>
              <Button variant="outline" size="sm" onClick={onViewConflicts}>
                Resolve
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Sync Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleSync}
            disabled={isSyncing || !isOnline}
            className="flex-1"
            variant={getTotalPending() > 0 ? 'default' : 'outline'}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {getTotalPending() > 0 ? `Sync ${getTotalPending()} Changes` : 'Sync Now'}
              </>
            )}
          </Button>
        </div>

        {/* Full Sync Info */}
        {syncStatus?.deviceState?.lastFullSyncAt && (
          <p className="text-xs text-center text-muted-foreground">
            Full sync: {formatLastSync(syncStatus.deviceState.lastFullSyncAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
