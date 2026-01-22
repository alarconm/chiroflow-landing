'use client';

/**
 * ImagingReportEditor Component
 * Epic 22 - US-229: Imaging reports
 *
 * Comprehensive imaging report editor with:
 * - Structured finding templates
 * - Report status workflow (draft, pending review, final, amended, addendum)
 * - Electronic signature support
 * - Comparison to prior studies
 * - Link to treatment plan
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertCircle,
  Check,
  ChevronRight,
  FileText,
  ListPlus,
  Loader2,
  PenTool,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export type ReportStatus = 'DRAFT' | 'PENDING_REVIEW' | 'FINAL' | 'AMENDED' | 'ADDENDUM';

export type FindingCategory =
  | 'alignment'
  | 'boneStructure'
  | 'discSpace'
  | 'jointSpace'
  | 'softTissue'
  | 'spineCurvature'
  | 'degenerativeChanges'
  | 'fracture'
  | 'subluxation'
  | 'other';

export type FindingSeverity = 'normal' | 'mild' | 'moderate' | 'severe';

export interface StructuredFinding {
  id: string;
  category: FindingCategory;
  location: string;
  description: string;
  severity: FindingSeverity;
  measurementId?: string;
  notes?: string;
}

export interface FindingTemplate {
  id: string;
  name: string;
  category: FindingCategory;
  description: string;
  locations: string[];
  severityOptions: FindingSeverity[];
  defaultSeverity: FindingSeverity;
}

export interface ReportData {
  findings: string;
  impression: string;
  structuredFindings: StructuredFinding[];
  comparisonStudyId?: string;
  comparisonNotes?: string;
  recommendations?: string;
  clinicalCorrelation?: string;
  treatmentPlanId?: string;
}

export interface ImagingReportEditorProps {
  studyId: string;
  studyInfo: {
    bodyPart: string;
    modality: string;
    studyDate: string;
    patientName: string;
  };
  initialData?: Partial<ReportData>;
  reportId?: string;
  currentStatus?: ReportStatus;
  findingTemplates?: FindingTemplate[];
  priorStudies?: Array<{ id: string; date: string; bodyPart: string }>;
  treatmentPlans?: Array<{ id: string; name: string; status: string }>;
  measurements?: Array<{
    id: string;
    type: string;
    value: number;
    unit: string;
    label?: string;
    deviation?: number | null;
  }>;
  onSave?: (data: ReportData) => void;
  onSubmitForReview?: (data: ReportData) => void;
  onSign?: (data: ReportData, signatureData: string) => void;
  onDelete?: () => void;
  isLoading?: boolean;
  isReadOnly?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_INFO: Record<
  ReportStatus,
  { label: string; color: string; description: string }
> = {
  DRAFT: {
    label: 'Draft',
    color: 'bg-gray-500',
    description: 'Report is being edited',
  },
  PENDING_REVIEW: {
    label: 'Pending Review',
    color: 'bg-yellow-500',
    description: 'Awaiting review and signature',
  },
  FINAL: {
    label: 'Final',
    color: 'bg-green-500',
    description: 'Report has been signed and finalized',
  },
  AMENDED: {
    label: 'Amended',
    color: 'bg-blue-500',
    description: 'Report has been amended',
  },
  ADDENDUM: {
    label: 'Addendum',
    color: 'bg-purple-500',
    description: 'Addendum has been added',
  },
};

const CATEGORY_INFO: Record<
  FindingCategory,
  { label: string; icon: React.ReactNode }
> = {
  alignment: { label: 'Alignment', icon: <ChevronRight className="h-4 w-4" /> },
  boneStructure: { label: 'Bone Structure', icon: <ChevronRight className="h-4 w-4" /> },
  discSpace: { label: 'Disc Space', icon: <ChevronRight className="h-4 w-4" /> },
  jointSpace: { label: 'Joint Space', icon: <ChevronRight className="h-4 w-4" /> },
  softTissue: { label: 'Soft Tissue', icon: <ChevronRight className="h-4 w-4" /> },
  spineCurvature: { label: 'Spine Curvature', icon: <ChevronRight className="h-4 w-4" /> },
  degenerativeChanges: { label: 'Degenerative Changes', icon: <ChevronRight className="h-4 w-4" /> },
  fracture: { label: 'Fracture', icon: <AlertCircle className="h-4 w-4" /> },
  subluxation: { label: 'Subluxation', icon: <ChevronRight className="h-4 w-4" /> },
  other: { label: 'Other', icon: <ChevronRight className="h-4 w-4" /> },
};

const SEVERITY_INFO: Record<
  FindingSeverity,
  { label: string; color: string; bgColor: string }
> = {
  normal: { label: 'Normal', color: 'text-green-600', bgColor: 'bg-green-100' },
  mild: { label: 'Mild', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  moderate: { label: 'Moderate', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  severe: { label: 'Severe', color: 'text-red-600', bgColor: 'bg-red-100' },
};

// ============================================
// COMPONENT
// ============================================

export function ImagingReportEditor({
  studyId,
  studyInfo,
  initialData,
  reportId,
  currentStatus = 'DRAFT',
  findingTemplates = [],
  priorStudies = [],
  treatmentPlans = [],
  measurements = [],
  onSave,
  onSubmitForReview,
  onSign,
  onDelete,
  isLoading = false,
  isReadOnly = false,
}: ImagingReportEditorProps) {
  // State
  const [findings, setFindings] = useState(initialData?.findings || '');
  const [impression, setImpression] = useState(initialData?.impression || '');
  const [structuredFindings, setStructuredFindings] = useState<StructuredFinding[]>(
    initialData?.structuredFindings || []
  );
  const [comparisonStudyId, setComparisonStudyId] = useState(
    initialData?.comparisonStudyId || ''
  );
  const [comparisonNotes, setComparisonNotes] = useState(
    initialData?.comparisonNotes || ''
  );
  const [recommendations, setRecommendations] = useState(
    initialData?.recommendations || ''
  );
  const [clinicalCorrelation, setClinicalCorrelation] = useState(
    initialData?.clinicalCorrelation || ''
  );
  const [treatmentPlanId, setTreatmentPlanId] = useState(
    initialData?.treatmentPlanId || ''
  );

  // Dialog states
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FindingTemplate | null>(null);
  const [newFindingLocation, setNewFindingLocation] = useState('');
  const [newFindingSeverity, setNewFindingSeverity] = useState<FindingSeverity>('mild');
  const [newFindingNotes, setNewFindingNotes] = useState('');
  const [signatureText, setSignatureText] = useState('');

  // Computed values
  const statusInfo = STATUS_INFO[currentStatus];
  const canEdit = !isReadOnly && (currentStatus === 'DRAFT' || currentStatus === 'PENDING_REVIEW');
  const canSubmit = currentStatus === 'DRAFT' && findings.trim().length > 0;
  const canSign = currentStatus === 'PENDING_REVIEW' && findings.trim().length > 0 && impression.trim().length > 0;

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const grouped: Record<FindingCategory, FindingTemplate[]> = {
      alignment: [],
      boneStructure: [],
      discSpace: [],
      jointSpace: [],
      softTissue: [],
      spineCurvature: [],
      degenerativeChanges: [],
      fracture: [],
      subluxation: [],
      other: [],
    };

    for (const template of findingTemplates) {
      grouped[template.category].push(template);
    }

    return grouped;
  }, [findingTemplates]);

  // Get report data
  const getReportData = useCallback((): ReportData => {
    return {
      findings,
      impression,
      structuredFindings,
      comparisonStudyId: comparisonStudyId || undefined,
      comparisonNotes: comparisonNotes || undefined,
      recommendations: recommendations || undefined,
      clinicalCorrelation: clinicalCorrelation || undefined,
      treatmentPlanId: treatmentPlanId || undefined,
    };
  }, [
    findings,
    impression,
    structuredFindings,
    comparisonStudyId,
    comparisonNotes,
    recommendations,
    clinicalCorrelation,
    treatmentPlanId,
  ]);

  // Handle save
  const handleSave = useCallback(() => {
    onSave?.(getReportData());
  }, [onSave, getReportData]);

  // Handle submit for review
  const handleSubmitForReview = useCallback(() => {
    onSubmitForReview?.(getReportData());
  }, [onSubmitForReview, getReportData]);

  // Handle sign
  const handleSign = useCallback(() => {
    if (signatureText.trim().length > 0) {
      // Create a simple signature data (in real app, use canvas signature)
      const signatureData = btoa(JSON.stringify({
        text: signatureText,
        timestamp: new Date().toISOString(),
      }));
      onSign?.(getReportData(), signatureData);
      setShowSignDialog(false);
      setSignatureText('');
    }
  }, [signatureText, onSign, getReportData]);

  // Add structured finding
  const handleAddFinding = useCallback(() => {
    if (!selectedTemplate || !newFindingLocation) return;

    const newFinding: StructuredFinding = {
      id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      category: selectedTemplate.category,
      location: newFindingLocation,
      description: selectedTemplate.description,
      severity: newFindingSeverity,
      notes: newFindingNotes || undefined,
    };

    setStructuredFindings((prev) => [...prev, newFinding]);

    // Clear form
    setSelectedTemplate(null);
    setNewFindingLocation('');
    setNewFindingSeverity('mild');
    setNewFindingNotes('');
    setShowAddFinding(false);
  }, [selectedTemplate, newFindingLocation, newFindingSeverity, newFindingNotes]);

  // Remove structured finding
  const handleRemoveFinding = useCallback((findingId: string) => {
    setStructuredFindings((prev) => prev.filter((f) => f.id !== findingId));
  }, []);

  // Generate findings text from structured findings
  const handleGenerateFindings = useCallback(() => {
    if (structuredFindings.length === 0) return;

    // Group by category
    const byCategory: Record<string, StructuredFinding[]> = {};
    for (const finding of structuredFindings) {
      if (!byCategory[finding.category]) {
        byCategory[finding.category] = [];
      }
      byCategory[finding.category].push(finding);
    }

    // Generate text
    const lines: string[] = [];
    for (const [category, categoryFindings] of Object.entries(byCategory)) {
      const categoryInfo = CATEGORY_INFO[category as FindingCategory];
      lines.push(`${categoryInfo.label}:`);

      for (const finding of categoryFindings) {
        const severityInfo = SEVERITY_INFO[finding.severity];
        let line = `- ${finding.location}: ${finding.description}`;
        if (finding.severity !== 'normal') {
          line += ` (${severityInfo.label})`;
        }
        if (finding.notes) {
          line += ` - ${finding.notes}`;
        }
        lines.push(line);
      }
      lines.push('');
    }

    setFindings(lines.join('\n'));
  }, [structuredFindings]);

  // Generate impression from findings
  const handleGenerateImpression = useCallback(() => {
    if (structuredFindings.length === 0) {
      setImpression('No significant radiographic abnormality.');
      return;
    }

    // Filter significant findings
    const significant = structuredFindings.filter((f) => f.severity !== 'normal');

    if (significant.length === 0) {
      setImpression('No significant radiographic abnormality.');
      return;
    }

    // Sort by severity
    const sorted = [...significant].sort((a, b) => {
      const order: FindingSeverity[] = ['severe', 'moderate', 'mild', 'normal'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });

    // Generate numbered list
    const lines = sorted.map((f, i) => {
      const severityInfo = SEVERITY_INFO[f.severity];
      let text = `${i + 1}. ${f.description} at ${f.location}`;
      if (f.severity !== 'mild') {
        text += ` (${severityInfo.label.toLowerCase()})`;
      }
      return text;
    });

    setImpression(lines.join('\n'));
  }, [structuredFindings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Imaging Report</h2>
          <p className="text-muted-foreground">
            {studyInfo.bodyPart} {studyInfo.modality} - {studyInfo.studyDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-white', statusInfo.color)}>
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {/* Study Info Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Study Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Patient:</span>{' '}
            <span className="font-medium">{studyInfo.patientName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Body Part:</span>{' '}
            <span className="font-medium">{studyInfo.bodyPart}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Modality:</span>{' '}
            <span className="font-medium">{studyInfo.modality}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Study Date:</span>{' '}
            <span className="font-medium">{studyInfo.studyDate}</span>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Study */}
      {priorStudies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Comparison</CardTitle>
            <CardDescription>Compare with prior studies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="comparison-study">Prior Study</Label>
              <Select
                value={comparisonStudyId}
                onValueChange={setComparisonStudyId}
                disabled={!canEdit}
              >
                <SelectTrigger id="comparison-study">
                  <SelectValue placeholder="Select prior study" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {priorStudies.map((study) => (
                    <SelectItem key={study.id} value={study.id}>
                      {study.date} - {study.bodyPart}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {comparisonStudyId && (
              <div>
                <Label htmlFor="comparison-notes">Comparison Notes</Label>
                <Textarea
                  id="comparison-notes"
                  value={comparisonNotes}
                  onChange={(e) => setComparisonNotes(e.target.value)}
                  placeholder="Describe interval changes..."
                  disabled={!canEdit}
                  rows={2}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Structured Findings */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Structured Findings</CardTitle>
              <CardDescription>Add findings using templates</CardDescription>
            </div>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddFinding(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Finding
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {structuredFindings.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No structured findings added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {structuredFindings.map((finding) => {
                const categoryInfo = CATEGORY_INFO[finding.category];
                const severityInfo = SEVERITY_INFO[finding.severity];

                return (
                  <div
                    key={finding.id}
                    className={cn(
                      'flex items-start justify-between p-3 rounded-lg border',
                      severityInfo.bgColor
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {categoryInfo.label}
                        </Badge>
                        <Badge className={cn('text-xs', severityInfo.bgColor, severityInfo.color)}>
                          {severityInfo.label}
                        </Badge>
                      </div>
                      <p className="font-medium mt-1">
                        {finding.location}: {finding.description}
                      </p>
                      {finding.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {finding.notes}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveFinding(finding.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {structuredFindings.length > 0 && canEdit && (
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateFindings}
              >
                <FileText className="h-4 w-4 mr-1" />
                Generate Findings Text
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateImpression}
              >
                <ListPlus className="h-4 w-4 mr-1" />
                Generate Impression
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measurements Summary */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Measurements</CardTitle>
            <CardDescription>Quantitative measurements from this study</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {measurements.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'p-3 rounded-lg border',
                    m.deviation && m.deviation !== 0 ? 'bg-yellow-50' : 'bg-gray-50'
                  )}
                >
                  <p className="font-medium">{m.label || m.type}</p>
                  <p className="text-lg">
                    {m.value.toFixed(1)} {m.unit}
                  </p>
                  {m.deviation !== null && m.deviation !== undefined && m.deviation !== 0 && (
                    <p className="text-sm text-muted-foreground">
                      {m.deviation > 0 ? '+' : ''}{m.deviation.toFixed(1)} {m.unit} from normal
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Findings</CardTitle>
          <CardDescription>Detailed radiographic findings</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Document all significant radiographic findings..."
            disabled={!canEdit}
            rows={8}
            className="font-mono"
          />
        </CardContent>
      </Card>

      {/* Impression */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Impression</CardTitle>
          <CardDescription>Summary diagnosis and conclusions</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={impression}
            onChange={(e) => setImpression(e.target.value)}
            placeholder="Provide a concise summary of significant findings..."
            disabled={!canEdit}
            rows={4}
            className="font-mono"
          />
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recommendations</CardTitle>
          <CardDescription>Clinical recommendations based on findings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="List any recommendations for treatment or follow-up..."
            disabled={!canEdit}
            rows={3}
          />

          {treatmentPlans.length > 0 && (
            <div>
              <Label htmlFor="treatment-plan">Link to Treatment Plan</Label>
              <Select
                value={treatmentPlanId}
                onValueChange={setTreatmentPlanId}
                disabled={!canEdit}
              >
                <SelectTrigger id="treatment-plan">
                  <SelectValue placeholder="Select treatment plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {treatmentPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} ({plan.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clinical Correlation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Clinical Correlation</CardTitle>
          <CardDescription>Additional clinical notes</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={clinicalCorrelation}
            onChange={(e) => setClinicalCorrelation(e.target.value)}
            placeholder="Any additional clinical correlation or notes..."
            disabled={!canEdit}
            rows={2}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex justify-between">
        <div>
          {reportId && currentStatus === 'DRAFT' && onDelete && (
            <Button variant="destructive" onClick={onDelete} disabled={isLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Draft
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Draft
            </Button>
          )}
          {canSubmit && (
            <Button onClick={handleSubmitForReview} disabled={isLoading}>
              <Send className="h-4 w-4 mr-2" />
              Submit for Review
            </Button>
          )}
          {canSign && (
            <Button onClick={() => setShowSignDialog(true)} disabled={isLoading}>
              <PenTool className="h-4 w-4 mr-2" />
              Sign & Finalize
            </Button>
          )}
        </div>
      </div>

      {/* Add Finding Dialog */}
      <Dialog open={showAddFinding} onOpenChange={setShowAddFinding}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Structured Finding</DialogTitle>
            <DialogDescription>
              Select a finding template and specify location and severity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template selection */}
            <div>
              <Label>Finding Template</Label>
              <Accordion type="single" collapsible className="mt-2">
                {Object.entries(templatesByCategory).map(([category, templates]) => {
                  if (templates.length === 0) return null;
                  const categoryInfo = CATEGORY_INFO[category as FindingCategory];

                  return (
                    <AccordionItem key={category} value={category}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          {categoryInfo.icon}
                          <span>{categoryInfo.label}</span>
                          <Badge variant="secondary" className="ml-2">
                            {templates.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-6">
                          {templates.map((template) => (
                            <div
                              key={template.id}
                              className={cn(
                                'p-3 rounded-lg border cursor-pointer transition-colors',
                                selectedTemplate?.id === template.id
                                  ? 'border-primary bg-primary/5'
                                  : 'hover:bg-muted'
                              )}
                              onClick={() => {
                                setSelectedTemplate(template);
                                setNewFindingLocation(template.locations[0] || '');
                                setNewFindingSeverity(template.defaultSeverity);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{template.name}</span>
                                {selectedTemplate?.id === template.id && (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {template.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>

            {selectedTemplate && (
              <>
                <Separator />

                {/* Location */}
                <div>
                  <Label htmlFor="finding-location">Location</Label>
                  <Select
                    value={newFindingLocation}
                    onValueChange={setNewFindingLocation}
                  >
                    <SelectTrigger id="finding-location">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTemplate.locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity */}
                <div>
                  <Label htmlFor="finding-severity">Severity</Label>
                  <Select
                    value={newFindingSeverity}
                    onValueChange={(v) => setNewFindingSeverity(v as FindingSeverity)}
                  >
                    <SelectTrigger id="finding-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTemplate.severityOptions.map((sev) => {
                        const info = SEVERITY_INFO[sev];
                        return (
                          <SelectItem key={sev} value={sev}>
                            <span className={info.color}>{info.label}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="finding-notes">Additional Notes (optional)</Label>
                  <Textarea
                    id="finding-notes"
                    value={newFindingNotes}
                    onChange={(e) => setNewFindingNotes(e.target.value)}
                    placeholder="Any additional notes about this finding..."
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFinding(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddFinding}
              disabled={!selectedTemplate || !newFindingLocation}
            >
              Add Finding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign and Finalize Report</DialogTitle>
            <DialogDescription>
              By signing this report, you confirm that you have reviewed all findings
              and the report is ready to be finalized.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Report Summary</h4>
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Patient:</span> {studyInfo.patientName}</p>
                <p><span className="text-muted-foreground">Study:</span> {studyInfo.bodyPart} {studyInfo.modality}</p>
                <p><span className="text-muted-foreground">Date:</span> {studyInfo.studyDate}</p>
                <p><span className="text-muted-foreground">Findings:</span> {structuredFindings.length} structured finding(s)</p>
              </div>
            </div>

            <div>
              <Label htmlFor="signature">Electronic Signature</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Type your full name to sign this report electronically.
              </p>
              <input
                id="signature"
                type="text"
                value={signatureText}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder="Type your full name"
                className="w-full border rounded-lg p-3 font-serif text-lg italic"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSign}
              disabled={signatureText.trim().length === 0 || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PenTool className="h-4 w-4 mr-2" />
              )}
              Sign Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ImagingReportEditor;
