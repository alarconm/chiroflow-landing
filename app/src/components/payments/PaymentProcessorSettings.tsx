'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard,
  Shield,
  Settings,
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Globe,
  Lock,
  Webhook,
  ExternalLink,
  Copy,
} from 'lucide-react';

const processorTypes = [
  {
    value: 'STRIPE',
    label: 'Stripe',
    description: 'Industry-leading payment processing with support for cards, ACH, and more',
    features: ['Cards', 'ACH', 'Apple Pay', 'Google Pay'],
  },
  {
    value: 'SQUARE',
    label: 'Square',
    description: 'Integrated payment solution with POS capabilities',
    features: ['Cards', 'Square POS', 'Invoicing'],
  },
  {
    value: 'AUTHORIZE_NET',
    label: 'Authorize.Net',
    description: 'Traditional payment gateway with healthcare-specific features',
    features: ['Cards', 'eCheck', 'Recurring'],
  },
  {
    value: 'MOCK',
    label: 'Test Mode',
    description: 'Simulated payments for testing and development',
    features: ['Test Cards', 'Simulated Responses'],
  },
];

const cardBrands = [
  { value: 'VISA', label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'AMEX', label: 'American Express' },
  { value: 'DISCOVER', label: 'Discover' },
];

export function PaymentProcessorSettings() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [selectedProcessor, setSelectedProcessor] = useState('STRIPE');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testMode, setTestMode] = useState(true);
  const [acceptedCards, setAcceptedCards] = useState(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER']);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Get current processor configuration
  const { data: processorConfig, isLoading } = trpc.paymentProcessing.getProcessorConfig.useQuery();

  // Update processor mutation
  const updateProcessor = trpc.paymentProcessing.updateProcessorConfig.useMutation({
    onSuccess: () => {
      toast({
        title: 'Configuration Updated',
        description: 'Payment processor settings have been saved.',
      });
      utils.paymentProcessing.getProcessorConfig.invalidate();
      setShowConnectDialog(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Test connection mutation
  const testConnection = trpc.paymentProcessing.testProcessorConnection.useMutation({
    onSuccess: () => {
      toast({
        title: 'Connection Successful',
        description: 'Payment processor is connected and working.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSaveConfig = () => {
    updateProcessor.mutate({
      type: selectedProcessor,
      apiKey,
      secretKey,
      webhookSecret: webhookSecret || undefined,
      testMode,
      supportedCardBrands: acceptedCards,
    });
  };

  const handleTestConnection = () => {
    testConnection.mutate();
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/webhooks/payment`;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: 'Copied',
      description: 'Webhook URL copied to clipboard',
    });
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Processor
              </CardTitle>
              <CardDescription>
                Configure your payment processing integration
              </CardDescription>
            </div>
            {processorConfig?.isConfigured ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Not Configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {processorConfig?.isConfigured ? (
            <>
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Processor:</span>
                  <span className="font-medium">
                    {processorTypes.find((p) => p.value === processorConfig.type)?.label}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Mode:</span>
                  <Badge variant={processorConfig.testMode ? 'secondary' : 'default'}>
                    {processorConfig.testMode ? 'Test Mode' : 'Live Mode'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">API Key:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {showApiKey ? processorConfig.apiKeyMasked : maskKey(processorConfig.apiKeyMasked || '')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Accepted Cards:</span>
                  <div className="flex gap-1">
                    {Array.isArray(processorConfig.supportedCardBrands) && (processorConfig.supportedCardBrands as string[]).map((brand) => (
                      <Badge key={brand} variant="outline" className="text-xs">
                        {brand}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testConnection.isPending}
                >
                  {testConnection.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Settings className="h-4 w-4 mr-2" />
                      Update Settings
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                Connect a payment processor to start accepting card payments
              </p>
              <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-[#053e67] hover:bg-[#042d4d]">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Connect Payment Processor
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure webhooks to receive real-time payment notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/payment`}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL in your payment processor's webhook settings
            </p>
          </div>

          <Alert>
            <Globe className="h-4 w-4" />
            <AlertTitle>Supported Events</AlertTitle>
            <AlertDescription>
              <ul className="text-sm mt-2 space-y-1">
                <li>• payment_intent.succeeded / payment.failed</li>
                <li>• charge.refunded</li>
                <li>• charge.dispute.created / updated / closed</li>
                <li>• payment_method.attached / detached</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Connect/Update Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Payment Processor</DialogTitle>
            <DialogDescription>
              Enter your payment processor credentials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Processor Selection */}
            <div className="space-y-2">
              <Label>Payment Processor</Label>
              <Select value={selectedProcessor} onValueChange={setSelectedProcessor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {processorTypes.map((processor) => (
                    <SelectItem key={processor.value} value={processor.value}>
                      <div>
                        <span className="font-medium">{processor.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {processorTypes.find((p) => p.value === selectedProcessor)?.description}
              </p>
            </div>

            <Separator />

            {/* API Keys */}
            {selectedProcessor !== 'MOCK' && (
              <>
                <div className="space-y-2">
                  <Label>
                    {selectedProcessor === 'STRIPE' ? 'Publishable Key' : 'API Key'}
                  </Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      className="pl-9 pr-10 font-mono"
                      placeholder={selectedProcessor === 'STRIPE' ? 'pk_...' : 'Enter API key'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showSecretKey ? 'text' : 'password'}
                      className="pl-9 pr-10 font-mono"
                      placeholder={selectedProcessor === 'STRIPE' ? 'sk_...' : 'Enter secret key'}
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Webhook Secret (optional)</Label>
                  <Input
                    type="password"
                    className="font-mono"
                    placeholder="whsec_..."
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to verify webhook signatures
                  </p>
                </div>
              </>
            )}

            {/* Test Mode Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Test Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Enable for development and testing
                </p>
              </div>
              <Switch checked={testMode} onCheckedChange={setTestMode} />
            </div>

            {/* Accepted Cards */}
            <div className="space-y-2">
              <Label>Accepted Card Types</Label>
              <div className="flex flex-wrap gap-2">
                {cardBrands.map((brand) => (
                  <Badge
                    key={brand.value}
                    variant={acceptedCards.includes(brand.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      setAcceptedCards((prev) =>
                        prev.includes(brand.value)
                          ? prev.filter((b) => b !== brand.value)
                          : [...prev, brand.value]
                      );
                    }}
                  >
                    {brand.label}
                  </Badge>
                ))}
              </div>
            </div>

            {selectedProcessor !== 'MOCK' && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your API keys are encrypted before being stored and are never exposed in logs or responses.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={
                updateProcessor.isPending ||
                (selectedProcessor !== 'MOCK' && (!apiKey || !secretKey))
              }
            >
              {updateProcessor.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
