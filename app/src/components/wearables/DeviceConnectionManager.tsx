'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Smartphone,
  Watch,
  Activity,
  RefreshCw,
  Link,
  Unlink,
  CheckCircle,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  Settings,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DeviceConnectionManagerProps {
  patientId: string;
  showFullList?: boolean;
}

// Device type configurations
const DEVICE_CONFIGS = {
  APPLE_HEALTH: {
    name: 'Apple Health',
    icon: Watch,
    color: 'bg-gray-900 text-white',
    description: 'Sync activity, sleep, and heart rate data from Apple Health',
  },
  GOOGLE_FIT: {
    name: 'Google Fit',
    icon: Activity,
    color: 'bg-blue-500 text-white',
    description: 'Sync activity, sleep, and heart rate data from Google Fit',
  },
  FITBIT: {
    name: 'Fitbit',
    icon: Watch,
    color: 'bg-teal-500 text-white',
    description: 'Sync data from Fitbit devices and app',
  },
  WHOOP: {
    name: 'Whoop',
    icon: Watch,
    color: 'bg-black text-white',
    description: 'Sync strain, recovery, and sleep data from Whoop',
  },
  POSTURE_SENSOR: {
    name: 'Posture Sensor',
    icon: Smartphone,
    color: 'bg-emerald-500 text-white',
    description: 'Track posture with Upright Go or compatible sensors',
  },
};

const STATUS_CONFIGS = {
  CONNECTED: {
    label: 'Connected',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle,
  },
  PENDING: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Clock,
  },
  EXPIRED: {
    label: 'Expired',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle,
  },
  DISCONNECTED: {
    label: 'Disconnected',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    icon: WifiOff,
  },
  ERROR: {
    label: 'Error',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle,
  },
};

export function DeviceConnectionManager({ patientId, showFullList = false }: DeviceConnectionManagerProps) {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [selectedDeviceType, setSelectedDeviceType] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Fetch device connections
  const { data: connections, isLoading, refetch } = trpc.devices.getConnections.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  // Fetch supported devices
  const { data: supportedDevices } = trpc.devices.getSupportedDevices.useQuery();

  // Connect mutations
  const connectAppleHealth = trpc.devices.connectAppleHealth.useMutation({
    onSuccess: (data) => {
      // Redirect to OAuth URL
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, '_blank');
      }
      toast.success('Apple Health connection initiated. Complete authorization in the popup.');
      setIsConnectDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const connectGoogleFit = trpc.devices.connectGoogleFit.useMutation({
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, '_blank');
      }
      toast.success('Google Fit connection initiated. Complete authorization in the popup.');
      setIsConnectDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  // Disconnect mutation
  const disconnectDevice = trpc.devices.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Device disconnected');
      setDisconnectingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setDisconnectingId(null);
    },
  });

  // Sync mutations
  const syncAppleHealth = trpc.devices.syncAppleHealth.useMutation({
    onSuccess: () => {
      toast.success('Apple Health data synced');
      setSyncingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setSyncingId(null);
    },
  });

  const syncGoogleFit = trpc.devices.syncGoogleFit.useMutation({
    onSuccess: () => {
      toast.success('Google Fit data synced');
      setSyncingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setSyncingId(null);
    },
  });

  const handleConnect = (deviceType: string) => {
    setSelectedDeviceType(deviceType);
    if (deviceType === 'APPLE_HEALTH') {
      connectAppleHealth.mutate({ patientId });
    } else if (deviceType === 'GOOGLE_FIT') {
      connectGoogleFit.mutate({ patientId });
    } else {
      toast.info(`${deviceType} connection coming soon`);
    }
  };

  const handleSync = (connection: NonNullable<typeof connections>[number]) => {
    setSyncingId(connection.id);
    if (connection.deviceType === 'APPLE_HEALTH') {
      syncAppleHealth.mutate({ connectionId: connection.id });
    } else if (connection.deviceType === 'GOOGLE_FIT') {
      syncGoogleFit.mutate({ connectionId: connection.id });
    } else {
      toast.info('Sync not available for this device type');
      setSyncingId(null);
    }
  };

  const handleDisconnect = (connectionId: string) => {
    disconnectDevice.mutate({ connectionId });
  };

  // Get available device types (not already connected)
  const connectedTypes = connections?.map(c => c.deviceType) || [];
  const availableDevices = Object.entries(DEVICE_CONFIGS).filter(
    ([type]) => !connectedTypes.includes(type as keyof typeof DEVICE_CONFIGS)
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Just the connect button if not showing full list
  if (!showFullList) {
    return (
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogTrigger asChild>
          <Button className="bg-[#053e67] hover:bg-[#053e67]/90">
            <Plus className="h-4 w-4 mr-2" />
            Connect Device
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a Device</DialogTitle>
            <DialogDescription>
              Choose a wearable device or health platform to connect
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {availableDevices.length > 0 ? (
              availableDevices.map(([type, config]) => {
                const Icon = config.icon;
                const isConnecting = selectedDeviceType === type && (
                  connectAppleHealth.isPending || connectGoogleFit.isPending
                );
                return (
                  <button
                    key={type}
                    onClick={() => handleConnect(type)}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-4 p-4 rounded-lg border border-stone-200 hover:border-[#053e67] hover:bg-stone-50 transition-all text-left disabled:opacity-50"
                  >
                    <div className={cn('p-2 rounded-lg', config.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-stone-900">{config.name}</p>
                      <p className="text-sm text-stone-500">{config.description}</p>
                    </div>
                    {isConnecting ? (
                      <RefreshCw className="h-5 w-5 text-[#053e67] animate-spin" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-stone-400" />
                    )}
                  </button>
                );
              })
            ) : (
              <p className="text-center text-stone-500 py-4">
                All available devices are already connected
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Full device list view
  return (
    <div className="space-y-6">
      {/* Connected devices */}
      <Card className="border-stone-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link className="h-5 w-5 text-[#053e67]" />
                Connected Devices
              </CardTitle>
              <CardDescription>
                Manage device connections and sync status
              </CardDescription>
            </div>
            <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#053e67] hover:bg-[#053e67]/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Device
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Connect a Device</DialogTitle>
                  <DialogDescription>
                    Choose a wearable device or health platform to connect
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  {availableDevices.length > 0 ? (
                    availableDevices.map(([type, config]) => {
                      const Icon = config.icon;
                      const isConnecting = selectedDeviceType === type && (
                        connectAppleHealth.isPending || connectGoogleFit.isPending
                      );
                      return (
                        <button
                          key={type}
                          onClick={() => handleConnect(type)}
                          disabled={isConnecting}
                          className="w-full flex items-center gap-4 p-4 rounded-lg border border-stone-200 hover:border-[#053e67] hover:bg-stone-50 transition-all text-left disabled:opacity-50"
                        >
                          <div className={cn('p-2 rounded-lg', config.color)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-stone-900">{config.name}</p>
                            <p className="text-sm text-stone-500">{config.description}</p>
                          </div>
                          {isConnecting ? (
                            <RefreshCw className="h-5 w-5 text-[#053e67] animate-spin" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-stone-400" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-center text-stone-500 py-4">
                      All available devices are already connected
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {connections && connections.length > 0 ? (
            <div className="space-y-4">
              {connections.map((connection) => {
                const deviceConfig = DEVICE_CONFIGS[connection.deviceType as keyof typeof DEVICE_CONFIGS];
                const statusConfig = STATUS_CONFIGS[connection.status as keyof typeof STATUS_CONFIGS];
                const Icon = deviceConfig?.icon || Smartphone;
                const StatusIcon = statusConfig?.icon || AlertCircle;
                const isSyncing = syncingId === connection.id;

                return (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-stone-200 bg-stone-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn('p-2 rounded-lg', deviceConfig?.color || 'bg-stone-500 text-white')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-stone-900">
                            {deviceConfig?.name || connection.deviceType}
                          </p>
                          <Badge className={cn('text-xs', statusConfig?.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig?.label || connection.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-stone-500 mt-1">
                          {connection.lastSyncAt && (
                            <span className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3" />
                              Synced {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {connection._count?.activityData || 0} activity records
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {connection.status === 'CONNECTED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(connection)}
                          disabled={isSyncing}
                        >
                          {isSyncing ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Sync
                            </>
                          )}
                        </Button>
                      )}
                      <AlertDialog>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDisconnectingId(connection.id)}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Smartphone className="h-10 w-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 mb-4">No devices connected yet</p>
              <Button
                variant="outline"
                onClick={() => setIsConnectDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Connect First Device
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data sync status */}
      {connections && connections.length > 0 && (
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wifi className="h-5 w-5 text-[#053e67]" />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {connections.map((connection) => {
                const deviceConfig = DEVICE_CONFIGS[connection.deviceType as keyof typeof DEVICE_CONFIGS];
                return (
                  <div key={connection.id} className="p-3 rounded-lg bg-stone-50">
                    <p className="text-sm font-medium text-stone-900 mb-2">
                      {deviceConfig?.name || connection.deviceType}
                    </p>
                    <div className="space-y-1 text-xs text-stone-500">
                      <div className="flex justify-between">
                        <span>Activity</span>
                        <span className="font-medium">{connection._count?.activityData || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sleep</span>
                        <span className="font-medium">{connection._count?.sleepData || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Heart Rate</span>
                        <span className="font-medium">{connection._count?.heartRateData || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Posture</span>
                        <span className="font-medium">{connection._count?.postureData || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disconnect confirmation dialog */}
      <AlertDialog open={!!disconnectingId} onOpenChange={(open) => !open && setDisconnectingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the device and stop syncing data. Existing data will be preserved.
              You can reconnect the device at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => disconnectingId && handleDisconnect(disconnectingId)}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
