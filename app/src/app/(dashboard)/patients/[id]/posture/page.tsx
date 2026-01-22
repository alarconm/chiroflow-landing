'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Camera,
  Plus,
  ImageIcon,
  Activity,
  Target,
  History,
  ChevronRight,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Download,
  Eye,
  BarChart3,
  Scan,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Import posture components
import { PostureCapture, LandmarkEditor } from '@/components/posture';
import { ROMDiagram, ROMSummaryCard } from '@/components/rom';
import { FMSScoring, type FMSTestInput } from '@/components/fms';

// Types
type PostureView = 'ANTERIOR' | 'POSTERIOR' | 'LATERAL_LEFT' | 'LATERAL_RIGHT';

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  MINIMAL: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  MILD: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  MODERATE: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  SEVERE: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  EXTREME: { bg: 'bg-red-200', text: 'text-red-800', border: 'border-red-400' },
};

const viewLabels: Record<PostureView, string> = {
  ANTERIOR: 'Front',
  POSTERIOR: 'Back',
  LATERAL_LEFT: 'Left Side',
  LATERAL_RIGHT: 'Right Side',
};

export default function PostureAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [showCapture, setShowCapture] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [compareAssessmentId, setCompareAssessmentId] = useState<string | null>(null);
  const [showROMEntry, setShowROMEntry] = useState(false);
  const [showFMSEntry, setShowFMSEntry] = useState(false);

  // Queries
  const { data: patient, isLoading: patientLoading } = trpc.patient.get.useQuery(
    { id: patientId },
    { enabled: !!patientId }
  );

  const { data: assessmentsData, isLoading: assessmentsLoading, refetch: refetchAssessments } =
    trpc.posture.listByPatient.useQuery(
      { patientId, includeComplete: true },
      { enabled: !!patientId }
    );

  const { data: postureSummary } = trpc.posture.getPatientSummary.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  const { data: romSummary } = trpc.rom.getPatientSummary.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  const { data: fmsSummary } = trpc.fms.getPatientSummary.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  // Selected assessment data
  const { data: selectedAssessment, isLoading: assessmentLoading } =
    trpc.posture.getAssessment.useQuery(
      { id: selectedAssessmentId! },
      { enabled: !!selectedAssessmentId }
    );

  const { data: deviationsData } = trpc.posture.getDeviations.useQuery(
    { assessmentId: selectedAssessmentId! },
    { enabled: !!selectedAssessmentId }
  );

  // ROM diagram data
  const { data: romDiagramData } = trpc.rom.getDiagramData.useQuery(
    { patientId },
    { enabled: !!patientId && activeTab === 'rom' }
  );

  // Note: Comparison is done in the UI by fetching both assessments and their deviations
  // The comparison functionality is built into the UI components

  // Mutations
  const analyzeDeviationsMutation = trpc.posture.analyzeDeviations.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchAssessments();
    },
    onError: (error) => toast.error(error.message),
  });

  const analyzeLandmarksMutation = trpc.posture.analyzeAssessment.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => toast.error(error.message),
  });

  const completeAssessmentMutation = trpc.posture.completeAssessment.useMutation({
    onSuccess: () => {
      toast.success('Assessment completed');
      refetchAssessments();
    },
    onError: (error) => toast.error(error.message),
  });

  // Derived data
  const assessments = assessmentsData?.assessments || [];
  const latestAssessment = assessments[0];
  const completedAssessments = assessments.filter(a => a.isComplete);

  // Auto-select latest assessment
  useEffect(() => {
    if (!selectedAssessmentId && latestAssessment) {
      setSelectedAssessmentId(latestAssessment.id);
    }
  }, [latestAssessment, selectedAssessmentId]);

  // Handlers
  const handleCaptureComplete = (assessmentId: string) => {
    setShowCapture(false);
    setSelectedAssessmentId(assessmentId);
    refetchAssessments();
    toast.success('Photos captured successfully');
  };

  const handleAnalyze = async (assessmentId: string) => {
    // First analyze landmarks
    await analyzeLandmarksMutation.mutateAsync({ assessmentId });
    // Then analyze deviations
    await analyzeDeviationsMutation.mutateAsync({ assessmentId });
  };

  const handleExportPDF = async () => {
    if (!selectedAssessmentId || !compareAssessmentId) {
      toast.error('Select two assessments to compare');
      return;
    }
    // Generate PDF using comparison report
    toast.info('PDF export coming soon...');
  };

  if (patientLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#053e67]" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500">Patient not found</p>
        <Link href="/patients">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Button>
        </Link>
      </div>
    );
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : patient.mrn;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/patients/${patientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
              <Link href="/patients" className="hover:text-[#053e67]">Patients</Link>
              <ChevronRight className="h-4 w-4" />
              <Link href={`/patients/${patientId}`} className="hover:text-[#053e67]">
                {patient.mrn}
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span>Posture Analysis</span>
            </div>
            <h1 className="text-2xl font-bold text-stone-900">
              Posture & Movement Analysis
            </h1>
            <p className="text-sm text-stone-500 mt-1">{patientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={showCapture} onOpenChange={setShowCapture}>
            <DialogTrigger asChild>
              <Button>
                <Camera className="h-4 w-4 mr-2" />
                New Assessment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Capture Posture Photos</DialogTitle>
                <DialogDescription>
                  Take photos from multiple angles for comprehensive posture analysis.
                </DialogDescription>
              </DialogHeader>
              <PostureCapture
                patientId={patientId}
                onComplete={handleCaptureComplete}
                onCancel={() => setShowCapture(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Camera className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{postureSummary?.totalAssessments || 0}</p>
                <p className="text-sm text-muted-foreground">Posture Assessments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{romSummary?.totalMeasurements || 0}</p>
                <p className="text-sm text-muted-foreground">ROM Measurements</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fmsSummary?.totalAssessments || 0}</p>
                <p className="text-sm text-muted-foreground">FMS Assessments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {postureSummary?.recentAssessment
                    ? formatDistanceToNow(new Date(postureSummary.recentAssessment.assessmentDate), {
                        addSuffix: true,
                      })
                    : 'Never'}
                </p>
                <p className="text-sm text-muted-foreground">Last Assessment</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="deviations" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Deviations</span>
          </TabsTrigger>
          <TabsTrigger value="rom" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">ROM</span>
          </TabsTrigger>
          <TabsTrigger value="fms" className="gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">FMS</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Compare</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {assessmentsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : assessments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Camera className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Assessments Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by capturing posture photos for this patient.
                </p>
                <Button onClick={() => setShowCapture(true)}>
                  <Camera className="h-4 w-4 mr-2" />
                  Capture Photos
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Assessment Selector */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Select Assessment</CardTitle>
                    <Select
                      value={selectedAssessmentId || ''}
                      onValueChange={setSelectedAssessmentId}
                    >
                      <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Select an assessment" />
                      </SelectTrigger>
                      <SelectContent>
                        {assessments.map((assessment) => (
                          <SelectItem key={assessment.id} value={assessment.id}>
                            {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                            {assessment.isComplete ? ' ✓' : ' (In Progress)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
              </Card>

              {/* Selected Assessment Details */}
              {selectedAssessment && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Images Grid */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Posture Images</CardTitle>
                        <div className="flex gap-2">
                          {!selectedAssessment.isComplete && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAnalyze(selectedAssessment.id)}
                                disabled={analyzeLandmarksMutation.isPending || analyzeDeviationsMutation.isPending}
                              >
                                {analyzeLandmarksMutation.isPending || analyzeDeviationsMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Scan className="h-4 w-4 mr-2" />
                                )}
                                Analyze
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => completeAssessmentMutation.mutate({
                                  assessmentId: selectedAssessment.id,
                                })}
                                disabled={completeAssessmentMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Complete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {selectedAssessment.images.map((image) => (
                          <div
                            key={image.id}
                            className={cn(
                              'relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all',
                              selectedImageId === image.id
                                ? 'border-[#053e67] ring-2 ring-[#053e67]/20'
                                : 'border-transparent hover:border-stone-300'
                            )}
                            onClick={() => setSelectedImageId(image.id)}
                          >
                            <img
                              src={image.thumbnailUrl || image.imageUrl}
                              alt={`${viewLabels[image.view as PostureView]} view`}
                              className="w-full aspect-[3/4] object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <Badge variant="secondary" className="text-xs">
                                {viewLabels[image.view as PostureView]}
                              </Badge>
                              {image.isAnalyzed && (
                                <Badge className="ml-1 text-xs bg-green-500">
                                  Analyzed
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImageId(image.id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {selectedAssessment.images.length < 4 && !selectedAssessment.isComplete && (
                          <div
                            className="flex items-center justify-center aspect-[3/4] border-2 border-dashed border-stone-300 rounded-lg cursor-pointer hover:border-[#053e67] hover:bg-stone-50 transition-colors"
                            onClick={() => setShowCapture(true)}
                          >
                            <div className="text-center">
                              <Plus className="h-8 w-8 text-stone-400 mx-auto mb-2" />
                              <p className="text-sm text-stone-500">Add View</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Assessment Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Assessment Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="font-medium">
                          {format(new Date(selectedAssessment.assessmentDate), 'MMMM d, yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={selectedAssessment.isComplete ? 'default' : 'secondary'}>
                          {selectedAssessment.isComplete ? 'Complete' : 'In Progress'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Images</p>
                        <p className="font-medium">{selectedAssessment.images.length} / 4 views</p>
                      </div>
                      {deviationsData && (
                        <>
                          <div>
                            <p className="text-sm text-muted-foreground">Deviations Found</p>
                            <p className="font-medium">{deviationsData.totalCount}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Overall Severity</p>
                            <Badge className={cn(
                              severityColors[deviationsData.overallSeverity]?.bg,
                              severityColors[deviationsData.overallSeverity]?.text
                            )}>
                              {deviationsData.overallSeverity}
                            </Badge>
                          </div>
                        </>
                      )}
                      {selectedAssessment.notes && (
                        <div>
                          <p className="text-sm text-muted-foreground">Notes</p>
                          <p className="text-sm">{selectedAssessment.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Landmark Editor Dialog */}
              {selectedImageId && selectedAssessment && (
                <Dialog open={!!selectedImageId} onOpenChange={() => setSelectedImageId(null)}>
                  <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Landmarks</DialogTitle>
                      <DialogDescription>
                        Adjust landmark positions for accurate deviation analysis.
                      </DialogDescription>
                    </DialogHeader>
                    {(() => {
                      const image = selectedAssessment.images.find(i => i.id === selectedImageId);
                      if (!image) return null;
                      return (
                        <LandmarkEditor
                          imageId={image.id}
                          imageUrl={image.imageUrl}
                          view={image.view as PostureView}
                          onSave={() => {
                            setSelectedImageId(null);
                            refetchAssessments();
                          }}
                        />
                      );
                    })()}
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </TabsContent>

        {/* Deviations Tab */}
        <TabsContent value="deviations" className="space-y-6">
          {!selectedAssessmentId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <p className="text-muted-foreground">Select an assessment to view deviations.</p>
              </CardContent>
            </Card>
          ) : !deviationsData || deviationsData.totalCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Scan className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Deviations Analyzed</h3>
                <p className="text-muted-foreground mb-4">
                  Run the analysis to detect postural deviations.
                </p>
                <Button onClick={() => handleAnalyze(selectedAssessmentId)}>
                  <Scan className="h-4 w-4 mr-2" />
                  Run Analysis
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Overall Summary */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Deviation Summary</CardTitle>
                    <Badge className={cn(
                      'text-lg px-4 py-1',
                      severityColors[deviationsData.overallSeverity]?.bg,
                      severityColors[deviationsData.overallSeverity]?.text
                    )}>
                      {deviationsData.overallSeverity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-stone-50 rounded-lg">
                      <p className="text-3xl font-bold">{deviationsData.totalCount}</p>
                      <p className="text-sm text-muted-foreground">Total Deviations</p>
                    </div>
                    <div className="text-center p-4 bg-stone-50 rounded-lg">
                      <p className="text-3xl font-bold text-orange-600">
                        {deviationsData.significantCount}
                      </p>
                      <p className="text-sm text-muted-foreground">Significant</p>
                    </div>
                    <div className="text-center p-4 bg-stone-50 rounded-lg">
                      <p className="text-3xl font-bold text-green-600">
                        {deviationsData.totalCount - deviationsData.significantCount}
                      </p>
                      <p className="text-sm text-muted-foreground">Minimal</p>
                    </div>
                    <div className="text-center p-4 bg-stone-50 rounded-lg">
                      <p className="text-3xl font-bold">
                        {Object.keys(deviationsData.groupedDeviations).filter(
                          k => (deviationsData.groupedDeviations as Record<string, unknown[]>)[k].length > 0
                        ).length}
                      </p>
                      <p className="text-sm text-muted-foreground">Body Regions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Deviations by Body Region */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(deviationsData.groupedDeviations as Record<string, Array<{
                  id: string;
                  deviationType: string;
                  measurementValue: number | null;
                  measurementUnit: string;
                  direction: string | null;
                  severity: string;
                }>>).map(([region, deviations]) => {
                  if (deviations.length === 0) return null;

                  const regionLabels: Record<string, string> = {
                    headNeck: 'Head & Neck',
                    shoulders: 'Shoulders',
                    spine: 'Spine',
                    pelvis: 'Pelvis',
                    knees: 'Knees',
                    ankles: 'Ankles',
                    overall: 'Overall',
                  };

                  return (
                    <Card key={region}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{regionLabels[region] || region}</CardTitle>
                        <CardDescription>{deviations.length} deviation(s)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {deviations.map((deviation) => (
                            <div
                              key={deviation.id}
                              className="flex items-start justify-between p-2 rounded-lg bg-stone-50"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-sm">{deviation.deviationType}</p>
                                {deviation.measurementValue !== null && (
                                  <p className="text-xs text-muted-foreground">
                                    {deviation.measurementValue.toFixed(1)}
                                    {deviation.measurementUnit}
                                    {deviation.direction && ` (${deviation.direction})`}
                                  </p>
                                )}
                              </div>
                              <Badge className={cn(
                                'ml-2',
                                severityColors[deviation.severity]?.bg,
                                severityColors[deviation.severity]?.text
                              )}>
                                {deviation.severity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ROM Tab */}
        <TabsContent value="rom" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Range of Motion</h2>
              <p className="text-sm text-muted-foreground">
                Track and compare range of motion measurements over time.
              </p>
            </div>
            <Button onClick={() => setShowROMEntry(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record ROM
            </Button>
          </div>

          {!romSummary || romSummary.totalMeasurements === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No ROM Data</h3>
                <p className="text-muted-foreground mb-4">
                  Start recording range of motion measurements.
                </p>
                <Button onClick={() => setShowROMEntry(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Record First Measurement
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ROM Diagram */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>ROM Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {romDiagramData?.diagramData && (
                    <ROMDiagram
                      data={romDiagramData.diagramData}
                      showLabels
                    />
                  )}
                </CardContent>
              </Card>

              {/* ROM Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {romSummary.summary && (
                    <ROMSummaryCard summary={romSummary.summary} />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* FMS Tab */}
        <TabsContent value="fms" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Functional Movement Screen</h2>
              <p className="text-sm text-muted-foreground">
                Assess movement patterns and identify functional limitations.
              </p>
            </div>
            <Button onClick={() => setShowFMSEntry(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New FMS Assessment
            </Button>
          </div>

          {!fmsSummary || fmsSummary.totalAssessments === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No FMS Data</h3>
                <p className="text-muted-foreground mb-4">
                  Conduct a Functional Movement Screen assessment.
                </p>
                <Button onClick={() => setShowFMSEntry(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start FMS Assessment
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* FMS Summary */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Latest FMS Results</CardTitle>
                </CardHeader>
                <CardContent>
                  {fmsSummary.summary && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-4 bg-stone-50 rounded-lg">
                          <p className="text-3xl font-bold">{fmsSummary.summary.totalScore}</p>
                          <p className="text-sm text-muted-foreground">Total Score</p>
                        </div>
                        <div className="p-4 bg-stone-50 rounded-lg">
                          <p className="text-3xl font-bold">{fmsSummary.summary.asymmetries}</p>
                          <p className="text-sm text-muted-foreground">Asymmetries</p>
                        </div>
                        <div className="p-4 bg-stone-50 rounded-lg">
                          <p className="text-3xl font-bold">{fmsSummary.summary.testsWithPain}</p>
                          <p className="text-sm text-muted-foreground">Painful Tests</p>
                        </div>
                      </div>
                      <div className="text-center pt-4">
                        <Badge className={fmsSummary.summary.totalScore >= 14 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                          {fmsSummary.interpretation?.level || (fmsSummary.summary.totalScore >= 14 ? 'acceptable' : 'at_risk')}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* FMS Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>FMS Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Assessments</p>
                    <p className="text-2xl font-bold">{fmsSummary.totalAssessments}</p>
                  </div>
                  {fmsSummary.latestDate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Last Assessment</p>
                      <p className="font-medium">
                        {format(new Date(fmsSummary.latestDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Compare Tab */}
        <TabsContent value="compare" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Compare Assessments</CardTitle>
                  <CardDescription>
                    View progress between two posture assessments.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={handleExportPDF} disabled={!compareAssessmentId}>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Previous Assessment</label>
                  <Select
                    value={compareAssessmentId || ''}
                    onValueChange={setCompareAssessmentId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select previous assessment" />
                    </SelectTrigger>
                    <SelectContent>
                      {completedAssessments
                        .filter(a => a.id !== selectedAssessmentId)
                        .map((assessment) => (
                          <SelectItem key={assessment.id} value={assessment.id}>
                            {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Current Assessment</label>
                  <Select
                    value={selectedAssessmentId || ''}
                    onValueChange={setSelectedAssessmentId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select current assessment" />
                    </SelectTrigger>
                    <SelectContent>
                      {completedAssessments
                        .filter(a => a.id !== compareAssessmentId)
                        .map((assessment) => (
                          <SelectItem key={assessment.id} value={assessment.id}>
                            {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {compareAssessmentId && selectedAssessmentId ? (
                <ComparisonView
                  previousAssessmentId={compareAssessmentId}
                  currentAssessmentId={selectedAssessmentId}
                />
              ) : (
                <div className="py-12 text-center border-2 border-dashed border-stone-200 rounded-lg">
                  <BarChart3 className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select two assessments to compare progress.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assessment History</CardTitle>
              <CardDescription>
                View all posture assessments and track progress over time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assessments.length === 0 ? (
                <div className="py-12 text-center">
                  <History className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-muted-foreground">No assessment history yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assessments.map((assessment, index) => (
                    <div
                      key={assessment.id}
                      className={cn(
                        'flex items-center gap-4 p-4 rounded-lg border transition-colors cursor-pointer',
                        selectedAssessmentId === assessment.id
                          ? 'border-[#053e67] bg-[#053e67]/5'
                          : 'border-stone-200 hover:border-stone-300'
                      )}
                      onClick={() => setSelectedAssessmentId(assessment.id)}
                    >
                      {/* Thumbnail */}
                      <div className="flex -space-x-2">
                        {assessment.images.slice(0, 3).map((img, i) => (
                          <div
                            key={i}
                            className="w-12 h-16 rounded overflow-hidden border-2 border-white"
                          >
                            <img
                              src={img.thumbnailUrl || ''}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {format(new Date(assessment.assessmentDate), 'MMMM d, yyyy')}
                          </p>
                          <Badge variant={assessment.isComplete ? 'default' : 'secondary'}>
                            {assessment.isComplete ? 'Complete' : 'In Progress'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {assessment._count.images} images • {assessment._count.deviations} deviations
                        </p>
                      </div>

                      {/* Trend indicator */}
                      {index > 0 && assessment.isComplete && (
                        <div className="flex items-center gap-1 text-green-600">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-sm">Improving</span>
                        </div>
                      )}

                      <ChevronRight className="h-5 w-5 text-stone-400" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ROM Entry Dialog */}
      <Dialog open={showROMEntry} onOpenChange={setShowROMEntry}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Range of Motion</DialogTitle>
            <DialogDescription>
              Record ROM measurements for this patient.
            </DialogDescription>
          </DialogHeader>
          <ROMEntryForm
            patientId={patientId}
            onComplete={() => {
              setShowROMEntry(false);
              toast.success('ROM measurements saved');
            }}
            onCancel={() => setShowROMEntry(false)}
          />
        </DialogContent>
      </Dialog>

      {/* FMS Entry Dialog */}
      <Dialog open={showFMSEntry} onOpenChange={setShowFMSEntry}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Functional Movement Screen</DialogTitle>
            <DialogDescription>
              Complete the FMS assessment for this patient.
            </DialogDescription>
          </DialogHeader>
          <FMSEntryForm
            patientId={patientId}
            onComplete={() => {
              setShowFMSEntry(false);
              toast.success('FMS assessment saved');
            }}
            onCancel={() => setShowFMSEntry(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ROM Entry Form Component
function ROMEntryForm({
  patientId,
  onComplete,
  onCancel,
}: {
  patientId: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [selectedRegion, setSelectedRegion] = useState<string>('cervical');
  const [measurements, setMeasurements] = useState<Record<string, number>>({});

  const { data: jointDefinitions } = trpc.rom.getJointsGrouped.useQuery();

  const createBatchMutation = trpc.rom.createBatch.useMutation({
    onSuccess: () => onComplete(),
    onError: (error) => toast.error(error.message),
  });

  const handleSave = () => {
    const entries = Object.entries(measurements)
      .filter(([_, value]) => value !== undefined && value !== null && !isNaN(value))
      .map(([joint, degrees]) => ({
        joint: joint as 'CERVICAL_FLEXION' | 'CERVICAL_EXTENSION' | 'CERVICAL_LATERAL_LEFT' | 'CERVICAL_LATERAL_RIGHT' | 'CERVICAL_ROTATION_LEFT' | 'CERVICAL_ROTATION_RIGHT' | 'THORACIC_FLEXION' | 'THORACIC_EXTENSION' | 'THORACIC_ROTATION_LEFT' | 'THORACIC_ROTATION_RIGHT' | 'LUMBAR_FLEXION' | 'LUMBAR_EXTENSION' | 'LUMBAR_LATERAL_LEFT' | 'LUMBAR_LATERAL_RIGHT' | 'SHOULDER_FLEXION' | 'SHOULDER_EXTENSION' | 'SHOULDER_ABDUCTION' | 'SHOULDER_ADDUCTION' | 'SHOULDER_INTERNAL_ROTATION' | 'SHOULDER_EXTERNAL_ROTATION' | 'ELBOW_FLEXION' | 'ELBOW_EXTENSION' | 'HIP_FLEXION' | 'HIP_EXTENSION' | 'HIP_ABDUCTION' | 'HIP_ADDUCTION' | 'HIP_INTERNAL_ROTATION' | 'HIP_EXTERNAL_ROTATION' | 'KNEE_FLEXION' | 'KNEE_EXTENSION' | 'ANKLE_DORSIFLEXION' | 'ANKLE_PLANTARFLEXION' | 'ANKLE_INVERSION' | 'ANKLE_EVERSION',
        degrees,
      }));

    if (entries.length === 0) {
      toast.error('Please enter at least one measurement');
      return;
    }

    createBatchMutation.mutate({ patientId, measurements: entries });
  };

  const regions = ['cervical', 'thoracic', 'lumbar', 'shoulder', 'elbow', 'hip', 'knee', 'ankle'];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {regions.map((region) => (
          <Button
            key={region}
            variant={selectedRegion === region ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedRegion(region)}
            className="capitalize"
          >
            {region}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {jointDefinitions?.[selectedRegion as keyof typeof jointDefinitions]?.map((item) => (
          <div key={item.joint} className="space-y-1">
            <label className="text-sm font-medium">{item.definition.name}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 px-3 py-2 border rounded-md"
                placeholder="°"
                value={measurements[item.joint] || ''}
                onChange={(e) =>
                  setMeasurements((prev) => ({
                    ...prev,
                    [item.joint]: parseFloat(e.target.value),
                  }))
                }
              />
              <span className="text-sm text-muted-foreground">
                Normal: {item.definition.normalDegrees}°
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={createBatchMutation.isPending}>
          {createBatchMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Measurements'
          )}
        </Button>
      </div>
    </div>
  );
}

// Comparison View Component
function ComparisonView({
  previousAssessmentId,
  currentAssessmentId,
}: {
  previousAssessmentId: string;
  currentAssessmentId: string;
}) {
  const { data: previousData } = trpc.posture.getDeviations.useQuery(
    { assessmentId: previousAssessmentId },
    { enabled: !!previousAssessmentId }
  );

  const { data: currentData } = trpc.posture.getDeviations.useQuery(
    { assessmentId: currentAssessmentId },
    { enabled: !!currentAssessmentId }
  );

  if (!previousData || !currentData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  const deviationChange = previousData.totalCount - currentData.totalCount;
  const improvementScore = previousData.totalCount > 0
    ? Math.round((deviationChange / previousData.totalCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-stone-50 rounded-lg">
          <p className={cn(
            'text-3xl font-bold',
            improvementScore > 0 ? 'text-green-600' : improvementScore < 0 ? 'text-red-600' : 'text-stone-600'
          )}>
            {improvementScore > 0 ? '+' : ''}{improvementScore}%
          </p>
          <p className="text-sm text-muted-foreground">Change</p>
        </div>
        <div className="text-center p-4 bg-stone-50 rounded-lg">
          <p className="text-3xl font-bold">
            {previousData.totalCount} → {currentData.totalCount}
          </p>
          <p className="text-sm text-muted-foreground">Total Deviations</p>
        </div>
        <div className="text-center p-4 bg-stone-50 rounded-lg">
          <div className="flex items-center justify-center gap-2">
            <Badge className={cn(
              severityColors[previousData.overallSeverity]?.bg,
              severityColors[previousData.overallSeverity]?.text
            )}>
              {previousData.overallSeverity}
            </Badge>
            <span>→</span>
            <Badge className={cn(
              severityColors[currentData.overallSeverity]?.bg,
              severityColors[currentData.overallSeverity]?.text
            )}>
              {currentData.overallSeverity}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Severity</p>
        </div>
        <div className="text-center p-4 bg-stone-50 rounded-lg">
          <div className="flex items-center justify-center">
            {improvementScore > 0 ? (
              <TrendingUp className="h-8 w-8 text-green-600" />
            ) : improvementScore < 0 ? (
              <AlertCircle className="h-8 w-8 text-red-600" />
            ) : (
              <Activity className="h-8 w-8 text-stone-400" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {improvementScore > 0 ? 'Improving' : improvementScore < 0 ? 'Needs Attention' : 'Stable'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">
            {improvementScore > 0
              ? `Patient shows improvement with ${deviationChange} fewer deviation(s) detected.`
              : improvementScore < 0
                ? `Patient shows ${Math.abs(deviationChange)} additional deviation(s) since the previous assessment.`
                : 'No significant change in posture deviations between assessments.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// FMS Entry Form Component
function FMSEntryForm({
  patientId,
  onComplete,
  onCancel,
}: {
  patientId: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [tests, setTests] = useState<FMSTestInput[]>([]);

  const createFullAssessmentMutation = trpc.fms.createFullAssessment.useMutation({
    onSuccess: () => onComplete(),
    onError: (error) => toast.error(error.message),
  });

  const handleTestUpdate = (updatedTest: FMSTestInput) => {
    setTests((prev) => {
      const existing = prev.findIndex((t) => t.testName === updatedTest.testName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = updatedTest;
        return updated;
      }
      return [...prev, updatedTest];
    });
  };

  const handleSave = () => {
    if (tests.length < 7) {
      toast.error('Please complete all 7 FMS tests');
      return;
    }

    createFullAssessmentMutation.mutate({
      patientId,
      assessmentDate: new Date(),
      tests: tests.map((t) => ({
        testName: t.testName,
        score: t.score,
        leftScore: t.leftScore ?? undefined,
        rightScore: t.rightScore ?? undefined,
        painDuringTest: t.painDuringTest,
        painLocation: t.painLocation || undefined,
        compensations: t.compensations,
        limitingFactors: t.limitingFactors,
        movementQuality: t.movementQuality || undefined,
        notes: t.notes || undefined,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <FMSScoring
        onTestUpdate={handleTestUpdate}
        onComplete={(completedTests) => setTests(completedTests)}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={createFullAssessmentMutation.isPending}>
          {createFullAssessmentMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Assessment'
          )}
        </Button>
      </div>
    </div>
  );
}
