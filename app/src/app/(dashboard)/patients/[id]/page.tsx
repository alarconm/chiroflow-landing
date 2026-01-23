'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, differenceInYears } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Shield,
  Users,
  FileText,
  Clock,
  User,
  MoreHorizontal,
  Archive,
  Undo,
  Plus,
  Stethoscope,
  Watch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DocumentList, InsuranceForm } from '@/components/patients';
import type { InsuranceFormData } from '@/components/patients/InsuranceForm';
import { ClinicalHistoryView } from '@/components/clinical';
import { PatientEligibilityCard } from '@/components/clearinghouse';
import { WearableDataDashboard } from '@/components/wearables';
import { usePermissions } from '@/hooks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  INACTIVE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ARCHIVED: 'bg-stone-100 text-stone-800 border-stone-200',
  DECEASED: 'bg-red-100 text-red-800 border-red-200',
};

const insuranceTypeLabels: Record<string, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  TERTIARY: 'Tertiary',
};

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const [activeTab, setActiveTab] = useState('overview');
  const [isInsuranceDialogOpen, setIsInsuranceDialogOpen] = useState(false);
  const [isFamilyDialogOpen, setIsFamilyDialogOpen] = useState(false);
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [selectedRelationship, setSelectedRelationship] = useState('');
  const { isAtLeast } = usePermissions();
  const canDeleteDocuments = isAtLeast('ADMIN');

  const { data: patient, isLoading, refetch } = trpc.patient.get.useQuery(
    { id: patientId },
    { enabled: !!patientId }
  );

  const { data: household } = trpc.patient.getHousehold.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  const archiveMutation = trpc.patient.archive.useMutation({
    onSuccess: () => {
      toast.success('Patient archived');
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const restoreMutation = trpc.patient.restore.useMutation({
    onSuccess: () => {
      toast.success('Patient restored');
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const createInsuranceMutation = trpc.patient.addInsurance.useMutation({
    onSuccess: () => {
      toast.success('Insurance added successfully');
      setIsInsuranceDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAddInsurance = async (data: InsuranceFormData) => {
    createInsuranceMutation.mutate({
      patientId,
      insurance: {
        payerName: data.payerName,
        policyNumber: data.policyNumber,
        type: data.type,
        payerId: data.payerId || undefined,
        planName: data.planName || undefined,
        planType: data.planType || undefined,
        groupNumber: data.groupNumber || undefined,
        subscriberRelationship: data.subscriberRelationship,
        subscriberId: data.subscriberId || undefined,
        subscriberFirstName: data.subscriberFirstName || undefined,
        subscriberLastName: data.subscriberLastName || undefined,
        subscriberDob: data.subscriberDob || undefined,
        effectiveDate: data.effectiveDate || undefined,
        terminationDate: data.terminationDate || undefined,
        copay: data.copay || undefined,
        deductible: data.deductible || undefined,
        deductibleMet: data.deductibleMet || undefined,
        outOfPocketMax: data.outOfPocketMax || undefined,
        outOfPocketMet: data.outOfPocketMet || undefined,
      },
    });
  };

  const handleAddFamilyMember = () => {
    // For now, show toast and close dialog - full implementation would require patient search
    toast.info('Family member linking will be available in the next update');
    setIsFamilyDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-10">
        <p className="text-stone-500">Patient not found</p>
        <Link href="/patients">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Button>
        </Link>
      </div>
    );
  }

  const age = patient.demographics?.dateOfBirth
    ? differenceInYears(new Date(), new Date(patient.demographics.dateOfBirth))
    : null;

  const primaryContact = patient.contacts?.find((c) => c.isPrimary) || patient.contacts?.[0];
  const primaryInsurance = patient.insurances?.find((i) => i.type === 'PRIMARY' && i.isActive);
  const secondaryInsurance = patient.insurances?.find((i) => i.type === 'SECONDARY' && i.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/patients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
              <Link href="/patients" className="hover:text-[#053e67]">
                Patients
              </Link>
              <span>/</span>
              <span>{patient.mrn}</span>
            </div>
            {/* Name and status */}
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-stone-900">
                {patient.demographics?.lastName}, {patient.demographics?.firstName}
                {patient.demographics?.preferredName && (
                  <span className="font-normal text-stone-500">
                    {' '}
                    ({patient.demographics.preferredName})
                  </span>
                )}
              </h1>
              <Badge className={cn('font-medium', statusColors[patient.status])}>
                {patient.status}
              </Badge>
            </div>
            {/* Quick info */}
            <div className="flex items-center gap-4 mt-1 text-sm text-stone-500">
              <span>MRN: {patient.mrn}</span>
              {age !== null && <span>{age} years old</span>}
              {patient.demographics?.gender && (
                <span className="capitalize">
                  {patient.demographics.gender.toLowerCase().replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href={`/patients/${patientId}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info('Coming soon')}>
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Appointment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Coming soon')}>
                <Mail className="h-4 w-4 mr-2" />
                Send Message
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {patient.status === 'ARCHIVED' ? (
                <DropdownMenuItem
                  onClick={() => restoreMutation.mutate({ id: patientId })}
                >
                  <Undo className="h-4 w-4 mr-2" />
                  Restore Patient
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm('Are you sure you want to archive this patient?')) {
                      archiveMutation.mutate({ id: patientId });
                    }
                  }}
                  className="text-red-600"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Patient
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-1">
            <Stethoscope className="h-4 w-4" />
            Clinical
          </TabsTrigger>
          <TabsTrigger value="wearables" className="flex items-center gap-1">
            <Watch className="h-4 w-4" />
            Wearables
          </TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="family">Family</TabsTrigger>
          <TabsTrigger value="history">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-[#053e67]" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {primaryContact ? (
                  <>
                    {primaryContact.mobilePhone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-stone-400" />
                        <span>{primaryContact.mobilePhone}</span>
                        <Badge variant="secondary" className="text-xs">Mobile</Badge>
                      </div>
                    )}
                    {primaryContact.homePhone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-stone-400" />
                        <span>{primaryContact.homePhone}</span>
                        <Badge variant="secondary" className="text-xs">Home</Badge>
                      </div>
                    )}
                    {primaryContact.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-stone-400" />
                        <span>{primaryContact.email}</span>
                      </div>
                    )}
                    {primaryContact.addressLine1 && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-stone-400 mt-0.5" />
                        <div>
                          <p>{primaryContact.addressLine1}</p>
                          {primaryContact.addressLine2 && (
                            <p>{primaryContact.addressLine2}</p>
                          )}
                          <p>
                            {primaryContact.city}, {primaryContact.state}{' '}
                            {primaryContact.zipCode}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-stone-500">No contact information on file</p>
                )}
              </CardContent>
            </Card>

            {/* Insurance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#053e67]" />
                  Insurance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {primaryInsurance ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-stone-500">Primary Insurance</p>
                      <p className="font-medium">{primaryInsurance.payerName}</p>
                      <p className="text-sm">Policy: {primaryInsurance.policyNumber}</p>
                    </div>
                    {secondaryInsurance && (
                      <div className="pt-3 border-t">
                        <p className="text-sm text-stone-500">Secondary Insurance</p>
                        <p className="font-medium">{secondaryInsurance.payerName}</p>
                        <p className="text-sm">Policy: {secondaryInsurance.policyNumber}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-500">No insurance on file</p>
                )}
              </CardContent>
            </Card>

            {/* Emergency Contacts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-5 w-5 text-[#053e67]" />
                  Emergency Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {patient.emergencyContacts?.length ? (
                  <div className="space-y-3">
                    {patient.emergencyContacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-stone-500">{contact.relationship}</p>
                        </div>
                        <p className="text-sm">{contact.phone}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-stone-500">No emergency contacts on file</p>
                )}
              </CardContent>
            </Card>

            {/* Family/Household */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#053e67]" />
                  Family Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {household?.members && household.members.length > 1 ? (
                  <div className="space-y-3">
                    {household.members
                      .filter((m) => m.patientId !== patientId)
                      .map((member) => (
                        <Link
                          key={member.id}
                          href={`/patients/${member.patientId}`}
                          className="flex items-center justify-between hover:bg-stone-50 p-2 rounded -mx-2"
                        >
                          <div>
                            <p className="font-medium">
                              {member.patient.demographics?.firstName}{' '}
                              {member.patient.demographics?.lastName}
                            </p>
                            <p className="text-sm text-stone-500 capitalize">
                              {member.relationship.toLowerCase()}
                            </p>
                          </div>
                          {member.isHeadOfHouse && (
                            <Badge variant="secondary">Head of House</Badge>
                          )}
                        </Link>
                      ))}
                  </div>
                ) : (
                  <p className="text-stone-500">No family members linked</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clinical Tab */}
        <TabsContent value="clinical">
          <ClinicalHistoryView patientId={patientId} />
        </TabsContent>

        {/* Wearables Tab */}
        <TabsContent value="wearables">
          <WearableDataDashboard patientId={patientId} />
        </TabsContent>

        {/* Demographics Tab */}
        <TabsContent value="demographics">
          <Card>
            <CardHeader>
              <CardTitle>Demographics</CardTitle>
              <CardDescription>
                Patient personal information and demographics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-stone-500">Full Name</p>
                    <p className="font-medium">
                      {patient.demographics?.firstName}{' '}
                      {patient.demographics?.middleName}{' '}
                      {patient.demographics?.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Preferred Name</p>
                    <p className="font-medium">
                      {patient.demographics?.preferredName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Date of Birth</p>
                    <p className="font-medium">
                      {patient.demographics?.dateOfBirth
                        ? format(new Date(patient.demographics.dateOfBirth), 'MMMM d, yyyy')
                        : '-'}
                      {age !== null && ` (${age} years old)`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Gender</p>
                    <p className="font-medium capitalize">
                      {patient.demographics?.gender?.toLowerCase().replace('_', ' ') || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Pronouns</p>
                    <p className="font-medium">
                      {patient.demographics?.pronouns || '-'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-stone-500">SSN (Last 4)</p>
                    <p className="font-medium">
                      {patient.demographics?.ssnLast4
                        ? `***-**-${patient.demographics.ssnLast4}`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Language</p>
                    <p className="font-medium">
                      {patient.demographics?.language?.toUpperCase() || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Marital Status</p>
                    <p className="font-medium capitalize">
                      {patient.demographics?.maritalStatus || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Occupation</p>
                    <p className="font-medium">
                      {patient.demographics?.occupation || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Employer</p>
                    <p className="font-medium">
                      {patient.demographics?.employer || '-'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Tab */}
        <TabsContent value="insurance" className="space-y-6">
          {patient.insurances?.filter((i) => i.isActive).length ? (
            patient.insurances
              .filter((i) => i.isActive)
              .map((insurance) => (
                <div key={insurance.id} className="space-y-4">
                  {/* Insurance Policy Card */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {insuranceTypeLabels[insurance.type]} Insurance
                        </CardTitle>
                        <Badge
                          variant={insurance.verifiedAt ? 'default' : 'secondary'}
                          className={insurance.verifiedAt ? 'bg-green-500' : ''}
                        >
                          {insurance.verifiedAt ? 'Verified' : 'Unverified'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <p className="text-sm text-stone-500">Insurance Company</p>
                          <p className="font-medium">{insurance.payerName}</p>
                        </div>
                        <div>
                          <p className="text-sm text-stone-500">Plan Name</p>
                          <p className="font-medium">{insurance.planName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-stone-500">Plan Type</p>
                          <p className="font-medium">{insurance.planType || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-stone-500">Policy Number</p>
                          <p className="font-medium">{insurance.policyNumber}</p>
                        </div>
                        <div>
                          <p className="text-sm text-stone-500">Group Number</p>
                          <p className="font-medium">{insurance.groupNumber || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-stone-500">Subscriber Relationship</p>
                          <p className="font-medium capitalize">
                            {insurance.subscriberRelationship.toLowerCase()}
                          </p>
                        </div>
                        {insurance.copay && (
                          <div>
                            <p className="text-sm text-stone-500">Copay</p>
                            <p className="font-medium">
                              ${parseFloat(insurance.copay.toString()).toFixed(2)}
                            </p>
                          </div>
                        )}
                        {insurance.deductible && (
                          <div>
                            <p className="text-sm text-stone-500">Deductible</p>
                            <p className="font-medium">
                              ${parseFloat(insurance.deductible.toString()).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Eligibility Status Card */}
                  <PatientEligibilityCard
                    patientId={patientId}
                    insuranceId={insurance.id}
                    insuranceName={insurance.payerName || undefined}
                    insuranceType={insurance.type as 'PRIMARY' | 'SECONDARY' | 'TERTIARY'}
                  />
                </div>
              ))
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <Shield className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 mb-4">No insurance on file</p>
                <Button variant="outline" onClick={() => setIsInsuranceDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Insurance
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#053e67]" />
                Documents
              </CardTitle>
              <CardDescription>
                Patient documents, insurance cards, and forms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentList patientId={patientId} canDelete={canDeleteDocuments} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Family Tab */}
        <TabsContent value="family">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#053e67]" />
                Family / Household
              </CardTitle>
              <CardDescription>
                Linked family members and household billing
              </CardDescription>
            </CardHeader>
            <CardContent>
              {household?.members && household.members.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-stone-50 rounded-lg">
                    <p className="text-sm text-stone-500">Household Name</p>
                    <p className="font-medium">{household.name || 'Unnamed Household'}</p>
                  </div>
                  <div className="divide-y">
                    {household.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-stone-200 flex items-center justify-center">
                            <User className="h-5 w-5 text-stone-500" />
                          </div>
                          <div>
                            <Link
                              href={`/patients/${member.patientId}`}
                              className="font-medium hover:text-[#053e67]"
                            >
                              {member.patient.demographics?.firstName}{' '}
                              {member.patient.demographics?.lastName}
                              {member.patientId === patientId && ' (Current)'}
                            </Link>
                            <p className="text-sm text-stone-500 capitalize">
                              {member.relationship.toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.isHeadOfHouse && (
                            <Badge variant="outline">Head of House</Badge>
                          )}
                          {member.isGuarantor && (
                            <Badge variant="outline">Guarantor</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <Users className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-500 mb-4">
                    No family members linked to this patient
                  </p>
                  <Button variant="outline" onClick={() => setIsFamilyDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Family Member
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#053e67]" />
                Activity History
              </CardTitle>
              <CardDescription>
                Recent patient activity and audit log
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-10 text-center">
                <Clock className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500">
                  Activity history will be displayed here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Insurance Dialog */}
      <Dialog open={isInsuranceDialogOpen} onOpenChange={setIsInsuranceDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#053e67]" />
              Add Insurance
            </DialogTitle>
            <DialogDescription>
              Add a new insurance policy for this patient
            </DialogDescription>
          </DialogHeader>
          <InsuranceForm
            onSubmit={handleAddInsurance}
            isLoading={createInsuranceMutation.isPending}
            mode="create"
          />
        </DialogContent>
      </Dialog>

      {/* Add Family Member Dialog */}
      <Dialog open={isFamilyDialogOpen} onOpenChange={setIsFamilyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#053e67]" />
              Add Family Member
            </DialogTitle>
            <DialogDescription>
              Link an existing patient as a family member
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="familySearch">Search Patient</Label>
              <Input
                id="familySearch"
                placeholder="Search by name or MRN..."
                value={familySearchQuery}
                onChange={(e) => setFamilySearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Select value={selectedRelationship} onValueChange={setSelectedRelationship}>
                <SelectTrigger id="relationship">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOUSE">Spouse</SelectItem>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="CHILD">Child</SelectItem>
                  <SelectItem value="SIBLING">Sibling</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsFamilyDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-[#053e67] hover:bg-blue-800"
                onClick={handleAddFamilyMember}
                disabled={!familySearchQuery || !selectedRelationship}
              >
                <Plus className="h-4 w-4 mr-2" />
                Link Family Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
