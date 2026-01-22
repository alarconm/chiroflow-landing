'use client';

/**
 * Mobile Health Dashboard Component (US-269)
 *
 * Main health overview screen for the patient mobile app
 * showing pain summary, goals, education, and quick actions.
 */

import React from 'react';
import {
  Activity,
  BookOpen,
  Camera,
  ChevronRight,
  Dumbbell,
  Heart,
  Target,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface PainSummary {
  averagePainThisWeek: number | null;
  latestPainLevel: number | null;
  latestPainLocation: string | null;
  entriesThisWeek: number;
}

interface Goal {
  id: string;
  title: string;
  goalType: string;
  progressPercentage: number | null;
  status: string;
}

interface GoalsSummary {
  activeCount: number;
  goals: Goal[];
}

interface EducationSummary {
  unreadCount: number;
}

interface ExercisesSummary {
  activeCount: number;
}

interface DashboardData {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  painSummary: PainSummary;
  goals: GoalsSummary;
  education: EducationSummary;
  exercises: ExercisesSummary;
}

interface MobileHealthDashboardProps {
  data: DashboardData;
  onNavigateToPainDiary: () => void;
  onNavigateToGoals: () => void;
  onNavigateToEducation: () => void;
  onNavigateToExercises: () => void;
  onNavigateToPhotos: () => void;
  onLogPain: () => void;
  isLoading?: boolean;
}

export function MobileHealthDashboard({
  data,
  onNavigateToPainDiary,
  onNavigateToGoals,
  onNavigateToEducation,
  onNavigateToExercises,
  onNavigateToPhotos,
  onLogPain,
  isLoading = false,
}: MobileHealthDashboardProps) {
  const getPainLevelColor = (level: number | null) => {
    if (level === null) return 'text-gray-400';
    if (level <= 3) return 'text-green-600';
    if (level <= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPainLevelBg = (level: number | null) => {
    if (level === null) return 'bg-gray-100';
    if (level <= 3) return 'bg-green-100';
    if (level <= 6) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getPainTrendIcon = () => {
    const { averagePainThisWeek, entriesThisWeek } = data.painSummary;
    if (entriesThisWeek < 2) {
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
    // For simplicity, we'll just show the level indicator
    if (averagePainThisWeek !== null) {
      if (averagePainThisWeek <= 3) return <TrendingDown className="w-4 h-4 text-green-600" />;
      if (averagePainThisWeek <= 6) return <Minus className="w-4 h-4 text-yellow-600" />;
      return <TrendingUp className="w-4 h-4 text-red-600" />;
    }
    return <AlertCircle className="w-4 h-4 text-gray-400" />;
  };

  const getLocationLabel = (location: string | null) => {
    if (!location) return '--';
    // Convert enum to readable format
    return location
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Welcome Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">
          Hi, {data.patient.firstName}!
        </h1>
        <p className="text-sm text-gray-500">Here&apos;s your health overview</p>
      </div>

      {/* Quick Log Pain Button */}
      <Button
        onClick={onLogPain}
        className="w-full bg-[#c90000] hover:bg-[#a80000] text-white"
        size="lg"
      >
        <Heart className="w-5 h-5 mr-2" />
        Log How You&apos;re Feeling
      </Button>

      {/* Pain Summary Card */}
      <Card
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onNavigateToPainDiary}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#053e67]" />
              Pain Tracker
            </CardTitle>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4">
            {/* Latest Pain Level */}
            <div className="text-center">
              <div
                className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center ${getPainLevelBg(
                  data.painSummary.latestPainLevel
                )}`}
              >
                <span
                  className={`text-xl font-bold ${getPainLevelColor(
                    data.painSummary.latestPainLevel
                  )}`}
                >
                  {data.painSummary.latestPainLevel ?? '--'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Latest</p>
            </div>

            {/* Weekly Average */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 h-14">
                {getPainTrendIcon()}
                <span
                  className={`text-xl font-bold ${getPainLevelColor(
                    data.painSummary.averagePainThisWeek
                  )}`}
                >
                  {data.painSummary.averagePainThisWeek ?? '--'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Weekly Avg</p>
            </div>

            {/* Location */}
            <div className="text-center">
              <div className="h-14 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700 text-center line-clamp-2">
                  {getLocationLabel(data.painSummary.latestPainLocation)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Location</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-3">
            {data.painSummary.entriesThisWeek} entries this week
          </p>
        </CardContent>
      </Card>

      {/* Goals Card */}
      <Card
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onNavigateToGoals}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-[#053e67]" />
              Your Goals
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {data.goals.activeCount} Active
              </Badge>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.goals.goals.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">
              No active goals. Set one to track your progress!
            </p>
          ) : (
            <div className="space-y-3">
              {data.goals.goals.slice(0, 2).map((goal) => (
                <div key={goal.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {goal.title}
                    </p>
                    {goal.progressPercentage !== null && (
                      <Progress value={goal.progressPercentage} className="h-1.5 mt-1" />
                    )}
                  </div>
                  {goal.progressPercentage !== null && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {goal.progressPercentage}%
                    </span>
                  )}
                </div>
              ))}
              {data.goals.activeCount > 2 && (
                <p className="text-xs text-[#053e67] font-medium">
                  +{data.goals.activeCount - 2} more goals
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Education Card */}
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={onNavigateToEducation}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <BookOpen className="w-6 h-6 text-[#053e67]" />
              {data.education.unreadCount > 0 && (
                <Badge className="bg-[#c90000]">{data.education.unreadCount}</Badge>
              )}
            </div>
            <h3 className="font-medium text-gray-900">Education</h3>
            <p className="text-xs text-gray-500">
              {data.education.unreadCount > 0
                ? `${data.education.unreadCount} unread articles`
                : 'Learn about your care'}
            </p>
          </CardContent>
        </Card>

        {/* Exercises Card */}
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={onNavigateToExercises}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <Dumbbell className="w-6 h-6 text-[#053e67]" />
              <Badge variant="outline" className="text-xs">
                {data.exercises.activeCount}
              </Badge>
            </div>
            <h3 className="font-medium text-gray-900">Exercises</h3>
            <p className="text-xs text-gray-500">
              {data.exercises.activeCount} active exercises
            </p>
          </CardContent>
        </Card>

        {/* Progress Photos Card */}
        <Card
          className="cursor-pointer hover:bg-gray-50 transition-colors col-span-2"
          onClick={onNavigateToPhotos}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Camera className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">Progress Photos</h3>
                <p className="text-xs text-gray-500">
                  Track your visual progress over time
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Motivational Tip */}
      <Card className="bg-gradient-to-br from-[#053e67]/5 to-[#053e67]/10 border-[#053e67]/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#053e67] rounded-full flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-medium text-[#053e67]">Daily Tip</h3>
              <p className="text-sm text-gray-600 mt-1">
                Consistent tracking helps your provider understand your progress better.
                Try to log your pain at the same time each day.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
