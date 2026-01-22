'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, differenceInYears } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  Stethoscope,
  ClipboardList,
  Target,
  ClipboardCheck,
  Printer,
  MoreHorizontal,
  Lock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  SOAPNoteEditor,
  DiagnosisList,
  ProcedureList,
  TreatmentPlanView,
  AssessmentList,
  BodyDiagramSection,
} from '@/components/encounters';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 border-blue-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  SIGNED: 'bg-purple-100 text-purple-800 border-purple-200',
  AMENDED: 'bg-orange-100 text-orange-800 border-orange-200',
};

const encounterTypeLabels: Record<string, string> = {
  INITIAL_EVAL: 'Initial Evaluation',
  FOLLOW_UP: 'Follow-up Visit',
  RE_EVAL: 'Re-evaluation',
  MAINTENANCE: 'Maintenance',
  ACUTE: 'Acute Care',
  DISCHARGE: 'Discharge',
};

export default function EncounterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const encounterId = params.encounterId as string;
  const [activeTab, setActiveTab] = useState('soap');
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const {
    data: encounter,
    isLoading,
    refetch,
  } = trpc.encounter.get.useQuery(
    { id: encounterId },
    { enabled: !!encounterId }
  );

  const { data: patient } = trpc.patient.get.useQuery(
    { id: patientId },
    { enabled: !!patientId }
  );

  const updateStatusMutation = trpc.encounter.update.useMutation({
    onSuccess: () => {
      toast.success('Encounter status updated');
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleStartEncounter = useCallback(() => {
    updateStatusMutation.mutate({
      id: encounterId,
      status: 'IN_PROGRESS',
    });
  }, [encounterId, updateStatusMutation]);

  const handleCompleteEncounter = useCallback(() => {
    updateStatusMutation.mutate({
      id: encounterId,
      status: 'COMPLETED',
    });
    setShowCompleteDialog(false);
  }, [encounterId, updateStatusMutation]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500">Encounter not found</p>
        <Link href={`/patients/${patientId}`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patient
          </Button>
        </Link>
      </div>
    );
  }

  const patientAge = patient?.demographics?.dateOfBirth
    ? differenceInYears(new Date(), new Date(patient.demographics.dateOfBirth))
    : null;

  const isReadOnly = encounter.status === 'SIGNED' || encounter.status === 'AMENDED';
  const canComplete =
    encounter.status === 'IN_PROGRESS' && encounter.soapNote?.isLocked;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href={`/patients/${patientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
              <Link href="/patients" className="hover:text-[#053e67]">
                Patients
              </Link>
              <span>/</span>
              <Link
                href={`/patients/${patientId}`}
                className="hover:text-[#053e67]"
              >
                {patient?.demographics?.lastName}, {patient?.demographics?.firstName}
              </Link>
              <span>/</span>
              <span>Encounter</span>
            </div>
            {/* Title */}
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-stone-900">
                {encounterTypeLabels[encounter.encounterType] || encounter.encounterType}
              </h1>
              <Badge className={cn('font-medium', statusColors[encounter.status])}>
                {encounter.status.replace('_', ' ')}
              </Badge>
              {encounter.soapNote?.isLocked && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Signed
                </Badge>
              )}
            </div>
            {/* Quick info */}
            <div className="flex items-center gap-4 mt-1 text-sm text-stone-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(encounter.encounterDate), 'MMMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {format(new Date(encounter.encounterDate), 'h:mm a')}
              </span>
              {encounter.provider && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  Dr. {encounter.provider.user.lastName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {encounter.status === 'SCHEDULED' && (
            <Button onClick={handleStartEncounter} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Start Encounter
            </Button>
          )}
          {encounter.status === 'IN_PROGRESS' && (
            <Button
              onClick={() => setShowCompleteDialog(true)}
              disabled={!canComplete}
              title={
                !canComplete
                  ? 'Sign and lock the SOAP note before completing'
                  : undefined
              }
            >
              Complete Encounter
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info('Coming soon')}>
                Create Superbill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Coming soon')}>
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => toast.info('Contact support to cancel encounters')}
                className="text-red-600"
                disabled={encounter.status === 'SIGNED'}
              >
                Cancel Encounter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Print Header (hidden on screen) */}
      <div className="hidden print:block border-b pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold">
              {patient?.demographics?.lastName}, {patient?.demographics?.firstName}
            </h1>
            <p className="text-sm text-stone-500">
              MRN: {patient?.mrn} | DOB:{' '}
              {patient?.demographics?.dateOfBirth
                ? format(new Date(patient.demographics.dateOfBirth), 'MM/dd/yyyy')
                : 'N/A'}
              {patientAge !== null && ` (${patientAge} y/o)`}
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium">{encounterTypeLabels[encounter.encounterType]}</p>
            <p className="text-sm text-stone-500">
              {format(new Date(encounter.encounterDate), 'MMMM d, yyyy h:mm a')}
            </p>
            <p className="text-sm text-stone-500">
              Provider: Dr. {encounter.provider?.user.lastName}
            </p>
          </div>
        </div>
      </div>

      {/* Chief Complaint */}
      {encounter.chiefComplaint && (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Chief Complaint</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-stone-700">{encounter.chiefComplaint}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="print:block">
        <TabsList className="grid w-full grid-cols-6 print:hidden">
          <TabsTrigger value="soap" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            SOAP
          </TabsTrigger>
          <TabsTrigger value="diagnoses" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Diagnoses
          </TabsTrigger>
          <TabsTrigger value="procedures" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Procedures
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="assessments" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Assessments
          </TabsTrigger>
          <TabsTrigger value="diagrams" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Diagrams
          </TabsTrigger>
        </TabsList>

        {/* SOAP Tab */}
        <TabsContent value="soap" className="print:block">
          <SOAPNoteEditor
            encounterId={encounterId}
            soapNote={encounter.soapNote}
            onUpdate={refetch}
            readOnly={isReadOnly}
          />
        </TabsContent>

        {/* Diagnoses Tab */}
        <TabsContent value="diagnoses" className="print:block">
          <DiagnosisList encounterId={encounterId} readOnly={isReadOnly} />
        </TabsContent>

        {/* Procedures Tab */}
        <TabsContent value="procedures" className="print:block">
          <ProcedureList encounterId={encounterId} readOnly={isReadOnly} />
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="print:block">
          <TreatmentPlanView
            patientId={patientId}
            encounterId={encounterId}
            readOnly={isReadOnly}
          />
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments" className="print:block">
          <AssessmentList
            encounterId={encounterId}
            patientId={patientId}
            readOnly={isReadOnly}
          />
        </TabsContent>

        {/* Diagrams Tab */}
        <TabsContent value="diagrams" className="print:block print:break-before-page">
          <BodyDiagramSection encounterId={encounterId} patientId={patientId} readOnly={isReadOnly} />
        </TabsContent>
      </Tabs>

      {/* Complete Encounter Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Encounter</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the encounter as complete. The SOAP note has been signed
              and locked. Make sure all diagnoses and procedures have been added before
              completing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompleteEncounter}>
              Complete Encounter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
