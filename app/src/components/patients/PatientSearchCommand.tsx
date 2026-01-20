'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Clock,
  User,
  X,
  Loader2,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { format, differenceInYears } from 'date-fns';
import { cn } from '@/lib/utils';

interface PatientSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (patientId: string) => void;
}

export function PatientSearchCommand({
  open,
  onOpenChange,
  onSelect,
}: PatientSearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch recent patients
  const { data: recentData, isLoading: recentLoading } =
    trpc.patient.recentPatients.useQuery({ limit: 5 }, { enabled: open && !query });

  // Fetch search results with debounce
  const { data: searchData, isLoading: searchLoading } =
    trpc.patient.searchAdvanced.useQuery(
      {
        query,
        useFuzzy: true,
        usePhonetic: true,
        limit: 10,
      },
      {
        enabled: open && !!query && query.length >= 2,
      }
    );

  const isLoading = query ? searchLoading : recentLoading;
  const results = query ? searchData?.patients ?? [] : recentData ?? [];

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [results, selectedIndex, onOpenChange]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleSelect = (patientId: string) => {
    onOpenChange(false);
    setQuery('');
    if (onSelect) {
      onSelect(patientId);
    } else {
      router.push(`/patients/${patientId}`);
    }
  };

  const formatAge = (dob: Date | string | null | undefined) => {
    if (!dob) return '';
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    return `${differenceInYears(new Date(), date)}y`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="sr-only">Search Patients</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search patients by name, DOB, MRN, phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-10"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="border-t">
          {/* Results Header */}
          <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            {query ? (
              <>
                <Search className="h-3 w-3" />
                Search Results
                {searchData?.total !== undefined && ` (${searchData.total})`}
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                Recently Viewed
              </>
            )}
          </div>

          {/* Results List */}
          <div ref={listRef} className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                {query
                  ? query.length < 2
                    ? 'Type at least 2 characters to search'
                    : 'No patients found'
                  : 'No recent patients'}
              </div>
            ) : (
              results.map((patient, index) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelect(patient.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-accent'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {patient.lastName}, {patient.firstName}
                      </span>
                      {'relevanceScore' in patient && (patient as { relevanceScore: number }).relevanceScore < 60 && (
                        <Badge variant="outline" className="text-xs">
                          Similar
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>MRN: {patient.mrn}</span>
                      {patient.dateOfBirth && (
                        <>
                          <span className="text-muted-foreground/50">•</span>
                          <span>
                            {format(new Date(patient.dateOfBirth), 'MM/dd/yyyy')}{' '}
                            ({formatAge(patient.dateOfBirth)})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Keyboard hints */}
          <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                <ArrowUp className="h-3 w-3 inline" />
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                <ArrowDown className="h-3 w-3 inline" />
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                <CornerDownLeft className="h-3 w-3 inline" />
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage global keyboard shortcut for opening search
export function usePatientSearchShortcut() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}
