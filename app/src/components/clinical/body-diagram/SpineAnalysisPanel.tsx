'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InteractiveSpineDiagram, SpineSegmentData } from './InteractiveSpineDiagram';

export interface SpineAnalysisPanelProps {
  patientId: string;
  patientName: string;
  encounterId?: string;
  segments: SpineSegmentData[];
  view: 'coronal' | 'sagittal';
  onViewChange: (view: 'coronal' | 'sagittal') => void;
  onSegmentClick?: (segment: SpineSegmentData) => void;
  onDocumentFinding?: (segment: string) => void;
  soapNoteContent?: string;
  patientEducationData?: PatientEducationData;
  readOnly?: boolean;
  className?: string;
}

export interface PatientEducationData {
  title: string;
  date: Date;
  findings: Array<{
    segment: string;
    region: string;
    listing: string;
    severity: string;
    severityColor: string;
    explanation?: string;
    progressNote?: string;
  }>;
  summary: {
    totalAreas: number;
    regionSummary: Array<{
      region: string;
      count: number;
      explanation: string;
    }>;
    overallMessage: string;
  };
  instructions: string[];
}

export function SpineAnalysisPanel({
  patientName,
  segments,
  view,
  onViewChange,
  onSegmentClick,
  onDocumentFinding,
  soapNoteContent,
  patientEducationData,
  readOnly = false,
  className,
}: SpineAnalysisPanelProps) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeFindings: true,
    includeRecommendations: true,
    includeDiagram: true,
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Handle export to SOAP note
  const handleExportToSoapNote = useCallback(() => {
    if (soapNoteContent) {
      navigator.clipboard.writeText(soapNoteContent);
      setExportDialogOpen(false);
    }
  }, [soapNoteContent]);

  // Handle print using safe DOM methods
  const handlePrint = useCallback(() => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        // Use safe DOM manipulation instead of document.write
        const doc = printWindow.document;

        // Create head
        const head = doc.createElement('head');
        const title = doc.createElement('title');
        title.textContent = `Spinal Analysis - ${patientName}`;
        head.appendChild(title);

        const style = doc.createElement('style');
        style.textContent = `
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #053e67;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h1 {
            color: #053e67;
            margin: 0;
          }
          .header p {
            margin: 5px 0;
            color: #666;
          }
          .section {
            margin-bottom: 20px;
          }
          .section h2 {
            color: #053e67;
            font-size: 16px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          }
          .finding {
            display: flex;
            align-items: flex-start;
            padding: 10px;
            margin-bottom: 10px;
            background: #f9fafb;
            border-left: 4px solid;
            border-radius: 4px;
          }
          .finding-segment {
            font-weight: bold;
            min-width: 60px;
          }
          .finding-details {
            flex: 1;
          }
          .finding-severity {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            color: white;
          }
          .summary-box {
            background: #f0f9ff;
            border: 1px solid #0284c7;
            padding: 15px;
            border-radius: 8px;
          }
          .instructions {
            background: #f0fdf4;
            border: 1px solid #22c55e;
            padding: 15px;
            border-radius: 8px;
          }
          .instructions li {
            margin-bottom: 8px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none; }
          }
        `;
        head.appendChild(style);

        // Create body with content
        const body = doc.createElement('body');
        body.innerHTML = printContent;

        // Append to document
        doc.documentElement.appendChild(head);
        doc.documentElement.appendChild(body);

        printWindow.print();
      }
    }
    setPrintDialogOpen(false);
  }, [patientName]);

  // Calculate summary stats
  const findingsCount = segments.filter((s) => s.hasFinding).length;
  const severeCount = segments.filter((s) => s.severityLevel >= 4).length;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header with Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Spinal Analysis</h2>
          <p className="text-sm text-muted-foreground">
            {findingsCount} finding{findingsCount !== 1 ? 's' : ''} documented
            {severeCount > 0 && (
              <span className="text-red-500 ml-2">
                ({severeCount} severe)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Export Button */}
          <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Export to Note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export to SOAP Note</DialogTitle>
                <DialogDescription>
                  Export spinal analysis findings to your documentation.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-findings"
                      checked={exportOptions.includeFindings}
                      onCheckedChange={(checked) =>
                        setExportOptions({ ...exportOptions, includeFindings: !!checked })
                      }
                    />
                    <Label htmlFor="include-findings">Include Findings</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-recommendations"
                      checked={exportOptions.includeRecommendations}
                      onCheckedChange={(checked) =>
                        setExportOptions({ ...exportOptions, includeRecommendations: !!checked })
                      }
                    />
                    <Label htmlFor="include-recommendations">Include Summary</Label>
                  </div>
                </div>

                {soapNoteContent && (
                  <div className="border rounded-md p-3 bg-muted">
                    <p className="text-xs font-medium mb-2">Preview:</p>
                    <ScrollArea className="h-48">
                      <pre className="text-xs whitespace-pre-wrap font-mono">
                        {soapNoteContent}
                      </pre>
                    </ScrollArea>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleExportToSoapNote}>
                    Copy to Clipboard
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Print Button */}
          <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Print Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Print Patient Education Report</DialogTitle>
                <DialogDescription>
                  Generate a printable spinal health report for the patient.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Print Preview */}
                <div ref={printRef} className="border rounded-md p-4 bg-white max-h-96 overflow-auto">
                  <div className="header">
                    <h1>Your Spinal Health Report</h1>
                    <p>{patientName}</p>
                    <p>{new Date().toLocaleDateString()}</p>
                  </div>

                  {patientEducationData ? (
                    <>
                      <div className="section">
                        <h2>Summary</h2>
                        <div className="summary-box">
                          <p><strong>Total Areas Requiring Attention:</strong> {patientEducationData.summary.totalAreas}</p>
                          <p style={{ marginTop: '10px' }}>{patientEducationData.summary.overallMessage}</p>
                        </div>
                      </div>

                      {patientEducationData.findings.length > 0 && (
                        <div className="section">
                          <h2>Findings</h2>
                          {patientEducationData.findings.map((finding, idx) => (
                            <div
                              key={idx}
                              className="finding"
                              style={{ borderLeftColor: finding.severityColor }}
                            >
                              <div className="finding-segment">{finding.segment}</div>
                              <div className="finding-details">
                                {finding.explanation && <p>{finding.explanation}</p>}
                                {finding.progressNote && (
                                  <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                    Progress: {finding.progressNote}
                                  </p>
                                )}
                              </div>
                              <span
                                className="finding-severity"
                                style={{ backgroundColor: finding.severityColor }}
                              >
                                {finding.severity.toLowerCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="section">
                        <h2>Your Care Instructions</h2>
                        <div className="instructions">
                          <ul>
                            {patientEducationData.instructions.map((instruction, idx) => (
                              <li key={idx}>{instruction}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="section">
                      <h2>Findings</h2>
                      {segments.filter((s) => s.hasFinding).length > 0 ? (
                        segments
                          .filter((s) => s.hasFinding)
                          .map((segment) => (
                            <div
                              key={segment.segment}
                              className="finding"
                              style={{ borderLeftColor: segment.severityColor }}
                            >
                              <div className="finding-segment">{segment.segment}</div>
                              <div className="finding-details">
                                <p>{segment.name} - {segment.region.toLowerCase()} region</p>
                                {segment.subluxation && (
                                  <p style={{ fontSize: '12px' }}>
                                    Listing: {segment.subluxation.listing}
                                  </p>
                                )}
                              </div>
                              <span
                                className="finding-severity"
                                style={{ backgroundColor: segment.severityColor }}
                              >
                                {segment.subluxation?.severity.toLowerCase() || 'finding'}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p>No significant findings at this time.</p>
                      )}
                    </div>
                  )}

                  <div className="footer">
                    <p>This report is for educational purposes. Please discuss any questions with your chiropractor.</p>
                    <p>Generated by ChiroFlow - {new Date().toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handlePrint}>
                    Print Report
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Interactive Diagram */}
      <InteractiveSpineDiagram
        segments={segments}
        view={view}
        onViewChange={onViewChange}
        onSegmentClick={onSegmentClick}
        onDocumentFinding={onDocumentFinding}
        readOnly={readOnly}
        showLegend={true}
        showSummary={true}
      />

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'PELVIS'] as const).map((region) => {
          const regionSegments = segments.filter((s) => s.region === region);
          const regionFindings = regionSegments.filter((s) => s.hasFinding).length;
          const regionColor = {
            CERVICAL: '#3b82f6',
            THORACIC: '#8b5cf6',
            LUMBAR: '#f59e0b',
            SACRAL: '#ec4899',
            PELVIS: '#14b8a6',
          }[region];

          return (
            <Card key={region} className="text-center">
              <CardContent className="pt-4">
                <div
                  className="text-2xl font-bold"
                  style={{ color: regionFindings > 0 ? regionColor : '#9ca3af' }}
                >
                  {regionFindings}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {region.charAt(0) + region.slice(1).toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {regionSegments.length}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
