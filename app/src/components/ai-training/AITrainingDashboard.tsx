'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GraduationCap,
  Users,
  Video,
  Award,
  Rocket,
  BookOpen,
  TrendingUp,
  Settings,
  FileText,
  Brain,
  Play,
  Target,
  RefreshCw,
  BarChart3,
} from 'lucide-react';

import { StaffProgressOverview } from './StaffProgressOverview';
import { PracticeSessionHistory } from './PracticeSessionHistory';
import { CertificationStatusBoard } from './CertificationStatusBoard';
import { OnboardingPipeline } from './OnboardingPipeline';
import { TrainingContentLibrary } from './TrainingContentLibrary';
import { PerformanceImprovementTrends } from './PerformanceImprovementTrends';
import { ManagerAssignmentTools } from './ManagerAssignmentTools';
import { TrainingCompletionReports } from './TrainingCompletionReports';

// Demo quick stats
const demoQuickStats = {
  totalStaff: 12,
  activeTrainees: 4,
  completionRate: 78,
  avgScore: 85,
  practiceSessionsToday: 8,
  certificationsExpiring: 3,
  onboardingInProgress: 2,
};

export function AITrainingDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate data refresh
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            AI Staff Training Center
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered training, practice sessions, and performance coaching
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Play className="h-4 w-4 mr-2" />
            Start Practice Session
          </Button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.totalStaff}</p>
            <p className="text-xs text-muted-foreground">Total Staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <GraduationCap className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.activeTrainees}</p>
            <p className="text-xs text-muted-foreground">In Training</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Target className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.completionRate}%</p>
            <p className="text-xs text-muted-foreground">Completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-teal-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.avgScore}%</p>
            <p className="text-xs text-muted-foreground">Avg Score</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Video className="h-5 w-5 mx-auto text-orange-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.practiceSessionsToday}</p>
            <p className="text-xs text-muted-foreground">Sessions Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Award className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.certificationsExpiring}</p>
            <p className="text-xs text-muted-foreground">Certs Expiring</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 text-center">
            <Rocket className="h-5 w-5 mx-auto text-rose-600 mb-1" />
            <p className="text-2xl font-bold">{demoQuickStats.onboardingInProgress}</p>
            <p className="text-xs text-muted-foreground">Onboarding</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="practice" className="flex items-center gap-1">
            <Video className="h-4 w-4" />
            <span className="hidden sm:inline">Practice</span>
          </TabsTrigger>
          <TabsTrigger value="certifications" className="flex items-center gap-1">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">Certs</span>
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="flex items-center gap-1">
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Onboarding</span>
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Library</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Trends</span>
          </TabsTrigger>
          <TabsTrigger value="assign" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Assign</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Staff Training Progress */}
        <TabsContent value="overview">
          <StaffProgressOverview />
        </TabsContent>

        {/* Practice Sessions Tab */}
        <TabsContent value="practice">
          <PracticeSessionHistory />
        </TabsContent>

        {/* Certifications Tab */}
        <TabsContent value="certifications">
          <CertificationStatusBoard />
        </TabsContent>

        {/* Onboarding Tab */}
        <TabsContent value="onboarding">
          <OnboardingPipeline />
        </TabsContent>

        {/* Content Library Tab */}
        <TabsContent value="library">
          <TrainingContentLibrary />
        </TabsContent>

        {/* Performance Trends Tab */}
        <TabsContent value="trends">
          <PerformanceImprovementTrends />
        </TabsContent>

        {/* Manager Assignment Tab */}
        <TabsContent value="assign">
          <ManagerAssignmentTools />
        </TabsContent>

        {/* Completion Reports Tab */}
        <TabsContent value="reports">
          <TrainingCompletionReports />
        </TabsContent>
      </Tabs>

      {/* Quick Actions Footer */}
      <Card className="bg-gradient-to-r from-primary/10 to-purple-500/10">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI Training Assistant
              </h3>
              <p className="text-sm text-muted-foreground">
                Practice customer scenarios with AI-powered role-play sessions
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline">
                <Target className="h-4 w-4 mr-2" />
                Set Goals
              </Button>
              <Button variant="outline">
                <TrendingUp className="h-4 w-4 mr-2" />
                View Coaching
              </Button>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                Start AI Practice
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
