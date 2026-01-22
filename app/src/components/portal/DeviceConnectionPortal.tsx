'use client';

/**
 * Epic 24: Wearable & Device Integration - Patient Portal
 * US-247: Device connection portal
 *
 * Patient-facing interface for connecting wearable devices and managing data sharing.
 */

import { useState, useEffect } from 'react';
import {
  Watch,
  Activity,
  Smartphone,
  Link2,
  Unlink,
  CheckCircle,
  AlertCircle,
  Clock,
  WifiOff,
  Shield,
  ChevronRight,
  RefreshCw,
  Settings,
  Info,
  X,
  Heart,
  Moon,
  Footprints,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

// Device type configurations
const DEVICE_CONFIGS: Record<string, {
  name: string;
  icon: typeof Watch;
  color: string;
  bgColor: string;
  description: string;
  features: string[];
  setupSteps: string[];
}> = {
  APPLE_HEALTH: {
    name: 'Apple Health',
    icon: Watch,
    color: 'text-gray-900',
    bgColor: 'bg-gray-100',
    description: 'Sync activity, sleep, and workout data from your iPhone or Apple Watch',
    features: ['Daily steps and distance', 'Sleep analysis', 'Heart rate tracking', 'Workout sessions'],
    setupSteps: [
      'Click "Connect" to start the authorization process',
      'Sign in with your Apple ID when prompted',
      'Select the health data you want to share',
      'Confirm the connection in the Health app on your iPhone',
    ],
  },
  GOOGLE_FIT: {
    name: 'Google Fit',
    icon: Activity,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: 'Sync fitness and wellness data from Google Fit',
    features: ['Daily activity metrics', 'Sleep patterns', 'Heart rate data', 'Workout history'],
    setupSteps: [
      'Click "Connect" to start the authorization',
      'Sign in with your Google account',
      'Grant permission to read your fitness data',
      'Data will sync automatically once connected',
    ],
  },
  FITBIT: {
    name: 'Fitbit',
    icon: Watch,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    description: 'Connect your Fitbit device for comprehensive health tracking',
    features: ['Steps and activity', 'Sleep stages', 'Heart rate zones', 'Active minutes'],
    setupSteps: [
      'Click "Connect" to open Fitbit authorization',
      'Log in to your Fitbit account',
      'Approve data sharing permissions',
      'Your Fitbit data will start syncing',
    ],
  },
  WHOOP: {
    name: 'WHOOP',
    icon: Watch,
    color: 'text-black',
    bgColor: 'bg-stone-100',
    description: 'Sync strain, recovery, and sleep data from your WHOOP',
    features: ['Daily strain score', 'Recovery metrics', 'Sleep performance', 'HRV tracking'],
    setupSteps: [
      'Click "Connect" to authorize WHOOP',
      'Sign in to your WHOOP account',
      'Grant read access to your data',
      'Recovery and strain data will sync daily',
    ],
  },
  POSTURE_SENSOR: {
    name: 'Posture Sensor',
    icon: Smartphone,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    description: 'Track your posture with Upright Go or compatible sensors',
    features: ['Real-time posture score', 'Slouch alerts', 'Daily summaries', 'Progress tracking'],
    setupSteps: [
      'Click "Connect" to register your sensor',
      'Open your sensor\'s companion app',
      'Enable data sharing in the app settings',
      'Enter your ChiroFlow connection code when prompted',
    ],
  },
};

const STATUS_CONFIGS: Record<string, {
  label: string;
  color: string;
  icon: typeof CheckCircle;
}> = {
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
    color: 'bg-stone-100 text-stone-600 border-stone-200',
    icon: WifiOff,
  },
  ERROR: {
    label: 'Error',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle,
  },
};

export function DeviceConnectionPortal() {
  const [token, setToken] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [preferencesConnectionId, setPreferencesConnectionId] = useState<string | null>(null);

  // Data sharing preferences state
  const [shareActivity, setShareActivity] = useState(true);
  const [shareSleep, setShareSleep] = useState(true);
  const [shareHeartRate, setShareHeartRate] = useState(true);
  const [sharePosture, setSharePosture] = useState(true);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  // Fetch device connections
  const {
    data: connections,
    isLoading: isLoadingConnections,
    refetch: refetchConnections,
  } = trpc.portal.getDeviceConnections.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Fetch supported devices
  const { data: supportedDevices, isLoading: isLoadingDevices } = trpc.portal.getSupportedDevices.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Fetch data sharing preferences when editing
  const { data: sharingPrefs, isLoading: isLoadingPrefs } = trpc.portal.getDeviceSharingPreferences.useQuery(
    { sessionToken: token!, connectionId: preferencesConnectionId! },
    { enabled: !!token && !!preferencesConnectionId }
  );

  // Update local state when sharing preferences are loaded
  useEffect(() => {
    if (sharingPrefs) {
      setShareActivity(sharingPrefs.shareActivity);
      setShareSleep(sharingPrefs.shareSleep);
      setShareHeartRate(sharingPrefs.shareHeartRate);
      setSharePosture(sharingPrefs.sharePosture);
    }
  }, [sharingPrefs]);

  // Connect device mutation
  const connectMutation = trpc.portal.connectDevice.useMutation({
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        // Open OAuth popup
        window.open(data.authorizationUrl, '_blank', 'width=600,height=700');
      }
      setSelectedDevice(null);
      setIsConnecting(false);
      refetchConnections();
    },
    onError: () => {
      setIsConnecting(false);
    },
  });

  // Disconnect mutation
  const disconnectMutation = trpc.portal.disconnectDevice.useMutation({
    onSuccess: () => {
      setDisconnectingId(null);
      refetchConnections();
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = trpc.portal.updateDeviceSharingPreferences.useMutation({
    onSuccess: () => {
      setPreferencesConnectionId(null);
      refetchConnections();
    },
  });

  const handleConnect = (deviceType: string) => {
    if (!token) return;
    setIsConnecting(true);
    connectMutation.mutate({
      sessionToken: token,
      deviceType: deviceType as 'APPLE_HEALTH' | 'GOOGLE_FIT' | 'FITBIT' | 'WHOOP' | 'POSTURE_SENSOR',
    });
  };

  const handleDisconnect = () => {
    if (!token || !disconnectingId) return;
    disconnectMutation.mutate({
      sessionToken: token,
      connectionId: disconnectingId,
    });
  };

  const handleSavePreferences = () => {
    if (!token || !preferencesConnectionId) return;
    updatePreferencesMutation.mutate({
      sessionToken: token,
      connectionId: preferencesConnectionId,
      shareActivity,
      shareSleep,
      shareHeartRate,
      sharePosture,
    });
  };

  const connectedDevices = connections?.filter((c) => c.status === 'CONNECTED') || [];
  const availableDeviceTypes = supportedDevices?.filter(
    (d) => !connectedDevices.some((c) => c.deviceType === d.type)
  ) || [];

  if (!token) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Connect Devices</h1>
        <p className="text-stone-600 mt-1">
          Connect your wearable devices to share health data with your care team
        </p>
      </div>

      {/* Privacy Notice */}
      <Alert className="bg-blue-50 border-blue-200">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Your privacy matters.</strong> Your health data is encrypted and only shared with
          your healthcare provider. You can disconnect devices or adjust sharing preferences at any time.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="connected" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="connected" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            My Devices
            {connectedDevices.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {connectedDevices.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="available" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Available
          </TabsTrigger>
        </TabsList>

        {/* Connected Devices Tab */}
        <TabsContent value="connected">
          {isLoadingConnections ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : connectedDevices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                  <Watch className="h-6 w-6 text-stone-400" />
                </div>
                <h3 className="font-medium text-stone-900 mb-2">No devices connected</h3>
                <p className="text-stone-500 mb-4">
                  Connect a wearable device to share your health data with your care team
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const tabTrigger = document.querySelector('[data-state="inactive"][value="available"]');
                    if (tabTrigger instanceof HTMLElement) tabTrigger.click();
                  }}
                >
                  Browse Available Devices
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {connections?.map((connection) => {
                const config = DEVICE_CONFIGS[connection.deviceType];
                const statusConfig = STATUS_CONFIGS[connection.status] || STATUS_CONFIGS.DISCONNECTED;
                const StatusIcon = statusConfig.icon;
                const DeviceIcon = config?.icon || Watch;

                return (
                  <Card key={connection.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              'h-12 w-12 rounded-full flex items-center justify-center',
                              config?.bgColor || 'bg-stone-100'
                            )}
                          >
                            <DeviceIcon className={cn('h-6 w-6', config?.color || 'text-stone-600')} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-stone-900">
                                {config?.name || connection.deviceType}
                              </h3>
                              <Badge className={cn('text-xs', statusConfig.color)}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig.label}
                              </Badge>
                            </div>
                            {connection.lastSyncAt && (
                              <p className="text-sm text-stone-500 mt-1">
                                Last synced {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-stone-600">
                              <span className="flex items-center gap-1">
                                <Footprints className="h-3.5 w-3.5" />
                                {connection.dataCounts?.activityData || 0} days
                              </span>
                              <span className="flex items-center gap-1">
                                <Moon className="h-3.5 w-3.5" />
                                {connection.dataCounts?.sleepData || 0} nights
                              </span>
                              {connection.dataCounts?.heartRateData ? (
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3.5 w-3.5" />
                                  {connection.dataCounts.heartRateData} readings
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreferencesConnectionId(connection.id)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDisconnectingId(connection.id)}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Available Devices Tab */}
        <TabsContent value="available">
          {isLoadingDevices ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {supportedDevices?.map((device) => {
                const config = DEVICE_CONFIGS[device.type];
                const DeviceIcon = config?.icon || Watch;
                const isConnected = connectedDevices.some((c) => c.deviceType === device.type);

                return (
                  <Card
                    key={device.type}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      isConnected && 'opacity-60'
                    )}
                    onClick={() => !isConnected && setSelectedDevice(device.type)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            'h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0',
                            config?.bgColor || 'bg-stone-100'
                          )}
                        >
                          <DeviceIcon className={cn('h-6 w-6', config?.color || 'text-stone-600')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-stone-900">{device.name}</h3>
                            {isConnected ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                Connected
                              </Badge>
                            ) : (
                              <ChevronRight className="h-5 w-5 text-stone-400" />
                            )}
                          </div>
                          <p className="text-sm text-stone-500 mt-1">{device.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {device.dataTypes.map((dt) => (
                              <Badge key={dt} variant="outline" className="text-xs">
                                {dt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Connect Device Dialog */}
      <Dialog open={!!selectedDevice} onOpenChange={() => setSelectedDevice(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedDevice && DEVICE_CONFIGS[selectedDevice] && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center',
                      DEVICE_CONFIGS[selectedDevice].bgColor
                    )}
                  >
                    {(() => {
                      const Icon = DEVICE_CONFIGS[selectedDevice].icon;
                      return <Icon className={cn('h-5 w-5', DEVICE_CONFIGS[selectedDevice].color)} />;
                    })()}
                  </div>
                  <div>
                    <DialogTitle>Connect {DEVICE_CONFIGS[selectedDevice].name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {DEVICE_CONFIGS[selectedDevice].description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Features */}
                <div>
                  <h4 className="text-sm font-medium text-stone-700 mb-3">Data that will be shared:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {DEVICE_CONFIGS[selectedDevice].features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm text-stone-600">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup Steps */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="steps" className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <span className="flex items-center gap-2 text-sm">
                        <Info className="h-4 w-4" />
                        How to connect
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <ol className="space-y-3">
                        {DEVICE_CONFIGS[selectedDevice].setupSteps.map((step, index) => (
                          <li key={index} className="flex gap-3 text-sm text-stone-600">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#053e67] text-white text-xs flex items-center justify-center">
                              {index + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Privacy Note */}
                <Alert className="bg-stone-50 border-stone-200">
                  <Shield className="h-4 w-4 text-stone-600" />
                  <AlertDescription className="text-stone-600 text-sm">
                    Your data is encrypted and shared only with your healthcare provider.
                    You can disconnect at any time.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedDevice(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleConnect(selectedDevice)}
                  disabled={isConnecting}
                  className="bg-[#053e67] hover:bg-[#042e4f]"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={!!disconnectingId} onOpenChange={() => setDisconnectingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing data from this device. Your existing data will remain saved,
              but new data won't be collected until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-red-600 hover:bg-red-700"
            >
              {disconnectMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Data Sharing Preferences Dialog */}
      <Dialog open={!!preferencesConnectionId} onOpenChange={() => setPreferencesConnectionId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data Sharing Preferences</DialogTitle>
            <DialogDescription>
              Choose what health data to share with your care team
            </DialogDescription>
          </DialogHeader>

          {isLoadingPrefs ? (
            <div className="space-y-4 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Footprints className="h-5 w-5 text-stone-500" />
                  <div>
                    <Label htmlFor="share-activity" className="font-medium">Activity Data</Label>
                    <p className="text-xs text-stone-500">Steps, distance, calories</p>
                  </div>
                </div>
                <Switch
                  id="share-activity"
                  checked={shareActivity}
                  onCheckedChange={setShareActivity}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Moon className="h-5 w-5 text-stone-500" />
                  <div>
                    <Label htmlFor="share-sleep" className="font-medium">Sleep Data</Label>
                    <p className="text-xs text-stone-500">Duration, quality, stages</p>
                  </div>
                </div>
                <Switch
                  id="share-sleep"
                  checked={shareSleep}
                  onCheckedChange={setShareSleep}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Heart className="h-5 w-5 text-stone-500" />
                  <div>
                    <Label htmlFor="share-heart" className="font-medium">Heart Rate</Label>
                    <p className="text-xs text-stone-500">BPM, resting, active</p>
                  </div>
                </div>
                <Switch
                  id="share-heart"
                  checked={shareHeartRate}
                  onCheckedChange={setShareHeartRate}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-stone-500" />
                  <div>
                    <Label htmlFor="share-posture" className="font-medium">Posture Data</Label>
                    <p className="text-xs text-stone-500">Score, alerts, trends</p>
                  </div>
                </div>
                <Switch
                  id="share-posture"
                  checked={sharePosture}
                  onCheckedChange={setSharePosture}
                />
              </div>

              <Alert className="mt-4 bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  Your provider may need certain data types to provide optimal care.
                  Consider keeping all data types enabled.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreferencesConnectionId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePreferences}
              disabled={updatePreferencesMutation.isPending}
              className="bg-[#053e67] hover:bg-[#042e4f]"
            >
              {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
