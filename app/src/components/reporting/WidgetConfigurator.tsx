'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/trpc/client';
import { Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';

const WIDGET_TYPES = [
  { value: 'VISITS_TODAY', label: 'Visits Today' },
  { value: 'REVENUE_TODAY', label: 'Revenue Today' },
  { value: 'REVENUE_MTD', label: 'Revenue Month-to-Date' },
  { value: 'COLLECTIONS_MTD', label: 'Collections Month-to-Date' },
  { value: 'AR_TOTAL', label: 'Total A/R' },
  { value: 'AR_AGING', label: 'A/R Aging Summary' },
  { value: 'PROVIDER_PRODUCTION', label: 'Provider Production' },
  { value: 'TOP_PROCEDURES', label: 'Top Procedures' },
  { value: 'PAYER_MIX', label: 'Payer Mix' },
  { value: 'COLLECTION_RATE', label: 'Collection Rate' },
  { value: 'NO_SHOW_RATE', label: 'No-Show Rate' },
  { value: 'PATIENT_RETENTION', label: 'Patient Retention' },
];

const WIDGET_SIZES = [
  { value: 'small', label: 'Small (1x1)' },
  { value: 'medium', label: 'Medium (2x1)' },
  { value: 'large', label: 'Large (2x2)' },
];

interface WidgetConfiguratorProps {
  onWidgetAdded?: () => void;
  trigger?: React.ReactNode;
}

export function WidgetConfigurator({ onWidgetAdded, trigger }: WidgetConfiguratorProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [widgetType, setWidgetType] = useState<string>('');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('small');

  const utils = trpc.useUtils();
  const saveWidget = trpc.reporting.saveWidget.useMutation({
    onSuccess: () => {
      toast.success('Widget added to dashboard');
      utils.reporting.getWidgets.invalidate();
      setOpen(false);
      resetForm();
      onWidgetAdded?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setWidgetType('');
    setSize('small');
  };

  const handleSave = () => {
    if (!widgetType) {
      toast.error('Please select a widget type');
      return;
    }

    const selectedWidget = WIDGET_TYPES.find(w => w.value === widgetType);

    // Map size to width/height
    const sizeMap = {
      small: { width: 1, height: 1 },
      medium: { width: 2, height: 1 },
      large: { width: 2, height: 2 },
    };
    const { width, height } = sizeMap[size];

    saveWidget.mutate({
      name: title || selectedWidget?.label || 'New Widget',
      widgetType: widgetType as any,
      dataSource: widgetType.toLowerCase(), // Use widget type as data source
      position: 0, // Will be reordered
      width,
      height,
      config: {
        title: title || selectedWidget?.label || 'New Widget',
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Dashboard Widget</DialogTitle>
          <DialogDescription>
            Configure a new widget to add to your dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="widgetType">Widget Type</Label>
            <Select value={widgetType} onValueChange={setWidgetType}>
              <SelectTrigger>
                <SelectValue placeholder="Select widget type" />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="title">Custom Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank for default"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="size">Widget Size</Label>
            <Select value={size} onValueChange={(v) => setSize(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_SIZES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveWidget.isPending}>
            {saveWidget.isPending ? 'Adding...' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
