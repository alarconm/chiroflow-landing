'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  X,
  GitMerge,
  Server,
  Smartphone,
  Clock,
  FileText,
} from 'lucide-react';

interface ConflictData {
  clientId: string;
  entityType: string;
  entityId: string | null;
  clientData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  queuedAt: Date;
}

interface MobileConflictResolverProps {
  conflicts: ConflictData[];
  onResolve: (
    clientId: string,
    resolution: 'use_client' | 'use_server' | 'merge',
    mergedData?: Record<string, unknown>
  ) => Promise<void>;
  onDismiss?: () => void;
  className?: string;
}

export function MobileConflictResolver({
  conflicts,
  onResolve,
  onDismiss,
  className = '',
}: MobileConflictResolverProps) {
  const [selectedConflict, setSelectedConflict] = useState<ConflictData | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  const handleResolve = async (resolution: 'use_client' | 'use_server' | 'merge') => {
    if (!selectedConflict) return;

    setResolving(true);
    try {
      await onResolve(selectedConflict.clientId, resolution);
      setSelectedConflict(null);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      appointment: 'Appointment',
      encounter: 'Encounter',
      soapNote: 'SOAP Note',
      patient: 'Patient',
      bodyDiagram: 'Body Diagram',
    };
    return labels[type] || type;
  };

  const renderDataDiff = (clientData: Record<string, unknown>, serverData: Record<string, unknown>) => {
    const allKeys = new Set([...Object.keys(clientData), ...Object.keys(serverData)]);
    const differences: Array<{
      key: string;
      clientValue: unknown;
      serverValue: unknown;
      isDifferent: boolean;
    }> = [];

    allKeys.forEach((key) => {
      const clientValue = clientData[key];
      const serverValue = serverData[key];
      const isDifferent = JSON.stringify(clientValue) !== JSON.stringify(serverValue);
      differences.push({ key, clientValue, serverValue, isDifferent });
    });

    return differences.filter((d) => d.isDifferent);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      if (value instanceof Date) return formatDate(value);
      return JSON.stringify(value).slice(0, 50) + '...';
    }
    return String(value).slice(0, 100);
  };

  if (conflicts.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Check className="h-12 w-12 mx-auto text-green-600 mb-4" />
          <p className="text-lg font-medium">No Conflicts</p>
          <p className="text-sm text-muted-foreground">All your data is in sync</p>
          {onDismiss && (
            <Button variant="outline" className="mt-4" onClick={onDismiss}>
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Conflict List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Sync Conflicts
              </CardTitle>
              <CardDescription>
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} need resolution
              </CardDescription>
            </div>
            {onDismiss && (
              <Button variant="ghost" size="icon" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {conflicts.map((conflict) => (
                <button
                  key={conflict.clientId}
                  onClick={() => setSelectedConflict(conflict)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedConflict?.clientId === conflict.clientId
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {getEntityTypeLabel(conflict.entityType)}
                      </span>
                    </div>
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDate(conflict.queuedAt)}
                    </Badge>
                  </div>
                  {conflict.entityId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: {conflict.entityId.slice(0, 8)}...
                    </p>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Selected Conflict Detail */}
      {selectedConflict && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resolve Conflict</CardTitle>
            <CardDescription>
              Choose which version to keep or merge the changes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Data Comparison */}
            <Tabs defaultValue="diff" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="diff">Differences</TabsTrigger>
                <TabsTrigger value="device">Device</TabsTrigger>
                <TabsTrigger value="server">Server</TabsTrigger>
              </TabsList>

              <TabsContent value="diff" className="mt-4">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-3">
                    {renderDataDiff(
                      selectedConflict.clientData,
                      selectedConflict.serverData
                    ).map(({ key, clientValue, serverValue }) => (
                      <div key={key} className="p-2 bg-muted/50 rounded-lg">
                        <p className="text-sm font-medium mb-2">{key}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded">
                            <p className="text-blue-600 dark:text-blue-400 mb-1">Device</p>
                            <p className="font-mono">{formatValue(clientValue)}</p>
                          </div>
                          <div className="p-2 bg-green-50 dark:bg-green-950 rounded">
                            <p className="text-green-600 dark:text-green-400 mb-1">Server</p>
                            <p className="font-mono">{formatValue(serverValue)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {renderDataDiff(selectedConflict.clientData, selectedConflict.serverData)
                      .length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No visible differences (may be internal metadata)
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="device" className="mt-4">
                <ScrollArea className="h-[200px]">
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedConflict.clientData, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="server" className="mt-4">
                <ScrollArea className="h-[200px]">
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedConflict.serverData, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Resolution Options */}
            <Alert>
              <AlertDescription className="text-sm">
                Choose how to resolve this conflict. Your choice will be applied immediately.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleResolve('use_client')}
                disabled={resolving}
              >
                <Smartphone className="h-5 w-5 mr-3 text-blue-600" />
                <div className="text-left">
                  <p className="font-medium">Use Device Version</p>
                  <p className="text-xs text-muted-foreground">
                    Keep your offline changes, discard server version
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleResolve('use_server')}
                disabled={resolving}
              >
                <Server className="h-5 w-5 mr-3 text-green-600" />
                <div className="text-left">
                  <p className="font-medium">Use Server Version</p>
                  <p className="text-xs text-muted-foreground">
                    Accept server changes, discard your offline edits
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => setShowMergeDialog(true)}
                disabled={resolving}
              >
                <GitMerge className="h-5 w-5 mr-3 text-purple-600" />
                <div className="text-left">
                  <p className="font-medium">Merge Changes</p>
                  <p className="text-xs text-muted-foreground">
                    Manually combine both versions (advanced)
                  </p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Changes</DialogTitle>
            <DialogDescription>
              Merging requires manual editing. For complex conflicts, consider using the desktop
              application.
            </DialogDescription>
          </DialogHeader>

          {selectedConflict && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Automatic merge will combine both versions. Fields that differ will use the more
                  recent value.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-center gap-4 py-4">
                <div className="text-center">
                  <Smartphone className="h-8 w-8 mx-auto text-blue-600 mb-1" />
                  <p className="text-sm font-medium">Device</p>
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <GitMerge className="h-8 w-8 mx-auto text-purple-600 mb-1" />
                  <p className="text-sm font-medium">Merged</p>
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <Server className="h-8 w-8 mx-auto text-green-600 mb-1" />
                  <p className="text-sm font-medium">Server</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowMergeDialog(false);
                handleResolve('merge');
              }}
              disabled={resolving}
            >
              Auto-Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
