// Location Switcher Component - US-255
// Enterprise Dashboard - Location switcher in navigation

'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Building2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';

interface LocationSwitcherProps {
  selectedLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
  showAllLocations?: boolean;
  className?: string;
}

export function LocationSwitcher({
  selectedLocationId,
  onLocationChange,
  showAllLocations = true,
  className,
}: LocationSwitcherProps) {
  const [open, setOpen] = useState(false);

  const { data: locations, isLoading } = trpc.location.list.useQuery({
    includeInactive: false,
  });

  const selectedLocation = locations?.find((loc) => loc.id === selectedLocationId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between min-w-[200px] border-stone-300',
            className
          )}
        >
          <div className="flex items-center gap-2">
            {selectedLocationId === null ? (
              <>
                <Building2 className="h-4 w-4 text-[#053e67]" />
                <span>All Locations</span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 text-[#053e67]" />
                <span className="truncate max-w-[150px]">
                  {selectedLocation?.name || 'Select location...'}
                </span>
                {selectedLocation?.isPrimary && (
                  <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-[#053e67]">
                    HQ
                  </Badge>
                )}
              </>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="max-h-[300px] overflow-y-auto">
          {showAllLocations && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-stone-100 border-b border-stone-100',
                selectedLocationId === null && 'bg-blue-50'
              )}
              onClick={() => {
                onLocationChange(null);
                setOpen(false);
              }}
            >
              <Building2 className="h-4 w-4 text-[#053e67]" />
              <span className="font-medium">All Locations</span>
              {selectedLocationId === null && (
                <Check className="ml-auto h-4 w-4 text-[#053e67]" />
              )}
            </div>
          )}
          {isLoading ? (
            <div className="px-3 py-4 text-center text-sm text-stone-500">
              Loading locations...
            </div>
          ) : locations && locations.length > 0 ? (
            locations.map((location) => (
              <div
                key={location.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-stone-100',
                  selectedLocationId === location.id && 'bg-blue-50'
                )}
                onClick={() => {
                  onLocationChange(location.id);
                  setOpen(false);
                }}
              >
                <MapPin className="h-4 w-4 text-stone-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{location.name}</span>
                    {location.isPrimary && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-[#053e67]">
                        HQ
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 truncate">
                    {location.code}
                  </p>
                </div>
                {selectedLocationId === location.id && (
                  <Check className="h-4 w-4 text-[#053e67]" />
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-stone-500">
              No locations found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
