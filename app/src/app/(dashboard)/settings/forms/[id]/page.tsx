'use client';

import { useState, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ArrowLeft,
  Save,
  Eye,
  Send,
  GripVertical,
  Plus,
  Trash2,
  Settings2,
  Type,
  AlignLeft,
  ListOrdered,
  CheckSquare,
  Calendar,
  Phone,
  Mail,
  Hash,
  PenTool,
  FileUp,
  Heading,
  Minus,
  CircleDot,
  SquareCheck,
} from 'lucide-react';

// Field type definitions - must match Prisma FormFieldType enum
const FIELD_TYPES = [
  { type: 'TEXT', label: 'Text Input', icon: Type, category: 'input' },
  { type: 'TEXTAREA', label: 'Text Area', icon: AlignLeft, category: 'input' },
  { type: 'SELECT', label: 'Dropdown', icon: ListOrdered, category: 'choice' },
  { type: 'RADIO', label: 'Radio Buttons', icon: CircleDot, category: 'choice' },
  { type: 'CHECKBOX', label: 'Checkbox', icon: CheckSquare, category: 'choice' },
  { type: 'CHECKBOX_GROUP', label: 'Checkbox Group', icon: SquareCheck, category: 'choice' },
  { type: 'DATE', label: 'Date', icon: Calendar, category: 'input' },
  { type: 'TIME', label: 'Time', icon: Calendar, category: 'input' },
  { type: 'DATETIME', label: 'Date & Time', icon: Calendar, category: 'input' },
  { type: 'PHONE', label: 'Phone', icon: Phone, category: 'input' },
  { type: 'EMAIL', label: 'Email', icon: Mail, category: 'input' },
  { type: 'SSN', label: 'SSN (Masked)', icon: Hash, category: 'input' },
  { type: 'NUMBER', label: 'Number', icon: Hash, category: 'input' },
  { type: 'CURRENCY', label: 'Currency', icon: Hash, category: 'input' },
  { type: 'SIGNATURE', label: 'Signature', icon: PenTool, category: 'special' },
  { type: 'FILE', label: 'File Upload', icon: FileUp, category: 'special' },
  { type: 'HEADING', label: 'Heading', icon: Heading, category: 'display' },
  { type: 'PARAGRAPH', label: 'Paragraph', icon: AlignLeft, category: 'display' },
  { type: 'DIVIDER', label: 'Divider', icon: Minus, category: 'display' },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]['type'];

interface FormField {
  id: string;
  fieldType: string; // Use string to match DB enum
  label: string;
  name: string;
  placeholder?: string | null;
  helpText?: string | null;
  isRequired: boolean;
  order: number;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
  options?: Array<{ value: string; label: string }> | null;
  conditionalOn?: string | null;
  conditionalValue?: string | null;
  conditionalOp?: string | null;
  mapsToPatient?: string | null;
  sectionId?: string | null;
}

interface FormSection {
  id: string;
  title: string; // Match Prisma schema field name
  description?: string | null;
  order: number;
}

// Sortable Field Component
function SortableField({
  field,
  onSelect,
  isSelected,
}: {
  field: FormField;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldType = FIELD_TYPES.find((f) => f.type === field.fieldType);
  const Icon = fieldType?.icon || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-3 bg-white border rounded-lg cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-[#053e67]/50 border-[#053e67]/50' : 'hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <button
        className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{field.label || 'Untitled Field'}</span>
          {field.isRequired && <span className="text-red-500 text-sm">*</span>}
        </div>
        <span className="text-xs text-gray-400">{fieldType?.label}</span>
      </div>
      <Settings2 className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// Field Palette Item
function FieldPaletteItem({
  type,
  onAdd,
}: {
  type: (typeof FIELD_TYPES)[number];
  onAdd: () => void;
}) {
  const Icon = type.icon;

  return (
    <button
      onClick={onAdd}
      className="flex items-center gap-2 w-full p-2 text-left text-sm rounded-md hover:bg-gray-100 transition-colors"
    >
      <Icon className="h-4 w-4 text-gray-500" />
      <span>{type.label}</span>
    </button>
  );
}

// Field Editor Panel
function FieldEditor({
  field,
  allFields,
  onUpdate,
  onDelete,
  onClose,
}: {
  field: FormField;
  allFields: FormField[];
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const fieldType = FIELD_TYPES.find((f) => f.type === field.fieldType);
  const showOptions = ['SELECT', 'RADIO', 'CHECKBOX_GROUP'].includes(field.fieldType);
  const showValidation = !['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.fieldType);
  const showLengthValidation = ['TEXT', 'TEXTAREA'].includes(field.fieldType);

  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    field.options || [{ value: '', label: '' }]
  );

  const handleOptionsChange = useCallback(
    (newOptions: Array<{ value: string; label: string }>) => {
      setOptions(newOptions);
      onUpdate({ options: newOptions.filter((o) => o.value || o.label) });
    },
    [onUpdate]
  );

  // Patient field mapping options
  const patientFieldOptions = [
    { value: '', label: 'None' },
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'dateOfBirth', label: 'Date of Birth' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'address.street', label: 'Street Address' },
    { value: 'address.city', label: 'City' },
    { value: 'address.state', label: 'State' },
    { value: 'address.zip', label: 'ZIP Code' },
    { value: 'emergencyContact.name', label: 'Emergency Contact Name' },
    { value: 'emergencyContact.phone', label: 'Emergency Contact Phone' },
    { value: 'insurance.provider', label: 'Insurance Provider' },
    { value: 'insurance.memberId', label: 'Insurance Member ID' },
  ];

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {fieldType && <fieldType.icon className="h-5 w-5 text-[#053e67]/50" />}
            Edit {fieldType?.label || 'Field'}
          </SheetTitle>
          <SheetDescription>Configure the field properties and validation rules.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Properties */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Basic Properties</h3>

            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={field.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="Field label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Field Name (ID)</Label>
              <Input
                id="name"
                value={field.name}
                onChange={(e) => onUpdate({ name: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                placeholder="field_name"
              />
              <p className="text-xs text-gray-500">Used for data mapping. No spaces allowed.</p>
            </div>

            {!['HEADING', 'PARAGRAPH', 'DIVIDER', 'CHECKBOX', 'SIGNATURE'].includes(field.fieldType) && (
              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={field.placeholder || ''}
                  onChange={(e) => onUpdate({ placeholder: e.target.value || null })}
                  placeholder="Placeholder text"
                />
              </div>
            )}

            {field.fieldType === 'PARAGRAPH' && (
              <div className="space-y-2">
                <Label htmlFor="helpText">Content</Label>
                <Textarea
                  id="helpText"
                  value={field.helpText || ''}
                  onChange={(e) => onUpdate({ helpText: e.target.value || null })}
                  placeholder="Paragraph content..."
                  rows={4}
                />
              </div>
            )}

            {!['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.fieldType) && (
              <div className="space-y-2">
                <Label htmlFor="helpText">Help Text</Label>
                <Input
                  id="helpText"
                  value={field.helpText || ''}
                  onChange={(e) => onUpdate({ helpText: e.target.value || null })}
                  placeholder="Additional instructions"
                />
              </div>
            )}
          </div>

          {/* Options for Select/Radio/Checkbox Group */}
          {showOptions && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Options</h3>
              <div className="space-y-2">
                {options.map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={option.label}
                      onChange={(e) => {
                        const newOptions = [...options];
                        newOptions[idx] = {
                          ...newOptions[idx],
                          label: e.target.value,
                          value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                        };
                        handleOptionsChange(newOptions);
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newOptions = options.filter((_, i) => i !== idx);
                        handleOptionsChange(newOptions.length ? newOptions : [{ value: '', label: '' }]);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOptionsChange([...options, { value: '', label: '' }])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Option
                </Button>
              </div>
            </div>
          )}

          {/* Validation */}
          {showValidation && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Validation</h3>

              <div className="flex items-center justify-between">
                <Label htmlFor="required">Required</Label>
                <Switch
                  id="required"
                  checked={field.isRequired}
                  onCheckedChange={(checked) => onUpdate({ isRequired: checked })}
                />
              </div>

              {showLengthValidation && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minLength">Min Length</Label>
                    <Input
                      id="minLength"
                      type="number"
                      value={field.minLength || ''}
                      onChange={(e) => onUpdate({ minLength: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxLength">Max Length</Label>
                    <Input
                      id="maxLength"
                      type="number"
                      value={field.maxLength || ''}
                      onChange={(e) => onUpdate({ maxLength: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="No limit"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conditional Display */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Conditional Display</h3>
            <p className="text-xs text-gray-500">Show this field only when another field has a specific value.</p>

            <div className="space-y-2">
              <Label htmlFor="conditionalOn">Show when field</Label>
              <Select
                value={field.conditionalOn || ''}
                onValueChange={(value) => onUpdate({ conditionalOn: value || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Always show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__always__">Always show</SelectItem>
                  {allFields
                    .filter((f) => f.id !== field.id && !['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(f.fieldType))
                    .map((f) => (
                      <SelectItem key={f.id} value={f.name}>
                        {f.label || f.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {field.conditionalOn && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="conditionalOp">Operator</Label>
                  <Select
                    value={field.conditionalOp || 'equals'}
                    onValueChange={(value) => onUpdate({ conditionalOp: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Not equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="is_not_empty">Is not empty</SelectItem>
                      <SelectItem value="is_empty">Is empty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!['is_not_empty', 'is_empty'].includes(field.conditionalOp || '') && (
                  <div className="space-y-2">
                    <Label htmlFor="conditionalValue">Value</Label>
                    <Input
                      id="conditionalValue"
                      value={field.conditionalValue || ''}
                      onChange={(e) => onUpdate({ conditionalValue: e.target.value || null })}
                      placeholder="Expected value"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Patient Record Mapping */}
          {!['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.fieldType) && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Patient Record Mapping</h3>
              <p className="text-xs text-gray-500">
                Automatically populate patient record with this field&apos;s value.
              </p>

              <div className="space-y-2">
                <Label htmlFor="mapsToPatient">Maps to</Label>
                <Select
                  value={field.mapsToPatient || ''}
                  onValueChange={(value) => onUpdate({ mapsToPatient: value || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Do not map" />
                  </SelectTrigger>
                  <SelectContent>
                    {patientFieldOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Delete Field */}
          <div className="pt-4 border-t">
            <Button variant="destructive" className="w-full" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Field
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Main Form Builder Page
export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { isAtLeast } = usePermissions();
  const canEdit = isAtLeast('ADMIN');

  const isNew = resolvedParams.id === 'new';

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('fields');

  const utils = trpc.useUtils();

  // Load existing template
  const { data: template, isLoading } = trpc.formTemplate.get.useQuery(
    { id: resolvedParams.id },
    { enabled: !isNew }
  );

  // Mutations
  const createMutation = trpc.formTemplate.create.useMutation({
    onSuccess: (data) => {
      toast.success('Template created');
      if (data) {
        router.push(`/settings/forms/${data.id}`);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create template');
    },
  });

  const updateMutation = trpc.formTemplate.update.useMutation({
    onSuccess: () => {
      toast.success('Template saved');
      setHasChanges(false);
      utils.formTemplate.get.invalidate({ id: resolvedParams.id });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save template');
    },
  });

  const publishMutation = trpc.formTemplate.publish.useMutation({
    onSuccess: () => {
      toast.success('Template published');
      setShowPublishDialog(false);
      utils.formTemplate.get.invalidate({ id: resolvedParams.id });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to publish template');
    },
  });

  const addFieldMutation = trpc.formTemplate.addField.useMutation({
    onSuccess: () => {
      utils.formTemplate.get.invalidate({ id: resolvedParams.id });
    },
  });

  const updateFieldMutation = trpc.formTemplate.updateField.useMutation();

  const deleteFieldMutation = trpc.formTemplate.deleteField.useMutation({
    onSuccess: () => {
      utils.formTemplate.get.invalidate({ id: resolvedParams.id });
      setSelectedFieldId(null);
    },
  });

  const reorderFieldsMutation = trpc.formTemplate.reorderFields.useMutation();

  // Initialize state from loaded template
  useEffect(() => {
    if (template) {
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      setFields(
        template.fields.map((f) => ({
          id: f.id,
          fieldType: f.fieldType,
          label: f.label,
          name: f.name,
          placeholder: f.placeholder,
          helpText: f.helpText,
          isRequired: f.isRequired,
          order: f.order,
          minLength: f.minLength,
          maxLength: f.maxLength,
          minValue: f.minValue ? Number(f.minValue) : null,
          maxValue: f.maxValue ? Number(f.maxValue) : null,
          pattern: f.pattern,
          options: f.options as Array<{ value: string; label: string }> | null,
          conditionalOn: f.conditionalOn,
          conditionalValue: f.conditionalValue,
          conditionalOp: f.conditionalOp,
          mapsToPatient: f.mapsToPatient,
          sectionId: f.sectionId,
        }))
      );
      setSections(template.sections.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        order: s.order,
      })));
    }
  }, [template]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
          ...item,
          order: idx,
        }));

        // Persist reorder to backend
        if (!isNew) {
          reorderFieldsMutation.mutate({
            templateId: resolvedParams.id,
            fieldOrders: newItems.map((f) => ({ id: f.id, order: f.order })),
          });
        }

        setHasChanges(true);
        return newItems;
      });
    }
  };

  const handleAddField = useCallback(
    (fieldType: FieldType) => {
      const newField: FormField = {
        id: `temp-${Date.now()}`,
        fieldType,
        label: FIELD_TYPES.find((f) => f.type === fieldType)?.label || 'New Field',
        name: `field_${Date.now()}`,
        isRequired: false,
        order: fields.length,
      };

      if (isNew) {
        setFields((prev) => [...prev, newField]);
        setHasChanges(true);
      } else {
        addFieldMutation.mutate(
          {
            templateId: resolvedParams.id,
            fieldType,
            label: newField.label,
            name: newField.name,
            isRequired: false,
            order: fields.length,
          },
          {
            onSuccess: () => {
              setHasChanges(true);
            },
          }
        );
      }
    },
    [fields.length, isNew, resolvedParams.id, addFieldMutation]
  );

  const handleUpdateField = useCallback(
    (fieldId: string, updates: Partial<FormField>) => {
      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
      setHasChanges(true);

      // Persist to backend if not new template
      if (!isNew && !fieldId.startsWith('temp-')) {
        // Filter out fieldType since it's an enum and rarely changes
        // Convert null values to undefined for the mutation
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fieldType, ...restUpdates } = updates;
        const safeUpdates = Object.fromEntries(
          Object.entries(restUpdates).map(([k, v]) => [k, v === null ? undefined : v])
        );
        updateFieldMutation.mutate({
          id: fieldId,
          ...safeUpdates,
        });
      }
    },
    [isNew, updateFieldMutation]
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (isNew || fieldId.startsWith('temp-')) {
        setFields((prev) => prev.filter((f) => f.id !== fieldId));
      } else {
        deleteFieldMutation.mutate({ id: fieldId });
      }
      setHasChanges(true);
    },
    [isNew, deleteFieldMutation]
  );

  const handleSave = useCallback(() => {
    if (isNew) {
      createMutation.mutate({
        name: templateName,
        description: templateDescription || undefined,
        fields: fields.map((f, idx) => ({
          fieldType: f.fieldType as FieldType,
          label: f.label,
          name: f.name,
          placeholder: f.placeholder || undefined,
          helpText: f.helpText || undefined,
          isRequired: f.isRequired,
          order: idx,
          minLength: f.minLength ?? undefined,
          maxLength: f.maxLength ?? undefined,
          options: f.options || undefined,
          conditionalOn: f.conditionalOn || undefined,
          conditionalValue: f.conditionalValue || undefined,
          conditionalOp: f.conditionalOp as 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' | undefined,
          mapsToPatient: f.mapsToPatient || undefined,
        })),
      });
    } else {
      updateMutation.mutate({
        id: resolvedParams.id,
        name: templateName,
        description: templateDescription || undefined,
      });
    }
  }, [isNew, templateName, templateDescription, fields, createMutation, updateMutation, resolvedParams.id]);

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const activeField = fields.find((f) => f.id === activeId);

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]/50"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings/forms">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <Input
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Template Name"
              className="text-lg font-semibold border-none px-0 h-auto focus-visible:ring-0"
              disabled={!canEdit}
            />
            <Input
              value={templateDescription}
              onChange={(e) => {
                setTemplateDescription(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Add a description..."
              className="text-sm text-gray-500 border-none px-0 h-auto focus-visible:ring-0"
              disabled={!canEdit}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {template?.publishedAt && (
            <Badge variant="default" className="bg-green-100 text-green-700">
              Published v{template.version}
            </Badge>
          )}
          {!isNew && (
            <Button variant="outline" asChild>
              <Link href={`/settings/forms/${resolvedParams.id}/preview`}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Link>
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!hasChanges || createMutation.isPending || updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
              {!isNew && !template?.publishedAt && (
                <Button
                  onClick={() => setShowPublishDialog(true)}
                  className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
                  disabled={hasChanges}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Publish
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 pt-4 overflow-hidden">
        {/* Left Sidebar - Field Palette */}
        <div className="w-64 flex-shrink-0 overflow-y-auto">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Add Fields</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="fields" className="text-xs">
                    Fields
                  </TabsTrigger>
                  <TabsTrigger value="display" className="text-xs">
                    Display
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="fields" className="mt-2 space-y-1">
                  {FIELD_TYPES.filter((f) => f.category !== 'display').map((type) => (
                    <FieldPaletteItem key={type.type} type={type} onAdd={() => handleAddField(type.type)} />
                  ))}
                </TabsContent>
                <TabsContent value="display" className="mt-2 space-y-1">
                  {FIELD_TYPES.filter((f) => f.category === 'display').map((type) => (
                    <FieldPaletteItem key={type.type} type={type} onAdd={() => handleAddField(type.type)} />
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Center - Form Canvas */}
        <div className="flex-1 overflow-y-auto">
          <Card className="min-h-full">
            <CardContent className="p-4">
              {fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Plus className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">No fields yet</p>
                  <p className="text-sm">Click a field type on the left to add it to your form.</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {fields.map((field) => (
                        <SortableField
                          key={field.id}
                          field={field}
                          isSelected={selectedFieldId === field.id}
                          onSelect={() => setSelectedFieldId(field.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeField && (
                      <div className="p-3 bg-white border rounded-lg shadow-lg opacity-90">
                        <span className="font-medium">{activeField.label}</span>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Field Editor Sheet */}
      {selectedField && (
        <FieldEditor
          field={selectedField}
          allFields={fields}
          onUpdate={(updates) => handleUpdateField(selectedField.id, updates)}
          onDelete={() => handleDeleteField(selectedField.id)}
          onClose={() => setSelectedFieldId(null)}
        />
      )}

      {/* Publish Confirmation Dialog */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing will make this template available for patient intake. This will create a new
              version and preserve the previous version for existing submissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => publishMutation.mutate({ id: resolvedParams.id })}
              className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67]"
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
