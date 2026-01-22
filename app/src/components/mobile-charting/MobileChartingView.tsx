'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Stethoscope,
  ClipboardList,
  User,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { MobileSOAPEntry } from './MobileSOAPEntry';
import { MobileBodyDiagram } from './MobileBodyDiagram';
import { MobileQuickCodes } from './MobileQuickCodes';

interface MobileChartingViewProps {
  encounterId?: string;
  appointmentId?: string;
  onBack?: () => void;
}

type ChartingTab = 'overview' | 'soap' | 'diagram' | 'codes';

export function MobileChartingView({
  encounterId: initialEncounterId,
  appointmentId,
  onBack,
}: MobileChartingViewProps) {
  const [activeTab, setActiveTab] = useState<ChartingTab>('overview');
  const [encounterId, setEncounterId] = useState<string | undefined>(initialEncounterId);

  const utils = trpc.useUtils();

  // Start encounter from appointment if needed
  const startEncounterMutation = trpc.mobileCharting.startEncounter.useMutation({
    onSuccess: (data) => {
      setEncounterId(data.encounterId);
      if (data.isNew) {
        toast.success('Encounter started');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to start encounter');
    },
  });

  // Get encounter summary
  const {
    data: summary,
    isLoading,
    error,
  } = trpc.mobileCharting.getEncounterSummary.useQuery(
    { encounterId: encounterId! },
    { enabled: !!encounterId }
  );

  // Start encounter if we have appointment but no encounter
  const handleStartEncounter = useCallback(() => {
    if (!appointmentId) return;
    startEncounterMutation.mutate({ appointmentId });
  }, [appointmentId, startEncounterMutation]);

  // If no encounter and have appointment, show start button
  if (!encounterId && appointmentId) {
    return (
      <div className="flex flex-col h-full bg-stone-50">
        <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="text-white hover:bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold">Start Charting</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="py-8 text-center">
              <Stethoscope className="h-12 w-12 mx-auto text-[#053e67] mb-4" />
              <h2 className="text-lg font-semibold mb-2">Ready to Chart</h2>
              <p className="text-stone-500 mb-6">
                Start the encounter to begin documentation
              </p>
              <Button
                className="w-full bg-[#053e67] hover:bg-[#053e67]/90"
                onClick={handleStartEncounter}
                disabled={startEncounterMutation.isPending}
              >
                {startEncounterMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Encounter'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!encounterId) {
    return (
      <div className="flex flex-col h-full bg-stone-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-lg font-semibold mb-2">No Encounter</h2>
              <p className="text-stone-500">
                Select an appointment or encounter to start charting
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-stone-50">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#053e67]" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex flex-col h-full bg-stone-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-lg font-semibold mb-2">Error</h2>
              <p className="text-stone-500">{error?.message || 'Failed to load encounter'}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-stone-50">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ChartingTab)}
        className="flex-1 flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#053e67] text-white">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="text-white hover:bg-white/10"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex-1">
                <h1 className="text-lg font-semibold">{summary.patient.name}</h1>
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <Clock className="h-3 w-3" />
                  {format(parseISO(summary.encounterDate), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
              <Badge
                className={cn(
                  'text-xs',
                  summary.status === 'SCHEDULED' && 'bg-amber-500',
                  summary.status === 'IN_PROGRESS' && 'bg-blue-500',
                  summary.status === 'COMPLETED' && 'bg-green-500',
                  summary.status === 'SIGNED' && 'bg-purple-500',
                  summary.status === 'AMENDED' && 'bg-indigo-500'
                )}
              >
                {summary.status}
              </Badge>
            </div>
          </div>

          {/* Tab navigation */}
          <TabsList className="w-full rounded-none bg-white/10 h-12 px-2">
            <TabsTrigger
              value="overview"
              className="flex-1 text-white data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
            >
              <ClipboardList className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger
              value="soap"
              className="flex-1 text-white data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
            >
              <FileText className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">SOAP</span>
            </TabsTrigger>
            <TabsTrigger
              value="diagram"
              className="flex-1 text-white data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
            >
              <User className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Body</span>
            </TabsTrigger>
            <TabsTrigger
              value="codes"
              className="flex-1 text-white data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
            >
              <Stethoscope className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Codes</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Content */}
        <TabsContent value="overview" className="flex-1 mt-0">
          <ScrollArea className="flex-1 p-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatsCard
                label="SOAP Note"
                value={summary.stats.hasSoapNote ? 'Started' : 'Not Started'}
                icon={<FileText className="h-5 w-5" />}
                status={summary.stats.hasSoapNote ? 'success' : 'pending'}
              />
              <StatsCard
                label="Diagnoses"
                value={summary.stats.diagnosisCount.toString()}
                icon={<ClipboardList className="h-5 w-5" />}
                status={summary.stats.diagnosisCount > 0 ? 'success' : 'pending'}
              />
              <StatsCard
                label="Procedures"
                value={summary.stats.procedureCount.toString()}
                icon={<Stethoscope className="h-5 w-5" />}
                status={summary.stats.procedureCount > 0 ? 'success' : 'pending'}
              />
              <StatsCard
                label="Body Diagrams"
                value={summary.stats.diagramCount.toString()}
                icon={<User className="h-5 w-5" />}
                status={summary.stats.diagramCount > 0 ? 'success' : 'pending'}
              />
            </div>

            {/* Chief Complaint */}
            {summary.chiefComplaint && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-stone-500">Chief Complaint</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{summary.chiefComplaint}</p>
                </CardContent>
              </Card>
            )}

            {/* SOAP Preview */}
            {summary.soapNote && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-stone-500 flex items-center justify-between">
                    SOAP Note Preview
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('soap')}
                    >
                      Edit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary.soapNote.subjective && (
                    <div>
                      <span className="font-semibold text-xs text-blue-600">S:</span>
                      <p className="text-sm text-stone-600 line-clamp-2">
                        {summary.soapNote.subjective}
                      </p>
                    </div>
                  )}
                  {summary.soapNote.objective && (
                    <div>
                      <span className="font-semibold text-xs text-green-600">O:</span>
                      <p className="text-sm text-stone-600 line-clamp-2">
                        {summary.soapNote.objective}
                      </p>
                    </div>
                  )}
                  {summary.soapNote.assessment && (
                    <div>
                      <span className="font-semibold text-xs text-amber-600">A:</span>
                      <p className="text-sm text-stone-600 line-clamp-2">
                        {summary.soapNote.assessment}
                      </p>
                    </div>
                  )}
                  {summary.soapNote.plan && (
                    <div>
                      <span className="font-semibold text-xs text-purple-600">P:</span>
                      <p className="text-sm text-stone-600 line-clamp-2">
                        {summary.soapNote.plan}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Diagnoses List */}
            {summary.diagnoses.length > 0 && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-stone-500 flex items-center justify-between">
                    Diagnoses
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('codes')}
                    >
                      Add More
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {summary.diagnoses.map((dx) => (
                      <li key={dx.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">
                          {dx.icd10Code}
                        </span>
                        <span className="text-stone-600 truncate flex-1">
                          {dx.description}
                        </span>
                        {dx.isPrimary && (
                          <Badge variant="secondary" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Procedures List */}
            {summary.procedures.length > 0 && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-stone-500 flex items-center justify-between">
                    Procedures
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('codes')}
                    >
                      Add More
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {summary.procedures.map((proc) => (
                      <li key={proc.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">
                          {proc.cptCode}
                        </span>
                        <span className="text-stone-600 truncate flex-1">
                          {proc.description}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          x{proc.units}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 pb-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('soap')}
              >
                <FileText className="h-6 w-6 text-[#053e67]" />
                <span className="text-sm">Edit SOAP</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('diagram')}
              >
                <User className="h-6 w-6 text-[#053e67]" />
                <span className="text-sm">Body Diagram</span>
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="soap" className="flex-1 mt-0 overflow-hidden">
          <MobileSOAPEntry
            encounterId={encounterId}
            onSaved={() => {
              utils.mobileCharting.getEncounterSummary.invalidate({ encounterId });
            }}
          />
        </TabsContent>

        <TabsContent value="diagram" className="flex-1 mt-0 overflow-hidden">
          <MobileBodyDiagram
            encounterId={encounterId}
            onSaved={() => {
              utils.mobileCharting.getEncounterSummary.invalidate({ encounterId });
            }}
          />
        </TabsContent>

        <TabsContent value="codes" className="flex-1 mt-0 overflow-hidden">
          <MobileQuickCodes
            encounterId={encounterId}
            onCodeAdded={() => {
              utils.mobileCharting.getEncounterSummary.invalidate({ encounterId });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface StatsCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  status: 'success' | 'pending';
}

function StatsCard({ label, value, icon, status }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              'p-2 rounded-lg',
              status === 'success' ? 'bg-green-100 text-green-600' : 'bg-stone-100 text-stone-400'
            )}
          >
            {icon}
          </div>
          {status === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-stone-300" />
          )}
        </div>
        <p className="text-lg font-semibold mt-2">{value}</p>
        <p className="text-xs text-stone-500">{label}</p>
      </CardContent>
    </Card>
  );
}

export default MobileChartingView;
