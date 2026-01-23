'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Brain,
  AlertTriangle,
  Activity,
  Shield,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { cn } from '@/lib/utils';

import { ClinicalAlertPanel } from './ClinicalAlertPanel';
import { DiagnosisSuggestionsSidebar } from './DiagnosisSuggestionsSidebar';
import { TreatmentRecommendationsDisplay } from './TreatmentRecommendationsDisplay';
import { ContraindicationWarnings } from './ContraindicationWarnings';
import { GuidelineQuickReference } from './GuidelineQuickReference';

interface ClinicalDecisionSupportPanelProps {
  patientId: string;
  encounterId: string;
  chiefComplaint?: string;
  subjective?: string;
  objective?: string;
  primaryDiagnosisCode?: string;
  onDiagnosisAdded?: () => void;
  onUpdate?: () => void;
  readOnly?: boolean;
  defaultExpanded?: boolean;
}

export function ClinicalDecisionSupportPanel({
  patientId,
  encounterId,
  chiefComplaint,
  subjective,
  objective,
  primaryDiagnosisCode,
  onDiagnosisAdded,
  onUpdate,
  readOnly = false,
  defaultExpanded = true,
}: ClinicalDecisionSupportPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState('alerts');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get alert count for badge
  const { data: alerts } = trpc.aiClinical.getPatientAlerts.useQuery({
    patientId,
    encounterId,
    includeAcknowledged: false,
  });

  // Get pending suggestions count
  const { data: suggestions } = trpc.aiClinical.getPendingSuggestions.useQuery({
    encounterId,
  });

  // Get pending treatment recommendations count
  const { data: treatmentRecs } = trpc.aiClinical.getPendingTreatmentRecommendations.useQuery({
    patientId,
    encounterId,
  });

  const activeAlertCount = alerts?.filter(a => a.status === 'ACTIVE').length || 0;
  const criticalAlertCount = alerts?.filter(a => a.status === 'ACTIVE' && a.severity === 'CRITICAL').length || 0;
  const suggestionCount = suggestions?.length || 0;
  const treatmentRecCount = treatmentRecs?.length || 0;

  const totalPendingItems = activeAlertCount + suggestionCount + treatmentRecCount;

  const handleDiagnosisAdded = useCallback(() => {
    onDiagnosisAdded?.();
    onUpdate?.();
  }, [onDiagnosisAdded, onUpdate]);

  return (
    <>
      {/* Collapsible Panel */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <Card className={cn(
          'transition-all',
          criticalAlertCount > 0 ? 'border-red-300 bg-red-50/30' :
          activeAlertCount > 0 ? 'border-orange-300 bg-orange-50/30' : ''
        )}>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Brain className="h-5 w-5 text-[#053e67]" />
                  <CardTitle className="text-lg">AI Clinical Decision Support</CardTitle>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    {criticalAlertCount > 0 && (
                      <Badge className="bg-red-600 text-white text-xs animate-pulse">
                        {criticalAlertCount} Critical
                      </Badge>
                    )}
                    {activeAlertCount > 0 && criticalAlertCount === 0 && (
                      <Badge className="bg-orange-500 text-white text-xs">
                        {activeAlertCount} Alert{activeAlertCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {suggestionCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {suggestionCount} Suggestion{suggestionCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!expanded && totalPendingItems > 0 && (
                    <span className="text-sm text-gray-500">
                      {totalPendingItems} item{totalPendingItems > 1 ? 's' : ''} pending
                    </span>
                  )}
                  {expanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Tab Navigation */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="alerts" className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Alerts
                      {activeAlertCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {activeAlertCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="diagnosis" className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Diagnosis
                      {suggestionCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {suggestionCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="treatment" className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Treatment
                    </TabsTrigger>
                    <TabsTrigger value="safety" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Safety
                    </TabsTrigger>
                    <TabsTrigger value="guidelines" className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Guidelines
                    </TabsTrigger>
                  </TabsList>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSidebarOpen(true)}
                        >
                          <PanelRightOpen className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Open full sidebar view</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Tab Content */}
                <TabsContent value="alerts" className="mt-0">
                  <ClinicalAlertPanel
                    patientId={patientId}
                    encounterId={encounterId}
                    readOnly={readOnly}
                    compact={false}
                  />
                </TabsContent>

                <TabsContent value="diagnosis" className="mt-0">
                  <DiagnosisSuggestionsSidebar
                    encounterId={encounterId}
                    patientId={patientId}
                    chiefComplaint={chiefComplaint}
                    subjective={subjective}
                    objective={objective}
                    onDiagnosisAdded={handleDiagnosisAdded}
                    readOnly={readOnly}
                  />
                </TabsContent>

                <TabsContent value="treatment" className="mt-0">
                  <TreatmentRecommendationsDisplay
                    encounterId={encounterId}
                    patientId={patientId}
                    diagnosisCode={primaryDiagnosisCode}
                    chiefComplaint={chiefComplaint}
                    onRecommendationAccepted={onUpdate}
                    readOnly={readOnly}
                  />
                </TabsContent>

                <TabsContent value="safety" className="mt-0">
                  <ContraindicationWarnings
                    patientId={patientId}
                    encounterId={encounterId}
                    onSafetyCleared={onUpdate}
                    readOnly={readOnly}
                  />
                </TabsContent>

                <TabsContent value="guidelines" className="mt-0">
                  <GuidelineQuickReference
                    diagnosisCode={primaryDiagnosisCode}
                    encounterId={encounterId}
                    onGuidelineApplied={onUpdate}
                    readOnly={readOnly}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Full Sidebar View */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-[#053e67]" />
              AI Clinical Decision Support
            </SheetTitle>
            <SheetDescription>
              Comprehensive clinical decision support tools for this encounter
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Alerts Section - Always Show If Any */}
            {activeAlertCount > 0 && (
              <ClinicalAlertPanel
                patientId={patientId}
                encounterId={encounterId}
                readOnly={readOnly}
                compact={false}
              />
            )}

            {/* Two Column Layout for Diagnosis and Treatment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DiagnosisSuggestionsSidebar
                encounterId={encounterId}
                patientId={patientId}
                chiefComplaint={chiefComplaint}
                subjective={subjective}
                objective={objective}
                onDiagnosisAdded={handleDiagnosisAdded}
                readOnly={readOnly}
              />

              <TreatmentRecommendationsDisplay
                encounterId={encounterId}
                patientId={patientId}
                diagnosisCode={primaryDiagnosisCode}
                chiefComplaint={chiefComplaint}
                onRecommendationAccepted={onUpdate}
                readOnly={readOnly}
              />
            </div>

            {/* Safety Check */}
            <ContraindicationWarnings
              patientId={patientId}
              encounterId={encounterId}
              onSafetyCleared={onUpdate}
              readOnly={readOnly}
            />

            {/* Guidelines */}
            <GuidelineQuickReference
              diagnosisCode={primaryDiagnosisCode}
              encounterId={encounterId}
              onGuidelineApplied={onUpdate}
              readOnly={readOnly}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
