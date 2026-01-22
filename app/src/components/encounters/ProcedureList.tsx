'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { ClipboardList, Plus, Search, Trash2, Edit, Loader2 } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface ProcedureListProps {
  encounterId: string;
  readOnly?: boolean;
}

export function ProcedureList({ encounterId, readOnly = false }: ProcedureListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<{
    id: string;
    units: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<{
    code: string;
    description: string;
  } | null>(null);
  const [units, setUnits] = useState('1');

  const { data: procedures, refetch } = trpc.procedure.listByEncounter.useQuery({
    encounterId,
  });

  const { data: searchResults, isLoading: isSearching } = trpc.procedure.searchCodes.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  const addMutation = trpc.procedure.add.useMutation({
    onSuccess: () => {
      toast.success('Procedure added');
      refetch();
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.procedure.update.useMutation({
    onSuccess: () => {
      toast.success('Procedure updated');
      refetch();
      setEditingProcedure(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMutation = trpc.procedure.remove.useMutation({
    onSuccess: () => {
      toast.success('Procedure removed');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = useCallback(() => {
    setSelectedCode(null);
    setUnits('1');
    setSearchQuery('');
  }, []);

  const handleSelectCode = useCallback(
    (code: { code: string; description: string }) => {
      setSelectedCode({
        code: code.code,
        description: code.description,
      });
    },
    []
  );

  const handleAddProcedure = useCallback(() => {
    if (!selectedCode) return;
    addMutation.mutate({
      encounterId,
      cptCode: selectedCode.code,
      description: selectedCode.description,
      units: parseInt(units) || 1,
    });
  }, [encounterId, selectedCode, units, addMutation]);

  const handleUpdateProcedure = useCallback(() => {
    if (!editingProcedure) return;
    updateMutation.mutate({
      id: editingProcedure.id,
      units: editingProcedure.units,
    });
  }, [editingProcedure, updateMutation]);

  const confirmRemove = useCallback(() => {
    if (deleteId) {
      removeMutation.mutate({ id: deleteId });
    }
  }, [deleteId, removeMutation]);

  const totalCharges =
    procedures?.reduce((sum, p) => sum + (p.chargeAmount ? Number(p.chargeAmount) * p.units : 0), 0) || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#053e67]/50" />
              Procedures
            </CardTitle>
            <CardDescription>CPT procedure codes for billing and documentation</CardDescription>
          </div>
          {!readOnly && (
            <Dialog
              open={showAddDialog}
              onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Procedure
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Procedure</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!selectedCode ? (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search CPT codes or descriptions..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      {/* Search results */}
                      {searchQuery.length >= 2 && (
                        <div className="max-h-64 overflow-y-auto">
                          {isSearching ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            </div>
                          ) : searchResults && searchResults.length > 0 ? (
                            <div className="space-y-1">
                              {searchResults.map((code) => (
                                <button
                                  key={code.code}
                                  onClick={() => handleSelectCode(code)}
                                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 flex items-center justify-between text-sm"
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
                              No CPT codes found for &quot;{searchQuery}&quot;
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="font-mono font-medium">{selectedCode.code}</p>
                        <p className="text-sm text-gray-600">{selectedCode.description}</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0 h-auto mt-2"
                          onClick={() => setSelectedCode(null)}
                        >
                          Choose different code
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Units</Label>
                        <Input
                          type="number"
                          min="1"
                          value={units}
                          onChange={(e) => setUnits(e.target.value)}
                          className="w-24"
                        />
                      </div>
                    </>
                  )}
                </div>
                {selectedCode && (
                  <DialogFooter>
                    <Button variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddProcedure} disabled={addMutation.isPending}>
                      {addMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Add Procedure
                    </Button>
                  </DialogFooter>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {procedures && procedures.length > 0 ? (
          <div className="space-y-3">
            {procedures.map((proc) => (
              <div
                key={proc.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
              >
                <div className="flex items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{proc.cptCode}</span>
                      {proc.modifier1 && (
                        <Badge variant="outline" className="text-xs">
                          -{proc.modifier1}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{proc.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>Units: {proc.units}</span>
                      {proc.chargeAmount && (
                        <span>Charge: ${(Number(proc.chargeAmount) * proc.units).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEditingProcedure({
                          id: proc.id,
                          units: proc.units,
                        })
                      }
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(proc.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {totalCharges > 0 && (
              <div className="flex justify-end pt-3 border-t">
                <span className="text-sm font-medium">
                  Total: ${totalCharges.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No procedures added</p>
          </div>
        )}
      </CardContent>

      {/* Edit procedure dialog */}
      <Dialog open={!!editingProcedure} onOpenChange={() => setEditingProcedure(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Procedure</DialogTitle>
          </DialogHeader>
          {editingProcedure && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Units</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingProcedure.units}
                  onChange={(e) =>
                    setEditingProcedure({
                      ...editingProcedure,
                      units: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-24"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProcedure(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProcedure} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Procedure</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this procedure from the encounter?
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
