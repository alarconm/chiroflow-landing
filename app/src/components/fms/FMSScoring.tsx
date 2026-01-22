'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FMS_DEFINITIONS,
  getAllTestNames,
  type FMSTestType,
  type FMSScore,
  type FMSSummary,
  type MovementCategory,
} from '@/lib/services/fmsAnalysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface FMSTestInput {
  testName: FMSTestType;
  score: FMSScore;
  leftScore: FMSScore | null;
  rightScore: FMSScore | null;
  painDuringTest: boolean;
  painLocation: string;
  compensations: string[];
  limitingFactors: string[];
  movementQuality: string;
  notes: string;
}

interface FMSScoringProps {
  initialTests?: FMSTestInput[];
  onTestUpdate?: (test: FMSTestInput) => void;
  onComplete?: (tests: FMSTestInput[]) => void;
  readOnly?: boolean;
  className?: string;
}

interface ScoreButtonProps {
  score: FMSScore;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

// ============================================
// SCORE BUTTON COMPONENT
// ============================================

const scoreColors: Record<FMSScore, { bg: string; text: string; border: string }> = {
  0: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  1: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  2: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  3: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
};

const scoreDescriptions: Record<FMSScore, string> = {
  0: 'Pain',
  1: 'Dysfunction',
  2: 'Compensated',
  3: 'Optimal',
};

function ScoreButton({ score, selected, onClick, disabled = false }: ScoreButtonProps) {
  const colors = scoreColors[score];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center w-16 h-16 rounded-lg border-2 transition-all',
        selected ? colors.bg : 'bg-white hover:bg-gray-50',
        selected ? colors.border : 'border-gray-200',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      <span className={cn('text-xl font-bold', selected ? colors.text : 'text-gray-600')}>
        {score}
      </span>
      <span className={cn('text-xs', selected ? colors.text : 'text-gray-500')}>
        {scoreDescriptions[score]}
      </span>
    </button>
  );
}

// ============================================
// SINGLE TEST SCORING CARD
// ============================================

interface TestScoringCardProps {
  testName: FMSTestType;
  testInput: FMSTestInput;
  onUpdate: (update: Partial<FMSTestInput>) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  readOnly?: boolean;
}

function TestScoringCard({
  testName,
  testInput,
  onUpdate,
  expanded = false,
  onToggleExpand,
  readOnly = false,
}: TestScoringCardProps) {
  const definition = FMS_DEFINITIONS[testName];
  const isBilateral = definition.bilateral;

  const handleScoreChange = (score: FMSScore) => {
    if (readOnly) return;
    onUpdate({ score });
    // If pain (0), auto-set painDuringTest
    if (score === 0) {
      onUpdate({ score, painDuringTest: true });
    }
  };

  const handleLeftScoreChange = (score: FMSScore) => {
    if (readOnly) return;
    onUpdate({ leftScore: score });
    // Final score is minimum of left/right
    const finalScore = Math.min(score, testInput.rightScore ?? 3) as FMSScore;
    onUpdate({ leftScore: score, score: finalScore });
  };

  const handleRightScoreChange = (score: FMSScore) => {
    if (readOnly) return;
    onUpdate({ rightScore: score });
    // Final score is minimum of left/right
    const finalScore = Math.min(testInput.leftScore ?? 3, score) as FMSScore;
    onUpdate({ rightScore: score, score: finalScore });
  };

  const toggleCompensation = (comp: string) => {
    if (readOnly) return;
    const current = testInput.compensations;
    const updated = current.includes(comp)
      ? current.filter((c) => c !== comp)
      : [...current, comp];
    onUpdate({ compensations: updated });
  };

  const toggleLimitingFactor = (factor: string) => {
    if (readOnly) return;
    const current = testInput.limitingFactors;
    const updated = current.includes(factor)
      ? current.filter((f) => f !== factor)
      : [...current, factor];
    onUpdate({ limitingFactors: updated });
  };

  const isAsymmetric =
    isBilateral &&
    testInput.leftScore !== null &&
    testInput.rightScore !== null &&
    testInput.leftScore !== testInput.rightScore;

  return (
    <Card className={cn(testInput.score === 0 && 'border-red-300')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {definition.name}
              <Badge variant="outline" className="text-xs font-normal">
                {definition.shortName}
              </Badge>
              {definition.category === 'mobility' && (
                <Badge variant="secondary" className="text-xs">
                  Mobility
                </Badge>
              )}
              {definition.category === 'stability' && (
                <Badge variant="secondary" className="text-xs">
                  Stability
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">{definition.description}</CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {testInput.score === 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                Pain
              </Badge>
            )}
            {isAsymmetric && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Asymmetry
              </Badge>
            )}
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full text-xl font-bold',
                scoreColors[testInput.score].bg,
                scoreColors[testInput.score].text
              )}
            >
              {testInput.score}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Scoring Section */}
        <div className="space-y-4">
          {isBilateral ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium mb-2 block">Left Side</Label>
                <div className="flex gap-2">
                  {([0, 1, 2, 3] as FMSScore[]).map((score) => (
                    <ScoreButton
                      key={`left-${score}`}
                      score={score}
                      selected={testInput.leftScore === score}
                      onClick={() => handleLeftScoreChange(score)}
                      disabled={readOnly}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Right Side</Label>
                <div className="flex gap-2">
                  {([0, 1, 2, 3] as FMSScore[]).map((score) => (
                    <ScoreButton
                      key={`right-${score}`}
                      score={score}
                      selected={testInput.rightScore === score}
                      onClick={() => handleRightScoreChange(score)}
                      disabled={readOnly}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-sm font-medium mb-2 block">Score</Label>
              <div className="flex gap-2">
                {([0, 1, 2, 3] as FMSScore[]).map((score) => (
                  <ScoreButton
                    key={score}
                    score={score}
                    selected={testInput.score === score}
                    onClick={() => handleScoreChange(score)}
                    disabled={readOnly}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pain tracking */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`pain-${testName}`}
                checked={testInput.painDuringTest}
                onCheckedChange={(checked) =>
                  !readOnly && onUpdate({ painDuringTest: checked as boolean })
                }
                disabled={readOnly}
              />
              <Label htmlFor={`pain-${testName}`} className="text-sm">
                Pain during test
              </Label>
            </div>
            {testInput.painDuringTest && (
              <input
                type="text"
                placeholder="Pain location"
                value={testInput.painLocation}
                onChange={(e) => !readOnly && onUpdate({ painLocation: e.target.value })}
                className="flex-1 px-3 py-1 text-sm border rounded"
                disabled={readOnly}
              />
            )}
          </div>
        </div>

        {/* Expandable Details */}
        <Collapsible open={expanded} onOpenChange={onToggleExpand} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="text-sm text-gray-500">
                {expanded ? 'Hide Details' : 'Show Details'}
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-4 space-y-4">
            {/* Scoring Criteria */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Scoring Criteria</Label>
              <div className="space-y-2 text-sm">
                {definition.scoringCriteria.map((criterion) => (
                  <div
                    key={criterion.score}
                    className={cn(
                      'p-2 rounded border',
                      testInput.score === criterion.score
                        ? scoreColors[criterion.score].bg + ' ' + scoreColors[criterion.score].border
                        : 'bg-gray-50 border-gray-200'
                    )}
                  >
                    <div className="font-medium">
                      Score {criterion.score}: {criterion.description}
                    </div>
                    <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                      {criterion.criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Compensations */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Compensations Observed</Label>
              <div className="flex flex-wrap gap-2">
                {definition.commonCompensations.map((comp) => (
                  <Button
                    key={comp}
                    type="button"
                    variant={testInput.compensations.includes(comp) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleCompensation(comp)}
                    disabled={readOnly}
                    className="text-xs"
                  >
                    {comp}
                  </Button>
                ))}
              </div>
            </div>

            {/* Limiting Factors */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Limiting Factors</Label>
              <div className="flex flex-wrap gap-2">
                {definition.limitingFactors.map((factor) => (
                  <Button
                    key={factor}
                    type="button"
                    variant={testInput.limitingFactors.includes(factor) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleLimitingFactor(factor)}
                    disabled={readOnly}
                    className="text-xs"
                  >
                    {factor}
                  </Button>
                ))}
              </div>
            </div>

            {/* Movement Quality Notes */}
            <div>
              <Label htmlFor={`quality-${testName}`} className="text-sm font-medium mb-2 block">
                Movement Quality
              </Label>
              <Textarea
                id={`quality-${testName}`}
                placeholder="Describe the quality of movement observed..."
                value={testInput.movementQuality}
                onChange={(e) => !readOnly && onUpdate({ movementQuality: e.target.value })}
                disabled={readOnly}
                rows={2}
              />
            </div>

            {/* Additional Notes */}
            <div>
              <Label htmlFor={`notes-${testName}`} className="text-sm font-medium mb-2 block">
                Additional Notes
              </Label>
              <Textarea
                id={`notes-${testName}`}
                placeholder="Any additional observations..."
                value={testInput.notes}
                onChange={(e) => !readOnly && onUpdate({ notes: e.target.value })}
                disabled={readOnly}
                rows={2}
              />
            </div>

            {/* Clearing Test Notice */}
            {definition.clearingTest && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-yellow-800">
                    Clearing Test: {definition.clearingTest}
                  </div>
                  <div className="text-xs text-yellow-700 mt-1">
                    {definition.clearingTestDescription}
                  </div>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ============================================
// FMS SUMMARY DISPLAY
// ============================================

interface FMSSummaryDisplayProps {
  summary: FMSSummary;
  className?: string;
}

export function FMSSummaryDisplay({ summary, className }: FMSSummaryDisplayProps) {
  const totalScoreColor =
    summary.totalScore >= 17
      ? 'text-green-600'
      : summary.totalScore >= 14
        ? 'text-yellow-600'
        : summary.totalScore >= 10
          ? 'text-orange-600'
          : 'text-red-600';

  const totalScoreBg =
    summary.totalScore >= 17
      ? 'bg-green-100'
      : summary.totalScore >= 14
        ? 'bg-yellow-100'
        : summary.totalScore >= 10
          ? 'bg-orange-100'
          : 'bg-red-100';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>FMS Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Score */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Total Score</div>
            <div className={cn('text-4xl font-bold', totalScoreColor)}>
              {summary.totalScore}
              <span className="text-xl text-gray-400">/{summary.maxPossibleScore}</span>
            </div>
          </div>
          <div className={cn('px-4 py-2 rounded-full text-sm font-medium', totalScoreBg, totalScoreColor)}>
            {summary.percentage}%
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-red-600">{summary.testsWithPain}</div>
            <div className="text-xs text-gray-500">Tests with Pain</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-orange-600">{summary.asymmetries}</div>
            <div className="text-xs text-gray-500">Asymmetries</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-blue-600">{summary.deficits.length}</div>
            <div className="text-xs text-gray-500">Deficits</div>
          </div>
        </div>

        {/* Category Scores */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Category Breakdown</div>
          {Object.entries(summary.categoryScores).map(([category, data]) => (
            <div key={category} className="flex items-center justify-between">
              <span className="text-sm capitalize">{category.replace('_', ' ')}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      data.percentage >= 80 ? 'bg-green-500' :
                      data.percentage >= 60 ? 'bg-yellow-500' :
                      data.percentage >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    )}
                    style={{ width: `${data.percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 w-16 text-right">
                  {data.score}/{data.maxScore}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Priority Areas */}
        {summary.priorityAreas.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Priority Areas</div>
            {summary.priorityAreas.map((area, idx) => (
              <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded">
                <div className="text-sm font-medium text-red-800">
                  {FMS_DEFINITIONS[area.test].name}
                </div>
                <div className="text-xs text-red-600 mt-1">{area.reason}</div>
                <div className="mt-2">
                  <div className="text-xs font-medium text-gray-600">Recommended Exercises:</div>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {area.exercises.slice(0, 3).map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Strengths */}
        {summary.strengths.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Strengths
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.strengths.map((test) => (
                <Badge key={test} variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  {FMS_DEFINITIONS[test].name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN FMS SCORING COMPONENT
// ============================================

export function FMSScoring({
  initialTests,
  onTestUpdate,
  onComplete,
  readOnly = false,
  className,
}: FMSScoringProps) {
  // Initialize tests with default values
  const defaultTests: FMSTestInput[] = getAllTestNames().map((testName) => ({
    testName,
    score: 3 as FMSScore,
    leftScore: null,
    rightScore: null,
    painDuringTest: false,
    painLocation: '',
    compensations: [],
    limitingFactors: [],
    movementQuality: '',
    notes: '',
  }));

  const [tests, setTests] = useState<FMSTestInput[]>(initialTests || defaultTests);
  const [expandedTest, setExpandedTest] = useState<FMSTestType | null>(null);

  const handleTestUpdate = (testName: FMSTestType, update: Partial<FMSTestInput>) => {
    setTests((prev) =>
      prev.map((t) =>
        t.testName === testName ? { ...t, ...update } : t
      )
    );

    const updatedTest = { ...tests.find((t) => t.testName === testName)!, ...update };
    onTestUpdate?.(updatedTest);
  };

  const handleComplete = () => {
    onComplete?.(tests);
  };

  // Calculate summary
  const summary: FMSSummary = useMemo(() => {
    const totalScore = tests.reduce((sum, t) => sum + t.score, 0);
    const maxPossibleScore = 21;
    const percentage = Math.round((totalScore / maxPossibleScore) * 100);
    const testsWithPain = tests.filter((t) => t.painDuringTest || t.score === 0).length;
    const asymmetries = tests.filter(
      (t) =>
        t.leftScore !== null &&
        t.rightScore !== null &&
        t.leftScore !== t.rightScore
    ).length;
    const deficits = tests.filter((t) => t.score <= 1).map((t) => t.testName);
    const strengths = tests
      .filter(
        (t) =>
          t.score === 3 &&
          !(t.leftScore !== null && t.rightScore !== null && t.leftScore !== t.rightScore)
      )
      .map((t) => t.testName);

    // Category scores
    const categoryScores: Record<MovementCategory, { score: number; maxScore: number; percentage: number }> = {
      mobility: { score: 0, maxScore: 0, percentage: 0 },
      stability: { score: 0, maxScore: 0, percentage: 0 },
      movement_pattern: { score: 0, maxScore: 0, percentage: 0 },
    };

    tests.forEach((test) => {
      const def = FMS_DEFINITIONS[test.testName];
      categoryScores[def.category].score += test.score;
      categoryScores[def.category].maxScore += 3;
    });

    Object.keys(categoryScores).forEach((cat) => {
      const category = cat as MovementCategory;
      if (categoryScores[category].maxScore > 0) {
        categoryScores[category].percentage = Math.round(
          (categoryScores[category].score / categoryScores[category].maxScore) * 100
        );
      }
    });

    // Priority areas
    const priorityAreas = tests
      .filter((t) => t.score <= 2 || (t.leftScore !== null && t.rightScore !== null && t.leftScore !== t.rightScore))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((t) => ({
        test: t.testName,
        reason:
          t.score === 0
            ? `Pain during ${FMS_DEFINITIONS[t.testName].name}`
            : t.score === 1
              ? `Dysfunction in ${FMS_DEFINITIONS[t.testName].name}`
              : `Compensation in ${FMS_DEFINITIONS[t.testName].name}`,
        exercises: [] as string[],
      }));

    return {
      totalScore,
      maxPossibleScore,
      percentage,
      testsWithPain,
      asymmetries,
      deficits,
      strengths,
      priorityAreas,
      categoryScores,
    };
  }, [tests]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary at top */}
      <FMSSummaryDisplay summary={summary} />

      {/* Test Cards */}
      <div className="space-y-4">
        {tests.map((test) => (
          <TestScoringCard
            key={test.testName}
            testName={test.testName}
            testInput={test}
            onUpdate={(update) => handleTestUpdate(test.testName, update)}
            expanded={expandedTest === test.testName}
            onToggleExpand={() =>
              setExpandedTest(expandedTest === test.testName ? null : test.testName)
            }
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Complete Button */}
      {!readOnly && onComplete && (
        <div className="flex justify-end">
          <Button onClick={handleComplete} size="lg">
            Complete Assessment
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// FMS COMPARISON VIEW
// ============================================

interface FMSComparisonViewProps {
  comparisons: Array<{
    testName: FMSTestType;
    previousScore: FMSScore;
    currentScore: FMSScore;
    change: number;
    improvement: 'improved' | 'declined' | 'stable';
    asymmetryResolved: boolean;
  }>;
  previousDate: Date;
  currentDate: Date;
  className?: string;
}

export function FMSComparisonView({
  comparisons,
  previousDate,
  currentDate,
  className,
}: FMSComparisonViewProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>FMS Progress Comparison</CardTitle>
        <CardDescription>
          {previousDate.toLocaleDateString()} → {currentDate.toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {comparisons.map((c) => {
            const definition = FMS_DEFINITIONS[c.testName];
            const ImprovementIcon =
              c.improvement === 'improved'
                ? TrendingUp
                : c.improvement === 'declined'
                  ? TrendingDown
                  : Minus;
            const improvementColor =
              c.improvement === 'improved'
                ? 'text-green-600'
                : c.improvement === 'declined'
                  ? 'text-red-600'
                  : 'text-gray-500';

            return (
              <div
                key={c.testName}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium">{definition.name}</div>
                  {c.asymmetryResolved && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                      Asymmetry Resolved
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className={cn('flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold', scoreColors[c.previousScore].bg, scoreColors[c.previousScore].text)}>
                    {c.previousScore}
                  </div>
                  <ImprovementIcon className={cn('w-5 h-5', improvementColor)} />
                  <div className={cn('flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold', scoreColors[c.currentScore].bg, scoreColors[c.currentScore].text)}>
                    {c.currentScore}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default FMSScoring;
