'use client';

/**
 * Epic 14: Patient Portal - Form Completion Component
 * US-096: Patient form completion portal
 *
 * Features:
 * - Renders form fields matching in-office experience
 * - Auto-saves progress as user fills out form
 * - Signature capture component
 * - Submit completed forms
 * - View previously submitted forms (read-only)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  Save,
  Send,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowLeft,
  Loader2,
  Eye,
  Edit3,
} from 'lucide-react';
import { SignatureCapture } from './SignatureCapture';

// Types
interface FormFieldOption {
  value: string;
  label: string;
}

interface FormField {
  id: string;
  fieldType: string;
  label: string;
  name: string;
  placeholder?: string | null;
  helpText?: string | null;
  order: number;
  isRequired: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: unknown; // Prisma Decimal type
  maxValue?: unknown; // Prisma Decimal type
  pattern?: string | null;
  patternMessage?: string | null;
  options?: unknown; // JSON type from Prisma
  conditionalOn?: string | null;
  conditionalValue?: string | null;
  conditionalOp?: string | null;
  sectionId?: string | null;
}

interface FormSection {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  isCollapsible: boolean;
}

interface FormResponse {
  fieldId: string;
  value?: string | null;
  valueJson?: unknown;
}

interface FormSubmissionData {
  id: string;
  accessToken: string;
  status: string;
  startedAt: Date;
  submittedAt?: Date | null;
  template: {
    id: string;
    name: string;
    description?: string | null;
    fields: FormField[];
    sections: FormSection[];
  };
  patient?: {
    id: string;
    mrn: string;
    demographics?: {
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
    } | null;
  } | null;
  responses: Array<{
    fieldId: string;
    value?: string | null;
    valueJson?: unknown;
    field: FormField;
  }>;
}

interface FormCompletionProps {
  token: string;
}

// Auto-save debounce delay (ms)
const AUTO_SAVE_DELAY = 2000;

export function FormCompletion({ token }: FormCompletionProps) {
  const router = useRouter();
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get portal token from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('portalToken');
    setPortalToken(storedToken);
  }, []);

  // Fetch form data using portal router
  const { data: submission, isLoading, error } = trpc.portal.getFormByToken.useQuery(
    { sessionToken: portalToken!, formToken: token },
    { enabled: !!portalToken && !!token, retry: false }
  );

  // Mutations using portal router
  const saveProgressMutation = trpc.portal.saveFormProgress.useMutation();
  const submitFormMutation = trpc.portal.submitCompletedForm.useMutation();
  const addSignatureMutation = trpc.portal.addFormSignature.useMutation();

  // Initialize form values from existing responses
  useEffect(() => {
    if (submission?.responses) {
      const initial: Record<string, string | string[]> = {};
      submission.responses.forEach((r) => {
        if (r.valueJson && Array.isArray(r.valueJson)) {
          initial[r.fieldId] = r.valueJson as string[];
        } else {
          initial[r.fieldId] = r.value || '';
        }
      });
      setFormValues(initial);
    }
  }, [submission]);

  // Auto-save function
  const saveProgress = useCallback(async () => {
    if (!submission || submission.status === 'COMPLETED' || !portalToken) return;

    const responses: FormResponse[] = Object.entries(formValues).map(([fieldId, value]) => ({
      fieldId,
      value: Array.isArray(value) ? undefined : value,
      valueJson: Array.isArray(value) ? value : undefined,
    }));

    if (responses.length === 0) return;

    setIsSaving(true);
    try {
      await saveProgressMutation.mutateAsync({
        sessionToken: portalToken,
        accessToken: submission.accessToken,
        responses,
      });
      setLastSaved(new Date());
    } catch {
      // Silent fail for auto-save
      console.error('Auto-save failed');
    } finally {
      setIsSaving(false);
    }
  }, [formValues, submission, portalToken, saveProgressMutation]);

  // Debounced auto-save on value changes
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (Object.keys(formValues).length > 0 && submission?.status !== 'COMPLETED') {
      saveTimeoutRef.current = setTimeout(() => {
        saveProgress();
      }, AUTO_SAVE_DELAY);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formValues, submission?.status, saveProgress]);

  // Handle field value change
  const handleValueChange = (fieldId: string, value: string | string[]) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  // Check if field should be visible based on conditional logic
  const isFieldVisible = (field: FormField): boolean => {
    if (!field.conditionalOn) return true;

    const dependentValue = formValues[field.conditionalOn];
    const targetValue = field.conditionalValue;
    const operation = field.conditionalOp || 'equals';

    switch (operation) {
      case 'equals':
        return dependentValue === targetValue;
      case 'not_equals':
        return dependentValue !== targetValue;
      case 'contains':
        return Array.isArray(dependentValue)
          ? dependentValue.includes(targetValue || '')
          : (dependentValue || '').includes(targetValue || '');
      case 'is_empty':
        return !dependentValue || dependentValue.length === 0;
      case 'is_not_empty':
        return !!dependentValue && dependentValue.length > 0;
      default:
        return true;
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    submission?.template.fields.forEach((field) => {
      if (!isFieldVisible(field)) return;

      const value = formValues[field.id];
      const stringValue = Array.isArray(value) ? value.join('') : value || '';

      // Required validation
      if (field.isRequired && !stringValue.trim()) {
        newErrors[field.id] = `${field.label} is required`;
        return;
      }

      if (!stringValue.trim()) return;

      // Min length
      if (field.minLength && stringValue.length < field.minLength) {
        newErrors[field.id] = `${field.label} must be at least ${field.minLength} characters`;
        return;
      }

      // Max length
      if (field.maxLength && stringValue.length > field.maxLength) {
        newErrors[field.id] = `${field.label} must be no more than ${field.maxLength} characters`;
        return;
      }

      // Pattern validation
      if (field.pattern) {
        const regex = new RegExp(field.pattern);
        if (!regex.test(stringValue)) {
          newErrors[field.id] = field.patternMessage || `${field.label} is not in the correct format`;
          return;
        }
      }

      // Email validation
      if (field.fieldType === 'EMAIL' && stringValue) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(stringValue)) {
          newErrors[field.id] = 'Please enter a valid email address';
        }
      }

      // Phone validation
      if (field.fieldType === 'PHONE' && stringValue) {
        const phoneRegex = /^[\d\s\-\(\)\+]+$/;
        if (!phoneRegex.test(stringValue)) {
          newErrors[field.id] = 'Please enter a valid phone number';
        }
      }
    });

    // Check for signature requirement
    const hasSignatureField = submission?.template.fields.some(
      (f) => f.fieldType === 'SIGNATURE' && f.isRequired
    );
    if (hasSignatureField && !signatureData) {
      newErrors['signature'] = 'Signature is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Calculate progress
  const calculateProgress = (): number => {
    if (!submission) return 0;

    const requiredFields = submission.template.fields.filter(
      (f) => f.isRequired && isFieldVisible(f) && f.fieldType !== 'HEADING' && f.fieldType !== 'PARAGRAPH' && f.fieldType !== 'DIVIDER'
    );

    if (requiredFields.length === 0) return 100;

    const completedFields = requiredFields.filter((f) => {
      const value = formValues[f.id];
      const stringValue = Array.isArray(value) ? value.join('') : value || '';
      return stringValue.trim().length > 0;
    });

    return Math.round((completedFields.length / requiredFields.length) * 100);
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm() || !portalToken || !submission) {
      setShowSubmitDialog(false);
      return;
    }

    setIsSubmitting(true);
    try {
      // Save signature first if provided
      if (signatureData) {
        await addSignatureMutation.mutateAsync({
          sessionToken: portalToken,
          accessToken: submission.accessToken,
          signatureData,
          signerName: undefined,
          consentText: 'I agree that my electronic signature is legally binding.',
        });
      }

      // Submit form
      const responses: FormResponse[] = Object.entries(formValues).map(([fieldId, value]) => ({
        fieldId,
        value: Array.isArray(value) ? undefined : value,
        valueJson: Array.isArray(value) ? value : undefined,
      }));

      await submitFormMutation.mutateAsync({
        sessionToken: portalToken,
        accessToken: submission.accessToken,
        responses,
      });

      setShowSubmitDialog(false);
      setShowSuccessDialog(true);
    } catch (err) {
      console.error('Submit failed:', err);
      setErrors({ submit: 'Failed to submit form. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render form field
  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    const value = formValues[field.id];
    const stringValue = Array.isArray(value) ? '' : value || '';
    const arrayValue = Array.isArray(value) ? value : [];
    const fieldError = errors[field.id];
    const isReadOnly = submission?.status === 'COMPLETED';

    // Parse options safely
    const options: FormFieldOption[] = Array.isArray(field.options)
      ? (field.options as FormFieldOption[])
      : [];

    switch (field.fieldType) {
      case 'HEADING':
        return (
          <h3 key={field.id} className="text-lg font-semibold text-stone-900 pt-4 pb-2">
            {field.label}
          </h3>
        );

      case 'PARAGRAPH':
        return (
          <p key={field.id} className="text-stone-600 pb-4">
            {field.label}
          </p>
        );

      case 'DIVIDER':
        return <hr key={field.id} className="my-6 border-stone-200" />;

      case 'TEXT':
      case 'EMAIL':
      case 'PHONE':
      case 'SSN':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'PHONE' ? 'tel' : 'text'}
              placeholder={field.placeholder || undefined}
              value={stringValue}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'NUMBER':
      case 'CURRENCY':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="relative">
              {field.fieldType === 'CURRENCY' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">$</span>
              )}
              <Input
                id={field.id}
                type="number"
                placeholder={field.placeholder || undefined}
                value={stringValue}
                onChange={(e) => handleValueChange(field.id, e.target.value)}
                disabled={isReadOnly}
                className={`${field.fieldType === 'CURRENCY' ? 'pl-7' : ''} ${fieldError ? 'border-red-300 focus:border-red-500' : ''}`}
                min={field.minValue ? Number(field.minValue) : undefined}
                max={field.maxValue ? Number(field.maxValue) : undefined}
              />
            </div>
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'TEXTAREA':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              placeholder={field.placeholder || undefined}
              value={stringValue}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
              rows={4}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'DATE':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={stringValue}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'TIME':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="time"
              value={stringValue}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'DATETIME':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="datetime-local"
              value={stringValue}
              onChange={(e) => handleValueChange(field.id, e.target.value)}
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'SELECT':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select
              value={stringValue}
              onValueChange={(val) => handleValueChange(field.id, val)}
              disabled={isReadOnly}
            >
              <SelectTrigger className={fieldError ? 'border-red-300 focus:border-red-500' : ''}>
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
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'RADIO':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <RadioGroup
              value={stringValue}
              onValueChange={(val) => handleValueChange(field.id, val)}
              disabled={isReadOnly}
              className="space-y-2"
            >
              {options.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
                  <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'CHECKBOX':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={field.id}
                checked={stringValue === 'true'}
                onCheckedChange={(checked) => handleValueChange(field.id, checked ? 'true' : 'false')}
                disabled={isReadOnly}
              />
              <Label htmlFor={field.id} className="font-normal text-stone-700">
                {field.label}
                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            {field.helpText && <p className="text-xs text-stone-500 ml-6">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500 ml-6">{fieldError}</p>}
          </div>
        );

      case 'CHECKBOX_GROUP':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="space-y-2">
              {options.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field.id}-${opt.value}`}
                    checked={arrayValue.includes(opt.value)}
                    onCheckedChange={(checked) => {
                      const newValue = checked
                        ? [...arrayValue, opt.value]
                        : arrayValue.filter((v) => v !== opt.value);
                      handleValueChange(field.id, newValue);
                    }}
                    disabled={isReadOnly}
                  />
                  <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      case 'SIGNATURE':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <SignatureCapture
              onSignatureChange={setSignatureData}
              disabled={isReadOnly}
              existingSignature={signatureData || undefined}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {(fieldError || errors['signature']) && (
              <p className="text-xs text-red-500">{fieldError || errors['signature']}</p>
            )}
          </div>
        );

      case 'FILE':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-stone-700">
              {field.label}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="file"
              disabled={isReadOnly}
              className={fieldError ? 'border-red-300 focus:border-red-500' : ''}
            />
            {field.helpText && <p className="text-xs text-stone-500">{field.helpText}</p>}
            {fieldError && <p className="text-xs text-red-500">{fieldError}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  // Group fields by section
  const renderSections = () => {
    if (!submission) return null;

    const { fields, sections } = submission.template;

    // Sort sections by order
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);

    // Fields without sections
    const unsectionedFields = fields
      .filter((f) => !f.sectionId)
      .sort((a, b) => a.order - b.order);

    return (
      <>
        {/* Unsectioned fields first */}
        {unsectionedFields.length > 0 && (
          <div className="space-y-6">
            {unsectionedFields.map(renderField)}
          </div>
        )}

        {/* Sectioned fields */}
        {sortedSections.map((section) => {
          const sectionFields = fields
            .filter((f) => f.sectionId === section.id)
            .sort((a, b) => a.order - b.order);

          if (sectionFields.length === 0) return null;

          return (
            <Card key={section.id} className="border-stone-200">
              <CardHeader className="bg-stone-50 border-b border-stone-200">
                <CardTitle className="text-lg text-stone-900">{section.title}</CardTitle>
                {section.description && (
                  <CardDescription>{section.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {sectionFields.map(renderField)}
              </CardContent>
            </Card>
          );
        })}
      </>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center">
          <div className="p-4 bg-red-50 rounded-full w-fit mx-auto mb-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <p className="text-red-900 font-medium mb-2">Form Not Found</p>
          <p className="text-red-600 text-sm mb-6">
            {error.message || 'This form may have expired or the link is invalid.'}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push('/portal/forms')}
            className="border-stone-200"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forms
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!submission) return null;

  const progress = calculateProgress();
  const isReadOnly = submission.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/portal/forms')}
              className="text-stone-500 hover:text-stone-700 -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-stone-900">{submission.template.name}</h1>
          {submission.template.description && (
            <p className="text-stone-600 mt-1">{submission.template.description}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={
            isReadOnly
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-blue-50 text-[#053e67] border-blue-200'
          }
        >
          {isReadOnly ? (
            <>
              <Eye className="h-3 w-3 mr-1" />
              View Only
            </>
          ) : (
            <>
              <Edit3 className="h-3 w-3 mr-1" />
              In Progress
            </>
          )}
        </Badge>
      </div>

      {/* Progress Bar */}
      {!isReadOnly && (
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-stone-700">Form Progress</span>
              <span className="text-sm text-stone-500">{progress}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between mt-2 text-xs text-stone-500">
              <div className="flex items-center gap-1">
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : lastSaved ? (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Saved {format(lastSaved, 'h:mm a')}
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    Auto-save enabled
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Form Info */}
      {isReadOnly && submission.submittedAt && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            This form was submitted on {format(new Date(submission.submittedAt), 'MMMM d, yyyy at h:mm a')}.
          </AlertDescription>
        </Alert>
      )}

      {/* Form Errors */}
      {errors.submit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errors.submit}</AlertDescription>
        </Alert>
      )}

      {/* Form Content */}
      <div className="space-y-6">
        {renderSections()}
      </div>

      {/* Action Buttons */}
      {!isReadOnly && (
        <Card className="border-stone-200 sticky bottom-4 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={saveProgress}
                disabled={isSaving}
                className="border-stone-200"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Progress
              </Button>
              <Button
                onClick={() => setShowSubmitDialog(true)}
                className="bg-[#053e67] hover:bg-[#042d4d] text-white"
              >
                <Send className="h-4 w-4 mr-2" />
                Submit Form
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Form</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this form? Once submitted, you won't be able to make changes.
            </DialogDescription>
          </DialogHeader>
          {Object.keys(errors).length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please correct the errors before submitting.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-[#053e67] hover:bg-[#042d4d] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto p-4 bg-green-50 rounded-full w-fit mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <DialogTitle className="text-center">Form Submitted Successfully!</DialogTitle>
            <DialogDescription className="text-center">
              Thank you for completing the form. Our staff will review your submission.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => router.push('/portal/forms')}
              className="bg-[#053e67] hover:bg-[#042d4d] text-white"
            >
              Back to Forms
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
