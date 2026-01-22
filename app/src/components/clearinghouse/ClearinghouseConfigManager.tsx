'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
  Plus,
  Settings,
  Trash2,
  CheckCircle,
  AlertCircle,
  Star,
  Loader2,
  TestTube,
} from 'lucide-react';
import { ClearinghouseProvider } from '@prisma/client';

export function ClearinghouseConfigManager() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null);
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: configs, isLoading } = trpc.clearinghouse.listConfigs.useQuery();
  const { data: providersData } = trpc.clearinghouse.getProviders.useQuery();

  const createMutation = trpc.clearinghouse.createConfig.useMutation({
    onSuccess: () => {
      utils.clearinghouse.listConfigs.invalidate();
      setIsAddDialogOpen(false);
    },
  });

  const updateMutation = trpc.clearinghouse.updateConfig.useMutation({
    onSuccess: () => {
      utils.clearinghouse.listConfigs.invalidate();
    },
  });

  const deleteMutation = trpc.clearinghouse.deleteConfig.useMutation({
    onSuccess: () => {
      utils.clearinghouse.listConfigs.invalidate();
      setDeleteConfigId(null);
    },
  });

  const testMutation = trpc.clearinghouse.testConnection.useMutation({
    onMutate: (data) => {
      setTestingConfigId(data.configId);
    },
    onSettled: () => {
      setTestingConfigId(null);
    },
  });

  const handleTestConnection = async (configId: string) => {
    try {
      const result = await testMutation.mutateAsync({ configId });
      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.message}`);
    } catch (error) {
      alert(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSetPrimary = (configId: string) => {
    updateMutation.mutate({ id: configId, isPrimary: true });
  };

  const handleToggleActive = (configId: string, currentActive: boolean) => {
    updateMutation.mutate({ id: configId, isActive: !currentActive });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Clearinghouse Configurations</h2>
          <p className="text-sm text-muted-foreground">
            Manage your clearinghouse connections for electronic claims
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Configuration
        </Button>
      </div>

      {configs?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Clearinghouse Configured</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
              Set up a clearinghouse connection to submit claims electronically, verify eligibility,
              and receive remittances.
            </p>
            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Configuration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {configs?.map((config) => (
            <Card key={config.id} className={config.isPrimary ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {config.name}
                      {config.isPrimary && (
                        <Badge variant="default" className="ml-2">
                          <Star className="h-3 w-3 mr-1" />
                          Primary
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{config.providerName}</CardDescription>
                  </div>
                  <Badge variant={config.isActive ? 'default' : 'secondary'}>
                    {config.isActive ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(config.id)}
                    disabled={testingConfigId === config.id}
                  >
                    {testingConfigId === config.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    Test Connection
                  </Button>

                  {!config.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimary(config.id)}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Set Primary
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(config.id, config.isActive)}
                  >
                    {config.isActive ? 'Deactivate' : 'Activate'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteConfigId(config.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Configuration Dialog */}
      <AddConfigDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        providers={providersData?.providers || []}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfigId} onOpenChange={() => setDeleteConfigId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this clearinghouse configuration. Any pending submissions
              using this configuration will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfigId && deleteMutation.mutate({ id: deleteConfigId })}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AddConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Array<{
    provider: ClearinghouseProvider;
    name: string;
    status: string;
    description: string;
  }>;
  onSubmit: (data: {
    provider: ClearinghouseProvider;
    name: string;
    credentials?: Record<string, string>;
    isPrimary?: boolean;
  }) => void;
  isLoading: boolean;
}

function AddConfigDialog({
  open,
  onOpenChange,
  providers,
  onSubmit,
  isLoading,
}: AddConfigDialogProps) {
  const [formData, setFormData] = useState({
    provider: '' as ClearinghouseProvider | '',
    name: '',
    apiKey: '',
    username: '',
    password: '',
    siteId: '',
    isPrimary: false,
  });

  const selectedProvider = providers.find((p) => p.provider === formData.provider);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.provider || !formData.name) return;

    const credentials: Record<string, string> = {};
    if (formData.apiKey) credentials.apiKey = formData.apiKey;
    if (formData.username) credentials.username = formData.username;
    if (formData.password) credentials.password = formData.password;
    if (formData.siteId) credentials.siteId = formData.siteId;

    onSubmit({
      provider: formData.provider,
      name: formData.name,
      credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      isPrimary: formData.isPrimary,
    });

    // Reset form
    setFormData({
      provider: '',
      name: '',
      apiKey: '',
      username: '',
      password: '',
      siteId: '',
      isPrimary: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Clearinghouse Configuration</DialogTitle>
            <DialogDescription>
              Set up a new clearinghouse connection for electronic claims submission.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData({ ...formData, provider: value as ClearinghouseProvider })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a clearinghouse" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.provider} value={p.provider}>
                      <div className="flex items-center gap-2">
                        {p.name}
                        {p.status === 'testing_only' && (
                          <Badge variant="outline" className="text-xs">
                            Testing
                          </Badge>
                        )}
                        {p.status === 'coming_soon' && (
                          <Badge variant="secondary" className="text-xs">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProvider && (
                <p className="text-xs text-muted-foreground">{selectedProvider.description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Configuration Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Primary Clearinghouse"
              />
            </div>

            {/* Provider-specific credential fields */}
            {formData.provider === 'CHANGE_HEALTHCARE' && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Enter API key"
                />
              </div>
            )}

            {(formData.provider === 'TRIZETTO' || formData.provider === 'OFFICE_ALLY') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Enter username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password"
                  />
                </div>
              </>
            )}

            {formData.provider === 'OFFICE_ALLY' && (
              <div className="space-y-2">
                <Label htmlFor="siteId">Site ID</Label>
                <Input
                  id="siteId"
                  value={formData.siteId}
                  onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                  placeholder="Enter site ID"
                />
              </div>
            )}

            {formData.provider === 'AVAILITY' && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Enter API key"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="isPrimary"
                checked={formData.isPrimary}
                onCheckedChange={(checked) => setFormData({ ...formData, isPrimary: checked })}
              />
              <Label htmlFor="isPrimary">Set as primary clearinghouse</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.provider || !formData.name || isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Configuration
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
