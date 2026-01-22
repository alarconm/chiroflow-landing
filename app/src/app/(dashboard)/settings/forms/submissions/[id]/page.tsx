'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileText,
  User,
  Calendar,
  CheckCircle,
  Printer,
  LinkIcon,
  MessageSquare,
  Save,
  Loader2,
  PenLine,
  Mail,
  Phone,
} from 'lucide-react';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  EXPIRED: 'bg-orange-100 text-orange-800 border-orange-200',
};

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [staffNotes, setStaffNotes] = useState('');
  const [showLinkAppointment, setShowLinkAppointment] = useState(false);

  const utils = trpc.useUtils();

  const { data: submission, isLoading } = trpc.formSubmission.get.useQuery(submissionId, {
    enabled: !!submissionId,
  });

  // Load initial notes
  useEffect(() => {
    if (submission?.staffNotes) {
      setStaffNotes(submission.staffNotes);
    }
  }, [submission?.staffNotes]);

  const updateStatusMutation = trpc.formSubmission.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Status updated successfully');
      utils.formSubmission.get.invalidate(submissionId);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  const addNoteMutation = trpc.formSubmission.addNote.useMutation({
    onSuccess: () => {
      toast.success('Notes saved');
      utils.formSubmission.get.invalidate(submissionId);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save notes');
    },
  });

  const handleMarkCompleted = () => {
    updateStatusMutation.mutate({
      id: submissionId,
      status: 'COMPLETED',
    });
  };

  const handleSaveNotes = () => {
    addNoteMutation.mutate({
      id: submissionId,
      note: staffNotes,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const renderFieldValue = (fieldType: string, value: string | null | undefined) => {
    if (!value) return <span className="text-gray-400 italic">Not provided</span>;

    switch (fieldType) {
      case 'SIGNATURE':
        return (
          <div className="border rounded-lg p-2 bg-gray-50">
            <img
              src={value}
              alt="Signature"
              className="max-h-24 object-contain"
            />
          </div>
        );
      case 'CHECKBOX':
        return value === 'true' ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <span className="text-gray-400">No</span>
        );
      case 'DATE':
        try {
          return format(new Date(value), 'MMMM d, yyyy');
        } catch {
          return value;
        }
      case 'TEXTAREA':
        return (
          <p className="whitespace-pre-wrap text-gray-700 bg-gray-50 p-3 rounded-lg">
            {value}
          </p>
        );
      default:
        return <span className="text-gray-700">{value}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#053e67]/50" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Submission not found</h3>
        <Link href="/settings/forms/submissions">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Submissions
          </Button>
        </Link>
      </div>
    );
  }

  // Group responses by field ID
  const responsesByField: Record<string, string | null> = {};
  submission.responses?.forEach((r) => {
    responsesByField[r.fieldId] = r.value;
  });

  const sections = submission.template?.sections || [];
  const fields = submission.template?.fields || [];

  // Group fields by section
  const fieldsBySection: Record<string, typeof fields> = {};
  fields.forEach((field) => {
    const sectionId = field.sectionId || 'unsectioned';
    if (!fieldsBySection[sectionId]) {
      fieldsBySection[sectionId] = [];
    }
    fieldsBySection[sectionId].push(field);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/settings/forms/submissions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {submission.template?.name || 'Form Submission'}
            </h1>
            <p className="text-gray-500 mt-1">
              Submitted {format(new Date(submission.submittedAt || submission.createdAt), 'MMMM d, yyyy \'at\' h:mm a')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColors[submission.status] || 'bg-gray-100'}>
            {submission.status}
          </Badge>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {submission.status === 'PENDING' && (
            <Button onClick={handleMarkCompleted} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark as Completed
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Form Responses */}
        <div className="lg:col-span-2 space-y-6">
          {/* Form Responses by Section */}
          {sections.length > 0 ? (
            sections.map((section) => (
              <Card key={section.id} className="print:shadow-none print:border">
                <CardHeader className="bg-gray-50 print:bg-white">
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                  {section.description && (
                    <CardDescription>{section.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {fieldsBySection[section.id]?.map((field) => (
                      <div key={field.id} className="border-b pb-4 last:border-0 last:pb-0">
                        <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                          {field.label}
                          {field.isRequired && <span className="text-red-500">*</span>}
                        </label>
                        <div className="mt-1">
                          {renderFieldValue(field.fieldType, responsesByField[field.id])}
                        </div>
                      </div>
                    ))}
                    {(!fieldsBySection[section.id] || fieldsBySection[section.id].length === 0) && (
                      <p className="text-gray-400 text-sm">No fields in this section</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="print:shadow-none print:border">
              <CardHeader>
                <CardTitle className="text-lg">Form Responses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fields.map((field) => (
                    <div key={field.id} className="border-b pb-4 last:border-0 last:pb-0">
                      <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        {field.label}
                        {field.isRequired && <span className="text-red-500">*</span>}
                      </label>
                      <div className="mt-1">
                        {renderFieldValue(field.fieldType, responsesByField[field.id])}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signatures */}
          {submission.signatures && submission.signatures.length > 0 && (
            <Card className="print:shadow-none print:border">
              <CardHeader className="bg-gray-50 print:bg-white">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PenLine className="h-5 w-5" />
                  E-Signatures
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {submission.signatures.map((sig) => (
                    <div key={sig.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-gray-500">
                            Signed on {format(new Date(sig.signedAt), 'MMMM d, yyyy \'at\' h:mm a')}
                          </p>
                          {sig.ipAddress && (
                            <p className="text-xs text-gray-400 mt-1">IP: {sig.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 border-t pt-3">
                        <img
                          src={sig.signatureData}
                          alt="E-Signature"
                          className="max-h-20 object-contain"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Patient Info & Actions */}
        <div className="space-y-6 print:hidden">
          {/* Patient Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submission.patient ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-lg">
                      {submission.patient.demographics?.firstName}{' '}
                      {submission.patient.demographics?.lastName}
                    </p>
                    {submission.patient.mrn && (
                      <p className="text-sm text-gray-500">MRN: {submission.patient.mrn}</p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    {submission.patient.demographics?.dateOfBirth && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>
                          DOB:{' '}
                          {format(
                            new Date(submission.patient.demographics.dateOfBirth),
                            'MMMM d, yyyy'
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <Link href={`/patients/${submission.patient.id}`}>
                    <Button variant="outline" className="w-full mt-4">
                      <User className="h-4 w-4 mr-2" />
                      View Patient Record
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-4">
                  <User className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No patient linked</p>
                  <p className="text-xs text-gray-400 mt-1">
                    This submission may be from an anonymous form
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Staff Notes
              </CardTitle>
              <CardDescription>Internal notes about this submission</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add notes for internal reference..."
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <Button
                variant="outline"
                className="w-full mt-3"
                onClick={handleSaveNotes}
                disabled={addNoteMutation.isPending}
              >
                {addNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Notes
              </Button>
            </CardContent>
          </Card>

          {/* Submission Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Submission Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Source</span>
                  <Badge variant="outline">{submission.source}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span>{format(new Date(submission.createdAt), 'MMM d, yyyy')}</span>
                </div>
                {submission.submittedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Submitted</span>
                    <span>{format(new Date(submission.submittedAt), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {submission.reviewedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reviewed</span>
                    <span>{format(new Date(submission.reviewedAt), 'MMM d, yyyy')}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-gray-500">Form Version</span>
                  <span>v{submission.template?.version || 1}</span>
                </div>
                {submission.appointmentId && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-gray-500">Linked to Appointment</span>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  </>
                )}
              </div>

              {!submission.appointmentId && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => setShowLinkAppointment(true)}
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Link to Appointment
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Link Appointment Dialog */}
      <Dialog open={showLinkAppointment} onOpenChange={setShowLinkAppointment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Appointment</DialogTitle>
            <DialogDescription>
              Connect this form submission to a patient appointment for better record keeping.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500 text-center">
              Appointment linking will be available in a future update.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkAppointment(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          [class*="print:shadow-none"] {
            box-shadow: none !important;
          }
          [class*="print:border"] {
            border: 1px solid #e5e7eb !important;
          }
          [class*="print:bg-white"] {
            background-color: white !important;
          }
        }
      `}</style>
    </div>
  );
}
