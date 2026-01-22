'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Search,
  Star,
  Check,
  Loader2,
  AlertCircle,
  FileText,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface MobileQuickCodesProps {
  encounterId: string;
  onCodeAdded?: () => void;
}

interface DiagnosisCode {
  id: string;
  icd10Code: string;
  description: string;
  shortName?: string | null;
  category?: string | null;
  usageCount?: number;
}

interface ProcedureCode {
  id: string;
  cptCode: string;
  description: string;
  shortName?: string | null;
  category?: string | null;
  defaultUnits?: number;
  usageCount?: number;
}

export function MobileQuickCodes({ encounterId, onCodeAdded }: MobileQuickCodesProps) {
  const [activeTab, setActiveTab] = useState<'diagnosis' | 'procedure'>('diagnosis');
  const [searchQuery, setSearchQuery] = useState('');

  const utils = trpc.useUtils();

  // Fetch existing codes
  const { data: diagnosisData } = trpc.mobileCharting.getDiagnoses.useQuery({ encounterId });
  const { data: procedureData } = trpc.mobileCharting.getProcedures.useQuery({ encounterId });

  // Fetch common codes
  const { data: commonDiagnoses, isLoading: loadingDx } = trpc.mobileCharting.getCommonDiagnoses.useQuery({
    limit: 20,
  });
  const { data: commonProcedures, isLoading: loadingCpt } = trpc.mobileCharting.getCommonProcedures.useQuery({
    limit: 20,
  });

  // Search codes
  const { data: searchDiagnoses } = trpc.diagnosis.searchCodes.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length > 2 && activeTab === 'diagnosis' }
  );
  const { data: searchProcedures } = trpc.procedure.searchCodes.useQuery(
    { query: searchQuery, chiroOnly: true, limit: 10 },
    { enabled: searchQuery.length > 2 && activeTab === 'procedure' }
  );

  // Add mutations
  const addDiagnosisMutation = trpc.mobileCharting.addQuickDiagnosis.useMutation({
    onSuccess: () => {
      toast.success('Diagnosis added');
      utils.mobileCharting.getDiagnoses.invalidate({ encounterId });
      onCodeAdded?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add diagnosis');
    },
  });

  const addProcedureMutation = trpc.mobileCharting.addQuickProcedure.useMutation({
    onSuccess: () => {
      toast.success('Procedure added');
      utils.mobileCharting.getProcedures.invalidate({ encounterId });
      onCodeAdded?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add procedure');
    },
  });

  const handleAddDiagnosis = useCallback(
    (code: string, description: string, isPrimary = false) => {
      addDiagnosisMutation.mutate({
        encounterId,
        icd10Code: code,
        description,
        isPrimary,
      });
    },
    [encounterId, addDiagnosisMutation]
  );

  const handleAddProcedure = useCallback(
    (code: string, description: string, units = 1) => {
      addProcedureMutation.mutate({
        encounterId,
        cptCode: code,
        description,
        units,
      });
    },
    [encounterId, addProcedureMutation]
  );

  const existingDiagnosisCodes = diagnosisData?.diagnoses.map((d) => d.icd10Code) || [];
  const existingProcedureCodes = procedureData?.procedures.map((p) => p.cptCode) || [];

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
        <h1 className="text-lg font-semibold">Quick Codes</h1>
        <p className="text-sm text-white/80">Add diagnoses and procedures</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'diagnosis' | 'procedure')}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-2 m-4 mb-0 max-w-[calc(100%-2rem)]">
          <TabsTrigger value="diagnosis" className="gap-2">
            <FileText className="h-4 w-4" />
            Diagnoses
            {diagnosisData?.diagnoses?.length ? (
              <Badge variant="secondary" className="ml-1">
                {diagnosisData.diagnoses.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="procedure" className="gap-2">
            <Activity className="h-4 w-4" />
            Procedures
            {procedureData?.procedures?.length ? (
              <Badge variant="secondary" className="ml-1">
                {procedureData.procedures.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              placeholder={activeTab === 'diagnosis' ? 'Search ICD-10...' : 'Search CPT...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value="diagnosis" className="flex-1 mt-0">
          <ScrollArea className="flex-1 px-4">
            {/* Current diagnoses */}
            {diagnosisData?.diagnoses && diagnosisData.diagnoses.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-stone-500 mb-2">Current</h3>
                <div className="space-y-2">
                  {diagnosisData.diagnoses.map((dx) => (
                    <Card key={dx.id} className="bg-green-50 border-green-200">
                      <CardContent className="py-2 px-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono font-medium text-sm">
                              {dx.icd10Code}
                            </span>
                            {dx.isPrimary && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                Primary
                              </Badge>
                            )}
                            <p className="text-sm text-stone-600 truncate">
                              {dx.description}
                            </p>
                          </div>
                          <Check className="h-5 w-5 text-green-600" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            {searchQuery.length > 2 && searchDiagnoses && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-stone-500 mb-2">Search Results</h3>
                <div className="space-y-2">
                  {searchDiagnoses.map((dx) => (
                    <CodeCard
                      key={dx.id}
                      code={dx.code}
                      description={dx.description}
                      isAdded={existingDiagnosisCodes.includes(dx.code)}
                      onAdd={() => handleAddDiagnosis(dx.code, dx.description)}
                      isLoading={addDiagnosisMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Common diagnoses */}
            {!searchQuery && (
              <div>
                <h3 className="text-sm font-medium text-stone-500 mb-2">
                  <Star className="h-4 w-4 inline mr-1 text-amber-500" />
                  Frequently Used
                </h3>
                {loadingDx ? (
                  <div className="py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-stone-400" />
                  </div>
                ) : commonDiagnoses?.diagnoses?.length ? (
                  <div className="space-y-2 pb-4">
                    {commonDiagnoses.diagnoses.map((dx) => (
                      <CodeCard
                        key={dx.id}
                        code={dx.icd10Code}
                        description={dx.description}
                        shortName={dx.shortName}
                        isAdded={existingDiagnosisCodes.includes(dx.icd10Code)}
                        onAdd={() => handleAddDiagnosis(dx.icd10Code, dx.description)}
                        isLoading={addDiagnosisMutation.isPending}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-stone-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      No common diagnoses configured
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="procedure" className="flex-1 mt-0">
          <ScrollArea className="flex-1 px-4">
            {/* Current procedures */}
            {procedureData?.procedures && procedureData.procedures.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-stone-500 mb-2">Current</h3>
                <div className="space-y-2">
                  {procedureData.procedures.map((proc) => (
                    <Card key={proc.id} className="bg-green-50 border-green-200">
                      <CardContent className="py-2 px-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono font-medium text-sm">
                              {proc.cptCode}
                            </span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                              x{proc.units}
                            </Badge>
                            <p className="text-sm text-stone-600 truncate">
                              {proc.description}
                            </p>
                          </div>
                          <Check className="h-5 w-5 text-green-600" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            {searchQuery.length > 2 && searchProcedures && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-stone-500 mb-2">Search Results</h3>
                <div className="space-y-2">
                  {searchProcedures.map((proc) => (
                    <CodeCard
                      key={proc.id}
                      code={proc.code}
                      description={proc.description}
                      isAdded={existingProcedureCodes.includes(proc.code)}
                      onAdd={() => handleAddProcedure(proc.code, proc.description)}
                      isLoading={addProcedureMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Common procedures */}
            {!searchQuery && (
              <div>
                <h3 className="text-sm font-medium text-stone-500 mb-2">
                  <Star className="h-4 w-4 inline mr-1 text-amber-500" />
                  Frequently Used
                </h3>
                {loadingCpt ? (
                  <div className="py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-stone-400" />
                  </div>
                ) : commonProcedures?.procedures?.length ? (
                  <div className="space-y-2 pb-4">
                    {commonProcedures.procedures.map((proc) => (
                      <CodeCard
                        key={proc.id}
                        code={proc.cptCode}
                        description={proc.description}
                        shortName={proc.shortName}
                        units={proc.defaultUnits}
                        isAdded={existingProcedureCodes.includes(proc.cptCode)}
                        onAdd={() =>
                          handleAddProcedure(
                            proc.cptCode,
                            proc.description,
                            proc.defaultUnits
                          )
                        }
                        isLoading={addProcedureMutation.isPending}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-stone-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      No common procedures configured
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface CodeCardProps {
  code: string;
  description: string;
  shortName?: string | null;
  units?: number;
  isAdded: boolean;
  onAdd: () => void;
  isLoading: boolean;
}

function CodeCard({
  code,
  description,
  shortName,
  units,
  isAdded,
  onAdd,
  isLoading,
}: CodeCardProps) {
  return (
    <Card className={cn(isAdded && 'opacity-50')}>
      <CardContent className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-sm">{code}</span>
              {units && units > 1 && (
                <Badge variant="outline" className="text-xs">
                  x{units}
                </Badge>
              )}
            </div>
            <p className="text-sm text-stone-600 truncate">
              {shortName || description}
            </p>
          </div>
          <Button
            size="sm"
            variant={isAdded ? 'secondary' : 'default'}
            onClick={onAdd}
            disabled={isAdded || isLoading}
            className={cn(!isAdded && 'bg-[#053e67] hover:bg-[#053e67]/90')}
          >
            {isAdded ? (
              <Check className="h-4 w-4" />
            ) : isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default MobileQuickCodes;
