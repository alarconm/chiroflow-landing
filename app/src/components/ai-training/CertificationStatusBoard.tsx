'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  Award,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Bell,
  RefreshCw,
  FileText,
  Users,
  AlertCircle,
} from 'lucide-react';

interface Certification {
  id: string;
  userId: string;
  userName: string;
  certType: string;
  certName: string;
  earnedDate: string;
  expirationDate: string;
  status: 'current' | 'expiring_soon' | 'expired';
  daysUntilExpiration: number;
  certificateNumber?: string;
  renewalUrl?: string;
}

interface ExpirationAlert {
  id: string;
  userId: string;
  userName: string;
  certType: string;
  certName: string;
  expirationDate: string;
  daysUntilExpiration: number;
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'expired';
  reminderSent: boolean;
}

// Demo data
const demoCertifications: Certification[] = [
  {
    id: '1',
    userId: 'user1',
    userName: 'Sarah Johnson',
    certType: 'HIPAA_PRIVACY',
    certName: 'HIPAA Privacy Training',
    earnedDate: '2024-01-15',
    expirationDate: '2025-01-15',
    status: 'current',
    daysUntilExpiration: 358,
    certificateNumber: 'HIPAA-2024-001',
  },
  {
    id: '2',
    userId: 'user1',
    userName: 'Sarah Johnson',
    certType: 'BILLING_COMPLIANCE',
    certName: 'Billing Compliance',
    earnedDate: '2024-02-01',
    expirationDate: '2025-02-01',
    status: 'current',
    daysUntilExpiration: 375,
    certificateNumber: 'BILL-2024-015',
  },
  {
    id: '3',
    userId: 'user2',
    userName: 'Mike Chen',
    certType: 'HIPAA_PRIVACY',
    certName: 'HIPAA Privacy Training',
    earnedDate: '2023-06-01',
    expirationDate: '2024-06-01',
    status: 'current',
    daysUntilExpiration: 132,
    certificateNumber: 'HIPAA-2023-045',
  },
  {
    id: '4',
    userId: 'user3',
    userName: 'Emily Davis',
    certType: 'WORKPLACE_SAFETY',
    certName: 'Workplace Safety',
    earnedDate: '2023-12-01',
    expirationDate: '2024-02-15',
    status: 'expiring_soon',
    daysUntilExpiration: 24,
    certificateNumber: 'SAFE-2023-089',
  },
  {
    id: '5',
    userId: 'user4',
    userName: 'James Wilson',
    certType: 'HIPAA_SECURITY',
    certName: 'HIPAA Security Training',
    earnedDate: '2022-12-01',
    expirationDate: '2023-12-01',
    status: 'expired',
    daysUntilExpiration: -52,
    certificateNumber: 'HIPAA-SEC-2022-012',
  },
  {
    id: '6',
    userId: 'user4',
    userName: 'James Wilson',
    certType: 'BILLING_COMPLIANCE',
    certName: 'Billing Compliance',
    earnedDate: '2023-03-15',
    expirationDate: '2024-03-15',
    status: 'expiring_soon',
    daysUntilExpiration: 53,
    certificateNumber: 'BILL-2023-078',
  },
];

const demoExpirationAlerts: ExpirationAlert[] = [
  {
    id: '1',
    userId: 'user4',
    userName: 'James Wilson',
    certType: 'HIPAA_SECURITY',
    certName: 'HIPAA Security Training',
    expirationDate: '2023-12-01',
    daysUntilExpiration: -52,
    urgency: 'expired',
    reminderSent: true,
  },
  {
    id: '2',
    userId: 'user3',
    userName: 'Emily Davis',
    certType: 'WORKPLACE_SAFETY',
    certName: 'Workplace Safety',
    expirationDate: '2024-02-15',
    daysUntilExpiration: 24,
    urgency: 'critical',
    reminderSent: false,
  },
  {
    id: '3',
    userId: 'user4',
    userName: 'James Wilson',
    certType: 'BILLING_COMPLIANCE',
    certName: 'Billing Compliance',
    expirationDate: '2024-03-15',
    daysUntilExpiration: 53,
    urgency: 'high',
    reminderSent: false,
  },
];

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusBadge(status: Certification['status']) {
  switch (status) {
    case 'current':
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Current</Badge>;
    case 'expiring_soon':
      return <Badge className="bg-yellow-500 text-white"><Clock className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
    case 'expired':
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
  }
}

function getUrgencyBadge(urgency: ExpirationAlert['urgency']) {
  switch (urgency) {
    case 'expired':
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />EXPIRED</Badge>;
    case 'critical':
      return <Badge className="bg-red-500"><AlertCircle className="h-3 w-3 mr-1" />Critical</Badge>;
    case 'high':
      return <Badge className="bg-orange-500 text-white"><Clock className="h-3 w-3 mr-1" />High</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-500 text-white"><Clock className="h-3 w-3 mr-1" />Medium</Badge>;
    case 'low':
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Low</Badge>;
  }
}

function getCertTypeIcon(certType: string) {
  switch (certType) {
    case 'HIPAA_PRIVACY':
    case 'HIPAA_SECURITY':
      return <Shield className="h-4 w-4 text-blue-600" />;
    case 'BILLING_COMPLIANCE':
      return <FileText className="h-4 w-4 text-green-600" />;
    case 'WORKPLACE_SAFETY':
    case 'BLOOD_BORNE_PATHOGENS':
      return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    default:
      return <Award className="h-4 w-4 text-purple-600" />;
  }
}

interface CertificationStatusBoardProps {
  showDemoData?: boolean;
}

export function CertificationStatusBoard({ showDemoData = true }: CertificationStatusBoardProps) {
  const [certTypeFilter, setCertTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  // Use demo data
  const certifications = showDemoData ? demoCertifications : [];
  const expirationAlerts = showDemoData ? demoExpirationAlerts : [];
  const isLoading = false;

  // Apply filters
  const filteredCertifications = certifications.filter((cert) => {
    if (certTypeFilter !== 'all' && cert.certType !== certTypeFilter) return false;
    if (statusFilter !== 'all' && cert.status !== statusFilter) return false;
    return true;
  });

  // Calculate summary stats
  const totalCerts = certifications.length;
  const currentCerts = certifications.filter((c) => c.status === 'current').length;
  const expiringCerts = certifications.filter((c) => c.status === 'expiring_soon').length;
  const expiredCerts = certifications.filter((c) => c.status === 'expired').length;
  const complianceRate = totalCerts > 0 ? Math.round((currentCerts / totalCerts) * 100) : 0;

  const handleSendReminder = async (alertId: string) => {
    setSendingReminder(alertId);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSendingReminder(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Certs</p>
                <p className="text-2xl font-bold">{totalCerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Current</p>
                <p className="text-2xl font-bold">{currentCerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-muted-foreground">Expiring</p>
                <p className="text-2xl font-bold">{expiringCerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold">{expiredCerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Compliance</p>
                <p className="text-2xl font-bold">{complianceRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiration Alerts */}
      {expirationAlerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <Bell className="h-5 w-5" />
              Expiration Alerts ({expirationAlerts.length})
            </CardTitle>
            <CardDescription className="text-orange-600">
              Certifications requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expirationAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {getCertTypeIcon(alert.certType)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{alert.userName}</p>
                        {getUrgencyBadge(alert.urgency)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {alert.certName} • Expires {formatDate(alert.expirationDate)}
                        {alert.daysUntilExpiration > 0 && (
                          <span className="ml-2">({alert.daysUntilExpiration} days)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {alert.reminderSent ? (
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Reminded
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendReminder(alert.id)}
                        disabled={sendingReminder === alert.id}
                      >
                        {sendingReminder === alert.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bell className="h-4 w-4 mr-1" />
                        )}
                        Send Reminder
                      </Button>
                    )}
                    <Button size="sm">
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Renew
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Certifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Certification Status Board
              </CardTitle>
              <CardDescription>All staff certifications and compliance status</CardDescription>
            </div>

            <div className="flex gap-2">
              <Select value={certTypeFilter} onValueChange={setCertTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Certification Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="HIPAA_PRIVACY">HIPAA Privacy</SelectItem>
                  <SelectItem value="HIPAA_SECURITY">HIPAA Security</SelectItem>
                  <SelectItem value="BILLING_COMPLIANCE">Billing Compliance</SelectItem>
                  <SelectItem value="WORKPLACE_SAFETY">Workplace Safety</SelectItem>
                  <SelectItem value="BLOOD_BORNE_PATHOGENS">Blood Borne Pathogens</SelectItem>
                  <SelectItem value="CUSTOMER_SERVICE">Customer Service</SelectItem>
                  <SelectItem value="EHR_PROFICIENCY">EHR Proficiency</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead>Earned</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Certificate #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCertifications.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {cert.userName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getCertTypeIcon(cert.certType)}
                      {cert.certName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(cert.earnedDate)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(cert.expirationDate)}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(cert.status)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {cert.certificateNumber || '-'}
                  </TableCell>
                </TableRow>
              ))}

              {filteredCertifications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Award className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No certifications found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
