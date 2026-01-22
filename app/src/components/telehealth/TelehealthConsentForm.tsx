/**
 * TelehealthConsentForm Component
 * Epic 21: Telehealth & Virtual Care - US-221
 *
 * Form for managing telehealth consent with digital signature capture,
 * state-specific requirements, and consent verification.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileSignature,
  Send,
  RefreshCw,
  Clock,
  XCircle,
  Eye,
  PenTool,
  FileText,
  AlertTriangle,
  MapPin,
} from 'lucide-react';

// US States for state-specific consent
const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'District of Columbia' },
];

type ConsentType = 'GENERAL' | 'HIPAA' | 'RECORDING' | 'STATE_SPECIFIC';
type ConsentStatus = 'PENDING' | 'SIGNED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

interface TelehealthConsentFormProps {
  patientId: string;
  /** Called when consent is signed successfully */
  onConsentSigned?: (consentId: string) => void;
  /** Called when all required consents are valid */
  onAllConsentsValid?: () => void;
  /** Required consent types for this context */
  requiredConsentTypes?: ConsentType[];
  /** State code for state-specific requirements */
  stateCode?: string;
  /** Session ID if validating for a specific session */
  sessionId?: string;
}

export function TelehealthConsentForm({
  patientId,
  onConsentSigned,
  onAllConsentsValid,
  requiredConsentTypes = ['GENERAL'],
  stateCode,
  sessionId,
}: TelehealthConsentFormProps) {
  const [selectedConsentType, setSelectedConsentType] = useState<ConsentType>('GENERAL');
  const [selectedStateCode, setSelectedStateCode] = useState(stateCode || '');
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [selectedConsentId, setSelectedConsentId] = useState<string | null>(null);
  const [showConsentTextDialog, setShowConsentTextDialog] = useState(false);

  // Signature state
  const [signerName, setSignerName] = useState('');
  const [acknowledgedReading, setAcknowledgedReading] = useState(false);
  const [signatureType, setSignatureType] = useState<'typed' | 'drawn'>('typed');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Check consent status
  const { data: consentStatus, isLoading: statusLoading, refetch: refetchStatus } =
    trpc.telehealth.checkConsent.useQuery({
      patientId,
      consentTypes: requiredConsentTypes,
      stateCode: selectedStateCode || undefined,
    });

  // List patient consents
  const { data: patientConsents, isLoading: consentsLoading, refetch: refetchConsents } =
    trpc.telehealth.listPatientConsents.useQuery({
      patientId,
      includeExpired: true,
    });

  // Get consent details
  const { data: consentDetails, isLoading: detailsLoading } =
    trpc.telehealth.getConsentDetails.useQuery(
      { consentId: selectedConsentId || '' },
      { enabled: !!selectedConsentId && showConsentTextDialog }
    );

  // Get state requirements
  const { data: stateRequirements } = trpc.telehealth.getStateRequirements.useQuery(
    { stateCode: selectedStateCode },
    { enabled: !!selectedStateCode }
  );

  // Validate session consent if sessionId provided
  const { data: sessionValidation } = trpc.telehealth.validateSessionConsent.useQuery(
    { sessionId: sessionId || '', requiredConsentTypes },
    { enabled: !!sessionId }
  );

  // Mutations
  const sendConsentMutation = trpc.telehealth.sendConsent.useMutation({
    onSuccess: () => {
      refetchStatus();
      refetchConsents();
    },
  });

  const signConsentMutation = trpc.telehealth.signConsent.useMutation({
    onSuccess: (result) => {
      setShowSignDialog(false);
      setSignerName('');
      setAcknowledgedReading(false);
      clearCanvas();
      refetchStatus();
      refetchConsents();
      onConsentSigned?.(result.consentId);
    },
  });

  const renewConsentMutation = trpc.telehealth.renewConsent.useMutation({
    onSuccess: () => {
      refetchStatus();
      refetchConsents();
    },
  });

  const revokeConsentMutation = trpc.telehealth.revokeConsent.useMutation({
    onSuccess: () => {
      refetchStatus();
      refetchConsents();
    },
  });

  // Effect to notify when all consents are valid
  useEffect(() => {
    if (consentStatus?.canProceedWithTelehealth) {
      onAllConsentsValid?.();
    }
  }, [consentStatus?.canProceedWithTelehealth, onAllConsentsValid]);

  // Canvas drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getSignatureData = (): string => {
    if (signatureType === 'typed') {
      // For typed signatures, encode the name
      return btoa(`TYPED:${signerName}`);
    } else {
      // For drawn signatures, get canvas data
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return canvas.toDataURL('image/png');
    }
  };

  const handleSendConsent = async () => {
    await sendConsentMutation.mutateAsync({
      patientId,
      consentType: selectedConsentType,
      stateCode: selectedConsentType === 'STATE_SPECIFIC' ? selectedStateCode : undefined,
      sendNotification: true,
    });
  };

  const handleSignConsent = async () => {
    if (!selectedConsentId || !signerName || !acknowledgedReading) return;

    const signatureData = getSignatureData();
    if (!signatureData) {
      return;
    }

    await signConsentMutation.mutateAsync({
      consentId: selectedConsentId,
      signatureData,
      signatureType: signatureType === 'typed' ? 'typed' : 'drawn',
      signerName,
      acknowledgedReading: true,
    });
  };

  const handleRenewConsent = async (consentId: string) => {
    await renewConsentMutation.mutateAsync({ consentId });
  };

  const handleRevokeConsent = async (consentId: string) => {
    const reason = prompt('Please provide a reason for revoking this consent:');
    if (!reason) return;
    await revokeConsentMutation.mutateAsync({ consentId, reason });
  };

  const getStatusBadge = (status: ConsentStatus, isExpired?: boolean) => {
    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    switch (status) {
      case 'SIGNED':
        return <Badge className="bg-green-500">Signed</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'DECLINED':
        return <Badge variant="destructive">Declined</Badge>;
      case 'REVOKED':
        return <Badge variant="destructive">Revoked</Badge>;
      case 'EXPIRED':
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getConsentTypeLabel = (type: ConsentType): string => {
    const labels: Record<ConsentType, string> = {
      GENERAL: 'General Telehealth Consent',
      HIPAA: 'HIPAA Telehealth Notice',
      RECORDING: 'Recording Consent',
      STATE_SPECIFIC: 'State-Specific Consent',
    };
    return labels[type];
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Consent Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Telehealth Consent Status
          </CardTitle>
          <CardDescription>
            Manage patient consent for telehealth services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall Status */}
          {consentStatus?.canProceedWithTelehealth ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Consent Valid</AlertTitle>
              <AlertDescription className="text-green-700">
                All required telehealth consents are valid. Session can proceed.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Consent Required</AlertTitle>
              <AlertDescription>
                {consentStatus?.recommendations?.join('. ') || 'Missing required consent(s).'}
              </AlertDescription>
            </Alert>
          )}

          {/* Session Validation (if sessionId provided) */}
          {sessionId && sessionValidation && !sessionValidation.canProceed && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Session Blocked</AlertTitle>
              <AlertDescription>
                {sessionValidation.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Consent Status Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {requiredConsentTypes.map((type) => {
              const status = consentStatus?.consents?.[type];
              return (
                <Card
                  key={type}
                  className={`${
                    status?.isValid
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-yellow-200 bg-yellow-50/50'
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{getConsentTypeLabel(type)}</p>
                        <div className="mt-1">
                          {status?.isValid ? (
                            <Badge className="bg-green-500">Valid</Badge>
                          ) : status?.hasConsent ? (
                            getStatusBadge(status.status as ConsentStatus)
                          ) : (
                            <Badge variant="outline">Not on file</Badge>
                          )}
                        </div>
                      </div>
                      {status?.isValid ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      )}
                    </div>
                    {status?.daysUntilExpiration !== undefined && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <Clock className="inline h-3 w-3 mr-1" />
                        Expires in {status.daysUntilExpiration} days
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* State-Specific Requirements */}
      {stateRequirements && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              State-Specific Requirements: {stateRequirements.stateName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stateRequirements.requiresSpecificConsent && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>State-Specific Consent Required</AlertTitle>
                <AlertDescription>
                  {stateRequirements.stateName} requires specific telehealth consent documentation.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <h4 className="font-medium">Consent Requirements:</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {stateRequirements.consentRequirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </div>

            {stateRequirements.restrictions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Restrictions:</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {stateRequirements.restrictions.map((restriction, i) => (
                    <li key={i}>{restriction}</li>
                  ))}
                </ul>
              </div>
            )}

            {stateRequirements.notes && (
              <p className="text-sm text-muted-foreground italic">
                Note: {stateRequirements.notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send New Consent */}
      <Card>
        <CardHeader>
          <CardTitle>Request Consent</CardTitle>
          <CardDescription>
            Send a consent form to the patient for signature
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Consent Type</Label>
              <Select
                value={selectedConsentType}
                onValueChange={(v) => setSelectedConsentType(v as ConsentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General Telehealth Consent</SelectItem>
                  <SelectItem value="HIPAA">HIPAA Telehealth Notice</SelectItem>
                  <SelectItem value="RECORDING">Recording Consent</SelectItem>
                  <SelectItem value="STATE_SPECIFIC">State-Specific Consent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedConsentType === 'STATE_SPECIFIC' && (
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={selectedStateCode} onValueChange={setSelectedStateCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSendConsent}
            disabled={
              sendConsentMutation.isPending ||
              (selectedConsentType === 'STATE_SPECIFIC' && !selectedStateCode)
            }
          >
            {sendConsentMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Consent Request
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Consent History */}
      <Card>
        <CardHeader>
          <CardTitle>Consent History</CardTitle>
          <CardDescription>
            All telehealth consents for this patient
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consentsLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : patientConsents && patientConsents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientConsents.map((consent) => (
                  <TableRow key={consent.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {getConsentTypeLabel(consent.consentType as ConsentType)}
                        {consent.stateCode && (
                          <Badge variant="outline" className="ml-1">
                            {consent.stateCode}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(consent.status as ConsentStatus, consent.isExpired)}
                    </TableCell>
                    <TableCell>
                      {consent.signedAt
                        ? new Date(consent.signedAt).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {consent.expirationDate
                        ? new Date(consent.expirationDate).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedConsentId(consent.id);
                            setShowConsentTextDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {consent.status === 'PENDING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedConsentId(consent.id);
                              setShowSignDialog(true);
                            }}
                          >
                            <FileSignature className="h-4 w-4" />
                          </Button>
                        )}

                        {(consent.status === 'SIGNED' || consent.isExpired) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRenewConsent(consent.id)}
                            disabled={renewConsentMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}

                        {consent.status === 'SIGNED' && !consent.isExpired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokeConsent(consent.id)}
                            disabled={revokeConsentMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No consent records found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sign Consent Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign Telehealth Consent</DialogTitle>
            <DialogDescription>
              Please read and sign the consent form
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="typed" onValueChange={(v) => setSignatureType(v as 'typed' | 'drawn')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="typed">Type Signature</TabsTrigger>
              <TabsTrigger value="drawn">Draw Signature</TabsTrigger>
            </TabsList>

            <TabsContent value="typed" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Type your full legal name</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="John Smith"
                  className="text-lg"
                />
                {signerName && (
                  <div className="border rounded-lg p-4 text-center bg-muted/50">
                    <p className="font-signature text-2xl italic">{signerName}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      This will serve as your electronic signature
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="drawn" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Draw your signature below</Label>
                <div className="border rounded-lg p-2 bg-white">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={150}
                    className="w-full border-b border-dashed cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={clearCanvas}>
                  Clear Signature
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Print your name</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="John Smith"
                />
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex items-start space-x-2">
            <Checkbox
              id="acknowledge"
              checked={acknowledgedReading}
              onCheckedChange={(checked) => setAcknowledgedReading(checked === true)}
            />
            <Label htmlFor="acknowledge" className="text-sm leading-relaxed">
              I acknowledge that I have read and understand the telehealth consent form.
              I agree to receive telehealth services and understand the terms and conditions
              outlined in the consent.
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSignConsent}
              disabled={
                !signerName ||
                !acknowledgedReading ||
                signConsentMutation.isPending
              }
            >
              {signConsentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <PenTool className="mr-2 h-4 w-4" />
                  Sign Consent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Consent Text Dialog */}
      <Dialog open={showConsentTextDialog} onOpenChange={setShowConsentTextDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {consentDetails && getConsentTypeLabel(consentDetails.consentType as ConsentType)}
            </DialogTitle>
            <DialogDescription>
              {consentDetails?.status === 'SIGNED'
                ? `Signed by ${consentDetails.signerName} on ${new Date(consentDetails.signedAt!).toLocaleDateString()}`
                : `Status: ${consentDetails?.status}`}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[50vh]">
            {detailsLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {consentDetails?.consentText}
              </div>
            )}
          </ScrollArea>

          {consentDetails?.hasSignature && consentDetails.status === 'SIGNED' && (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Signature:</strong> {consentDetails.signerName}
                <br />
                <strong>Signed:</strong>{' '}
                {new Date(consentDetails.signedAt!).toLocaleString()}
                <br />
                <strong>Signature Type:</strong> {consentDetails.signatureType}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowConsentTextDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Display */}
      {(sendConsentMutation.isError ||
        signConsentMutation.isError ||
        renewConsentMutation.isError ||
        revokeConsentMutation.isError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {sendConsentMutation.error?.message ||
              signConsentMutation.error?.message ||
              renewConsentMutation.error?.message ||
              revokeConsentMutation.error?.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
