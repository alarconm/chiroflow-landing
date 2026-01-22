'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface SyncInfo {
  isOnline: boolean;
  pendingChanges: number;
  conflicts: number;
  lastSyncAt: Date | null;
  isSyncing: boolean;
}

interface MobileOfflineIndicatorProps {
  onSyncClick?: () => void;
  onConflictsClick?: () => void;
  className?: string;
  variant?: 'badge' | 'button' | 'minimal';
}

export function MobileOfflineIndicator({
  onSyncClick,
  onConflictsClick,
  className = '',
  variant = 'badge',
}: MobileOfflineIndicatorProps) {
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({
    isOnline: true,
    pendingChanges: 0,
    conflicts: 0,
    lastSyncAt: null,
    isSyncing: false,
  });

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setSyncInfo((prev) => ({ ...prev, isOnline: true }));
    };
    const handleOffline = () => {
      setSyncInfo((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setSyncInfo((prev) => ({ ...prev, isOnline: navigator.onLine }));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Simulate sync info updates (would use tRPC subscription in real implementation)
  useEffect(() => {
    const fetchSyncInfo = () => {
      // In real implementation: subscribe to sync status
      setSyncInfo((prev) => ({
        ...prev,
        lastSyncAt: new Date(),
      }));
    };

    fetchSyncInfo();
    const interval = setInterval(fetchSyncInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatLastSync = () => {
    if (!syncInfo.lastSyncAt) return 'Never';
    const diffMs = Date.now() - syncInfo.lastSyncAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  };

  const getStatusColor = () => {
    if (!syncInfo.isOnline) return 'bg-gray-100 text-gray-600';
    if (syncInfo.conflicts > 0) return 'bg-red-100 text-red-600';
    if (syncInfo.pendingChanges > 0) return 'bg-yellow-100 text-yellow-600';
    return 'bg-green-100 text-green-600';
  };

  const getStatusIcon = () => {
    if (!syncInfo.isOnline) return <CloudOff className="h-3 w-3" />;
    if (syncInfo.isSyncing) return <RefreshCw className="h-3 w-3 animate-spin" />;
    if (syncInfo.conflicts > 0) return <AlertCircle className="h-3 w-3" />;
    if (syncInfo.pendingChanges > 0) return <Upload className="h-3 w-3" />;
    return <CheckCircle className="h-3 w-3" />;
  };

  const getStatusText = () => {
    if (!syncInfo.isOnline) return 'Offline';
    if (syncInfo.isSyncing) return 'Syncing...';
    if (syncInfo.conflicts > 0) return `${syncInfo.conflicts} conflicts`;
    if (syncInfo.pendingChanges > 0) return `${syncInfo.pendingChanges} pending`;
    return 'Synced';
  };

  // Minimal variant - just an icon
  if (variant === 'minimal') {
    return (
      <div className={`flex items-center ${className}`}>
        {syncInfo.isOnline ? (
          <Wifi className="h-4 w-4 text-green-600" />
        ) : (
          <WifiOff className="h-4 w-4 text-gray-400" />
        )}
        {syncInfo.pendingChanges > 0 && (
          <span className="ml-1 flex h-2 w-2 rounded-full bg-yellow-500" />
        )}
        {syncInfo.conflicts > 0 && (
          <span className="ml-1 flex h-2 w-2 rounded-full bg-red-500" />
        )}
      </div>
    );
  }

  // Button variant - clickable button with popover
  if (variant === 'button') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`${className} ${!syncInfo.isOnline ? 'opacity-50' : ''}`}
          >
            {syncInfo.isOnline ? (
              <Cloud className="h-4 w-4 mr-1" />
            ) : (
              <CloudOff className="h-4 w-4 mr-1" />
            )}
            {getStatusText()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Sync Status</span>
              <Badge variant={syncInfo.isOnline ? 'default' : 'secondary'}>
                {syncInfo.isOnline ? 'Online' : 'Offline'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Last sync</p>
                <p className="font-medium">{formatLastSync()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pending</p>
                <p className="font-medium">{syncInfo.pendingChanges} changes</p>
              </div>
            </div>

            {syncInfo.conflicts > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={onConflictsClick}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Resolve {syncInfo.conflicts} Conflicts
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onSyncClick}
              disabled={!syncInfo.isOnline || syncInfo.isSyncing}
            >
              {syncInfo.isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Default badge variant
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className={`cursor-pointer ${getStatusColor()} ${className}`}
        >
          {getStatusIcon()}
          <span className="ml-1">{getStatusText()}</span>
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sync Status</span>
            <Badge variant={syncInfo.isOnline ? 'default' : 'secondary'}>
              {syncInfo.isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Last sync</p>
              <p className="font-medium">{formatLastSync()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending</p>
              <p className="font-medium">{syncInfo.pendingChanges} changes</p>
            </div>
          </div>

          {syncInfo.conflicts > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onConflictsClick}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Resolve {syncInfo.conflicts} Conflicts
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onSyncClick}
            disabled={!syncInfo.isOnline || syncInfo.isSyncing}
          >
            {syncInfo.isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
