'use client';

/**
 * Epic 23: Patient Education Portal
 * US-238: Patient-facing interface for education and exercises
 *
 * Features:
 * - My Exercises page with video player
 * - Daily exercise checklist
 * - Progress history and charts
 * - Home care instructions view
 * - Educational articles library
 * - Ask provider question feature
 * - Mobile-friendly design
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Dumbbell,
  BookOpen,
  ClipboardList,
  Trophy,
  MessageSquare,
  ChevronRight,
  AlertCircle,
  Activity,
  TrendingUp,
  Calendar,
  Flame,
  Target,
  User,
  ThermometerSun,
  Snowflake,
  Info,
  Send,
  Star,
} from 'lucide-react';

// Types
interface ExercisePrescription {
  id: string;
  exerciseName?: string;
  status: string;
  sets: number | null;
  reps: number | null;
  holdTime: number | null;
  frequency: string | null;
  specialInstructions: string | null;
  exercise: {
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
    videoUrl: string | null;
    imageUrl: string | null;
    difficulty: string | null;
    bodyRegion: string | null;
    targetMuscles: string[];
    equipmentRequired: string[];
    contraindications: string | null;
    modifications: string | null;
    category: {
      id: string;
      name: string;
      type: string;
    } | null;
  };
  prescriber: {
    name: string;
    title: string | null;
  } | null;
  completedToday: boolean;
  skippedToday: boolean;
}

interface HomeCareInstruction {
  id: string;
  instructions: string;
  iceProtocol: string | null;
  heatProtocol: string | null;
  activityMods: string | null;
  ergonomicRecs: string | null;
  warningSigns: string | null;
  followUpInstr: string | null;
  durationDays: number | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  provider: {
    name: string;
    title: string | null;
  } | null;
  encounterDate?: Date;
}

interface EducationArticle {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  readingLevel: string;
  keywords: string[];
  relatedConditions: string[];
  viewCount: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: number;
  threshold: number;
}

// Safe text rendering helper - renders text with line breaks as React elements
function renderTextWithLineBreaks(text: string) {
  return text.split('\n').map((line, index, arr) => (
    <span key={index}>
      {line}
      {index < arr.length - 1 && <br />}
    </span>
  ));
}

export function PatientEducationPortal() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('exercises');
  const [selectedExercise, setSelectedExercise] = useState<ExercisePrescription | null>(null);
  const [showExerciseDialog, setShowExerciseDialog] = useState(false);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [showArticleDialog, setShowArticleDialog] = useState(false);

  // Log exercise form state
  const [logFormData, setLogFormData] = useState({
    setsCompleted: 0,
    repsCompleted: 0,
    painBefore: 5,
    painAfter: 5,
    difficulty: 3,
    notes: '',
    skipped: false,
    skipReason: '',
  });

  // Question form state
  const [questionFormData, setQuestionFormData] = useState({
    subject: '',
    message: '',
    relatedTo: null as { type: 'exercise' | 'instruction' | 'article'; id: string; name: string } | null,
  });

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  // Data fetching
  const { data: exercisesData, isLoading: exercisesLoading, refetch: refetchExercises } =
    trpc.portalEducation.getMyExercises.useQuery(
      { sessionToken: token! },
      { enabled: !!token }
    );

  const { data: checklistData, refetch: refetchChecklist } =
    trpc.portalEducation.getDailyChecklist.useQuery(
      { sessionToken: token! },
      { enabled: !!token }
    );

  const { data: progressData } = trpc.portalEducation.getProgressHistory.useQuery(
    { sessionToken: token!, limit: 30 },
    { enabled: !!token }
  );

  const { data: achievementsData } = trpc.portalEducation.getAchievements.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const { data: homeCareData, isLoading: homeCareLoading } =
    trpc.portalEducation.getHomeCareInstructions.useQuery(
      { sessionToken: token! },
      { enabled: !!token }
    );

  const { data: articlesData, isLoading: articlesLoading } =
    trpc.portalEducation.getEducationArticles.useQuery(
      { sessionToken: token!, limit: 20 },
      { enabled: !!token }
    );

  const { data: prescribedArticlesData } =
    trpc.portalEducation.getPrescribedArticles.useQuery(
      { sessionToken: token! },
      { enabled: !!token }
    );

  const { data: articleDetailData } = trpc.portalEducation.getArticle.useQuery(
    { sessionToken: token!, articleId: selectedArticle! },
    { enabled: !!token && !!selectedArticle }
  );

  // Mutations
  const logExerciseMutation = trpc.portalEducation.logExerciseCompletion.useMutation({
    onSuccess: (data) => {
      setShowLogDialog(false);
      refetchExercises();
      refetchChecklist();
      // Show achievement toast if new badges
      if (data.newBadges && data.newBadges.length > 0) {
        alert(`Congratulations! ${data.newBadges.join('\n')}`);
      }
    },
  });

  const askQuestionMutation = trpc.portalEducation.askProviderQuestion.useMutation({
    onSuccess: (data) => {
      setShowQuestionDialog(false);
      setQuestionFormData({ subject: '', message: '', relatedTo: null });
      alert(data.message);
    },
  });

  const markArticleReadMutation = trpc.portalEducation.markArticleRead.useMutation();

  // Handlers
  const handleLogExercise = () => {
    if (!selectedExercise || !token) return;

    logExerciseMutation.mutate({
      sessionToken: token,
      prescriptionId: selectedExercise.id,
      setsCompleted: logFormData.skipped ? null : logFormData.setsCompleted,
      repsCompleted: logFormData.skipped ? null : logFormData.repsCompleted,
      painBefore: logFormData.painBefore,
      painAfter: logFormData.skipped ? null : logFormData.painAfter,
      difficulty: logFormData.skipped ? null : logFormData.difficulty,
      notes: logFormData.notes || null,
      skipped: logFormData.skipped,
      skipReason: logFormData.skipped ? logFormData.skipReason : null,
    });
  };

  const handleAskQuestion = () => {
    if (!token) return;

    askQuestionMutation.mutate({
      sessionToken: token,
      subject: questionFormData.subject,
      message: questionFormData.message,
      relatedTo: questionFormData.relatedTo || undefined,
    });
  };

  const openExerciseForLogging = (prescription: ExercisePrescription) => {
    setSelectedExercise(prescription);
    setLogFormData({
      setsCompleted: prescription.sets || 3,
      repsCompleted: prescription.reps || 10,
      painBefore: 5,
      painAfter: 5,
      difficulty: 3,
      notes: '',
      skipped: false,
      skipReason: '',
    });
    setShowLogDialog(true);
  };

  const openExerciseDetails = (prescription: ExercisePrescription) => {
    setSelectedExercise(prescription);
    setShowExerciseDialog(true);
  };

  const openArticle = (articleId: string) => {
    setSelectedArticle(articleId);
    setShowArticleDialog(true);
  };

  const getDifficultyLabel = (level: number) => {
    const labels: Record<number, string> = {
      1: 'Very Easy',
      2: 'Easy',
      3: 'Moderate',
      4: 'Difficult',
      5: 'Very Difficult',
    };
    return labels[level] || 'Moderate';
  };

  const getDifficultyColor = (difficulty: string | null) => {
    const colors: Record<string, string> = {
      BEGINNER: 'bg-green-100 text-green-700 border-green-200',
      INTERMEDIATE: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      ADVANCED: 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[difficulty || ''] || 'bg-stone-100 text-stone-700 border-stone-200';
  };

  if (!token) return null;

  return (
    <div className="space-y-6">
      {/* Header with Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-stone-50 rounded-xl p-6 border border-blue-100">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          <Dumbbell className="h-6 w-6 text-[#053e67]" />
          My Health & Exercises
        </h1>
        <p className="text-stone-600 mt-1">
          Track your exercises, view care instructions, and learn about your health
        </p>

        {/* Quick Stats */}
        {exercisesData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-white rounded-lg p-3 border border-stone-200">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[#053e67]" />
                <span className="text-sm text-stone-600">Active Exercises</span>
              </div>
              <p className="text-2xl font-bold text-stone-900 mt-1">
                {exercisesData.summary.active}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-stone-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-stone-600">Completed Today</span>
              </div>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {exercisesData.summary.completedToday}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-stone-200">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-stone-600">Remaining</span>
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {exercisesData.summary.remainingToday}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-stone-200">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-600" />
                <span className="text-sm text-stone-600">Current Streak</span>
              </div>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                {achievementsData?.stats.currentStreak || 0} days
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="exercises" className="flex items-center gap-1.5">
            <Dumbbell className="h-4 w-4" />
            <span className="hidden sm:inline">Exercises</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Progress</span>
          </TabsTrigger>
          <TabsTrigger value="homecare" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Home Care</span>
          </TabsTrigger>
          <TabsTrigger value="education" className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Education</span>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="flex items-center gap-1.5">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Achievements</span>
          </TabsTrigger>
        </TabsList>

        {/* Exercises Tab */}
        <TabsContent value="exercises" className="space-y-6">
          {/* Daily Checklist */}
          {checklistData && checklistData.checklist.length > 0 && (
            <Card className="border-[#053e67]/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-[#053e67]" />
                  Today&apos;s Exercise Checklist
                </CardTitle>
                <CardDescription>
                  {checklistData.summary.completed} of {checklistData.summary.total} completed
                </CardDescription>
                <Progress
                  value={(checklistData.summary.completed / checklistData.summary.total) * 100}
                  className="h-2 mt-2"
                />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {checklistData.checklist.map((item) => (
                    <div
                      key={item.prescriptionId}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        item.status === 'completed'
                          ? 'bg-green-50 border-green-200'
                          : item.status === 'skipped'
                          ? 'bg-stone-50 border-stone-200'
                          : 'bg-white border-stone-200 hover:bg-blue-50 hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : item.status === 'skipped' ? (
                          <XCircle className="h-5 w-5 text-stone-400" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-stone-300" />
                        )}
                        <div>
                          <p className="font-medium text-stone-900">{item.exerciseName}</p>
                          <p className="text-sm text-stone-500">
                            {item.sets && item.reps
                              ? `${item.sets} sets x ${item.reps} reps`
                              : item.holdTime
                              ? `${item.holdTime}s hold`
                              : item.frequency}
                          </p>
                        </div>
                      </div>
                      {item.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            const prescription = exercisesData?.prescriptions.find(
                              (p) => p.id === item.prescriptionId
                            );
                            if (prescription) {
                              openExerciseForLogging(prescription as unknown as ExercisePrescription);
                            }
                          }}
                          className="bg-[#053e67] hover:bg-[#053e67]/90"
                        >
                          Log
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Exercise List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-[#053e67]" />
                My Prescribed Exercises
              </CardTitle>
              <CardDescription>
                Exercises prescribed by your care team
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exercisesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : exercisesData?.prescriptions.length === 0 ? (
                <div className="text-center py-12">
                  <Dumbbell className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500">No exercises prescribed yet</p>
                  <p className="text-sm text-stone-400 mt-1">
                    Your provider will prescribe exercises as part of your treatment plan
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {exercisesData?.prescriptions.map((prescription) => (
                    <Card
                      key={prescription.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        prescription.completedToday
                          ? 'border-green-300 bg-green-50/50'
                          : prescription.skippedToday
                          ? 'border-stone-200 bg-stone-50/50'
                          : 'border-stone-200 hover:border-blue-300'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-stone-900">
                                {prescription.exercise.name}
                              </h3>
                              {prescription.completedToday && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {prescription.exercise.category && (
                                <Badge variant="outline" className="text-xs">
                                  {prescription.exercise.category.name}
                                </Badge>
                              )}
                              {prescription.exercise.difficulty && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${getDifficultyColor(prescription.exercise.difficulty)}`}
                                >
                                  {prescription.exercise.difficulty.toLowerCase()}
                                </Badge>
                              )}
                              {prescription.exercise.bodyRegion && (
                                <Badge variant="outline" className="text-xs">
                                  {prescription.exercise.bodyRegion.replace(/_/g, ' ')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-stone-600 line-clamp-2">
                              {prescription.exercise.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-stone-500">
                              {prescription.sets && prescription.reps && (
                                <span>{prescription.sets} x {prescription.reps} reps</span>
                              )}
                              {prescription.holdTime && (
                                <span>{prescription.holdTime}s hold</span>
                              )}
                              {prescription.frequency && (
                                <span>{prescription.frequency}</span>
                              )}
                            </div>
                          </div>
                          {prescription.exercise.videoUrl && (
                            <div className="ml-3">
                              <div className="w-16 h-16 bg-stone-100 rounded-lg flex items-center justify-center">
                                <Play className="h-8 w-8 text-[#053e67]" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openExerciseDetails(prescription as unknown as ExercisePrescription)}
                            className="flex-1"
                          >
                            View Details
                          </Button>
                          {!prescription.completedToday && !prescription.skippedToday && (
                            <Button
                              size="sm"
                              onClick={() => openExerciseForLogging(prescription as unknown as ExercisePrescription)}
                              className="flex-1 bg-[#053e67] hover:bg-[#053e67]/90"
                            >
                              Log Exercise
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#053e67]" />
                Exercise Progress
              </CardTitle>
              <CardDescription>
                Your exercise completion over the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {progressData ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {progressData.summary.completed}
                      </p>
                      <p className="text-sm text-green-700">Completed</p>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-stone-600">
                        {progressData.summary.skipped}
                      </p>
                      <p className="text-sm text-stone-700">Skipped</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {progressData.summary.totalLogs > 0
                          ? Math.round(
                              (progressData.summary.completed / progressData.summary.totalLogs) * 100
                            )
                          : 0}%
                      </p>
                      <p className="text-sm text-blue-700">Compliance</p>
                    </div>
                  </div>

                  {/* Simple Chart Representation */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-stone-700 mb-3">Daily Activity</h4>
                    <div className="flex items-end gap-1 h-32">
                      {progressData.chartData.slice(-14).map((day, index) => (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div className="w-full bg-stone-100 rounded-t relative" style={{ height: '100%' }}>
                            <div
                              className="absolute bottom-0 w-full bg-green-500 rounded-t transition-all"
                              style={{
                                height: `${Math.max(5, (day.completed / (day.completed + day.skipped || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-stone-400">
                            {index % 2 === 0 ? format(new Date(day.date), 'd') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div>
                    <h4 className="font-medium text-stone-700 mb-3">Recent Activity</h4>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {progressData.logs.slice(0, 10).map((log) => (
                          <div
                            key={log.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              log.skipped
                                ? 'bg-stone-50 border-stone-200'
                                : 'bg-white border-stone-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {log.skipped ? (
                                <XCircle className="h-5 w-5 text-stone-400" />
                              ) : (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              )}
                              <div>
                                <p className="font-medium text-stone-900">{log.exerciseName}</p>
                                <p className="text-sm text-stone-500">
                                  {format(new Date(log.completedAt), 'MMM d, h:mm a')}
                                </p>
                              </div>
                            </div>
                            {!log.skipped && log.painBefore !== null && log.painAfter !== null && (
                              <div className="text-right">
                                <p className="text-sm text-stone-600">
                                  Pain: {log.painBefore} → {log.painAfter}
                                </p>
                                {log.painAfter < log.painBefore && (
                                  <Badge className="bg-green-100 text-green-700 border-green-200">
                                    -{log.painBefore - log.painAfter} pain
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500">No progress data yet</p>
                  <p className="text-sm text-stone-400 mt-1">
                    Start logging your exercises to track progress
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Home Care Tab */}
        <TabsContent value="homecare" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#053e67]" />
                Home Care Instructions
              </CardTitle>
              <CardDescription>
                Care instructions from your provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              {homeCareLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : homeCareData?.instructions.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500">No home care instructions</p>
                  <p className="text-sm text-stone-400 mt-1">
                    Your provider will add instructions as needed
                  </p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-4">
                  {homeCareData?.instructions.map((instruction: HomeCareInstruction) => (
                    <AccordionItem
                      key={instruction.id}
                      value={instruction.id}
                      className="border rounded-lg"
                    >
                      <AccordionTrigger className="px-4 hover:no-underline hover:bg-stone-50">
                        <div className="flex items-center gap-3 text-left">
                          <ClipboardList className="h-5 w-5 text-[#053e67]" />
                          <div>
                            <p className="font-medium">
                              Home Care Instructions
                              {instruction.encounterDate && (
                                <span className="font-normal text-stone-500">
                                  {' '}
                                  - {format(new Date(instruction.encounterDate), 'MMM d, yyyy')}
                                </span>
                              )}
                            </p>
                            {instruction.provider && (
                              <p className="text-sm text-stone-500">
                                From {instruction.provider.title} {instruction.provider.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-4">
                          {/* Main Instructions */}
                          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                              <Info className="h-4 w-4" />
                              Instructions
                            </h4>
                            <p className="text-blue-800 whitespace-pre-wrap">
                              {instruction.instructions}
                            </p>
                          </div>

                          {/* Ice Protocol */}
                          {instruction.iceProtocol && (
                            <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-100">
                              <h4 className="font-medium text-cyan-900 mb-2 flex items-center gap-2">
                                <Snowflake className="h-4 w-4" />
                                Ice Protocol
                              </h4>
                              <p className="text-cyan-800 whitespace-pre-wrap">
                                {instruction.iceProtocol}
                              </p>
                            </div>
                          )}

                          {/* Heat Protocol */}
                          {instruction.heatProtocol && (
                            <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                              <h4 className="font-medium text-orange-900 mb-2 flex items-center gap-2">
                                <ThermometerSun className="h-4 w-4" />
                                Heat Protocol
                              </h4>
                              <p className="text-orange-800 whitespace-pre-wrap">
                                {instruction.heatProtocol}
                              </p>
                            </div>
                          )}

                          {/* Activity Modifications */}
                          {instruction.activityMods && (
                            <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                              <h4 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Activity Modifications
                              </h4>
                              <p className="text-amber-800 whitespace-pre-wrap">
                                {instruction.activityMods}
                              </p>
                            </div>
                          )}

                          {/* Ergonomic Recommendations */}
                          {instruction.ergonomicRecs && (
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                              <h4 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Ergonomic Recommendations
                              </h4>
                              <p className="text-purple-800 whitespace-pre-wrap">
                                {instruction.ergonomicRecs}
                              </p>
                            </div>
                          )}

                          {/* Warning Signs */}
                          {instruction.warningSigns && (
                            <Alert className="bg-red-50 border-red-200">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-red-800">
                                <strong>Warning Signs to Watch For:</strong>
                                <p className="mt-1 whitespace-pre-wrap">
                                  {instruction.warningSigns}
                                </p>
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Follow-up Instructions */}
                          {instruction.followUpInstr && (
                            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                              <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Follow-Up
                              </h4>
                              <p className="text-green-800 whitespace-pre-wrap">
                                {instruction.followUpInstr}
                              </p>
                            </div>
                          )}

                          {/* Ask Question Button */}
                          <Button
                            variant="outline"
                            onClick={() => {
                              setQuestionFormData({
                                subject: 'Question about Home Care Instructions',
                                message: '',
                                relatedTo: {
                                  type: 'instruction',
                                  id: instruction.id,
                                  name: 'Home Care Instructions',
                                },
                              });
                              setShowQuestionDialog(true);
                            }}
                            className="w-full"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Ask a Question About These Instructions
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Education Tab */}
        <TabsContent value="education" className="space-y-6">
          {/* Prescribed Articles */}
          {prescribedArticlesData && prescribedArticlesData.articles.length > 0 && (
            <Card className="border-[#053e67]/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  Recommended Reading
                  {prescribedArticlesData.unreadCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                      {prescribedArticlesData.unreadCount} new
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Articles recommended by your care team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {prescribedArticlesData.articles.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        openArticle(item.articleId);
                        if (!item.readAt) {
                          markArticleReadMutation.mutate({
                            sessionToken: token!,
                            prescribedArticleId: item.id,
                          });
                        }
                      }}
                      className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                        item.readAt
                          ? 'bg-white border-stone-200 hover:bg-stone-50'
                          : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <BookOpen
                          className={`h-5 w-5 ${
                            item.readAt ? 'text-stone-400' : 'text-amber-600'
                          }`}
                        />
                        <div>
                          <p className="font-medium text-stone-900">{item.article.title}</p>
                          <p className="text-sm text-stone-500">
                            {item.article.category} | {item.article.readingLevel.toLowerCase()} reading level
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-stone-400" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Articles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#053e67]" />
                Health Education Library
              </CardTitle>
              <CardDescription>
                Learn about your condition and treatment options
              </CardDescription>
            </CardHeader>
            <CardContent>
              {articlesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : articlesData?.articles.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500">No articles available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Categories Filter */}
                  {articlesData?.categories && articlesData.categories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {articlesData.categories.map((cat) => (
                        <Badge
                          key={cat.name}
                          variant="outline"
                          className="cursor-pointer hover:bg-blue-50 hover:border-blue-300"
                        >
                          {cat.name} ({cat.count})
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Article List */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {articlesData?.articles.map((article: EducationArticle) => (
                      <Card
                        key={article.id}
                        onClick={() => openArticle(article.id)}
                        className="cursor-pointer hover:shadow-md transition-all hover:border-blue-300"
                      >
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-stone-900 mb-2">
                            {article.title}
                          </h3>
                          {article.summary && (
                            <p className="text-sm text-stone-600 line-clamp-2 mb-3">
                              {article.summary}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-xs">
                              {article.category}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-stone-50">
                              {article.readingLevel.toLowerCase()}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Achievements Tab */}
        <TabsContent value="achievements" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Your Achievements
              </CardTitle>
              <CardDescription>
                Earn badges by staying consistent with your exercises
              </CardDescription>
            </CardHeader>
            <CardContent>
              {achievementsData ? (
                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                      <p className="text-3xl mb-1">
                        {achievementsData.stats.earnedCount}
                      </p>
                      <p className="text-sm text-amber-700">Badges Earned</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-3xl mb-1">
                        {achievementsData.stats.totalCompleted}
                      </p>
                      <p className="text-sm text-green-700">Exercises Completed</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 text-center">
                      <p className="text-3xl mb-1">
                        {achievementsData.stats.maxStreak}
                      </p>
                      <p className="text-sm text-orange-700">Best Streak (days)</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-3xl mb-1">
                        {achievementsData.stats.painImprovementCount}
                      </p>
                      <p className="text-sm text-blue-700">Pain Improvements</p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {achievementsData.achievements.map((achievement: Achievement) => (
                      <div
                        key={achievement.id}
                        className={`flex items-center gap-4 p-4 rounded-lg border ${
                          achievement.earned
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-stone-50 border-stone-200 opacity-60'
                        }`}
                      >
                        <div
                          className={`text-4xl ${
                            achievement.earned ? '' : 'grayscale'
                          }`}
                        >
                          {achievement.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-stone-900">
                              {achievement.name}
                            </h4>
                            {achievement.earned && (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            )}
                          </div>
                          <p className="text-sm text-stone-600">
                            {achievement.description}
                          </p>
                          {!achievement.earned && (
                            <div className="mt-2">
                              <Progress
                                value={(achievement.progress / achievement.threshold) * 100}
                                className="h-2"
                              />
                              <p className="text-xs text-stone-500 mt-1">
                                {achievement.progress} / {achievement.threshold}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                  <p className="text-stone-500">Loading achievements...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Exercise Details Dialog */}
      <Dialog open={showExerciseDialog} onOpenChange={setShowExerciseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-[#053e67]" />
              {selectedExercise?.exercise.name}
            </DialogTitle>
            <DialogDescription>
              {selectedExercise?.exercise.category?.name && (
                <Badge variant="outline" className="mr-2">
                  {selectedExercise.exercise.category.name}
                </Badge>
              )}
              {selectedExercise?.exercise.difficulty && (
                <Badge
                  variant="outline"
                  className={getDifficultyColor(selectedExercise.exercise.difficulty)}
                >
                  {selectedExercise.exercise.difficulty.toLowerCase()}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedExercise && (
            <div className="space-y-6">
              {/* Video Player */}
              {selectedExercise.exercise.videoUrl && (
                <div className="aspect-video bg-stone-900 rounded-lg overflow-hidden">
                  <video
                    src={selectedExercise.exercise.videoUrl}
                    controls
                    className="w-full h-full"
                    poster={selectedExercise.exercise.imageUrl || undefined}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}

              {/* Image fallback */}
              {!selectedExercise.exercise.videoUrl && selectedExercise.exercise.imageUrl && (
                <div className="aspect-video bg-stone-100 rounded-lg overflow-hidden">
                  <img
                    src={selectedExercise.exercise.imageUrl}
                    alt={selectedExercise.exercise.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Parameters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedExercise.sets && (
                  <div className="bg-stone-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-stone-900">{selectedExercise.sets}</p>
                    <p className="text-xs text-stone-500">Sets</p>
                  </div>
                )}
                {selectedExercise.reps && (
                  <div className="bg-stone-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-stone-900">{selectedExercise.reps}</p>
                    <p className="text-xs text-stone-500">Reps</p>
                  </div>
                )}
                {selectedExercise.holdTime && (
                  <div className="bg-stone-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-stone-900">{selectedExercise.holdTime}s</p>
                    <p className="text-xs text-stone-500">Hold</p>
                  </div>
                )}
                {selectedExercise.frequency && (
                  <div className="bg-stone-50 rounded-lg p-3 text-center">
                    <p className="text-sm font-medium text-stone-900">{selectedExercise.frequency}</p>
                    <p className="text-xs text-stone-500">Frequency</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedExercise.exercise.description && (
                <div>
                  <h4 className="font-medium text-stone-700 mb-2">Description</h4>
                  <p className="text-stone-600">{selectedExercise.exercise.description}</p>
                </div>
              )}

              {/* Instructions */}
              {selectedExercise.exercise.instructions && (
                <div>
                  <h4 className="font-medium text-stone-700 mb-2">How to Perform</h4>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <p className="text-blue-800 whitespace-pre-wrap">
                      {selectedExercise.exercise.instructions}
                    </p>
                  </div>
                </div>
              )}

              {/* Special Instructions */}
              {selectedExercise.specialInstructions && (
                <div>
                  <h4 className="font-medium text-stone-700 mb-2">Special Instructions</h4>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <p className="text-amber-800 whitespace-pre-wrap">
                      {selectedExercise.specialInstructions}
                    </p>
                  </div>
                </div>
              )}

              {/* Equipment */}
              {selectedExercise.exercise.equipmentRequired && selectedExercise.exercise.equipmentRequired.length > 0 && (
                <div>
                  <h4 className="font-medium text-stone-700 mb-2">Equipment Needed</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedExercise.exercise.equipmentRequired.map((item: string, i: number) => (
                      <Badge key={i} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Contraindications */}
              {selectedExercise.exercise.contraindications && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Stop if you experience:</strong>
                    <p className="mt-1 whitespace-pre-wrap">
                      {selectedExercise.exercise.contraindications}
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQuestionFormData({
                  subject: `Question about ${selectedExercise?.exercise.name}`,
                  message: '',
                  relatedTo: selectedExercise
                    ? {
                        type: 'exercise',
                        id: selectedExercise.id,
                        name: selectedExercise.exercise.name,
                      }
                    : null,
                });
                setShowExerciseDialog(false);
                setShowQuestionDialog(true);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Ask Question
            </Button>
            {!selectedExercise?.completedToday && !selectedExercise?.skippedToday && (
              <Button
                onClick={() => {
                  setShowExerciseDialog(false);
                  if (selectedExercise) {
                    openExerciseForLogging(selectedExercise);
                  }
                }}
                className="bg-[#053e67] hover:bg-[#053e67]/90"
              >
                Log Exercise
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Exercise Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {logFormData.skipped ? 'Skip Exercise' : 'Log Exercise'}
            </DialogTitle>
            <DialogDescription>
              {selectedExercise?.exercise.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Skip toggle */}
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
              <span className="text-sm font-medium">Unable to complete?</span>
              <Button
                variant={logFormData.skipped ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setLogFormData({ ...logFormData, skipped: !logFormData.skipped })
                }
              >
                {logFormData.skipped ? 'Skipping' : 'Mark as Skipped'}
              </Button>
            </div>

            {logFormData.skipped ? (
              <div>
                <Label htmlFor="skipReason">Reason (optional)</Label>
                <Textarea
                  id="skipReason"
                  placeholder="Why couldn't you complete this exercise?"
                  value={logFormData.skipReason}
                  onChange={(e) =>
                    setLogFormData({ ...logFormData, skipReason: e.target.value })
                  }
                />
              </div>
            ) : (
              <>
                {/* Sets and Reps */}
                {selectedExercise?.sets && selectedExercise?.reps && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sets">Sets Completed</Label>
                      <Input
                        id="sets"
                        type="number"
                        min={1}
                        value={logFormData.setsCompleted}
                        onChange={(e) =>
                          setLogFormData({
                            ...logFormData,
                            setsCompleted: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="reps">Reps Completed</Label>
                      <Input
                        id="reps"
                        type="number"
                        min={1}
                        value={logFormData.repsCompleted}
                        onChange={(e) =>
                          setLogFormData({
                            ...logFormData,
                            repsCompleted: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Pain Before */}
                <div>
                  <Label>Pain Before Exercise: {logFormData.painBefore}/10</Label>
                  <Slider
                    value={[logFormData.painBefore]}
                    onValueChange={(values: number[]) =>
                      setLogFormData({ ...logFormData, painBefore: values[0] })
                    }
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-stone-500 mt-1">
                    <span>No pain</span>
                    <span>Severe pain</span>
                  </div>
                </div>

                {/* Pain After */}
                <div>
                  <Label>Pain After Exercise: {logFormData.painAfter}/10</Label>
                  <Slider
                    value={[logFormData.painAfter]}
                    onValueChange={(values: number[]) =>
                      setLogFormData({ ...logFormData, painAfter: values[0] })
                    }
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-stone-500 mt-1">
                    <span>No pain</span>
                    <span>Severe pain</span>
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <Label>How difficult was it? {getDifficultyLabel(logFormData.difficulty)}</Label>
                  <Slider
                    value={[logFormData.difficulty]}
                    onValueChange={(values: number[]) =>
                      setLogFormData({ ...logFormData, difficulty: values[0] })
                    }
                    min={1}
                    max={5}
                    step={1}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-stone-500 mt-1">
                    <span>Very Easy</span>
                    <span>Very Difficult</span>
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about this session..."
                value={logFormData.notes}
                onChange={(e) =>
                  setLogFormData({ ...logFormData, notes: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLogExercise}
              disabled={logExerciseMutation.isPending}
              className={logFormData.skipped ? 'bg-stone-600' : 'bg-[#053e67]'}
            >
              {logExerciseMutation.isPending
                ? 'Saving...'
                : logFormData.skipped
                ? 'Skip Exercise'
                : 'Log Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ask Question Dialog */}
      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#053e67]" />
              Ask Your Care Team
            </DialogTitle>
            <DialogDescription>
              Send a message to your provider. They typically respond within 1-2 business days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {questionFormData.relatedTo && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-sm text-blue-700">
                  Regarding: {questionFormData.relatedTo.name}
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="What's your question about?"
                value={questionFormData.subject}
                onChange={(e) =>
                  setQuestionFormData({ ...questionFormData, subject: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Describe your question or concern..."
                rows={5}
                value={questionFormData.message}
                onChange={(e) =>
                  setQuestionFormData({ ...questionFormData, message: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAskQuestion}
              disabled={
                askQuestionMutation.isPending ||
                !questionFormData.subject ||
                !questionFormData.message
              }
              className="bg-[#053e67] hover:bg-[#053e67]/90"
            >
              {askQuestionMutation.isPending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Article Detail Dialog */}
      <Dialog open={showArticleDialog} onOpenChange={setShowArticleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{articleDetailData?.article.title}</DialogTitle>
            <DialogDescription>
              <Badge variant="outline" className="mr-2">
                {articleDetailData?.article.category}
              </Badge>
              <Badge variant="outline">
                {articleDetailData?.article.readingLevel?.toLowerCase()} reading level
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            {articleDetailData?.article.content && (
              <div className="prose prose-stone max-w-none whitespace-pre-wrap">
                {renderTextWithLineBreaks(articleDetailData.article.content)}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setQuestionFormData({
                  subject: `Question about "${articleDetailData?.article.title}"`,
                  message: '',
                  relatedTo: articleDetailData
                    ? {
                        type: 'article',
                        id: articleDetailData.article.id,
                        name: articleDetailData.article.title,
                      }
                    : null,
                });
                setShowArticleDialog(false);
                setShowQuestionDialog(true);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Ask Question
            </Button>
            <Button onClick={() => setShowArticleDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
