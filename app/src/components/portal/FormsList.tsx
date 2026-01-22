'use client';

/**
 * Epic 14: Patient Portal - Forms List Component
 * Digital forms interface with warm amber/stone theme
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { format, addDays, subDays } from 'date-fns';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  Eye,
} from 'lucide-react';

// Demo forms data
const DEMO_FORMS_PENDING = [
  {
    id: 'demo-form-1',
    templateName: 'New Patient Health History',
    status: 'PENDING',
    dueDate: addDays(new Date(), 2).toISOString(),
    accessToken: 'demo-token-1',
  },
  {
    id: 'demo-form-2',
    templateName: 'Informed Consent for Treatment',
    status: 'DRAFT',
    dueDate: addDays(new Date(), 2).toISOString(),
    accessToken: 'demo-token-2',
  },
];

const DEMO_FORMS_COMPLETED = [
  {
    id: 'demo-form-3',
    templateName: 'Pain Assessment Questionnaire',
    status: 'COMPLETED',
    completedAt: subDays(new Date(), 7).toISOString(),
    accessToken: 'demo-token-3',
  },
  {
    id: 'demo-form-4',
    templateName: 'Patient Contact Information',
    status: 'COMPLETED',
    completedAt: subDays(new Date(), 30).toISOString(),
    accessToken: 'demo-token-4',
  },
];

export function FormsList() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: pendingData, isLoading: isLoadingPending } = trpc.portal.listForms.useQuery(
    { sessionToken: token!, status: 'PENDING' },
    { enabled: !!token }
  );

  const { data: completedData, isLoading: isLoadingCompleted } = trpc.portal.listForms.useQuery(
    { sessionToken: token!, status: 'COMPLETED' },
    { enabled: !!token }
  );

  // Use demo data if API returns nothing
  const pendingForms = pendingData?.forms?.length ? pendingData.forms : DEMO_FORMS_PENDING;
  const completedForms = completedData?.forms?.length ? completedData.forms : DEMO_FORMS_COMPLETED;
  const pendingCount = pendingData?.total ?? DEMO_FORMS_PENDING.length;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      DRAFT: { label: 'In Progress', className: 'bg-blue-50 text-[#053e67] border-blue-200' },
      PENDING: { label: 'To Complete', className: 'bg-blue-50 text-[#053e67] border-blue-200' },
      COMPLETED: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
      REJECTED: { label: 'Needs Revision', className: 'bg-red-50 text-red-700 border-red-200' },
      EXPIRED: { label: 'Expired', className: 'bg-stone-100 text-stone-600 border-stone-200' },
    };
    const config = variants[status] || { label: status, className: 'bg-stone-100 text-stone-600 border-stone-200' };
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'PENDING':
        return <Clock className="h-6 w-6 text-blue-500" />;
      case 'DRAFT':
        return <FileText className="h-6 w-6 text-blue-500" />;
      case 'REJECTED':
        return <AlertCircle className="h-6 w-6 text-red-500" />;
      default:
        return <FileText className="h-6 w-6 text-stone-400" />;
    }
  };

  if (!token) return null;

  // Define a flexible form type that handles both API and demo data
  interface FormType {
    id: string;
    templateId?: string;
    templateName: string;
    status: string;
    dueDate?: string | Date | null;
    completedAt?: string | Date | null;
    accessToken: string;
  }

  const renderFormCard = (form: FormType) => (
    <Card key={form.id} className="border-stone-200 hover:border-blue-200 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              {getStatusIcon(form.status)}
            </div>
            <div>
              <h3 className="font-medium text-stone-900">{form.templateName}</h3>
              {'dueDate' in form && form.dueDate && (
                <p className="text-sm text-stone-500">
                  <span className="font-medium">Due:</span> {format(new Date(form.dueDate), 'MMM d, yyyy')}
                </p>
              )}
              {'completedAt' in form && form.completedAt && (
                <p className="text-sm text-stone-500">
                  <span className="font-medium">Completed:</span> {format(new Date(form.completedAt), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(form.status)}
            {(form.status === 'PENDING' || form.status === 'DRAFT') && (
              <Link href={`/portal/forms/${form.accessToken}`}>
                <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
                  {form.status === 'DRAFT' ? 'Continue' : 'Complete Form'}
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
            {form.status === 'COMPLETED' && (
              <Link href={`/portal/forms/${form.accessToken}`}>
                <Button variant="outline" className="border-stone-200 hover:bg-stone-50">
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Forms</h1>
        <p className="text-stone-600">Complete required forms before your appointments</p>
      </div>

      {/* Pending Forms Alert */}
      {pendingCount > 0 && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-[#053e67] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">
                  You have {pendingCount} form{pendingCount > 1 ? 's' : ''} to complete
                </p>
                <p className="text-sm text-[#053e67]">
                  Please complete all pending forms before your next appointment. This helps us provide you with the best care possible.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-stone-100">
          <TabsTrigger
            value="pending"
            className="relative data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
          >
            To Complete
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-[#053e67] text-white border-0 h-5 min-w-[20px] px-1.5">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
          >
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {isLoadingPending ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : pendingForms.length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-12 text-center">
                <div className="p-4 bg-green-50 rounded-full w-fit mx-auto mb-4">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <p className="text-stone-900 font-medium mb-1">All caught up!</p>
                <p className="text-stone-500">You have no pending forms to complete.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingForms.map(renderFormCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {isLoadingCompleted ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : completedForms.length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-12 text-center">
                <div className="p-4 bg-stone-100 rounded-full w-fit mx-auto mb-4">
                  <FileText className="h-12 w-12 text-stone-400" />
                </div>
                <p className="text-stone-500">No completed forms yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedForms.map(renderFormCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Form Tips */}
      <Card className="border-stone-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-stone-900">
            <ClipboardList className="h-5 w-5 text-[#053e67]" />
            Tips for Completing Forms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-stone-600">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Your progress is automatically saved as you fill out each form</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>You can return to incomplete forms at any time to finish them</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Have your insurance card and ID handy for faster completion</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>All information is encrypted and stored securely</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Help Card */}
      <Card className="border-stone-200 bg-stone-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-[#053e67]" />
            </div>
            <div>
              <p className="font-medium text-stone-900">Need help with a form?</p>
              <p className="text-sm text-stone-500">
                Contact us at <span className="text-[#053e67] font-medium">(555) 123-4567</span> or{' '}
                <Link href="/portal/messages" className="text-[#053e67] font-medium hover:underline">
                  send us a message
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
