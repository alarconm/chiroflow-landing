'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, differenceInYears } from 'date-fns';
import {
  ArrowLeft,
  Search,
  Users,
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { PatientMergeCompare } from '@/components/patients/PatientMergeCompare';

// Type for duplicate groups (when no patientId specified)
type DuplicateGroup = {
  patients: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    phone: string | null;
  }[];
  reason: string;
};

export default function PatientDuplicatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [mergePatients, setMergePatients] = useState<{
    id1: string;
    id2: string;
  } | null>(null);

  // Fetch all potential duplicates
  const {
    data: duplicateGroups,
    isLoading,
    refetch,
  } = trpc.patient.findDuplicates.useQuery({ limit: 50 });

  const formatAge = (dob: Date | string | null) => {
    if (!dob) return '';
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    return `${differenceInYears(new Date(), date)}y`;
  };

  // Type guard to check if the response is an array of duplicate groups
  const isDuplicateGroupArray = (data: unknown): data is DuplicateGroup[] => {
    if (!Array.isArray(data)) return false;
    if (data.length === 0) return true;
    return 'patients' in data[0] && 'reason' in data[0];
  };

  const groups = isDuplicateGroupArray(duplicateGroups) ? duplicateGroups : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/patients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Duplicate Detection</h1>
            <p className="text-gray-500 mt-1">
              Find and merge duplicate patient records
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search for specific patient */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search for Duplicates</CardTitle>
          <CardDescription>
            Enter a patient name or MRN to find potential duplicates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search patient name or MRN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button>Find Duplicates</Button>
          </div>
        </CardContent>
      </Card>

      {/* Potential Duplicates List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-blue-500" />
            Potential Duplicates
          </CardTitle>
          <CardDescription>
            Review and merge records that appear to be duplicates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No potential duplicates found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The system checks for matching names, birth dates, and phone numbers
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-[#053e67] border-blue-200">
                      {group.reason}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.patients.length} patients
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.patients.map((patient, pIndex) => (
                      <div
                        key={patient.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <Users className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {patient.lastName}, {patient.firstName}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>MRN: {patient.mrn}</span>
                              {patient.dateOfBirth && (
                                <>
                                  <span>•</span>
                                  <span>
                                    {format(new Date(patient.dateOfBirth), 'MM/dd/yyyy')}{' '}
                                    ({formatAge(patient.dateOfBirth)})
                                  </span>
                                </>
                              )}
                              {patient.phone && (
                                <>
                                  <span>•</span>
                                  <span>{patient.phone}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {pIndex === 0 && group.patients.length === 2 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setMergePatients({
                                id1: group.patients[0].id,
                                id2: group.patients[1].id,
                              })
                            }
                          >
                            Compare & Merge
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {group.patients.length > 2 && (
                    <div className="mt-3 text-sm text-muted-foreground">
                      Select two patients to compare and merge
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      <Dialog
        open={!!mergePatients}
        onOpenChange={(open) => !open && setMergePatients(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {mergePatients && (
            <PatientMergeCompare
              patientId1={mergePatients.id1}
              patientId2={mergePatients.id2}
              onClose={() => setMergePatients(null)}
              onMergeComplete={() => {
                setMergePatients(null);
                refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
