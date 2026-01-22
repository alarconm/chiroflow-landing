'use client';

/**
 * Epic 14: Patient Portal - Health Records Access Component
 * US-098: Provide patients access to their health records through portal
 *
 * Features:
 * - View visit history with dates and providers
 * - View diagnoses and treatment plans
 * - View and download visit summaries
 * - View prescribed exercises or home care instructions
 * - HIPAA-compliant access controls
 * - Audit logging of all record access
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  FileText,
  Calendar,
  User,
  Download,
  Stethoscope,
  Activity,
  ClipboardList,
  Target,
  AlertCircle,
  Info,
  Heart,
  Shield,
  Eye,
} from 'lucide-react';

// Types - Using null instead of undefined to match Prisma's return types
interface VisitRecord {
  id: string;
  encounterDate: Date;
  encounterType: string;
  status: string;
  chiefComplaint: string | null;
  provider: {
    id: string;
    name: string;
    title: string | null;
  };
  diagnoses: {
    id: string;
    icd10Code: string;
    description: string;
    isPrimary: boolean;
    status: string;
  }[];
  procedures: {
    id: string;
    cptCode: string;
    description: string;
  }[];
  soapNote: {
    subjective: string | null;
    assessment: string | null;
    plan: string | null;
  } | null;
  hasSummary: boolean;
}

interface DiagnosisRecord {
  id: string;
  icd10Code: string;
  description: string;
  status: string;
  onsetDate: Date | null;
  resolvedDate: Date | null;
  bodySite: string | null;
  encounterDate: Date;
  providerName: string;
}

interface TreatmentPlanRecord {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  frequency: string | null;
  plannedVisits: number | null;
  completedVisits: number;
  provider: {
    name: string;
    title: string | null;
  };
  goals: {
    id: string;
    description: string;
    status: string;
    targetDate: Date | null;
  }[];
}

interface HomeCareInstruction {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  provider: {
    name: string;
  };
  encounterId: string | null;
}

interface VisitSummary {
  id: string;
  encounterDate: Date;
  provider: {
    name: string;
    title: string | null;
  };
  chiefComplaint: string | null;
  diagnoses: string[];
  treatmentPlan: string;
  instructions: string;
  followUp: string | null;
}

export function HealthRecordsAccess() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('visits');
  const [selectedSummary, setSelectedSummary] = useState<VisitSummary | null>(null);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  // Fetch visit history
  const { data: visitsData, isLoading: visitsLoading } = trpc.portal.getVisitHistory.useQuery(
    { sessionToken: token!, limit: 50 },
    { enabled: !!token }
  );

  // Fetch diagnoses
  const { data: diagnosesData, isLoading: diagnosesLoading } = trpc.portal.getDiagnosesList.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Fetch treatment plans
  const { data: treatmentPlansData, isLoading: plansLoading } = trpc.portal.getTreatmentPlans.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Fetch home care instructions
  const { data: instructionsData, isLoading: instructionsLoading } = trpc.portal.getHomeCareInstructions.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Get visit summary mutation
  const getVisitSummary = trpc.portal.getVisitSummary.useMutation({
    onSuccess: (data) => {
      if (data.summary) {
        setSelectedSummary(data.summary);
        setShowSummaryDialog(true);
      }
    },
  });

  const handleViewSummary = (visitId: string) => {
    if (token) {
      getVisitSummary.mutate({ sessionToken: token, encounterId: visitId });
    }
  };

  const handleDownloadSummary = async (visitId: string) => {
    if (!token) return;

    setDownloadingId(visitId);
    try {
      // In a real implementation, this would call an API to generate a PDF
      // For now, we'll create a simple text download
      const response = await fetch(`/api/portal/visit-summary/${visitId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `visit-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to download summary:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  // Helper to render multiline text safely
  const renderMultilineText = (text: string) => {
    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  if (!token) return null;

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      ACTIVE: { label: 'Active', variant: 'default' },
      RESOLVED: { label: 'Resolved', variant: 'secondary' },
      CHRONIC: { label: 'Chronic', variant: 'outline' },
      IN_PROGRESS: { label: 'In Progress', variant: 'default' },
      COMPLETED: { label: 'Completed', variant: 'secondary' },
      SIGNED: { label: 'Signed', variant: 'secondary' },
      ON_HOLD: { label: 'On Hold', variant: 'outline' },
      DISCONTINUED: { label: 'Discontinued', variant: 'destructive' },
    };
    const config = variants[status] || { label: status.replace(/_/g, ' '), variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getEncounterTypeBadge = (type: string) => {
    const types: Record<string, string> = {
      INITIAL: 'Initial Visit',
      FOLLOW_UP: 'Follow-Up',
      RE_EVALUATION: 'Re-Evaluation',
      MAINTENANCE: 'Maintenance',
      EMERGENCY: 'Emergency',
    };
    return <Badge variant="outline">{types[type] || type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Health Records</h1>
        <p className="text-gray-600">
          Access your medical records, visit history, and care instructions
        </p>
      </div>

      {/* HIPAA Notice */}
      <Alert className="bg-blue-50 border-blue-200">
        <Shield className="h-4 w-4 text-[#053e67]" />
        <AlertDescription className="text-blue-800">
          <strong>Your privacy is protected.</strong> All access to your health records is logged
          and protected under HIPAA regulations. Only you and authorized healthcare providers can
          view this information.
        </AlertDescription>
      </Alert>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="visits" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Visits</span>
          </TabsTrigger>
          <TabsTrigger value="diagnoses" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Diagnoses</span>
          </TabsTrigger>
          <TabsTrigger value="treatment" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Treatment</span>
          </TabsTrigger>
          <TabsTrigger value="instructions" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Home Care</span>
          </TabsTrigger>
        </TabsList>

        {/* Visit History Tab */}
        <TabsContent value="visits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Visit History
              </CardTitle>
              <CardDescription>
                Review your past visits, diagnoses, and download visit summaries
              </CardDescription>
            </CardHeader>
            <CardContent>
              {visitsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : visitsData?.visits?.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No visit records found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your visit history will appear here after your appointments
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {visitsData?.visits?.map((visit: VisitRecord) => (
                    <div
                      key={visit.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium">
                              {format(new Date(visit.encounterDate), 'MMMM d, yyyy')}
                            </span>
                            {getEncounterTypeBadge(visit.encounterType)}
                            {getStatusBadge(visit.status)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <User className="h-4 w-4" />
                            <span>
                              {visit.provider.title ? `${visit.provider.title} ` : ''}
                              {visit.provider.name}
                            </span>
                          </div>
                          {visit.chiefComplaint && (
                            <p className="text-sm text-gray-600">
                              <strong>Chief Complaint:</strong> {visit.chiefComplaint}
                            </p>
                          )}
                          {visit.diagnoses.length > 0 && (
                            <div className="mt-2">
                              <p className="text-sm text-gray-500">
                                <strong>Diagnoses:</strong>{' '}
                                {visit.diagnoses.map((d) => d.description).join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSummary(visit.id)}
                            disabled={getVisitSummary.isPending}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {visit.hasSummary && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadSummary(visit.id)}
                              disabled={downloadingId === visit.id}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              {downloadingId === visit.id ? 'Downloading...' : 'Download'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diagnoses Tab */}
        <TabsContent value="diagnoses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Diagnoses
              </CardTitle>
              <CardDescription>
                View your current and past diagnoses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : diagnosesData?.diagnoses?.length === 0 ? (
                <div className="text-center py-12">
                  <Stethoscope className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No diagnoses on file</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Active Diagnoses */}
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      Active Diagnoses
                    </h3>
                    <div className="space-y-3">
                      {diagnosesData?.diagnoses
                        ?.filter((d: DiagnosisRecord) => d.status === 'ACTIVE' || d.status === 'CHRONIC')
                        .map((diagnosis: DiagnosisRecord) => (
                          <div
                            key={diagnosis.id}
                            className="border rounded-lg p-4 bg-green-50/50"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{diagnosis.description}</span>
                                  {getStatusBadge(diagnosis.status)}
                                </div>
                                <p className="text-sm text-gray-600">
                                  ICD-10: {diagnosis.icd10Code}
                                  {diagnosis.bodySite && ` | ${diagnosis.bodySite}`}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Diagnosed: {format(new Date(diagnosis.encounterDate), 'MMM d, yyyy')}
                                  {' by '}{diagnosis.providerName}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      {diagnosesData?.diagnoses?.filter(
                        (d: DiagnosisRecord) => d.status === 'ACTIVE' || d.status === 'CHRONIC'
                      ).length === 0 && (
                        <p className="text-sm text-gray-500 italic">No active diagnoses</p>
                      )}
                    </div>
                  </div>

                  {/* Resolved Diagnoses */}
                  {diagnosesData?.diagnoses?.some((d: DiagnosisRecord) => d.status === 'RESOLVED') && (
                    <div className="mt-6">
                      <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <Heart className="h-4 w-4 text-gray-400" />
                        Resolved Diagnoses
                      </h3>
                      <div className="space-y-3">
                        {diagnosesData?.diagnoses
                          ?.filter((d: DiagnosisRecord) => d.status === 'RESOLVED')
                          .map((diagnosis: DiagnosisRecord) => (
                            <div
                              key={diagnosis.id}
                              className="border rounded-lg p-4 bg-gray-50"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-gray-600">
                                      {diagnosis.description}
                                    </span>
                                    {getStatusBadge(diagnosis.status)}
                                  </div>
                                  <p className="text-sm text-gray-500">
                                    ICD-10: {diagnosis.icd10Code}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {diagnosis.onsetDate && (
                                      <>Onset: {format(new Date(diagnosis.onsetDate), 'MMM d, yyyy')} | </>
                                    )}
                                    {diagnosis.resolvedDate && (
                                      <>Resolved: {format(new Date(diagnosis.resolvedDate), 'MMM d, yyyy')}</>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treatment Plans Tab */}
        <TabsContent value="treatment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Treatment Plans
              </CardTitle>
              <CardDescription>
                View your current and past treatment plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plansLoading ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : treatmentPlansData?.plans?.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No treatment plans on file</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your provider will create a treatment plan after your assessment
                  </p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-4">
                  {treatmentPlansData?.plans?.map((plan: TreatmentPlanRecord) => (
                    <AccordionItem key={plan.id} value={plan.id} className="border rounded-lg">
                      <AccordionTrigger className="px-4 hover:no-underline hover:bg-gray-50">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{plan.name}</span>
                              {getStatusBadge(plan.status)}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {plan.provider.title ? `${plan.provider.title} ` : ''}
                              {plan.provider.name} | Started{' '}
                              {format(new Date(plan.startDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            {plan.completedVisits}/{plan.plannedVisits || '?'} visits
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        {plan.description && (
                          <p className="text-gray-600 mb-4">{plan.description}</p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Frequency</p>
                            <p className="font-medium">{plan.frequency || 'As needed'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Progress</p>
                            <p className="font-medium">
                              {plan.plannedVisits
                                ? Math.round(
                                    (plan.completedVisits / plan.plannedVisits) * 100
                                  )
                                : 0}
                              %
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Start Date</p>
                            <p className="font-medium">
                              {format(new Date(plan.startDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                          {plan.endDate && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">End Date</p>
                              <p className="font-medium">
                                {format(new Date(plan.endDate), 'MMM d, yyyy')}
                              </p>
                            </div>
                          )}
                        </div>

                        {plan.goals.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 mb-2">Treatment Goals</h4>
                            <div className="space-y-2">
                              {plan.goals.map((goal) => (
                                <div
                                  key={goal.id}
                                  className="flex items-center gap-3 p-2 bg-gray-50 rounded"
                                >
                                  <div
                                    className={`w-2 h-2 rounded-full ${
                                      goal.status === 'ACHIEVED'
                                        ? 'bg-green-500'
                                        : goal.status === 'IN_PROGRESS'
                                        ? 'bg-blue-500'
                                        : 'bg-gray-300'
                                    }`}
                                  />
                                  <span className="flex-1 text-sm">{goal.description}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {goal.status.replace('_', ' ')}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Home Care Instructions Tab */}
        <TabsContent value="instructions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Home Care Instructions
              </CardTitle>
              <CardDescription>
                Exercises and care instructions prescribed by your provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              {instructionsLoading ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : instructionsData?.instructions?.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No home care instructions</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your provider will add exercises and care instructions as needed
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {instructionsData?.instructions?.map((instruction: HomeCareInstruction) => (
                    <Card key={instruction.id} className="border-l-4 border-l-[#053e67]">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{instruction.title}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              <Badge variant="outline">{instruction.category}</Badge>
                              <span>|</span>
                              <span>
                                Prescribed by {instruction.provider.name} on{' '}
                                {format(new Date(instruction.createdAt), 'MMM d, yyyy')}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          <p className="whitespace-pre-wrap text-gray-600">
                            {instruction.content}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Important Notice */}
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Important:</strong> These instructions are provided as guidance for your home
              care. If you experience increased pain, discomfort, or any concerning symptoms,
              please contact our office immediately.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      {/* Visit Summary Dialog */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Visit Summary
            </DialogTitle>
            <DialogDescription>
              {selectedSummary && (
                <>
                  {format(new Date(selectedSummary.encounterDate), 'MMMM d, yyyy')} with{' '}
                  {selectedSummary.provider.title ? `${selectedSummary.provider.title} ` : ''}
                  {selectedSummary.provider.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedSummary && (
              <div className="space-y-6">
                {selectedSummary.chiefComplaint && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Chief Complaint
                    </h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {selectedSummary.chiefComplaint}
                    </p>
                  </div>
                )}

                {selectedSummary.diagnoses.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Diagnoses
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {selectedSummary.diagnoses.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedSummary.treatmentPlan && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Treatment Provided
                    </h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {selectedSummary.treatmentPlan}
                    </p>
                  </div>
                )}

                {selectedSummary.instructions && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Instructions
                    </h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {selectedSummary.instructions}
                    </p>
                  </div>
                )}

                {selectedSummary.followUp && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Follow-Up
                    </h4>
                    <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {selectedSummary.followUp}
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowSummaryDialog(false)}>
              Close
            </Button>
            {selectedSummary && (
              <Button
                onClick={() => selectedSummary && handleDownloadSummary(selectedSummary.id)}
                disabled={downloadingId === selectedSummary?.id}
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
