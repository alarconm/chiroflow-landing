'use client';

import { useState } from 'react';
import { format, differenceInYears } from 'date-fns';
import {
  ArrowRight,
  AlertTriangle,
  Check,
  X,
  Loader2,
  User,
  Phone,
  Mail,
  MapPin,
  Shield,
  FileText,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PatientMergeCompareProps {
  patientId1: string;
  patientId2: string;
  onClose: () => void;
  onMergeComplete: () => void;
}

type FieldSelection = {
  demographics: string[];
  contacts: boolean;
  emergencyContacts: boolean;
  insurances: boolean;
  documents: boolean;
};

export function PatientMergeCompare({
  patientId1,
  patientId2,
  onClose,
  onMergeComplete,
}: PatientMergeCompareProps) {
  const [targetId, setTargetId] = useState(patientId1); // Keep this patient
  const sourceId = targetId === patientId1 ? patientId2 : patientId1;
  const [showConfirm, setShowConfirm] = useState(false);
  const [mergeReason, setMergeReason] = useState('');
  const [fieldsToKeep, setFieldsToKeep] = useState<FieldSelection>({
    demographics: [],
    contacts: false,
    emergencyContacts: false,
    insurances: false,
    documents: true,
  });

  const { data, isLoading, error } = trpc.patient.comparePatients.useQuery({
    patientId1,
    patientId2,
  });

  const mergeMutation = trpc.patient.mergePatients.useMutation({
    onSuccess: () => {
      toast.success('Patients merged successfully');
      onMergeComplete();
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
        <p className="text-muted-foreground">Failed to load patient comparison</p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    );
  }

  const { patient1, patient2 } = data;
  const targetPatient = targetId === patientId1 ? patient1 : patient2;
  const sourcePatient = targetId === patientId1 ? patient2 : patient1;

  const formatAge = (dob: Date | string | null) => {
    if (!dob) return '-';
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    return `${differenceInYears(new Date(), date)} years`;
  };

  const toggleDemographicField = (field: string) => {
    setFieldsToKeep((prev) => ({
      ...prev,
      demographics: prev.demographics.includes(field)
        ? prev.demographics.filter((f) => f !== field)
        : [...prev.demographics, field],
    }));
  };

  const handleMerge = () => {
    if (!mergeReason.trim()) {
      toast.error('Please provide a reason for the merge');
      return;
    }

    mergeMutation.mutate({
      sourcePatientId: sourceId,
      targetPatientId: targetId,
      fieldsToKeepFromSource: fieldsToKeep,
      reason: mergeReason,
    });
  };

  const renderPatientCard = (patient: typeof patient1, isTarget: boolean, isSource: boolean) => {
    const demo = patient.demographics;
    const contact = patient.contacts?.[0];
    const insurance = patient.insurances?.[0];

    return (
      <Card className={cn(
        'flex-1',
        isTarget && 'border-green-500 border-2',
        isSource && 'border-blue-500 border-2'
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {demo?.firstName} {demo?.lastName}
            </CardTitle>
            {isTarget ? (
              <Badge className="bg-green-500">Keep</Badge>
            ) : isSource ? (
              <Badge variant="outline" className="border-blue-500 text-[#053e67]">
                Archive
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">MRN: {patient.mrn}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Demographics */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Demographics
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm pl-6">
              <div>
                <span className="text-muted-foreground">DOB:</span>{' '}
                {demo?.dateOfBirth
                  ? format(new Date(demo.dateOfBirth), 'MM/dd/yyyy')
                  : '-'}
              </div>
              <div>
                <span className="text-muted-foreground">Age:</span>{' '}
                {formatAge(demo?.dateOfBirth ?? null)}
              </div>
              <div>
                <span className="text-muted-foreground">Gender:</span>{' '}
                {demo?.gender?.toLowerCase().replace('_', ' ') || '-'}
              </div>
              <div>
                <span className="text-muted-foreground">SSN:</span>{' '}
                {demo?.ssnLast4 ? `***-**-${demo.ssnLast4}` : '-'}
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Contact ({patient.contacts?.length || 0})
            </div>
            {contact && (
              <div className="text-sm pl-6 space-y-1">
                {contact.mobilePhone && <p>{contact.mobilePhone} (mobile)</p>}
                {contact.email && <p>{contact.email}</p>}
                {contact.addressLine1 && (
                  <p className="text-muted-foreground">
                    {contact.city}, {contact.state} {contact.zipCode}
                  </p>
                )}
              </div>
            )}
            {!contact && <p className="text-sm text-muted-foreground pl-6">No contact info</p>}
          </div>

          {/* Insurance */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Insurance ({patient.insurances?.length || 0})
            </div>
            {insurance && (
              <div className="text-sm pl-6">
                <p className="font-medium">{insurance.payerName}</p>
                <p className="text-muted-foreground">
                  Policy: {insurance.policyNumber}
                </p>
              </div>
            )}
            {!insurance && <p className="text-sm text-muted-foreground pl-6">No insurance</p>}
          </div>

          {/* Documents */}
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Documents:</span>
            <span>{patient.documents?.length || 0}</span>
          </div>

          {/* Household */}
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Household Members:</span>
            <span>{patient.householdMembers?.length || 0}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Compare & Merge Patients</h2>
          <p className="text-muted-foreground">
            Review both records and select which one to keep
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-[#053e67] mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-blue-800">Merge is Irreversible</p>
          <p className="text-[#053e67]">
            The source patient will be archived after merge. All appointments, billing, and
            clinical data will be transferred to the target patient.
          </p>
        </div>
      </div>

      {/* Comparison */}
      <div className="flex gap-4">
        {renderPatientCard(patient1, targetId === patientId1, targetId !== patientId1)}
        <div className="flex flex-col items-center justify-center gap-2">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTargetId(targetId === patientId1 ? patientId2 : patientId1)}
          >
            Swap
          </Button>
        </div>
        {renderPatientCard(patient2, targetId === patientId2, targetId !== patientId2)}
      </div>

      {/* Field Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What to Transfer from Source</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select what data to copy from the archived patient
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fieldsToKeep.contacts}
                onChange={(e) =>
                  setFieldsToKeep((prev) => ({ ...prev, contacts: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Additional Contact Information</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fieldsToKeep.emergencyContacts}
                onChange={(e) =>
                  setFieldsToKeep((prev) => ({ ...prev, emergencyContacts: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Emergency Contacts</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fieldsToKeep.insurances}
                onChange={(e) =>
                  setFieldsToKeep((prev) => ({ ...prev, insurances: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Insurance Information</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fieldsToKeep.documents}
                onChange={(e) =>
                  setFieldsToKeep((prev) => ({ ...prev, documents: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Documents (Recommended)</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          className="bg-blue-500 hover:bg-[#053e67]"
        >
          Review & Merge
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Patient Merge</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The source patient record will be archived.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500">Keep</Badge>
                <span className="font-medium">
                  {targetPatient.demographics?.firstName}{' '}
                  {targetPatient.demographics?.lastName}
                </span>
                <span className="text-muted-foreground">({targetPatient.mrn})</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-blue-500 text-[#053e67]">
                  Archive
                </Badge>
                <span className="font-medium">
                  {sourcePatient.demographics?.firstName}{' '}
                  {sourcePatient.demographics?.lastName}
                </span>
                <span className="text-muted-foreground">({sourcePatient.mrn})</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Merge (Required)</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Duplicate record created during registration"
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={mergeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={mergeMutation.isPending || !mergeReason.trim()}
              className="bg-blue-500 hover:bg-[#053e67]"
            >
              {mergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirm Merge
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
