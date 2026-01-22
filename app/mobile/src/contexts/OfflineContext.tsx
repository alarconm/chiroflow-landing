import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncApi } from '../services/api';

// Offline queue item
interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  entityId?: string;
  data: unknown;
  timestamp: string;
  retryCount: number;
}

// Sync status
type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface OfflineState {
  isOnline: boolean;
  isConnected: boolean;
  syncStatus: SyncStatus;
  pendingOperations: number;
  lastSyncTime: string | null;
  syncError: string | null;
}

interface OfflineContextValue extends OfflineState {
  queueOperation: (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => Promise<void>;
  triggerSync: () => Promise<void>;
  clearQueue: () => Promise<void>;
  getPendingOperations: () => Promise<QueuedOperation[]>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

// Storage keys
const QUEUE_KEY = 'chiroflow_offline_queue';
const LAST_SYNC_KEY = 'chiroflow_last_sync';

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [state, setState] = useState<OfflineState>({
    isOnline: true,
    isConnected: true,
    syncStatus: 'idle',
    pendingOperations: 0,
    lastSyncTime: null,
    syncError: null,
  });

  // Load initial state
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
        const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
        const queue: QueuedOperation[] = queueJson ? JSON.parse(queueJson) : [];

        setState((prev) => ({
          ...prev,
          lastSyncTime: lastSync,
          pendingOperations: queue.length,
        }));
      } catch (error) {
        console.error('Failed to load offline state:', error);
      }
    };

    loadInitialState();
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const isOnline = netState.isConnected === true && netState.isInternetReachable === true;
      const isConnected = netState.isConnected === true;

      setState((prev) => {
        // If we just came online and have pending operations, trigger sync
        if (isOnline && !prev.isOnline && prev.pendingOperations > 0) {
          // Schedule sync (don't block state update)
          setTimeout(() => triggerSync(), 1000);
        }

        return {
          ...prev,
          isOnline,
          isConnected,
          syncStatus: isOnline ? prev.syncStatus : 'offline',
        };
      });
    });

    return () => unsubscribe();
  }, []);

  // Queue an offline operation
  const queueOperation = useCallback(
    async (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => {
      try {
        const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
        const queue: QueuedOperation[] = queueJson ? JSON.parse(queueJson) : [];

        const newOperation: QueuedOperation = {
          ...operation,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          retryCount: 0,
        };

        queue.push(newOperation);
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

        setState((prev) => ({
          ...prev,
          pendingOperations: queue.length,
        }));

        // If online, trigger sync immediately
        if (state.isOnline) {
          triggerSync();
        }
      } catch (error) {
        console.error('Failed to queue operation:', error);
        throw error;
      }
    },
    [state.isOnline]
  );

  // Trigger sync
  const triggerSync = useCallback(async () => {
    if (!state.isOnline) {
      setState((prev) => ({ ...prev, syncStatus: 'offline' }));
      return;
    }

    setState((prev) => ({ ...prev, syncStatus: 'syncing', syncError: null }));

    try {
      const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: QueuedOperation[] = queueJson ? JSON.parse(queueJson) : [];

      if (queue.length === 0) {
        setState((prev) => ({ ...prev, syncStatus: 'idle' }));
        return;
      }

      // Push operations to server
      const response = await syncApi.pushOperations(queue);

      if (response.success) {
        // Clear the queue
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([]));
        const now = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNC_KEY, now);

        setState((prev) => ({
          ...prev,
          syncStatus: 'idle',
          pendingOperations: 0,
          lastSyncTime: now,
          syncError: null,
        }));
      } else {
        // Mark as error but keep operations in queue
        setState((prev) => ({
          ...prev,
          syncStatus: 'error',
          syncError: response.error || 'Sync failed',
        }));
      }
    } catch (error) {
      console.error('Sync failed:', error);
      setState((prev) => ({
        ...prev,
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [state.isOnline]);

  // Clear the queue
  const clearQueue = useCallback(async () => {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([]));
      setState((prev) => ({
        ...prev,
        pendingOperations: 0,
      }));
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw error;
    }
  }, []);

  // Get pending operations
  const getPendingOperations = useCallback(async (): Promise<QueuedOperation[]> => {
    try {
      const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('Failed to get pending operations:', error);
      return [];
    }
  }, []);

  const value: OfflineContextValue = {
    ...state,
    queueOperation,
    triggerSync,
    clearQueue,
    getPendingOperations,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
