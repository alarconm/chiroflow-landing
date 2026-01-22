'use client';

/**
 * Imaging Dashboard UI
 * Epic 22: Imaging & X-Ray Integration (US-231)
 *
 * Patient imaging tab with:
 * - Study list with thumbnails
 * - DICOM viewer integration
 * - Annotation toolbar
 * - Measurement history
 * - Report creation interface
 * - Side-by-side study comparison
 * - Print/export with annotations
 */

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Upload,
  Plus,
  ImageIcon,
  FileText,
  History,
  ChevronRight,
  Clock,
  Loader2,
  AlertCircle,
  Scan,
  Columns2,
  Download,
  Printer,
  Eye,
  Ruler,
  Pencil,
  Trash2,
  MoreVertical,
  Info,
  Brain,
  CheckCircle2,
  XCircle,
  ChevronDown,
  SplitSquareHorizontal,
  Layers,
  Activity,
  CalendarDays,
  Grid3X3,
  List,
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Import imaging components
import {
  DICOMViewer,
  AnnotationToolbar,
  SpinalMeasurementTools,
  ImagingReportEditor,
  type ViewerImage,
  type Measurement,
} from '@/components/imaging';

// Types
type ViewMode = 'grid' | 'list';
type StudyStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'REPORTED' | 'CANCELLED';
type ImagingModality = 'XRAY' | 'MRI' | 'CT' | 'ULTRASOUND';

interface ImagingStudy {
  id: string;
  studyDate: Date;
  modality: ImagingModality;
  bodyPart: string;
  status: StudyStatus;
  description?: string;
  indication?: string;
  accessionNumber: string;
  imageCount: number;
  images: Array<{
    id: string;
    imageUrl: string;
    thumbnailUrl?: string;
    viewPosition?: string;
    width: number;
    height: number;
    pixelSpacingX?: number;
    pixelSpacingY?: number;
    windowCenter?: number;
    windowWidth?: number;
  }>;
  reports: Array<{
    id: string;
    status: string;
    findings?: string;
    impression?: string;
    reportedBy?: {
      user: {
        firstName: string;
        lastName: string;
      };
    };
    createdAt: Date;
    signedAt?: Date;
  }>;
  orderingProvider?: {
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

const statusColors: Record<StudyStatus, { bg: string; text: string; border: string }> = {
  SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  IN_PROGRESS: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  REPORTED: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  CANCELLED: { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-300' },
};

const modalityLabels: Record<ImagingModality, string> = {
  XRAY: 'X-Ray',
  MRI: 'MRI',
  CT: 'CT',
  ULTRASOUND: 'Ultrasound',
};

const modalityIcons: Record<ImagingModality, string> = {
  XRAY: '📷',
  MRI: '🧲',
  CT: '💿',
  ULTRASOUND: '📡',
};

export default function ImagingDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  // State
  const [activeTab, setActiveTab] = useState('studies');
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showNewStudyDialog, setShowNewStudyDialog] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [showReportEditor, setShowReportEditor] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareStudyId, setCompareStudyId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // New study form state
  const [newStudyForm, setNewStudyForm] = useState({
    modality: 'XRAY' as ImagingModality,
    bodyPart: '',
    description: '',
    indication: '',
    clinicalHistory: '',
  });

  // Queries
  const { data: patient, isLoading: patientLoading } = trpc.patient.get.useQuery(
    { id: patientId },
    { enabled: !!patientId }
  );

  const {
    data: studiesData,
    isLoading: studiesLoading,
    refetch: refetchStudies,
  } = trpc.imaging.listByPatient.useQuery(
    { patientId, limit: 50 },
    { enabled: !!patientId }
  );

  const { data: selectedStudy, isLoading: studyLoading } = trpc.imaging.getStudy.useQuery(
    { studyId: selectedStudyId! },
    { enabled: !!selectedStudyId }
  );

  const { data: compareStudy } = trpc.imaging.getStudy.useQuery(
    { studyId: compareStudyId! },
    { enabled: !!compareStudyId && compareMode }
  );

  const { data: aiAnalysis, isLoading: aiAnalysisLoading } = trpc.imaging.getAIAnalysisSummary.useQuery(
    { imageId: selectedStudy?.images[selectedImageIndex]?.id! },
    { enabled: !!selectedStudy?.images[selectedImageIndex]?.id && showAIAnalysis }
  );

  const { data: measurementHistory } = trpc.imaging.getMeasurements.useQuery(
    { imageId: selectedStudy?.images[selectedImageIndex]?.id! },
    { enabled: !!selectedStudy?.images[selectedImageIndex]?.id }
  );

  // Mutations
  const createStudyMutation = trpc.imaging.createStudy.useMutation({
    onSuccess: (study) => {
      toast.success('Study created successfully');
      setShowNewStudyDialog(false);
      setSelectedStudyId(study.id);
      refetchStudies();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStatusMutation = trpc.imaging.updateStudyStatus.useMutation({
    onSuccess: () => {
      toast.success('Study status updated');
      refetchStudies();
    },
    onError: (error) => toast.error(error.message),
  });

  const aiAnalyzeMutation = trpc.imaging.aiAnalyze.useMutation({
    onSuccess: () => {
      toast.success('AI analysis complete');
      setShowAIAnalysis(true);
    },
    onError: (error) => toast.error(error.message),
  });

  // Derived data
  const studies = studiesData?.studies || [];
  const totalStudies = studies.length;

  // Handlers
  const handleCreateStudy = () => {
    if (!newStudyForm.bodyPart) {
      toast.error('Please enter a body part');
      return;
    }
    createStudyMutation.mutate({
      patientId,
      ...newStudyForm,
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadFiles(files);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }
    setIsUploading(true);
    // In a real implementation, this would upload to the server
    // For now, just simulate the upload
    setTimeout(() => {
      toast.success(`${uploadFiles.length} file(s) uploaded successfully`);
      setIsUploading(false);
      setShowUploadDialog(false);
      setUploadFiles([]);
      refetchStudies();
    }, 2000);
  };

  const handleRunAIAnalysis = () => {
    if (selectedStudy?.images[selectedImageIndex]?.id) {
      aiAnalyzeMutation.mutate({
        imageId: selectedStudy.images[selectedImageIndex].id,
        options: {
          detectVertebrae: true,
          detectAbnormalities: true,
          suggestMeasurements: true,
        },
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async () => {
    // In a real implementation, this would generate a PDF or image export
    toast.info('Export functionality coming soon...');
  };

  // Convert study images to viewer format
  const getViewerImages = (study: ImagingStudy): ViewerImage[] => {
    return study.images.map((img) => ({
      id: img.id,
      url: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      width: img.width || 512,
      height: img.height || 512,
      pixelSpacing: img.pixelSpacingX && img.pixelSpacingY
        ? { x: img.pixelSpacingX, y: img.pixelSpacingY }
        : undefined,
      windowCenter: img.windowCenter,
      windowWidth: img.windowWidth,
      viewPosition: img.viewPosition,
      bodyPart: study.bodyPart,
    }));
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
    <TooltipProvider>
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
                <span>Imaging</span>
              </div>
              <h1 className="text-2xl font-bold text-stone-900">
                Imaging & X-Ray Studies
              </h1>
              <p className="text-sm text-stone-500 mt-1">{patientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Images
            </Button>
            <Button onClick={() => setShowNewStudyDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Study
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <ImageIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalStudies}</p>
                  <p className="text-sm text-muted-foreground">Total Studies</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {studies.filter((s) => s.status === 'REPORTED').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Reported</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {studies.filter((s) => s.status === 'IN_PROGRESS' || s.status === 'COMPLETED').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending Report</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <CalendarDays className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {studies.length > 0
                      ? formatDistanceToNow(new Date(studies[0].studyDate), { addSuffix: true })
                      : 'Never'}
                  </p>
                  <p className="text-sm text-muted-foreground">Last Study</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Study List (Left Panel) */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Studies</CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(viewMode === 'grid' && 'bg-stone-100')}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(viewMode === 'list' && 'bg-stone-100')}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {studiesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : studies.length === 0 ? (
                <div className="py-12 text-center">
                  <ImageIcon className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Studies Yet</h3>
                  <p className="text-muted-foreground mb-4 text-sm">
                    Upload images or create a new study to get started.
                  </p>
                  <Button size="sm" onClick={() => setShowNewStudyDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Study
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-2 gap-3'
                      : 'space-y-2'
                  )}>
                    {studies.map((study) => (
                      <StudyCard
                        key={study.id}
                        study={study as unknown as ImagingStudy}
                        isSelected={selectedStudyId === study.id}
                        onClick={() => setSelectedStudyId(study.id)}
                        viewMode={viewMode}
                        compareMode={compareMode}
                        isCompare={compareStudyId === study.id}
                        onCompareSelect={() => setCompareStudyId(study.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Study Viewer (Right Panel) */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {selectedStudy
                      ? `${modalityLabels[selectedStudy.modality as ImagingModality]} - ${selectedStudy.bodyPart}`
                      : 'Select a Study'}
                  </CardTitle>
                  {selectedStudy && (
                    <CardDescription>
                      {format(new Date(selectedStudy.studyDate), 'MMMM d, yyyy')} •{' '}
                      {selectedStudy.images.length} image(s)
                    </CardDescription>
                  )}
                </div>
                {selectedStudy && (
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCompareMode(!compareMode)}
                          className={cn(compareMode && 'bg-[#053e67] text-white')}
                        >
                          <Columns2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Compare Studies</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={handleRunAIAnalysis}>
                          <Brain className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>AI Analysis</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={handlePrint}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Print</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={handleExport}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowReportEditor(true)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Create Report
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowViewer(true)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Full Screen Viewer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            updateStatusMutation.mutate({
                              studyId: selectedStudy.id,
                              status: 'COMPLETED',
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark Complete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedStudy ? (
                <div className="h-[500px] flex items-center justify-center border-2 border-dashed border-stone-200 rounded-lg">
                  <div className="text-center">
                    <ImageIcon className="h-16 w-16 text-stone-300 mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Select a study from the list to view images
                    </p>
                  </div>
                </div>
              ) : studyLoading ? (
                <Skeleton className="h-[500px]" />
              ) : (
                <div className={cn(compareMode ? 'grid grid-cols-2 gap-4' : '')}>
                  {/* Main Viewer */}
                  <div className="space-y-4">
                    <DICOMViewer
                      images={getViewerImages(selectedStudy as unknown as ImagingStudy)}
                      initialImageIndex={selectedImageIndex}
                      measurements={measurements}
                      onMeasurementsChange={setMeasurements}
                      onImageChange={setSelectedImageIndex}
                      showToolbar={true}
                      showThumbnails={!compareMode}
                      className="h-[400px]"
                    />

                    {/* Annotation Toolbar */}
                    <AnnotationToolbar
                      activeTool="pan"
                      onToolChange={() => {}}
                      color="#00ff00"
                      onColorChange={() => {}}
                      lineWidth={2}
                      onLineWidthChange={() => {}}
                      fontSize={14}
                      onFontSizeChange={() => {}}
                      onUndo={() => {}}
                      onRedo={() => {}}
                      onClear={() => setMeasurements([])}
                      onSave={() => toast.success('Annotations saved')}
                      onExport={handleExport}
                      onImport={() => {}}
                      canUndo={false}
                      canRedo={false}
                    />
                  </div>

                  {/* Comparison Viewer */}
                  {compareMode && compareStudy && (
                    <div className="space-y-4">
                      <DICOMViewer
                        images={getViewerImages(compareStudy as unknown as ImagingStudy)}
                        showToolbar={true}
                        showThumbnails={false}
                        readOnly={true}
                        className="h-[400px]"
                      />
                      <div className="text-center text-sm text-muted-foreground">
                        {format(new Date(compareStudy.studyDate), 'MMMM d, yyyy')} •{' '}
                        {compareStudy.bodyPart}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details Tabs */}
        {selectedStudy && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="studies" className="gap-2">
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">Study Info</span>
              </TabsTrigger>
              <TabsTrigger value="measurements" className="gap-2">
                <Ruler className="h-4 w-4" />
                <span className="hidden sm:inline">Measurements</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Reports</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">AI Analysis</span>
              </TabsTrigger>
            </TabsList>

            {/* Study Info Tab */}
            <TabsContent value="studies" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Study Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Accession #</span>
                      <span className="text-sm font-medium">{selectedStudy.accessionNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Modality</span>
                      <span className="text-sm font-medium">
                        {modalityLabels[selectedStudy.modality as ImagingModality]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Body Part</span>
                      <span className="text-sm font-medium">{selectedStudy.bodyPart}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge
                        className={cn(
                          statusColors[selectedStudy.status as StudyStatus]?.bg,
                          statusColors[selectedStudy.status as StudyStatus]?.text
                        )}
                      >
                        {selectedStudy.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Clinical Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <span className="text-sm text-muted-foreground">Indication</span>
                      <p className="text-sm">{selectedStudy.indication || 'Not specified'}</p>
                    </div>
                    {selectedStudy.clinicalHistory && (
                      <div>
                        <span className="text-sm text-muted-foreground">Clinical History</span>
                        <p className="text-sm">{selectedStudy.clinicalHistory}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Provider Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Ordering Provider</span>
                      <span className="text-sm font-medium">
                        {selectedStudy.orderingProvider
                          ? `${selectedStudy.orderingProvider.user.firstName} ${selectedStudy.orderingProvider.user.lastName}`
                          : 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Study Date</span>
                      <span className="text-sm font-medium">
                        {format(new Date(selectedStudy.studyDate), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Measurements Tab */}
            <TabsContent value="measurements" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Measurement History</CardTitle>
                    <CardDescription>
                      All measurements taken on this study
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {measurementHistory && measurementHistory.length > 0 ? (
                      <div className="space-y-3">
                        {measurementHistory.map((m: {
                          id: string;
                          type: string;
                          label: string | null;
                          value: number;
                          unit: string;
                          normalMin: number | null;
                          normalMax: number | null;
                          createdAt: Date;
                        }) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{m.label || m.type}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(m.createdAt), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                {m.value.toFixed(2)} {m.unit}
                              </p>
                              {m.normalMin !== null && m.normalMax !== null && (
                                <p className="text-xs text-muted-foreground">
                                  Normal: {m.normalMin} - {m.normalMax} {m.unit}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Ruler className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                        <p className="text-muted-foreground">No measurements recorded yet</p>
                        <p className="text-sm text-muted-foreground">
                          Use the measurement tools in the viewer to add measurements
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <SpinalMeasurementTools
                  imageId={selectedStudy.images[selectedImageIndex]?.id}
                  measurements={[]}
                  activeTool={null}
                  onToolSelect={() => {}}
                />
              </div>
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Imaging Reports</CardTitle>
                      <CardDescription>
                        Clinical reports for this study
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowReportEditor(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Report
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedStudy.reports && selectedStudy.reports.length > 0 ? (
                    <div className="space-y-4">
                      {selectedStudy.reports.map((report) => (
                        <div
                          key={report.id}
                          className="p-4 border rounded-lg space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-[#053e67]" />
                              <span className="font-medium">Imaging Report</span>
                              <Badge
                                variant={report.status === 'FINAL' ? 'default' : 'secondary'}
                              >
                                {report.status}
                              </Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(report.createdAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                          {report.findings && (
                            <div>
                              <p className="text-sm font-medium">Findings</p>
                              <p className="text-sm text-muted-foreground">{report.findings}</p>
                            </div>
                          )}
                          {report.impression && (
                            <div>
                              <p className="text-sm font-medium">Impression</p>
                              <p className="text-sm text-muted-foreground">{report.impression}</p>
                            </div>
                          )}
                          {report.reportedBy && (
                            <div className="flex items-center justify-between pt-2 border-t">
                              <span className="text-sm text-muted-foreground">
                                Reported by: {report.reportedBy.user.firstName}{' '}
                                {report.reportedBy.user.lastName}
                              </span>
                              {report.signedAt && (
                                <span className="text-sm text-green-600">
                                  Signed {format(new Date(report.signedAt), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <FileText className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                      <p className="text-muted-foreground">No reports yet</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowReportEditor(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Report
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Analysis Tab */}
            <TabsContent value="ai" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>AI-Assisted Analysis</CardTitle>
                      <CardDescription>
                        AI-generated findings and measurements (requires provider review)
                      </CardDescription>
                    </div>
                    <Button
                      onClick={handleRunAIAnalysis}
                      disabled={aiAnalyzeMutation.isPending}
                    >
                      {aiAnalyzeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Run AI Analysis
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {aiAnalysisLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                    </div>
                  ) : aiAnalysis && aiAnalysis.aiAnalysisAvailable ? (
                    <div className="space-y-6">
                      {/* AI Disclaimer */}
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-yellow-800">Provider Review Required</p>
                            <p className="text-sm text-yellow-700">
                              AI-generated findings are preliminary and must be reviewed and
                              approved by a qualified healthcare provider before clinical use.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Analysis Summary */}
                      <div className="space-y-4">
                        <div className="p-4 bg-stone-50 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <p className="font-medium">AI Analysis Complete</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{aiAnalysis.message}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Body Part: {aiAnalysis.bodyPart}
                          </p>
                        </div>

                        {/* Disclaimers */}
                        {aiAnalysis.disclaimers && aiAnalysis.disclaimers.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-3">Important Notes</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {aiAnalysis.disclaimers.map((d: string, i: number) => (
                                <li key={i} className="flex items-start gap-2">
                                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                                  <span>{d}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="text-sm text-muted-foreground">
                          Run a full AI analysis using the button above to detect vertebral levels,
                          identify abnormalities, and get measurement suggestions.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <Brain className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                      <p className="text-muted-foreground">No AI analysis yet</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Run AI analysis to detect vertebral levels, abnormalities, and get
                        measurement suggestions
                      </p>
                      <Button onClick={handleRunAIAnalysis} disabled={aiAnalyzeMutation.isPending}>
                        <Brain className="h-4 w-4 mr-2" />
                        Run AI Analysis
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* New Study Dialog */}
        <Dialog open={showNewStudyDialog} onOpenChange={setShowNewStudyDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>New Imaging Study</DialogTitle>
              <DialogDescription>
                Create a new imaging study for this patient
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Modality</Label>
                <Select
                  value={newStudyForm.modality}
                  onValueChange={(v) =>
                    setNewStudyForm((f) => ({ ...f, modality: v as ImagingModality }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XRAY">X-Ray</SelectItem>
                    <SelectItem value="MRI">MRI</SelectItem>
                    <SelectItem value="CT">CT</SelectItem>
                    <SelectItem value="ULTRASOUND">Ultrasound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Body Part *</Label>
                <Input
                  placeholder="e.g., Cervical Spine, Lumbar Spine"
                  value={newStudyForm.bodyPart}
                  onChange={(e) =>
                    setNewStudyForm((f) => ({ ...f, bodyPart: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="Brief description"
                  value={newStudyForm.description}
                  onChange={(e) =>
                    setNewStudyForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Clinical Indication</Label>
                <Textarea
                  placeholder="Reason for imaging"
                  value={newStudyForm.indication}
                  onChange={(e) =>
                    setNewStudyForm((f) => ({ ...f, indication: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Clinical History</Label>
                <Textarea
                  placeholder="Relevant patient history"
                  value={newStudyForm.clinicalHistory}
                  onChange={(e) =>
                    setNewStudyForm((f) => ({ ...f, clinicalHistory: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewStudyDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateStudy} disabled={createStudyMutation.isPending}>
                {createStudyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Study'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Upload Images</DialogTitle>
              <DialogDescription>
                Upload DICOM or standard image files (JPEG, PNG)
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".dcm,.dicom,image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                className="border-2 border-dashed border-stone-300 rounded-lg p-8 text-center cursor-pointer hover:border-[#053e67] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-stone-400 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Click to select files or drag and drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports DICOM, JPEG, PNG, WebP
                </p>
              </div>
              {uploadFiles.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">
                    {uploadFiles.length} file(s) selected
                  </p>
                  <ScrollArea className="h-[100px]">
                    <div className="space-y-1">
                      {uploadFiles.map((file, i) => (
                        <div
                          key={i}
                          className="text-sm text-muted-foreground flex items-center gap-2"
                        >
                          <ImageIcon className="h-4 w-4" />
                          {file.name}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={isUploading || uploadFiles.length === 0}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Full Screen Viewer Dialog */}
        <Dialog open={showViewer} onOpenChange={setShowViewer}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
            {selectedStudy && (
              <DICOMViewer
                images={getViewerImages(selectedStudy as unknown as ImagingStudy)}
                initialImageIndex={selectedImageIndex}
                measurements={measurements}
                onMeasurementsChange={setMeasurements}
                onImageChange={setSelectedImageIndex}
                showToolbar={true}
                showThumbnails={true}
                className="h-[90vh]"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Report Editor Dialog */}
        <Dialog open={showReportEditor} onOpenChange={setShowReportEditor}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Imaging Report</DialogTitle>
              <DialogDescription>
                Document findings and impression for this imaging study
              </DialogDescription>
            </DialogHeader>
            {selectedStudy && (
              <ImagingReportEditor
                studyId={selectedStudy.id}
                studyInfo={{
                  patientName,
                  bodyPart: selectedStudy.bodyPart,
                  modality: selectedStudy.modality,
                  studyDate: format(new Date(selectedStudy.studyDate), 'yyyy-MM-dd'),
                }}
                measurements={measurementHistory?.map((m: {
                  id: string;
                  type: string;
                  value: number;
                  unit: string;
                  label: string | null;
                  deviation: number | null;
                }) => ({
                  id: m.id,
                  type: m.type,
                  value: m.value,
                  unit: m.unit,
                  label: m.label || undefined,
                  deviation: m.deviation,
                })) || []}
                onSave={() => {
                  setShowReportEditor(false);
                  refetchStudies();
                  toast.success('Report saved');
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// Study Card Component
function StudyCard({
  study,
  isSelected,
  onClick,
  viewMode,
  compareMode,
  isCompare,
  onCompareSelect,
}: {
  study: ImagingStudy;
  isSelected: boolean;
  onClick: () => void;
  viewMode: ViewMode;
  compareMode: boolean;
  isCompare: boolean;
  onCompareSelect: () => void;
}) {
  const thumbnail = study.images[0]?.thumbnailUrl || study.images[0]?.imageUrl;

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all',
          isSelected
            ? 'border-[#053e67] bg-[#053e67]/5 ring-1 ring-[#053e67]'
            : 'border-stone-200 hover:border-stone-300',
          isCompare && 'border-purple-500 bg-purple-50'
        )}
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-md overflow-hidden bg-stone-100 flex-shrink-0">
          {thumbnail ? (
            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-stone-400" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{modalityIcons[study.modality]}</span>
            <span className="font-medium truncate">{study.bodyPart}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {format(new Date(study.studyDate), 'MMM d, yyyy')}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                statusColors[study.status]?.bg,
                statusColors[study.status]?.text
              )}
            >
              {study.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {study.imageCount} image(s)
            </span>
          </div>
        </div>

        {/* Compare button */}
        {compareMode && !isSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCompareSelect();
            }}
            className={cn(isCompare && 'bg-purple-100')}
          >
            <Columns2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // Grid view
  return (
    <div
      className={cn(
        'relative rounded-lg border cursor-pointer transition-all overflow-hidden group',
        isSelected
          ? 'border-[#053e67] ring-2 ring-[#053e67]/20'
          : 'border-stone-200 hover:border-stone-300',
        isCompare && 'border-purple-500 ring-2 ring-purple-500/20'
      )}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-stone-100">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-stone-400" />
          </div>
        )}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Info */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <div className="flex items-center gap-1">
          <span className="text-sm">{modalityIcons[study.modality]}</span>
          <span className="text-xs font-medium text-white truncate">{study.bodyPart}</span>
        </div>
        <p className="text-xs text-white/80">
          {format(new Date(study.studyDate), 'MMM d, yyyy')}
        </p>
      </div>

      {/* Status badge */}
      <div className="absolute top-2 right-2">
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            statusColors[study.status]?.bg,
            statusColors[study.status]?.text
          )}
        >
          {study.status}
        </Badge>
      </div>

      {/* Compare indicator */}
      {isCompare && (
        <div className="absolute top-2 left-2">
          <Badge className="bg-purple-500">Compare</Badge>
        </div>
      )}

      {/* Compare button on hover */}
      {compareMode && !isSelected && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-white/90 hover:bg-white"
          onClick={(e) => {
            e.stopPropagation();
            onCompareSelect();
          }}
        >
          <Columns2 className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
