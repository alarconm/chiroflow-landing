'use client';

/**
 * Mobile Pain Diary Component (US-269)
 *
 * Allows patients to log daily pain entries with location,
 * intensity, triggers, and impact on daily life.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  Calendar,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Plus,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
  Bed,
  Briefcase,
  Smile,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PainEntry {
  id: string;
  entryDate: string;
  painLevel: number;
  bodyLocation: string;
  painQuality: string[];
  triggers: string[];
  relievingFactors: string[];
  affectsWork: boolean;
  affectsSleep: boolean;
  affectsActivity: boolean;
  affectsMood: boolean;
  duration?: string;
  medicationTaken?: string;
  notes?: string;
}

interface PainSummary {
  totalEntries: number;
  averagePainLevel: number | null;
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data';
  mostCommonLocation: { location: string; count: number } | null;
}

interface ReferenceData {
  bodyLocations: Array<{ value: string; label: string }>;
  painQualities: Array<{ value: string; label: string }>;
  commonTriggers: string[];
  commonRelievingFactors: string[];
}

interface MobilePainDiaryProps {
  entries: PainEntry[];
  summary: PainSummary;
  referenceData: ReferenceData;
  onCreateEntry: (data: Omit<PainEntry, 'id' | 'entryDate'>) => Promise<void>;
  onViewEntry: (id: string) => void;
  onRefresh: () => Promise<void>;
  isLoading?: boolean;
}

export function MobilePainDiary({
  entries,
  summary,
  referenceData,
  onCreateEntry,
  onViewEntry,
  onRefresh,
  isLoading = false,
}: MobilePainDiaryProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [painLevel, setPainLevel] = useState(5);
  const [bodyLocation, setBodyLocation] = useState('');
  const [selectedQualities, setSelectedQualities] = useState<string[]>([]);
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
  const [selectedRelieving, setSelectedRelieving] = useState<string[]>([]);
  const [affectsWork, setAffectsWork] = useState(false);
  const [affectsSleep, setAffectsSleep] = useState(false);
  const [affectsActivity, setAffectsActivity] = useState(false);
  const [affectsMood, setAffectsMood] = useState(false);
  const [duration, setDuration] = useState('');
  const [medicationTaken, setMedicationTaken] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setPainLevel(5);
    setBodyLocation('');
    setSelectedQualities([]);
    setSelectedTriggers([]);
    setSelectedRelieving([]);
    setAffectsWork(false);
    setAffectsSleep(false);
    setAffectsActivity(false);
    setAffectsMood(false);
    setDuration('');
    setMedicationTaken('');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!bodyLocation) return;

    setIsSubmitting(true);
    try {
      await onCreateEntry({
        painLevel,
        bodyLocation,
        painQuality: selectedQualities,
        triggers: selectedTriggers,
        relievingFactors: selectedRelieving,
        affectsWork,
        affectsSleep,
        affectsActivity,
        affectsMood,
        duration: duration || undefined,
        medicationTaken: medicationTaken || undefined,
        notes: notes || undefined,
      });
      setShowAddDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPainLevelColor = (level: number) => {
    if (level <= 3) return 'text-green-600';
    if (level <= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPainLevelBg = (level: number) => {
    if (level <= 3) return 'bg-green-100';
    if (level <= 6) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getTrendIcon = () => {
    switch (summary.trend) {
      case 'improving':
        return <TrendingDown className="w-5 h-5 text-green-600" />;
      case 'worsening':
        return <TrendingUp className="w-5 h-5 text-red-600" />;
      case 'stable':
        return <Minus className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTrendText = () => {
    switch (summary.trend) {
      case 'improving':
        return 'Improving';
      case 'worsening':
        return 'Worsening';
      case 'stable':
        return 'Stable';
      default:
        return 'Not enough data';
    }
  };

  const getLocationLabel = (value: string) => {
    const location = referenceData.bodyLocations.find((l) => l.value === value);
    return location?.label || value;
  };

  const toggleSelection = (
    value: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((v) => v !== value));
    } else {
      setSelected([...selected, value]);
    }
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-[#053e67] to-[#0a5a94]">
        <CardContent className="pt-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pain Summary</h2>
            <Badge variant="secondary" className="bg-white/20 text-white">
              This Week
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-2xl font-bold">
                {summary.averagePainLevel ?? '--'}
              </div>
              <div className="text-sm text-white/80">Avg. Pain Level</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span className="text-lg font-semibold">{getTrendText()}</span>
              </div>
              <div className="text-sm text-white/80">Trend</div>
            </div>
          </div>

          {summary.mostCommonLocation && (
            <div className="mt-4 flex items-center gap-2 text-sm text-white/80">
              <MapPin className="w-4 h-4" />
              <span>
                Most affected: {getLocationLabel(summary.mostCommonLocation.location)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Entry Button */}
      <Button
        onClick={() => setShowAddDialog(true)}
        className="w-full bg-[#c90000] hover:bg-[#a80000] text-white"
        size="lg"
      >
        <Plus className="w-5 h-5 mr-2" />
        Log Pain Entry
      </Button>

      {/* Recent Entries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Entries</h3>
          <span className="text-xs text-gray-500">
            {summary.totalEntries} total entries
          </span>
        </div>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Activity className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Pain Entries Yet
              </h3>
              <p className="text-gray-500 text-sm">
                Track your pain levels to help your provider understand your progress.
              </p>
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card
              key={entry.id}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => onViewEntry(entry.id)}
            >
              <CardContent className="py-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${getPainLevelBg(
                        entry.painLevel
                      )}`}
                    >
                      <span
                        className={`text-lg font-bold ${getPainLevelColor(
                          entry.painLevel
                        )}`}
                      >
                        {entry.painLevel}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {getLocationLabel(entry.bodyLocation)}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(entry.entryDate), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {entry.affectsWork && (
                        <Briefcase className="w-4 h-4 text-gray-400" />
                      )}
                      {entry.affectsSleep && (
                        <Bed className="w-4 h-4 text-gray-400" />
                      )}
                      {entry.affectsActivity && (
                        <Activity className="w-4 h-4 text-gray-400" />
                      )}
                      {entry.affectsMood && (
                        <Smile className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Pain Entry</DialogTitle>
            <DialogDescription>
              Record your current pain level and details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Pain Level Slider */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Pain Level: {painLevel}</Label>
              <div className="px-2">
                <Slider
                  value={[painLevel]}
                  onValueChange={(v: number[]) => setPainLevel(v[0])}
                  max={10}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>No Pain</span>
                  <span>Worst Pain</span>
                </div>
              </div>
              <div
                className={`text-center text-lg font-bold ${getPainLevelColor(
                  painLevel
                )}`}
              >
                {painLevel === 0
                  ? 'No Pain'
                  : painLevel <= 3
                  ? 'Mild'
                  : painLevel <= 6
                  ? 'Moderate'
                  : painLevel <= 8
                  ? 'Severe'
                  : 'Extreme'}
              </div>
            </div>

            {/* Body Location */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Location</Label>
              <Select value={bodyLocation} onValueChange={setBodyLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select body area" />
                </SelectTrigger>
                <SelectContent>
                  {referenceData.bodyLocations.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pain Quality */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Pain Type (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {referenceData.painQualities.map((quality) => (
                  <Badge
                    key={quality.value}
                    variant={selectedQualities.includes(quality.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      toggleSelection(quality.value, selectedQualities, setSelectedQualities)
                    }
                  >
                    {quality.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Triggers */}
            <div className="space-y-2">
              <Label className="text-base font-medium">What triggered or worsened it?</Label>
              <div className="flex flex-wrap gap-2">
                {referenceData.commonTriggers.map((trigger) => (
                  <Badge
                    key={trigger}
                    variant={selectedTriggers.includes(trigger) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      toggleSelection(trigger, selectedTriggers, setSelectedTriggers)
                    }
                  >
                    {trigger}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Relieving Factors */}
            <div className="space-y-2">
              <Label className="text-base font-medium">What helped?</Label>
              <div className="flex flex-wrap gap-2">
                {referenceData.commonRelievingFactors.map((factor) => (
                  <Badge
                    key={factor}
                    variant={selectedRelieving.includes(factor) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      toggleSelection(factor, selectedRelieving, setSelectedRelieving)
                    }
                  >
                    {factor}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Impact on Daily Life */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Does this affect your:</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <Checkbox
                    checked={affectsWork}
                    onCheckedChange={(checked) => setAffectsWork(checked === true)}
                  />
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">Work</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <Checkbox
                    checked={affectsSleep}
                    onCheckedChange={(checked) => setAffectsSleep(checked === true)}
                  />
                  <div className="flex items-center gap-1">
                    <Bed className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">Sleep</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <Checkbox
                    checked={affectsActivity}
                    onCheckedChange={(checked) => setAffectsActivity(checked === true)}
                  />
                  <div className="flex items-center gap-1">
                    <Activity className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">Activity</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <Checkbox
                    checked={affectsMood}
                    onCheckedChange={(checked) => setAffectsMood(checked === true)}
                  />
                  <div className="flex items-center gap-1">
                    <Smile className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">Mood</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Additional Notes</Label>
              <Textarea
                placeholder="Any other details about your pain..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!bodyLocation || isSubmitting}
              className="bg-[#053e67] hover:bg-[#042e4e]"
            >
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
