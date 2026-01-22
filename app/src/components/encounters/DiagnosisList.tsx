'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Stethoscope, Plus, Search, Trash2, Loader2 } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DiagnosisListProps {
  encounterId: string;
  readOnly?: boolean;
}

export function DiagnosisList({ encounterId, readOnly = false }: DiagnosisListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: diagnoses, refetch } = trpc.diagnosis.listByEncounter.useQuery({
    encounterId,
  });

  const { data: searchResults, isLoading: isSearching } = trpc.diagnosis.searchCodes.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  const addMutation = trpc.diagnosis.add.useMutation({
    onSuccess: () => {
      toast.success('Diagnosis added');
      refetch();
      setShowAddDialog(false);
      setSearchQuery('');
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMutation = trpc.diagnosis.remove.useMutation({
    onSuccess: () => {
      toast.success('Diagnosis removed');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAddDiagnosis = useCallback(
    (icd10Code: string, description: string) => {
      addMutation.mutate({
        encounterId,
        icd10Code,
        description,
        isPrimary: !diagnoses || diagnoses.length === 0,
      });
    },
    [encounterId, diagnoses, addMutation]
  );

  const handleRemove = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const confirmRemove = useCallback(() => {
    if (deleteId) {
      removeMutation.mutate({ id: deleteId });
    }
  }, [deleteId, removeMutation]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-[#053e67]/50" />
              Diagnoses
            </CardTitle>
            <CardDescription>ICD-10 diagnosis codes for this encounter</CardDescription>
          </div>
          {!readOnly && (
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Diagnosis
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Add Diagnosis</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search ICD-10 codes or descriptions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Search results */}
                  {searchQuery.length >= 2 && (
                    <div className="flex-1 overflow-y-auto">
                      {isSearching ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                      ) : searchResults && searchResults.length > 0 ? (
                        <div className="space-y-1">
                          {searchResults.map((code) => (
                            <button
                              key={code.code}
                              onClick={() => handleAddDiagnosis(code.code, code.description)}
                              className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 flex items-center justify-between text-sm"
                              disabled={addMutation.isPending}
                            >
                              <span>
                                <span className="font-mono font-medium">{code.code}</span>
                                <span className="text-gray-500 ml-2">{code.description}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center py-8 text-gray-500">
                          No ICD-10 codes found for &quot;{searchQuery}&quot;
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {diagnoses && diagnoses.length > 0 ? (
          <div className="space-y-3">
            {diagnoses.map((dx, index) => (
              <div
                key={dx.id}
                className={cn(
                  'flex items-start justify-between p-3 rounded-lg border',
                  dx.isPrimary ? 'border-[#053e67]/20 bg-[#053e67]/5' : 'border-gray-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-gray-500 mt-0.5">#{index + 1}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{dx.icd10Code}</span>
                      {dx.isPrimary && (
                        <Badge variant="secondary" className="text-xs">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{dx.description}</p>
                    {dx.onsetDate && (
                      <p className="text-xs text-gray-400 mt-1">
                        Onset: {format(new Date(dx.onsetDate), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(dx.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Stethoscope className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No diagnoses added</p>
          </div>
        )}
      </CardContent>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Diagnosis</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this diagnosis from the encounter?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
