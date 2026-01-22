'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, FileText, Loader2, Check, HelpCircle } from 'lucide-react';

interface CodeSuggestion {
  code: string;
  description: string;
  confidence: number;
  rationale: string;
  isChiroCommon?: boolean;
}

interface CodeSuggestionsProps {
  encounterId: string;
  onSelectCodes?: (icd10: string[], cpt: string[]) => void;
  disabled?: boolean;
}

export function CodeSuggestions({
  encounterId,
  onSelectCodes,
  disabled = false,
}: CodeSuggestionsProps) {
  const [selectedICD10, setSelectedICD10] = useState<Set<string>>(new Set());
  const [selectedCPT, setSelectedCPT] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<{
    icd10: CodeSuggestion[];
    cpt: CodeSuggestion[];
  } | null>(null);

  const { toast } = useToast();

  const suggestCodesMutation = trpc.aiDocumentation.suggestCodes.useMutation({
    onSuccess: (data) => {
      setSuggestions(data);
      // Pre-select high-confidence codes
      const highConfidenceICD10 = new Set(
        data.icd10.filter((s) => s.confidence >= 0.85).map((s) => s.code)
      );
      const highConfidenceCPT = new Set(
        data.cpt.filter((s) => s.confidence >= 0.85).map((s) => s.code)
      );
      setSelectedICD10(highConfidenceICD10);
      setSelectedCPT(highConfidenceCPT);
      toast({
        title: 'Code suggestions ready',
        description: `Found ${data.icd10.length} ICD-10 and ${data.cpt.length} CPT suggestions`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to suggest codes',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSuggest = () => {
    suggestCodesMutation.mutate({ encounterId });
  };

  const toggleICD10 = (code: string) => {
    setSelectedICD10((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleCPT = (code: string) => {
    setSelectedCPT((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleApply = () => {
    onSelectCodes?.(Array.from(selectedICD10), Array.from(selectedCPT));
    toast({
      title: 'Codes applied',
      description: `Applied ${selectedICD10.size} ICD-10 and ${selectedCPT.size} CPT codes`,
    });
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return (
        <Badge variant="default" className="bg-green-500">
          High ({Math.round(confidence * 100)}%)
        </Badge>
      );
    }
    if (confidence >= 0.7) {
      return (
        <Badge variant="default" className="bg-yellow-500">
          Medium ({Math.round(confidence * 100)}%)
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="bg-gray-400">
        Low ({Math.round(confidence * 100)}%)
      </Badge>
    );
  };

  const renderCodeList = (
    codes: CodeSuggestion[],
    selected: Set<string>,
    onToggle: (code: string) => void,
    type: 'ICD-10' | 'CPT'
  ) => {
    if (codes.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">No {type} codes suggested</p>
      );
    }

    return (
      <div className="space-y-2">
        {codes.map((suggestion) => (
          <div
            key={suggestion.code}
            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
            onClick={() => onToggle(suggestion.code)}
          >
            <Checkbox
              checked={selected.has(suggestion.code)}
              onCheckedChange={() => onToggle(suggestion.code)}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{suggestion.code}</span>
                {suggestion.isChiroCommon && (
                  <Badge variant="outline" className="text-xs">
                    Common
                  </Badge>
                )}
                {getConfidenceBadge(suggestion.confidence)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {suggestion.description}
              </p>
              <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
                <HelpCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{suggestion.rationale}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Code Suggestions
        </CardTitle>
        <CardDescription>
          Get ICD-10 and CPT code suggestions based on your documentation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleSuggest}
          disabled={disabled || suggestCodesMutation.isPending}
          className="w-full"
        >
          {suggestCodesMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing Documentation...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Suggest Codes
            </>
          )}
        </Button>

        {suggestCodesMutation.isPending && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {suggestions && (
          <Accordion type="multiple" defaultValue={['icd10', 'cpt']} className="w-full">
            <AccordionItem value="icd10">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>ICD-10 Diagnoses</span>
                  <Badge variant="secondary">{suggestions.icd10.length}</Badge>
                  {selectedICD10.size > 0 && (
                    <Badge variant="default">{selectedICD10.size} selected</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {renderCodeList(suggestions.icd10, selectedICD10, toggleICD10, 'ICD-10')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cpt">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>CPT Procedures</span>
                  <Badge variant="secondary">{suggestions.cpt.length}</Badge>
                  {selectedCPT.size > 0 && (
                    <Badge variant="default">{selectedCPT.size} selected</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {renderCodeList(suggestions.cpt, selectedCPT, toggleCPT, 'CPT')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {suggestions && (selectedICD10.size > 0 || selectedCPT.size > 0) && (
          <Button onClick={handleApply} className="w-full" variant="secondary">
            <Check className="mr-2 h-4 w-4" />
            Apply Selected Codes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
