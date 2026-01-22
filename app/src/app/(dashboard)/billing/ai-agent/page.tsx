'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BrainCircuit,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileSearch,
  Send,
  RefreshCw,
  Clock,
  Shield,
  Zap,
  BarChart3,
  FileCheck,
  AlertCircle,
  ChevronRight,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Eye,
  Edit,
  FileText,
  Users,
  Building2,
  CreditCard,
} from 'lucide-react';

// Demo data types
interface ClaimIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  suggestion: string;
  autoFixable: boolean;
}

interface ClaimScrubResult {
  claimId: string;
  patientName: string;
  providerId: string;
  totalCharges: number;
  status: 'passed' | 'failed' | 'warnings';
  issues: ClaimIssue[];
  confidenceScore: number;
}

interface ChargeCaptureSuggestion {
  id: string;
  encounterId: string;
  patientName: string;
  encounterDate: string;
  suggestedCpt: string;
  suggestedDescription: string;
  suggestedFee: number;
  confidence: number;
  reason: string;
  documentationExcerpt: string;
}

interface DenialRecord {
  id: string;
  claimId: string;
  patientName: string;
  denialDate: string;
  denialReason: string;
  denialCode: string;
  chargeAmount: number;
  appealStrategy: string;
  successProbability: number;
  priority: 'high' | 'medium' | 'low';
}

interface RevenueMetric {
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  aiInsight: string;
}

interface EligibilityResult {
  patientName: string;
  insuranceId: string;
  payerName: string;
  status: 'active' | 'inactive' | 'pending';
  copay: number;
  deductible: number;
  deductibleMet: number;
  coinsurance: number;
  outOfPocketMax: number;
  outOfPocketMet: number;
  effectiveDate: string;
  terminationDate: string | null;
  lastVerified: string;
}

// Demo data
const demoClaimScrubResults: ClaimScrubResult[] = [
  {
    claimId: 'CLM-2024-001',
    patientName: '[DEMO] Sarah Johnson',
    providerId: 'Dr. [DEMO] Michael Chen',
    totalCharges: 285.00,
    status: 'failed',
    confidenceScore: 45,
    issues: [
      {
        id: '1',
        type: 'error',
        code: 'DX-001',
        message: 'Missing primary diagnosis pointer',
        suggestion: 'Add diagnosis pointer 1 (M54.5 - Low back pain) to line 1',
        autoFixable: true,
      },
      {
        id: '2',
        type: 'error',
        code: 'MOD-002',
        message: 'Modifier 59 required for distinct procedural service',
        suggestion: 'Add modifier 59 to CPT 98941 to indicate separate anatomical site',
        autoFixable: true,
      },
    ],
  },
  {
    claimId: 'CLM-2024-002',
    patientName: '[DEMO] Robert Williams',
    providerId: 'Dr. [DEMO] Emily Davis',
    totalCharges: 175.00,
    status: 'warnings',
    confidenceScore: 78,
    issues: [
      {
        id: '3',
        type: 'warning',
        code: 'FREQ-001',
        message: 'Treatment frequency approaching payer limit',
        suggestion: 'Patient has 11 of 12 allowed visits this quarter. Consider authorization request.',
        autoFixable: false,
      },
    ],
  },
  {
    claimId: 'CLM-2024-003',
    patientName: '[DEMO] Maria Garcia',
    providerId: 'Dr. [DEMO] Michael Chen',
    totalCharges: 340.00,
    status: 'passed',
    confidenceScore: 98,
    issues: [],
  },
  {
    claimId: 'CLM-2024-004',
    patientName: '[DEMO] James Thompson',
    providerId: 'Dr. [DEMO] Emily Davis',
    totalCharges: 225.00,
    status: 'passed',
    confidenceScore: 95,
    issues: [],
  },
];

const demoChargeCaptureSuggestions: ChargeCaptureSuggestion[] = [
  {
    id: 'sug-001',
    encounterId: 'ENC-2024-156',
    patientName: '[DEMO] Jennifer Lee',
    encounterDate: '2024-01-19',
    suggestedCpt: '98940',
    suggestedDescription: 'Chiropractic manipulative treatment (1-2 regions)',
    suggestedFee: 65.00,
    confidence: 94,
    reason: 'Documentation indicates cervical and thoracic regions addressed',
    documentationExcerpt: '...adjusted C2-C4 and T3-T5 with diversified technique...',
  },
  {
    id: 'sug-002',
    encounterId: 'ENC-2024-157',
    patientName: '[DEMO] David Martinez',
    encounterDate: '2024-01-19',
    suggestedCpt: '97140',
    suggestedDescription: 'Manual therapy techniques',
    suggestedFee: 55.00,
    confidence: 87,
    reason: 'Soft tissue work documented but not captured',
    documentationExcerpt: '...performed myofascial release to lumbar paraspinals...',
  },
  {
    id: 'sug-003',
    encounterId: 'ENC-2024-158',
    patientName: '[DEMO] Amanda White',
    encounterDate: '2024-01-18',
    suggestedCpt: '97110',
    suggestedDescription: 'Therapeutic exercises',
    suggestedFee: 45.00,
    confidence: 82,
    reason: 'Rehabilitation exercises documented',
    documentationExcerpt: '...instructed patient in core stabilization exercises...',
  },
];

const demoDenials: DenialRecord[] = [
  {
    id: 'den-001',
    claimId: 'CLM-2024-089',
    patientName: '[DEMO] Thomas Anderson',
    denialDate: '2024-01-15',
    denialReason: 'Medical necessity not established',
    denialCode: 'CO-50',
    chargeAmount: 285.00,
    appealStrategy: 'Submit peer-reviewed literature supporting treatment efficacy for chronic low back pain. Include functional outcome measures (ODI scores) showing improvement.',
    successProbability: 78,
    priority: 'high',
  },
  {
    id: 'den-002',
    claimId: 'CLM-2024-076',
    patientName: '[DEMO] Patricia Brown',
    denialDate: '2024-01-12',
    denialReason: 'Service not covered under plan',
    denialCode: 'CO-96',
    chargeAmount: 125.00,
    appealStrategy: 'Verify patient benefits. If covered, resubmit with correct benefit information and plan ID.',
    successProbability: 45,
    priority: 'medium',
  },
  {
    id: 'den-003',
    claimId: 'CLM-2024-091',
    patientName: '[DEMO] Kevin Wilson',
    denialDate: '2024-01-18',
    denialReason: 'Duplicate claim submission',
    denialCode: 'CO-18',
    chargeAmount: 195.00,
    appealStrategy: 'Review billing history to confirm original claim status. If truly duplicate, void claim. If modifier issue, resubmit with correction.',
    successProbability: 92,
    priority: 'low',
  },
];

const demoRevenueMetrics: RevenueMetric[] = [
  {
    label: 'Clean Claim Rate',
    value: 94.2,
    change: 2.8,
    trend: 'up',
    aiInsight: 'AI scrubbing improved first-pass rate by catching 23 errors before submission this week.',
  },
  {
    label: 'Average Days to Payment',
    value: 18.5,
    change: -3.2,
    trend: 'up',
    aiInsight: 'Faster payments due to reduced rework. Consider electronic ERA enrollment for remaining payers.',
  },
  {
    label: 'Denial Rate',
    value: 5.8,
    change: -1.4,
    trend: 'up',
    aiInsight: 'Denial rate down from 7.2%. CO-50 (medical necessity) denials reduced by 40% with documentation improvements.',
  },
  {
    label: 'Collection Rate',
    value: 96.3,
    change: 1.1,
    trend: 'up',
    aiInsight: 'Strong collections. Consider implementing patient payment plans for outstanding balances over $500.',
  },
];

const demoEligibilityResults: EligibilityResult[] = [
  {
    patientName: '[DEMO] Sarah Johnson',
    insuranceId: 'BC123456789',
    payerName: 'Blue Cross Blue Shield',
    status: 'active',
    copay: 35,
    deductible: 1500,
    deductibleMet: 1500,
    coinsurance: 20,
    outOfPocketMax: 6000,
    outOfPocketMet: 2340,
    effectiveDate: '2024-01-01',
    terminationDate: null,
    lastVerified: '2024-01-20T10:30:00Z',
  },
  {
    patientName: '[DEMO] Robert Williams',
    insuranceId: 'AE987654321',
    payerName: 'Aetna',
    status: 'active',
    copay: 40,
    deductible: 2000,
    deductibleMet: 850,
    coinsurance: 30,
    outOfPocketMax: 8000,
    outOfPocketMet: 1200,
    effectiveDate: '2024-01-01',
    terminationDate: null,
    lastVerified: '2024-01-20T09:15:00Z',
  },
  {
    patientName: '[DEMO] James Thompson',
    insuranceId: 'UH456789123',
    payerName: 'UnitedHealthcare',
    status: 'pending',
    copay: 30,
    deductible: 1000,
    deductibleMet: 1000,
    coinsurance: 20,
    outOfPocketMax: 5000,
    outOfPocketMet: 1850,
    effectiveDate: '2024-01-01',
    terminationDate: null,
    lastVerified: '2024-01-19T14:45:00Z',
  },
];

// Loading skeleton component
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Claim Scrubbing Component
function ClaimScrubbing() {
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ClaimScrubResult[]>(demoClaimScrubResults);

  const handleScan = () => {
    setIsScanning(true);
    // Simulate AI scanning
    setTimeout(() => {
      setIsScanning(false);
    }, 2000);
  };

  const handleAutoFix = (claimId: string, issueId: string) => {
    setResults(prev =>
      prev.map(claim => {
        if (claim.claimId === claimId) {
          const newIssues = claim.issues.filter(i => i.id !== issueId);
          return {
            ...claim,
            issues: newIssues,
            status: newIssues.length === 0 ? 'passed' : newIssues.some(i => i.type === 'error') ? 'failed' : 'warnings',
            confidenceScore: newIssues.length === 0 ? 98 : claim.confidenceScore + 15,
          };
        }
        return claim;
      })
    );
  };

  const getStatusBadge = (status: ClaimScrubResult['status']) => {
    switch (status) {
      case 'passed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" /> Passed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>;
      case 'warnings':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><AlertTriangle className="mr-1 h-3 w-3" /> Warnings</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Claim Scrubbing</h3>
          <p className="text-sm text-muted-foreground">
            Automatically analyze claims for errors before submission
          </p>
        </div>
        <Button onClick={handleScan} disabled={isScanning} className="bg-[#053e67] hover:bg-[#053e67]">
          {isScanning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <BrainCircuit className="mr-2 h-4 w-4" />
              Scan Pending Claims
            </>
          )}
        </Button>
      </div>

      {isScanning && (
        <Alert className="border-blue-200 bg-blue-50">
          <Sparkles className="h-4 w-4 text-[#053e67]" />
          <AlertTitle className="text-blue-800">AI Analysis in Progress</AlertTitle>
          <AlertDescription className="text-[#053e67]">
            Analyzing 4 pending claims against 847 billing rules and payer-specific requirements...
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {results.map((claim) => (
          <Card key={claim.claimId} className={claim.status === 'failed' ? 'border-red-200' : claim.status === 'warnings' ? 'border-blue-200' : 'border-green-200'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <CardTitle className="text-base">{claim.claimId}</CardTitle>
                    <CardDescription>{claim.patientName} - {claim.providerId}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-medium">${claim.totalCharges.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Total Charges</div>
                  </div>
                  {getStatusBadge(claim.status)}
                </div>
              </div>
            </CardHeader>
            {claim.issues.length > 0 && (
              <CardContent className="pt-0">
                <div className="mb-2 flex items-center gap-2">
                  <Progress value={claim.confidenceScore} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{claim.confidenceScore}%</span>
                </div>
                <div className="space-y-2">
                  {claim.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`flex items-start justify-between rounded-lg p-3 ${
                        issue.type === 'error' ? 'bg-red-50' : issue.type === 'warning' ? 'bg-blue-50' : 'bg-blue-50'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {issue.type === 'error' ? (
                            <XCircle className="h-4 w-4 text-red-600" />
                          ) : issue.type === 'warning' ? (
                            <AlertTriangle className="h-4 w-4 text-[#053e67]" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-[#053e67]" />
                          )}
                          <span className="font-medium text-sm">{issue.code}: {issue.message}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground pl-6">
                          <Sparkles className="mr-1 inline h-3 w-3 text-blue-500" />
                          AI Suggestion: {issue.suggestion}
                        </p>
                      </div>
                      {issue.autoFixable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAutoFix(claim.claimId, issue.id)}
                          className="ml-4"
                        >
                          <Zap className="mr-1 h-3 w-3" />
                          Auto-Fix
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
            {claim.status === 'passed' && (
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-green-700">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">All 847 billing rules passed. Ready for submission.</span>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// Charge Capture Suggestions Component
function ChargeCaptureAI() {
  const [suggestions] = useState<ChargeCaptureSuggestion[]>(demoChargeCaptureSuggestions);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  const handleAccept = (id: string) => {
    setAcceptedIds(prev => new Set([...prev, id]));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Charge Capture</h3>
          <p className="text-sm text-muted-foreground">
            Suggested charges based on encounter documentation analysis
          </p>
        </div>
        <Badge variant="outline" className="text-[#053e67] border-[#053e67]">
          <Sparkles className="mr-1 h-3 w-3" />
          {suggestions.length - acceptedIds.size} Suggestions
        </Badge>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <BrainCircuit className="h-4 w-4 text-[#053e67]" />
        <AlertTitle className="text-blue-800">Potential Revenue Recovery</AlertTitle>
        <AlertDescription className="text-[#053e67]">
          AI identified ${suggestions.filter(s => !acceptedIds.has(s.id)).reduce((sum, s) => sum + s.suggestedFee, 0).toFixed(2)} in potentially missed charges from the last 7 days.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <Card key={suggestion.id} className={acceptedIds.has(suggestion.id) ? 'opacity-50' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {suggestion.patientName}
                    <Badge variant="outline" className="font-normal">
                      {formatDate(suggestion.encounterDate)}
                    </Badge>
                  </CardTitle>
                  <CardDescription>Encounter: {suggestion.encounterId}</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">${suggestion.suggestedFee.toFixed(2)}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Target className="mr-1 h-3 w-3" />
                    {suggestion.confidence}% confidence
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 text-[#053e67]" />
                  {suggestion.suggestedCpt} - {suggestion.suggestedDescription}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium">Reason:</span> {suggestion.reason}
                </p>
                <p className="mt-1 text-sm italic text-muted-foreground">
                  "{suggestion.documentationExcerpt}"
                </p>
              </div>
            </CardContent>
            <CardFooter className="pt-0 flex gap-2">
              {acceptedIds.has(suggestion.id) ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Charge Created
                </Badge>
              ) : (
                <>
                  <Button onClick={() => handleAccept(suggestion.id)} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Accept & Create Charge
                  </Button>
                  <Button variant="outline">
                    <Eye className="mr-2 h-4 w-4" />
                    Review Documentation
                  </Button>
                  <Button variant="ghost" className="text-muted-foreground">
                    Dismiss
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Denial Management Component
function DenialManagement() {
  const [denials] = useState<DenialRecord[]>(demoDenials);
  const [selectedDenial, setSelectedDenial] = useState<DenialRecord | null>(null);

  const getPriorityBadge = (priority: DenialRecord['priority']) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">High Priority</Badge>;
      case 'medium':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Medium Priority</Badge>;
      case 'low':
        return <Badge className="bg-stone-100 text-stone-800 hover:bg-stone-100">Low Priority</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Denial Management</h3>
          <p className="text-sm text-muted-foreground">
            Intelligent appeal strategies for denied claims
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-red-600 border-red-600">
            {denials.length} Active Denials
          </Badge>
          <Badge variant="outline" className="text-green-600 border-green-600">
            ${denials.reduce((sum, d) => sum + d.chargeAmount, 0).toFixed(2)} At Risk
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-800">Medical Necessity</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-red-900">
              ${denials.filter(d => d.denialCode === 'CO-50').reduce((sum, d) => sum + d.chargeAmount, 0).toFixed(2)}
            </div>
            <p className="text-xs text-red-700">1 denial - 78% avg appeal success</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-[#053e67]" />
              <span className="text-sm font-medium text-blue-800">Coverage Issues</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-900">
              ${denials.filter(d => d.denialCode === 'CO-96').reduce((sum, d) => sum + d.chargeAmount, 0).toFixed(2)}
            </div>
            <p className="text-xs text-[#053e67]">1 denial - 45% avg appeal success</p>
          </CardContent>
        </Card>
        <Card className="bg-stone-50 border-stone-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-stone-600" />
              <span className="text-sm font-medium text-stone-800">Duplicate/Admin</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-stone-900">
              ${denials.filter(d => d.denialCode === 'CO-18').reduce((sum, d) => sum + d.chargeAmount, 0).toFixed(2)}
            </div>
            <p className="text-xs text-stone-700">1 denial - 92% avg appeal success</p>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Claim</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Denial Reason</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Success Rate</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {denials.map((denial) => (
            <TableRow key={denial.id}>
              <TableCell className="font-medium">{denial.claimId}</TableCell>
              <TableCell>{denial.patientName}</TableCell>
              <TableCell>
                <div className="max-w-[200px]">
                  <div className="font-medium">{denial.denialCode}</div>
                  <div className="text-xs text-muted-foreground truncate">{denial.denialReason}</div>
                </div>
              </TableCell>
              <TableCell>${denial.chargeAmount.toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={denial.successProbability} className="h-2 w-16" />
                  <span className="text-sm">{denial.successProbability}%</span>
                </div>
              </TableCell>
              <TableCell>{getPriorityBadge(denial.priority)}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedDenial(denial)}
                >
                  <Sparkles className="mr-1 h-3 w-3 text-blue-500" />
                  View Strategy
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedDenial && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-[#053e67]" />
              AI Appeal Strategy for {selectedDenial.claimId}
            </CardTitle>
            <CardDescription>
              {selectedDenial.patientName} - {selectedDenial.denialCode}: {selectedDenial.denialReason}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-white p-4">
              <p className="text-sm">{selectedDenial.appealStrategy}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Target className="h-4 w-4 text-green-600" />
                  {selectedDenial.successProbability}% success probability
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-[#053e67]" />
                  Appeal deadline: 30 days
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedDenial(null)}>
                  Close
                </Button>
                <Button className="bg-[#053e67] hover:bg-[#053e67]">
                  <Send className="mr-2 h-4 w-4" />
                  Generate Appeal Letter
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Revenue Analytics Component
function RevenueAnalytics() {
  const [metrics] = useState<RevenueMetric[]>(demoRevenueMetrics);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Revenue Insights</h3>
          <p className="text-sm text-muted-foreground">
            Intelligent analytics and optimization recommendations
          </p>
        </div>
        <Select defaultValue="30d">
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Time period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {metrics.map((metric, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={
                    metric.trend === 'up'
                      ? 'text-green-600 border-green-600'
                      : metric.trend === 'down'
                      ? 'text-red-600 border-red-600'
                      : ''
                  }
                >
                  {metric.trend === 'up' ? (
                    <ArrowUpRight className="mr-1 h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="mr-1 h-3 w-3" />
                  )}
                  {metric.change > 0 ? '+' : ''}{metric.change}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {metric.label.includes('Rate') || metric.label.includes('Days')
                  ? metric.value.toFixed(1)
                  : metric.value}
                {metric.label.includes('Rate') && '%'}
                {metric.label.includes('Days') && ' days'}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                <Sparkles className="h-4 w-4 text-[#053e67] mt-0.5 shrink-0" />
                <p className="text-sm text-blue-800">{metric.aiInsight}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#053e67]" />
            Revenue Cycle Performance
          </CardTitle>
          <CardDescription>
            AI-powered analysis of your billing performance trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-stone-50 rounded-lg border-2 border-dashed border-stone-200">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-stone-400 mx-auto" />
              <p className="mt-2 text-sm text-muted-foreground">
                Revenue cycle charts would render here
              </p>
              <p className="text-xs text-muted-foreground">
                (Integrate with recharts or similar library)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-blue-200 bg-blue-50">
        <BrainCircuit className="h-4 w-4 text-[#053e67]" />
        <AlertTitle className="text-blue-800">AI Revenue Optimization Suggestion</AlertTitle>
        <AlertDescription className="text-[#053e67]">
          Based on your data, implementing electronic ERA processing for United Healthcare (your #2 payer by volume)
          could reduce payment posting time by 3 days and improve cash flow by approximately $4,200/month.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Eligibility Verification Component
function EligibilityVerification() {
  const [results] = useState<EligibilityResult[]>(demoEligibilityResults);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = () => {
    setIsVerifying(true);
    setTimeout(() => setIsVerifying(false), 2000);
  };

  const getStatusBadge = (status: EligibilityResult['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" /> Active</Badge>;
      case 'inactive':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" /> Inactive</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Insurance Eligibility Verification</h3>
          <p className="text-sm text-muted-foreground">
            Real-time insurance verification for scheduled patients
          </p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="today">
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Appointments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="tomorrow">Tomorrow</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleVerify} disabled={isVerifying} className="bg-[#053e67] hover:bg-[#053e67]">
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Verify All
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">Verified Active</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-green-900">
              {results.filter(r => r.status === 'active').length}
            </div>
            <p className="text-xs text-green-700">patients ready for billing</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#053e67]" />
              <span className="text-sm font-medium text-blue-800">Pending Verification</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-900">
              {results.filter(r => r.status === 'pending').length}
            </div>
            <p className="text-xs text-[#053e67]">awaiting payer response</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-800">Issues Found</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-red-900">
              {results.filter(r => r.status === 'inactive').length}
            </div>
            <p className="text-xs text-red-700">require attention</p>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Payer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Copay</TableHead>
            <TableHead>Deductible</TableHead>
            <TableHead>Coinsurance</TableHead>
            <TableHead>Out-of-Pocket</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, index) => (
            <TableRow key={index}>
              <TableCell>
                <div>
                  <div className="font-medium">{result.patientName}</div>
                  <div className="text-xs text-muted-foreground">{result.insuranceId}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {result.payerName}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(result.status)}</TableCell>
              <TableCell>${result.copay}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">${result.deductibleMet} / ${result.deductible}</div>
                  <Progress value={(result.deductibleMet / result.deductible) * 100} className="h-1 mt-1" />
                </div>
              </TableCell>
              <TableCell>{result.coinsurance}%</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">${result.outOfPocketMet} / ${result.outOfPocketMax}</div>
                  <Progress value={(result.outOfPocketMet / result.outOfPocketMax) * 100} className="h-1 mt-1" />
                </div>
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost">
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Batch Claim Submission Component
function BatchClaimSubmission() {
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingClaims = demoClaimScrubResults.filter(c => c.status === 'passed');

  const toggleClaim = (claimId: string) => {
    setSelectedClaims(prev => {
      const next = new Set(prev);
      if (next.has(claimId)) {
        next.delete(claimId);
      } else {
        next.add(claimId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedClaims.size === pendingClaims.length) {
      setSelectedClaims(new Set());
    } else {
      setSelectedClaims(new Set(pendingClaims.map(c => c.claimId)));
    }
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSelectedClaims(new Set());
    }, 3000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Batch Claim Submission</h3>
          <p className="text-sm text-muted-foreground">
            Submit multiple claims to clearinghouse
          </p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter payers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payers</SelectItem>
              <SelectItem value="bcbs">Blue Cross Blue Shield</SelectItem>
              <SelectItem value="aetna">Aetna</SelectItem>
              <SelectItem value="uhc">UnitedHealthcare</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleSubmit}
            disabled={selectedClaims.size === 0 || isSubmitting}
            className="bg-[#053e67] hover:bg-[#053e67]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit {selectedClaims.size} Claims
              </>
            )}
          </Button>
        </div>
      </div>

      {pendingClaims.length === 0 ? (
        <Alert>
          <FileCheck className="h-4 w-4" />
          <AlertTitle>No Claims Ready</AlertTitle>
          <AlertDescription>
            All pending claims need to pass AI scrubbing before submission. Check the Claim Scrubbing tab.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedClaims.size === pendingClaims.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </TableHead>
                <TableHead>Claim ID</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingClaims.map((claim) => (
                <TableRow key={claim.claimId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedClaims.has(claim.claimId)}
                      onChange={() => toggleClaim(claim.claimId)}
                      className="rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{claim.claimId}</TableCell>
                  <TableCell>{claim.patientName}</TableCell>
                  <TableCell>{claim.providerId}</TableCell>
                  <TableCell>Jan 19, 2024</TableCell>
                  <TableCell>${claim.totalCharges.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <Building2 className="mr-1 h-3 w-3" />
                      BCBS
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Ready
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-stone-600" />
              <span className="text-sm font-medium">Total Claims</span>
            </div>
            <div className="mt-2 text-2xl font-bold">{pendingClaims.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">Total Value</span>
            </div>
            <div className="mt-2 text-2xl font-bold">
              ${pendingClaims.reduce((sum, c) => sum + c.totalCharges, 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#053e67]" />
              <span className="text-sm font-medium">Unique Patients</span>
            </div>
            <div className="mt-2 text-2xl font-bold">
              {new Set(pendingClaims.map(c => c.patientName)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium">Payers</span>
            </div>
            <div className="mt-2 text-2xl font-bold">1</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Main Dashboard Component
export default function AIBillingAgentPage() {
  const [isLoading, setIsLoading] = useState(true);

  // Simulate initial loading
  useState(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  });

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">AI Billing Agent</h2>
            <p className="text-muted-foreground">Loading intelligent billing assistant...</p>
          </div>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-[#053e67]" />
            AI Billing Agent
          </h2>
          <p className="text-muted-foreground">
            Intelligent automation for claims, denials, and revenue optimization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <Activity className="mr-1 h-3 w-3" />
            AI Active
          </Badge>
          <Badge variant="outline">
            <Clock className="mr-1 h-3 w-3" />
            Last sync: 2 min ago
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clean Claim Rate</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94.2%</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+2.8%</span> from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Claims</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">
              $1,025.00 total value
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Denials</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              $605.00 at risk
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Opportunity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">$165.00</div>
            <p className="text-xs text-muted-foreground">
              3 AI-suggested charges
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="scrubbing" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="scrubbing" className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            <span className="hidden sm:inline">Claim Scrubbing</span>
          </TabsTrigger>
          <TabsTrigger value="capture" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Charge Capture</span>
          </TabsTrigger>
          <TabsTrigger value="denials" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Denials</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="eligibility" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Eligibility</span>
          </TabsTrigger>
          <TabsTrigger value="submit" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Submit Claims</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scrubbing" className="space-y-4">
          <ClaimScrubbing />
        </TabsContent>

        <TabsContent value="capture" className="space-y-4">
          <ChargeCaptureAI />
        </TabsContent>

        <TabsContent value="denials" className="space-y-4">
          <DenialManagement />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <RevenueAnalytics />
        </TabsContent>

        <TabsContent value="eligibility" className="space-y-4">
          <EligibilityVerification />
        </TabsContent>

        <TabsContent value="submit" className="space-y-4">
          <BatchClaimSubmission />
        </TabsContent>
      </Tabs>
    </div>
  );
}
