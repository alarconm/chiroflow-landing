'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Shield,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Users,
  BarChart3,
  Target,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  Calendar,
  ClipboardCheck,
  Zap,
  ShieldAlert,
  Heart,
  Scale,
  Eye,
  ListChecks,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// ============================================
// Type Definitions
// ============================================

interface QAMetricScore {
  score: number | null;
  trend?: string | null;
}

interface ComplianceAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  entityType?: string;
  entityId?: string;
}

interface QAFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  riskScore: number | null;
  entityType?: string;
  createdAt: Date;
}

interface QAAudit {
  id: string;
  auditType: string;
  auditDate: Date;
  score: number | null;
  scoreCategory?: string;
  findingsCount?: number;
  status: string;
}

interface ProviderQuality {
  providerId: string;
  providerName: string;
  overallScore: number;
  documentationScore: number;
  codingScore: number;
  complianceScore: number;
  rank: number;
}

// ============================================
// Utility Components
// ============================================

function QualityScoreCard({
  title,
  score,
  icon: Icon,
  trend,
  benchmark,
  subtitle,
}: {
  title: string;
  score: number | null;
  icon: any;
  trend?: string | null;
  benchmark?: number;
  subtitle?: string;
}) {
  const getScoreColor = (s: number | null) => {
    if (s === null) return 'text-muted-foreground';
    if (s >= 90) return 'text-green-600';
    if (s >= 75) return 'text-yellow-600';
    if (s >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (s: number | null) => {
    if (s === null) return 'bg-gray-100';
    if (s >= 90) return 'bg-green-50';
    if (s >= 75) return 'bg-yellow-50';
    if (s >= 50) return 'bg-orange-50';
    return 'bg-red-50';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${getScoreColor(score)}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
          {score !== null ? `${score.toFixed(0)}%` : 'N/A'}
        </div>
        <div className="flex items-center text-xs text-muted-foreground mt-1 gap-2">
          {trend && (
            <span className={`flex items-center ${trend === 'IMPROVING' ? 'text-green-600' : trend === 'DECLINING' ? 'text-red-600' : ''}`}>
              {trend === 'IMPROVING' ? <TrendingUp className="h-3 w-3 mr-1" /> : trend === 'DECLINING' ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
              {trend}
            </span>
          )}
          {benchmark !== undefined && score !== null && (
            <span className={score >= benchmark ? 'text-green-600' : 'text-yellow-600'}>
              Benchmark: {benchmark}%
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
    CRITICAL: { variant: 'destructive', className: 'bg-red-600' },
    HIGH: { variant: 'destructive', className: 'bg-orange-600' },
    MEDIUM: { variant: 'secondary', className: 'bg-yellow-600 text-white' },
    LOW: { variant: 'outline', className: 'border-blue-500 text-blue-600' },
    INFO: { variant: 'outline', className: 'border-gray-400 text-gray-600' },
  };

  const config = variants[severity] || variants.INFO;

  return (
    <Badge variant={config.variant} className={config.className}>
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    OPEN: { variant: 'destructive', icon: AlertCircle },
    NEW: { variant: 'destructive', icon: AlertCircle },
    IN_REVIEW: { variant: 'secondary', icon: Eye },
    IN_PROGRESS: { variant: 'secondary', icon: Loader2 },
    ACKNOWLEDGED: { variant: 'secondary', icon: CheckCircle },
    RESOLVED: { variant: 'default', icon: CheckCircle },
    DISMISSED: { variant: 'outline', icon: XCircle },
    DEFERRED: { variant: 'outline', icon: Clock },
    ESCALATED: { variant: 'destructive', icon: AlertTriangle },
    COMPLETED: { variant: 'default', icon: CheckCircle },
  };

  const config = variants[status] || { variant: 'outline' as const, icon: Clock };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function AuditTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    DOCUMENTATION: 'bg-blue-100 text-blue-800',
    CODING: 'bg-purple-100 text-purple-800',
    COMPLIANCE: 'bg-green-100 text-green-800',
    CLINICAL: 'bg-pink-100 text-pink-800',
    WORKFLOW: 'bg-orange-100 text-orange-800',
    FINANCIAL: 'bg-yellow-100 text-yellow-800',
    AUDIT_PREPARATION: 'bg-cyan-100 text-cyan-800',
    MOCK_AUDIT: 'bg-indigo-100 text-indigo-800',
  };

  return (
    <Badge className={colors[type] || 'bg-gray-100 text-gray-800'}>
      {type.replace(/_/g, ' ')}
    </Badge>
  );
}

// ============================================
// Overall Quality Score Component
// ============================================

function OverallQualityScore() {
  const { data: complianceData, isLoading: complianceLoading } = trpc.aiQA.getComplianceDashboard.useQuery();
  const { data: qualityData, isLoading: qualityLoading } = trpc.aiQA.getClinicalQualityDashboard.useQuery({});
  const { data: riskData, isLoading: riskLoading } = trpc.aiQA.getRiskDashboard.useQuery({});

  const isLoading = complianceLoading || qualityLoading || riskLoading;

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate overall quality score from all dimensions
  const complianceScore = complianceData?.scores.overall || 0;
  const qualityScore = qualityData?.scores.overall || 0;
  const riskScore = riskData?.currentRiskScore !== null ? 100 - (riskData?.currentRiskScore || 0) : 0;

  // Weighted average (compliance 30%, quality 40%, risk 30%)
  const overallScore = Math.round(
    (complianceScore * 0.3) + (qualityScore * 0.4) + (riskScore * 0.3)
  );

  const getOverallCategory = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (score >= 75) return { label: 'Good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (score >= 50) return { label: 'Needs Improvement', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const category = getOverallCategory(overallScore);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#053e67]" />
              Overall Quality Score
            </CardTitle>
            <CardDescription>
              Comprehensive quality assessment across all dimensions
            </CardDescription>
          </div>
          <Badge className={`${category.bg} ${category.color}`}>
            {category.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8 mb-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${category.color}`}>{overallScore}%</div>
            <div className="text-sm text-muted-foreground mt-1">Combined Score</div>
          </div>
          <div className="flex-1">
            <Progress value={overallScore} className="h-4" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-blue-50">
            <div className="flex items-center gap-2 text-sm text-blue-800 mb-1">
              <FileText className="h-4 w-4" />
              Documentation
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {qualityData?.scores.outcomeTracking?.toFixed(0) || 'N/A'}%
            </div>
          </div>
          <div className="p-4 rounded-lg bg-purple-50">
            <div className="flex items-center gap-2 text-sm text-purple-800 mb-1">
              <Scale className="h-4 w-4" />
              Coding
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {qualityData?.scores.treatmentEffectiveness?.toFixed(0) || 'N/A'}%
            </div>
          </div>
          <div className="p-4 rounded-lg bg-green-50">
            <div className="flex items-center gap-2 text-sm text-green-800 mb-1">
              <Shield className="h-4 w-4" />
              Compliance
            </div>
            <div className="text-2xl font-bold text-green-600">
              {complianceScore?.toFixed(0) || 'N/A'}%
            </div>
          </div>
          <div className="p-4 rounded-lg bg-red-50">
            <div className="flex items-center gap-2 text-sm text-red-800 mb-1">
              <ShieldAlert className="h-4 w-4" />
              Risk Score
            </div>
            <div className="text-2xl font-bold text-red-600">
              {riskData?.currentRiskScore !== null && riskData?.currentRiskScore !== undefined ? `${riskData.currentRiskScore.toFixed(0)}` : 'N/A'}
            </div>
            <div className="text-xs text-red-700 mt-1">
              {riskData?.currentRiskLevel || 'Unknown'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Audit Findings Summary Component
// ============================================

function AuditFindingsSummary() {
  const [filter, setFilter] = useState<string>('all');

  const { data: riskData, isLoading, refetch } = trpc.aiQA.getRiskDashboard.useQuery({});
  const { data: complianceAlerts } = trpc.aiQA.getComplianceAlerts.useQuery({
    limit: 10,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const findings = riskData?.openHighRiskFindings || [];
  const filteredFindings = filter === 'all'
    ? findings
    : findings.filter(f => f.severity === filter);

  const severityCounts = {
    CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
    HIGH: findings.filter(f => f.severity === 'HIGH').length,
    MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
    LOW: findings.filter(f => f.severity === 'LOW').length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Audit Findings Summary
            </CardTitle>
            <CardDescription>
              Open findings requiring attention
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Severity Summary */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <div className="text-xl font-bold text-red-600">{severityCounts.CRITICAL}</div>
            <div className="text-xs text-red-800">Critical</div>
          </div>
          <div className="text-center p-2 bg-orange-50 rounded-lg">
            <div className="text-xl font-bold text-orange-600">{severityCounts.HIGH}</div>
            <div className="text-xs text-orange-800">High</div>
          </div>
          <div className="text-center p-2 bg-yellow-50 rounded-lg">
            <div className="text-xl font-bold text-yellow-600">{severityCounts.MEDIUM}</div>
            <div className="text-xs text-yellow-800">Medium</div>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <div className="text-xl font-bold text-blue-600">{severityCounts.LOW}</div>
            <div className="text-xs text-blue-800">Low</div>
          </div>
        </div>

        <ScrollArea className="h-[300px]">
          <div className="space-y-3">
            {filteredFindings.map((finding) => (
              <div
                key={finding.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={finding.severity} />
                    <StatusBadge status={finding.status} />
                  </div>
                  <p className="text-sm font-medium">{finding.title}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span>{finding.entityType}</span>
                    {finding.riskScore && (
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Risk: {finding.riskScore}
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {filteredFindings.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p>No open findings</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Compliance Alert Queue Component
// ============================================

function ComplianceAlertQueue() {
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const statusFilters: Record<string, string[]> = {
    open: ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'],
    all: [],
    resolved: ['RESOLVED', 'DISMISSED'],
  };

  const { data, isLoading, refetch } = trpc.aiQA.getComplianceAlerts.useQuery({
    status: statusFilters[statusFilter].length > 0 ? statusFilters[statusFilter] as any : undefined,
    limit: 20,
  });

  const { data: complianceDashboard } = trpc.aiQA.getComplianceDashboard.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const alerts = data?.alerts || [];
  const alertCounts = complianceDashboard?.alerts || { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Compliance Alert Queue
            </CardTitle>
            <CardDescription>
              {alertCounts.total} open alerts requiring attention
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Alert Severity Summary */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
            <div className="text-lg font-bold text-red-600">{alertCounts.critical}</div>
            <div className="text-xs text-red-800">Critical</div>
          </div>
          <div className="text-center p-2 bg-orange-50 rounded-lg border border-orange-200">
            <div className="text-lg font-bold text-orange-600">{alertCounts.high}</div>
            <div className="text-xs text-orange-800">High</div>
          </div>
          <div className="text-center p-2 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-lg font-bold text-yellow-600">{alertCounts.medium}</div>
            <div className="text-xs text-yellow-800">Medium</div>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-lg font-bold text-blue-600">{alertCounts.low}</div>
            <div className="text-xs text-blue-800">Low</div>
          </div>
        </div>

        <ScrollArea className="h-[300px]">
          <div className="space-y-3">
            {alerts.map((alert: any) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={alert.severity} />
                    <StatusBadge status={alert.status} />
                    <Badge variant="outline" className="text-xs">
                      {alert.type?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{alert.title || alert.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p>No compliance alerts</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Provider Quality Comparison Component
// ============================================

function ProviderQualityComparison() {
  const { data, isLoading } = trpc.aiQA.getProviderQualityComparison.useQuery({});
  const { data: codingData } = trpc.aiQA.getProviderCodingAccuracy.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const providers = data?.providers || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Provider Quality Comparison
        </CardTitle>
        <CardDescription>
          Compare quality metrics across providers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-center">Overall</TableHead>
              <TableHead className="text-center">Documentation</TableHead>
              <TableHead className="text-center">Coding</TableHead>
              <TableHead className="text-center">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider: any, index: number) => (
              <TableRow key={provider.providerId}>
                <TableCell className="font-medium">
                  <Badge variant={index < 3 ? 'default' : 'outline'}>
                    #{index + 1}
                  </Badge>
                </TableCell>
                <TableCell>{provider.providerName}</TableCell>
                <TableCell className="text-center">
                  <span className={`font-bold ${
                    provider.overallScore >= 90 ? 'text-green-600' :
                    provider.overallScore >= 75 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {provider.overallScore?.toFixed(0) || 'N/A'}%
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {provider.documentationScore?.toFixed(0) || 'N/A'}%
                </TableCell>
                <TableCell className="text-center">
                  {provider.codingScore?.toFixed(0) || 'N/A'}%
                </TableCell>
                <TableCell className="text-center">
                  {provider.trend === 'IMPROVING' ? (
                    <TrendingUp className="h-4 w-4 text-green-600 inline" />
                  ) : provider.trend === 'DECLINING' ? (
                    <TrendingDown className="h-4 w-4 text-red-600 inline" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No provider data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {data?.organizationAverages && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-sm font-medium mb-2">Organization Average</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold">{data.organizationAverages.avgOverallScore?.toFixed(0) || 'N/A'}%</div>
                <div className="text-xs text-muted-foreground">Overall</div>
              </div>
              <div>
                <div className="text-lg font-bold">{data.organizationAverages.avgOutcomeImprovement?.toFixed(0) || 'N/A'}%</div>
                <div className="text-xs text-muted-foreground">Outcome</div>
              </div>
              <div>
                <div className="text-lg font-bold">{data.organizationAverages.avgSatisfactionScore?.toFixed(1) || 'N/A'}</div>
                <div className="text-xs text-muted-foreground">Satisfaction</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Risk Indicators Component
// ============================================

function RiskIndicators() {
  const { data, isLoading } = trpc.aiQA.getRiskDashboard.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getRiskColor = (level: string | null) => {
    if (!level) return 'gray';
    if (level === 'CRITICAL' || level === 'HIGH_RISK') return 'red';
    if (level === 'HIGH' || level === 'MODERATE_RISK') return 'orange';
    if (level === 'MEDIUM' || level === 'LOW_RISK') return 'yellow';
    return 'green';
  };

  const riskLevel = data?.currentRiskLevel || 'Unknown';
  const riskScore = data?.currentRiskScore;
  const color = getRiskColor(riskLevel);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Risk Indicators
        </CardTitle>
        <CardDescription>
          Current risk assessment and trends
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Risk Score Circle */}
        <div className={`text-center p-6 rounded-lg mb-6 bg-${color}-50`}>
          <div className={`text-4xl font-bold text-${color}-600`}>
            {riskScore !== null && riskScore !== undefined ? riskScore.toFixed(0) : 'N/A'}
          </div>
          <div className={`text-sm text-${color}-800 mt-1`}>
            Risk Score
          </div>
          <Badge className={`mt-2 bg-${color}-100 text-${color}-800`}>
            {riskLevel}
          </Badge>
        </div>

        {/* Risk Breakdown */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm">High-Risk Findings</span>
            <Badge variant="destructive">{data?.openHighRiskFindings?.length || 0}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Mitigations In Progress</span>
            <Badge variant="secondary">{data?.mitigationsInProgress || 0}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Recently Resolved</span>
            <Badge variant="default" className="bg-green-600">{data?.resolvedRisks || 0}</Badge>
          </div>
        </div>

        {/* Recent Risk Trends */}
        {data?.riskTrends && data.riskTrends.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Risk Score Trends</h4>
            <div className="space-y-2">
              {data.riskTrends.slice(0, 5).map((trend: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {format(new Date(trend.periodStart), 'MMM d')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Progress value={100 - trend.score} className="w-24 h-2" />
                    <span className="font-medium w-12 text-right">
                      {(100 - trend.score).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Quality Trend Charts Component
// ============================================

function QualityTrendCharts() {
  const [metricType, setMetricType] = useState<string>('CLINICAL_QUALITY_OVERALL');

  const { data, isLoading } = trpc.aiQA.getQualityScoreHistory.useQuery({
    metricType: metricType as any,
    limit: 12,
  });

  const { data: complianceTrends } = trpc.aiQA.getComplianceScoreTrending.useQuery({
    limit: 6,
  });

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const scores = data?.history || [];

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Quality Trend Analysis
            </CardTitle>
            <CardDescription>
              Track quality metrics over time
            </CardDescription>
          </div>
          <Select value={metricType} onValueChange={setMetricType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CLINICAL_QUALITY_OVERALL">Overall Quality</SelectItem>
              <SelectItem value="OUTCOME_TRACKING">Outcome Tracking</SelectItem>
              <SelectItem value="TREATMENT_EFFECTIVENESS">Treatment Effectiveness</SelectItem>
              <SelectItem value="DOCUMENTATION_COMPLETENESS">Documentation</SelectItem>
              <SelectItem value="CODING_ACCURACY">Coding Accuracy</SelectItem>
              <SelectItem value="COMPLIANCE_OVERALL">Compliance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {/* Simple trend visualization */}
        <div className="space-y-3">
          {scores.map((item: any, index: number) => (
            <div key={index} className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground w-20">
                {format(new Date(item.periodStart), 'MMM yyyy')}
              </span>
              <div className="flex-1">
                <Progress value={item.overallScore} className="h-6" />
              </div>
              <span className="text-sm font-medium w-16 text-right">
                {item.overallScore?.toFixed(1)}%
              </span>
            </div>
          ))}
          {scores.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No trend data available</p>
            </div>
          )}
        </div>

        {/* Compliance Score Summary */}
        {complianceTrends?.history && complianceTrends.history.length > 0 && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-3">Compliance Score Trends</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold">{complianceTrends.currentScore?.toFixed(0) || 'N/A'}%</div>
                <div className="text-xs text-muted-foreground">Current</div>
              </div>
              <div>
                <div className="text-lg font-bold">{complianceTrends.averageScore?.toFixed(0) || 'N/A'}%</div>
                <div className="text-xs text-muted-foreground">6-Month Avg</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${
                  complianceTrends.trend === 'IMPROVING' ? 'text-green-600' :
                  complianceTrends.trend === 'DECLINING' ? 'text-red-600' :
                  ''
                }`}>
                  {complianceTrends.trend || 'STABLE'}
                </div>
                <div className="text-xs text-muted-foreground">Trend</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Action Item Tracking Component
// ============================================

function ActionItemTracking() {
  const { data, isLoading } = trpc.aiQA.getRiskMitigationTracking.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const statusCounts = data?.statusCounts as { open?: number; inReview?: number; inProgress?: number; resolved?: number } || {};
  const findings = data?.findings || [];

  const totalOpen = (statusCounts.open || 0) + (statusCounts.inReview || 0);
  const totalInProgress = statusCounts.inProgress || 0;
  const totalResolved = statusCounts.resolved || 0;
  const mitigationRate = data?.mitigationRate || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Action Item Tracking
        </CardTitle>
        <CardDescription>
          Track remediation and improvement actions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{totalOpen}</div>
            <div className="text-xs text-red-800">Open</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{totalInProgress}</div>
            <div className="text-xs text-yellow-800">In Progress</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{totalResolved}</div>
            <div className="text-xs text-green-800">Resolved</div>
          </div>
        </div>

        {/* Mitigation Rate */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Mitigation Rate</span>
            <span className="font-medium">{mitigationRate.toFixed(0)}%</span>
          </div>
          <Progress value={mitigationRate} className="h-2" />
        </div>

        {/* Open Items List */}
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {findings.slice(0, 10).map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded border hover:bg-accent/50"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-sm truncate max-w-[200px]">{item.title}</span>
                </div>
                <SeverityBadge severity={item.severity} />
              </div>
            ))}
            {findings.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>All action items resolved!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Audit Schedule & History Component
// ============================================

function AuditScheduleHistory() {
  const [auditType, setAuditType] = useState<string>('all');

  const { data: documentationAudits, isLoading: docLoading } = trpc.aiQA.getDocumentationAuditHistory.useQuery({
    limit: 5,
  });

  const { data: codingAudits, isLoading: codingLoading } = trpc.aiQA.getCodingAuditHistory.useQuery({
    limit: 5,
  });

  const { data: clinicalAudits, isLoading: clinicalLoading } = trpc.aiQA.getClinicalQualityAuditHistory.useQuery({
    limit: 5,
  });

  const { data: auditPrepHistory, isLoading: prepLoading } = trpc.aiQA.getAuditPreparationHistory.useQuery({
    limit: 5,
  });

  const isLoading = docLoading || codingLoading || clinicalLoading || prepLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Combine all audits
  const allAudits = [
    ...(documentationAudits?.audits || []).map((a: any) => ({ ...a, type: 'DOCUMENTATION' })),
    ...(codingAudits?.audits || []).map((a: any) => ({ ...a, type: 'CODING' })),
    ...(clinicalAudits?.audits || []).map((a: any) => ({ ...a, type: 'CLINICAL' })),
    ...(auditPrepHistory?.audits || []).map((a: any) => ({ ...a, type: 'AUDIT_PREPARATION' })),
  ].sort((a, b) => new Date(b.auditDate || b.createdAt).getTime() - new Date(a.auditDate || a.createdAt).getTime());

  const filteredAudits = auditType === 'all'
    ? allAudits
    : allAudits.filter(a => a.type === auditType);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Audit Schedule & History
            </CardTitle>
            <CardDescription>
              Past audits and upcoming schedule
            </CardDescription>
          </div>
          <Select value={auditType} onValueChange={setAuditType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="DOCUMENTATION">Documentation</SelectItem>
              <SelectItem value="CODING">Coding</SelectItem>
              <SelectItem value="CLINICAL">Clinical</SelectItem>
              <SelectItem value="AUDIT_PREPARATION">Audit Prep</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px]">
          <div className="space-y-3">
            {filteredAudits.slice(0, 15).map((audit: any) => (
              <div
                key={audit.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AuditTypeBadge type={audit.type || audit.auditType} />
                    <StatusBadge status={audit.status} />
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(audit.auditDate || audit.createdAt), 'MMM d, yyyy')}
                    </span>
                    {audit.score !== null && audit.score !== undefined && (
                      <span className={`font-medium ${
                        audit.score >= 90 ? 'text-green-600' :
                        audit.score >= 75 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        Score: {audit.score.toFixed(0)}%
                      </span>
                    )}
                    {audit.findingsCount !== undefined && (
                      <span className="text-muted-foreground">
                        {audit.findingsCount} findings
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {filteredAudits.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit history available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

export function QAAgentDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: complianceData, isLoading: complianceLoading } = trpc.aiQA.getComplianceDashboard.useQuery();
  const { data: qualityData, isLoading: qualityLoading } = trpc.aiQA.getClinicalQualityDashboard.useQuery({});
  const { data: riskData, isLoading: riskLoading } = trpc.aiQA.getRiskDashboard.useQuery({});

  const isLoading = complianceLoading || qualityLoading || riskLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const alertCount = complianceData?.alerts.total || 0;
  const openFindings = riskData?.openHighRiskFindings?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-[#053e67]" />
            AI Quality Assurance Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor documentation, coding, compliance, and clinical quality
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <Activity className="h-3 w-3 mr-1" />
            QA Agent Active
          </Badge>
          {alertCount > 0 && (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" />
              {alertCount} alerts
            </Badge>
          )}
          {openFindings > 0 && (
            <Badge variant="secondary">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {openFindings} findings
            </Badge>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QualityScoreCard
          title="Compliance Score"
          score={complianceData?.scores.overall || null}
          icon={Shield}
          benchmark={85}
        />
        <QualityScoreCard
          title="Clinical Quality"
          score={qualityData?.scores.overall || null}
          icon={Heart}
          trend={qualityData?.trends.overall}
          benchmark={80}
        />
        <QualityScoreCard
          title="Documentation"
          score={qualityData?.scores.outcomeTracking || null}
          icon={FileText}
          trend={qualityData?.trends.outcomeTracking}
        />
        <QualityScoreCard
          title="Risk Level"
          score={riskData?.currentRiskScore !== null && riskData?.currentRiskScore !== undefined ? 100 - riskData.currentRiskScore : null}
          icon={ShieldAlert}
          subtitle={riskData?.currentRiskLevel || 'Unknown'}
        />
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="findings" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Findings</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Providers</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Trends</span>
          </TabsTrigger>
          <TabsTrigger value="audits" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Audits</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverallQualityScore />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AuditFindingsSummary />
            <ComplianceAlertQueue />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RiskIndicators />
            <ActionItemTracking />
          </div>
        </TabsContent>

        <TabsContent value="findings" className="space-y-6">
          <AuditFindingsSummary />
          <ActionItemTracking />
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <ComplianceAlertQueue />
          <RiskIndicators />
        </TabsContent>

        <TabsContent value="providers" className="space-y-6">
          <ProviderQualityComparison />
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <QualityTrendCharts />
        </TabsContent>

        <TabsContent value="audits" className="space-y-6">
          <AuditScheduleHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
