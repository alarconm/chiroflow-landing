/**
 * TelehealthDocumentation Component
 * Epic 21: Telehealth & Virtual Care - US-220
 *
 * Form for documenting telehealth visits with telehealth-specific fields,
 * billing codes, and compliance requirements.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  FileText,
  MapPin,
  Stethoscope,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Video,
  Phone,
  Wifi,
  Shield,
} from 'lucide-react';

// US States for location dropdowns
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

interface TelehealthDocumentationProps {
  sessionId: string;
  encounterId?: string;
  onComplete?: (result: {
    soapNoteId: string;
    encounterId: string;
    billingInfo: {
      placeOfServiceCode: string;
      telehealthModifier: string;
    };
  }) => void;
  onCancel?: () => void;
}

type TechnologyType = 'audio_video' | 'audio_only' | 'store_and_forward' | 'remote_monitoring';
type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';
type FollowUpType = 'telehealth' | 'in_person' | 'either';

export function TelehealthDocumentation({
  sessionId,
  encounterId,
  onComplete,
  onCancel,
}: TelehealthDocumentationProps) {
  // Form state
  const [technologyUsed, setTechnologyUsed] = useState<TechnologyType>('audio_video');
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('good');
  const [technicalIssues, setTechnicalIssues] = useState('');

  // Patient location
  const [patientCity, setPatientCity] = useState('');
  const [patientState, setPatientState] = useState('');
  const [isPatientHome, setIsPatientHome] = useState(true);

  // Provider location
  const [providerCity, setProviderCity] = useState('');
  const [providerState, setProviderState] = useState('');

  // Consent
  const [consentVerified, setConsentVerified] = useState(false);

  // SOAP content
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Assessment adequacy
  const [adequateAssessment, setAdequateAssessment] = useState(true);
  const [inadequateReason, setInadequateReason] = useState('');

  // Follow-up
  const [followUpRecommendation, setFollowUpRecommendation] = useState<FollowUpType>('either');

  // Get documentation status
  const { data: docStatus, isLoading: statusLoading } =
    trpc.telehealth.getDocumentationStatus.useQuery({ sessionId });

  // Get SOAP template
  const { data: soapTemplate } = trpc.telehealth.getSOAPTemplate.useQuery();

  // Create telehealth note mutation
  const createNoteMutation = trpc.telehealth.createTelehealthNote.useMutation({
    onSuccess: (result: {
      soapNoteId: string;
      encounterId: string;
      sessionId: string;
      billingInfo: {
        placeOfServiceCode: string;
        telehealthModifier: string;
        patientLocation: string;
        providerLocation: string;
      };
    }) => {
      onComplete?.(result);
    },
  });

  // Apply template to form
  useEffect(() => {
    if (soapTemplate) {
      setSubjective(soapTemplate.subjectiveTemplate.defaultText);
      setObjective(soapTemplate.objectiveTemplate.defaultText);
      setAssessment(soapTemplate.assessmentTemplate.defaultText);
      setPlan(soapTemplate.planTemplate.defaultText);
    }
  }, [soapTemplate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await createNoteMutation.mutateAsync({
      sessionId,
      encounterId,
      technologyUsed,
      connectionQuality,
      technicalIssues: technicalIssues || undefined,
      patientLocation: {
        city: patientCity,
        state: patientState,
        isPatientHome,
      },
      providerLocation: {
        city: providerCity,
        state: providerState,
      },
      consentVerified,
      subjective,
      objective,
      assessment,
      plan,
      adequateAssessment,
      inadequateAssessmentReason: !adequateAssessment ? inadequateReason : undefined,
      followUpRecommendation,
    });
  };

  // Get place of service code based on patient location
  const getPlaceOfServiceCode = () => {
    return isPatientHome ? '10' : '02';
  };

  // Get telehealth modifier based on technology
  const getTelehealthModifier = () => {
    return technologyUsed === 'audio_only' ? '93' : '95';
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
      {/* Documentation Status Banner */}
      {docStatus && !docStatus.documentationStatus.complete && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Documentation Incomplete</AlertTitle>
          <AlertDescription>
            Missing: {docStatus.missingItems.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {docStatus && docStatus.documentationStatus.complete && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Documentation Complete</AlertTitle>
          <AlertDescription className="text-green-700">
            All required telehealth documentation has been completed.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="telehealth" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="telehealth" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Telehealth Info
            </TabsTrigger>
            <TabsTrigger value="soap" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              SOAP Note
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Locations
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>

          {/* Telehealth Info Tab */}
          <TabsContent value="telehealth" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Session Technology</CardTitle>
                <CardDescription>
                  Document the technology used for this telehealth visit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Technology Used</Label>
                    <Select
                      value={technologyUsed}
                      onValueChange={(v) => setTechnologyUsed(v as TechnologyType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="audio_video">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Real-time Audio & Video
                          </div>
                        </SelectItem>
                        <SelectItem value="audio_only">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Audio Only
                          </div>
                        </SelectItem>
                        <SelectItem value="store_and_forward">
                          Store and Forward
                        </SelectItem>
                        <SelectItem value="remote_monitoring">
                          Remote Patient Monitoring
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Connection Quality</Label>
                    <Select
                      value={connectionQuality}
                      onValueChange={(v) => setConnectionQuality(v as ConnectionQuality)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-green-500" />
                            Excellent - No issues
                          </div>
                        </SelectItem>
                        <SelectItem value="good">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-blue-500" />
                            Good - Minor issues
                          </div>
                        </SelectItem>
                        <SelectItem value="fair">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-yellow-500" />
                            Fair - Some disruption
                          </div>
                        </SelectItem>
                        <SelectItem value="poor">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-red-500" />
                            Poor - Significant issues
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Technical Issues (if any)</Label>
                  <Textarea
                    value={technicalIssues}
                    onChange={(e) => setTechnicalIssues(e.target.value)}
                    placeholder="Document any technical issues encountered during the visit..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assessment Adequacy</CardTitle>
                <CardDescription>
                  Document whether the patient could be adequately assessed via telehealth
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="adequateAssessment"
                    checked={adequateAssessment}
                    onCheckedChange={(checked) => setAdequateAssessment(checked === true)}
                  />
                  <Label htmlFor="adequateAssessment">
                    Patient could be adequately assessed via telehealth
                  </Label>
                </div>

                {!adequateAssessment && (
                  <div className="space-y-2">
                    <Label>Reason for inadequate assessment</Label>
                    <Textarea
                      value={inadequateReason}
                      onChange={(e) => setInadequateReason(e.target.value)}
                      placeholder="Explain why telehealth assessment was inadequate..."
                      rows={2}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Follow-up Recommendation</Label>
                  <Select
                    value={followUpRecommendation}
                    onValueChange={(v) => setFollowUpRecommendation(v as FollowUpType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telehealth">
                        Continue with telehealth visits
                      </SelectItem>
                      <SelectItem value="in_person">
                        In-person visit recommended for next appointment
                      </SelectItem>
                      <SelectItem value="either">
                        Either telehealth or in-person appropriate
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Consent Verification
                </CardTitle>
                <CardDescription>
                  Verify telehealth consent before proceeding
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consentVerified"
                    checked={consentVerified}
                    onCheckedChange={(checked) => setConsentVerified(checked === true)}
                  />
                  <Label htmlFor="consentVerified">
                    I verify that telehealth consent is on file and valid for this patient
                  </Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SOAP Note Tab */}
          <TabsContent value="soap" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Telehealth SOAP Note</CardTitle>
                <CardDescription>
                  Document the clinical encounter with telehealth-specific content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Subjective</Label>
                  <ScrollArea className="h-[200px]">
                    <Textarea
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      placeholder="Chief complaint, history of present illness, review of systems..."
                      className="min-h-[180px] resize-none"
                    />
                  </ScrollArea>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Objective</Label>
                  <Alert className="mb-2">
                    <Stethoscope className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      Note: Physical examination is limited via telehealth. Document visual
                      observations and patient-demonstrated findings.
                    </AlertDescription>
                  </Alert>
                  <ScrollArea className="h-[200px]">
                    <Textarea
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Visual observation, patient-demonstrated ROM, general appearance..."
                      className="min-h-[180px] resize-none"
                    />
                  </ScrollArea>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Assessment</Label>
                  <ScrollArea className="h-[150px]">
                    <Textarea
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      placeholder="Clinical impression, diagnosis, response to treatment..."
                      className="min-h-[130px] resize-none"
                    />
                  </ScrollArea>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Plan</Label>
                  <ScrollArea className="h-[200px]">
                    <Textarea
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder="Treatment plan, patient education, follow-up recommendations..."
                      className="min-h-[180px] resize-none"
                    />
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Locations Tab */}
          <TabsContent value="locations" className="space-y-4 mt-4">
            <Alert>
              <MapPin className="h-4 w-4" />
              <AlertTitle>Location Documentation Required</AlertTitle>
              <AlertDescription>
                Both patient and provider locations must be documented for proper billing
                and regulatory compliance.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Patient Location</CardTitle>
                  <CardDescription>
                    Where is the patient located during this visit?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={patientCity}
                      onChange={(e) => setPatientCity(e.target.value)}
                      placeholder="City"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select value={patientState} onValueChange={setPatientState}>
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPatientHome"
                      checked={isPatientHome}
                      onCheckedChange={(checked) => setIsPatientHome(checked === true)}
                    />
                    <Label htmlFor="isPatientHome">Patient is at their home</Label>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Place of Service: <Badge variant="secondary">{getPlaceOfServiceCode()}</Badge>
                    <span className="ml-2">
                      ({isPatientHome ? "Patient's home" : 'Telehealth - other location'})
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Provider Location</CardTitle>
                  <CardDescription>
                    Where is the provider located during this visit?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={providerCity}
                      onChange={(e) => setProviderCity(e.target.value)}
                      placeholder="City"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select value={providerState} onValueChange={setProviderState}>
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Telehealth Billing Information</CardTitle>
                <CardDescription>
                  Auto-calculated billing codes based on session details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Place of Service Code</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-lg px-4 py-2">
                        {getPlaceOfServiceCode()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {isPatientHome
                          ? "Telehealth - Patient's Home"
                          : 'Telehealth - Other Location'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Telehealth Modifier</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-lg px-4 py-2">
                        {getTelehealthModifier()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {technologyUsed === 'audio_only'
                          ? 'Audio-only communication technology'
                          : 'Synchronous telemedicine via audio/video'}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <h4 className="font-medium">Billing Summary</h4>
                  <ul className="text-sm space-y-1">
                    <li className="flex justify-between">
                      <span>Patient Location:</span>
                      <span className="font-medium">
                        {patientCity && patientState
                          ? `${patientCity}, ${patientState}`
                          : 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>Provider Location:</span>
                      <span className="font-medium">
                        {providerCity && providerState
                          ? `${providerCity}, ${providerState}`
                          : 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>Place of Service:</span>
                      <span className="font-medium">{getPlaceOfServiceCode()}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Modifier:</span>
                      <span className="font-medium">{getTelehealthModifier()}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Technology:</span>
                      <span className="font-medium">
                        {technologyUsed.replace(/_/g, ' ')}
                      </span>
                    </li>
                  </ul>
                </div>

                <Alert>
                  <CreditCard className="h-4 w-4" />
                  <AlertDescription>
                    The telehealth modifier ({getTelehealthModifier()}) will be automatically
                    added to all procedure codes for this encounter when you save.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Form Actions */}
        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              createNoteMutation.isPending ||
              !patientCity ||
              !patientState ||
              !providerCity ||
              !providerState ||
              !consentVerified
            }
          >
            {createNoteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save Telehealth Documentation
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Error Display */}
      {createNoteMutation.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {createNoteMutation.error.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
