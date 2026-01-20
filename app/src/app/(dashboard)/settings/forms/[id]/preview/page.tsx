'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/trpc/client';
import { ArrowLeft, Monitor, Smartphone, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';

type FormValues = Record<string, string | boolean | string[]>;

interface FormFieldData {
  id: string;
  fieldType: string;
  label: string;
  name: string;
  placeholder?: string | null;
  helpText?: string | null;
  isRequired: boolean;
  order: number;
  options?: Array<{ value: string; label: string }> | null;
  conditionalOn?: string | null;
  conditionalValue?: string | null;
  conditionalOp?: string | null;
}

function isFieldVisible(field: FormFieldData, values: FormValues): boolean {
  if (!field.conditionalOn) return true;

  const dependentValue = values[field.conditionalOn];
  const expectedValue = field.conditionalValue;
  const op = field.conditionalOp || 'equals';

  switch (op) {
    case 'equals':
      return dependentValue === expectedValue;
    case 'not_equals':
      return dependentValue !== expectedValue;
    case 'contains':
      return String(dependentValue || '').includes(expectedValue || '');
    case 'not_empty':
      return dependentValue !== undefined && dependentValue !== '' && dependentValue !== false;
    case 'is_empty':
      return dependentValue === undefined || dependentValue === '' || dependentValue === false;
    default:
      return true;
  }
}

function FormFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FormFieldData;
  value: string | boolean | string[] | undefined;
  onChange: (value: string | boolean | string[]) => void;
}) {
  const options = (field.options as Array<{ value: string; label: string }>) || [];

  switch (field.fieldType) {
    case 'TEXT':
    case 'EMAIL':
    case 'PHONE':
      return (
        <Input
          type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'PHONE' ? 'tel' : 'text'}
          placeholder={field.placeholder || undefined}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'SSN':
      return (
        <Input
          type="password"
          placeholder={field.placeholder || 'XXX-XX-XXXX'}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={11}
        />
      );

    case 'TEXTAREA':
      return (
        <Textarea
          placeholder={field.placeholder || undefined}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      );

    case 'DATE':
      return (
        <Input
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'SELECT':
      return (
        <Select value={(value as string) || ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || 'Select an option'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'RADIO':
      return (
        <RadioGroup value={(value as string) || ''} onValueChange={onChange}>
          {options.map((opt) => (
            <div key={opt.value} className="flex items-center space-x-2">
              <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
              <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case 'CHECKBOX':
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.id}
            checked={(value as boolean) || false}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <Label htmlFor={field.id} className="font-normal">
            {field.helpText || field.label}
          </Label>
        </div>
      );

    case 'CHECKBOX_GROUP':
      return (
        <div className="space-y-2">
          {options.map((opt) => {
            const currentValues = (value as string[]) || [];
            const isChecked = currentValues.includes(opt.value);
            return (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.id}-${opt.value}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...currentValues, opt.value]);
                    } else {
                      onChange(currentValues.filter((v) => v !== opt.value));
                    }
                  }}
                />
                <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                  {opt.label}
                </Label>
              </div>
            );
          })}
        </div>
      );

    case 'SIGNATURE':
      return (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
          <p>Signature pad will appear here</p>
          <p className="text-sm mt-1">Click or touch to sign</p>
        </div>
      );

    case 'FILE':
      return (
        <Input
          type="file"
          className="cursor-pointer"
          accept="image/*,.pdf,.doc,.docx"
        />
      );

    case 'HEADING':
      return (
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">{field.label}</h3>
      );

    case 'PARAGRAPH':
      return (
        <p className="text-gray-600 whitespace-pre-wrap">{field.helpText || field.label}</p>
      );

    case 'DIVIDER':
      return <hr className="border-gray-200" />;

    default:
      return <Input placeholder="Unsupported field type" disabled />;
  }
}

export default function FormPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [viewportSize, setViewportSize] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [formValues, setFormValues] = useState<FormValues>({});

  const { data: template, isLoading } = trpc.formTemplate.get.useQuery({
    id: resolvedParams.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Template not found</p>
      </div>
    );
  }

  const fields = template.fields as FormFieldData[];
  const visibleFields = fields.filter((f) => isFieldVisible(f, formValues));

  const viewportClasses = {
    desktop: 'max-w-3xl',
    tablet: 'max-w-md',
    mobile: 'max-w-sm',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/settings/forms/${resolvedParams.id}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Preview: {template.name}</h1>
            <p className="text-sm text-gray-500">See how patients will view this form</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <Button
            variant={viewportSize === 'desktop' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewportSize('desktop')}
          >
            <Monitor className="h-4 w-4" />
          </Button>
          <Button
            variant={viewportSize === 'tablet' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewportSize('tablet')}
          >
            <Tablet className="h-4 w-4" />
          </Button>
          <Button
            variant={viewportSize === 'mobile' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewportSize('mobile')}
          >
            <Smartphone className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Preview Container */}
      <div className="flex justify-center bg-gray-100 rounded-xl p-8 min-h-[600px]">
        <Card className={cn('w-full transition-all duration-300', viewportClasses[viewportSize])}>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            {template.description && <CardDescription>{template.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {visibleFields.map((field) => {
              const isDisplayOnly = ['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.fieldType);
              const isCheckbox = field.fieldType === 'CHECKBOX';

              return (
                <div key={field.id} className={isDisplayOnly ? '' : 'space-y-2'}>
                  {!isDisplayOnly && !isCheckbox && (
                    <Label htmlFor={field.id}>
                      {field.label}
                      {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                  )}
                  <FormFieldRenderer
                    field={field}
                    value={formValues[field.name]}
                    onChange={(value) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: value }))
                    }
                  />
                  {field.helpText && !isDisplayOnly && !isCheckbox && (
                    <p className="text-xs text-gray-500">{field.helpText}</p>
                  )}
                </div>
              );
            })}

            {visibleFields.length > 0 && (
              <div className="pt-4">
                <Button className="w-full bg-gradient-to-r from-cyan-500 to-teal-500">
                  Submit
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
