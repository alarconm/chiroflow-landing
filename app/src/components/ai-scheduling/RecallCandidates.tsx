'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/trpc/client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Users,
  UserPlus,
  Calendar,
  Mail,
  Phone,
  MessageSquare,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function RecallCandidates() {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>('');
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());

  const { data: sequences } = trpc.aiScheduling.getRecallSequences.useQuery();
  const {
    data: candidates,
    isLoading,
    refetch,
  } = trpc.aiScheduling.findRecallCandidates.useQuery({
    sequenceId: selectedSequenceId || undefined,
    limit: 50,
  });

  const enrollMutation = trpc.aiScheduling.batchEnrollPatients.useMutation({
    onSuccess: () => {
      setSelectedPatients(new Set());
      refetch();
    },
  });

  const contactMethodIcons = {
    email: <Mail className="h-4 w-4" />,
    sms: <MessageSquare className="h-4 w-4" />,
    phone: <Phone className="h-4 w-4" />,
  };

  const handleSelectAll = () => {
    if (selectedPatients.size === candidates?.length) {
      setSelectedPatients(new Set());
    } else {
      setSelectedPatients(new Set(candidates?.map((c) => c.patientId) || []));
    }
  };

  const handleSelectPatient = (patientId: string) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(patientId)) {
      newSelected.delete(patientId);
    } else {
      newSelected.add(patientId);
    }
    setSelectedPatients(newSelected);
  };

  const handleEnrollSelected = () => {
    if (selectedPatients.size === 0 || !selectedSequenceId) return;

    const enrollments = Array.from(selectedPatients).map((patientId) => ({
      patientId,
      sequenceId: selectedSequenceId,
    }));

    enrollMutation.mutate({ enrollments });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#053e67]" />
            Recall Candidates
          </CardTitle>
          <CardDescription>Loading candidates...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#053e67]" />
              Recall Candidates
            </CardTitle>
            <CardDescription>
              {candidates?.length || 0} patient{candidates?.length !== 1 ? 's' : ''} due for recall
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedSequenceId} onValueChange={setSelectedSequenceId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select sequence" />
              </SelectTrigger>
              <SelectContent>
                {sequences?.map((seq) => (
                  <SelectItem key={seq.id} value={seq.id}>
                    {seq.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleEnrollSelected}
              disabled={
                selectedPatients.size === 0 ||
                !selectedSequenceId ||
                enrollMutation.isPending
              }
            >
              {enrollMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Enroll {selectedPatients.size > 0 ? `(${selectedPatients.size})` : ''}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(!candidates || candidates.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No patients currently due for recall.</p>
            <p className="text-sm">Patients will appear here based on your recall sequence settings.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select all header */}
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                checked={selectedPatients.size === candidates.length}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm font-medium">
                {selectedPatients.size === 0
                  ? 'Select all'
                  : `${selectedPatients.size} selected`}
              </span>
            </div>

            {/* Candidate list */}
            {candidates.map((candidate) => (
              <div
                key={candidate.patientId}
                className={`flex items-center gap-4 p-4 border rounded-lg transition-colors ${
                  selectedPatients.has(candidate.patientId)
                    ? 'bg-[#053e67]/5 border-[#053e67]/20'
                    : 'hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={selectedPatients.has(candidate.patientId)}
                  onCheckedChange={() => handleSelectPatient(candidate.patientId)}
                />
                <div className="h-10 w-10 rounded-full bg-[#053e67]/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-[#053e67]">
                    {candidate.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{candidate.patientName}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Last visit: {format(new Date(candidate.lastVisitDate), 'MMM d, yyyy')}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>{formatDistanceToNow(new Date(candidate.lastVisitDate), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {candidate.lastAppointmentType}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={`border-0 ${
                            candidate.daysSinceLastVisit >= 90
                              ? 'bg-red-100 text-red-700'
                              : candidate.daysSinceLastVisit >= 60
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {candidate.daysSinceLastVisit} days
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Days since last visit</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="border-0 bg-blue-50 text-[#053e67]">
                          {contactMethodIcons[candidate.contactMethod]}
                          <span className="ml-1 capitalize">{candidate.contactMethod}</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Preferred contact method</p>
                        {candidate.contactInfo && <p className="text-xs">{candidate.contactInfo}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
