'use client';

/**
 * Patient Form Filling Page
 * Epic 04: Digital Intake System
 * US-041: Patient form filling UI
 */

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignaturePad, type SignaturePadRef } from '@/components/forms';
import { trpc } from '@/trpc/client';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PatientFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [currentSection, setCurrentSection] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const signatureRefs = useRef<Record<string, SignaturePadRef | null>>({});

  // Fetch form data by token
  const { data: formData, isLoading, error } = trpc.formSubmission.getByToken.useQuery(
    { token },
    { refetchOnWindowFocus: false }
  );

  // Save progress mutation
  const saveProgress = trpc.formSubmission.saveResponses.useMutation({
    onSuccess: () => {
      setLastSaved(new Date());
    },
  });

  // Submit mutation
  const submitForm = trpc.formSubmission.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      setErrors({ submit: err.message });
    },
  });

  // Initialize values from saved responses
  useEffect(() => {
    if (formData?.responses) {
      const initialValues: Record<string, string> = {};
      formData.responses.forEach((r) => {
        if (r.value) {
          initialValues[r.fieldId] = r.value;
        }
      });
      setValues(initialValues);
    }
  }, [formData?.responses]);

  // Auto-save progress every 30 seconds
  useEffect(() => {
    if (!formData || submitted) return;

    const timer = setInterval(() => {
      handleSaveProgress();
    }, 30000);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, submitted]);

  const handleSaveProgress = async () => {
    if (!formData) return;

    const responses = Object.entries(values).map(([fieldId, value]) => ({
      fieldId,
      value,
    }));

    saveProgress.mutate({
      token,
      responses,
    });
  };

  const handleValueChange = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error when value changes
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  type FormFieldData = NonNullable<typeof formData>['template']['fields'][0];

  const validateField = (field: FormFieldData, value: string): string | null => {
    if (field.isRequired && (!value || value.trim() === '')) {
      return `${field.label} is required`;
    }

    if (value && field.minLength !== null && field.minLength !== undefined) {
      if (field.fieldType === 'TEXT' || field.fieldType === 'TEXTAREA') {
        if (value.length < field.minLength) {
          return field.patternMessage || `Minimum ${field.minLength} characters required`;
        }
      }
    }

    if (value && field.maxLength !== null && field.maxLength !== undefined) {
      if (field.fieldType === 'TEXT' || field.fieldType === 'TEXTAREA') {
        if (value.length > field.maxLength) {
          return field.patternMessage || `Maximum ${field.maxLength} characters allowed`;
        }
      }
    }

    if (value && field.minValue !== null && field.minValue !== undefined) {
      if (field.fieldType === 'NUMBER' || field.fieldType === 'CURRENCY') {
        const num = parseFloat(value);
        if (num < Number(field.minValue)) {
          return field.patternMessage || `Minimum value is ${field.minValue}`;
        }
      }
    }

    if (value && field.maxValue !== null && field.maxValue !== undefined) {
      if (field.fieldType === 'NUMBER' || field.fieldType === 'CURRENCY') {
        const num = parseFloat(value);
        if (num > Number(field.maxValue)) {
          return field.patternMessage || `Maximum value is ${field.maxValue}`;
        }
      }
    }

    if (value && field.pattern) {
      const regex = new RegExp(field.pattern);
      if (!regex.test(value)) {
        return field.patternMessage || 'Invalid format';
      }
    }

    // Email validation
    if (field.fieldType === 'EMAIL' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
    }

    // Phone validation
    if (field.fieldType === 'PHONE' && value) {
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 10) {
        return 'Please enter a valid phone number';
      }
    }

    // Signature validation
    if (field.fieldType === 'SIGNATURE' && field.isRequired) {
      const sigRef = signatureRefs.current[field.id];
      if (!sigRef || sigRef.isEmpty()) {
        return 'Signature is required';
      }
    }

    return null;
  };

  const isFieldVisible = (field: FormFieldData): boolean => {
    if (!field.conditionalOn) return true;

    const conditionalValue = values[field.conditionalOn];
    const expectedValue = field.conditionalValue;

    switch (field.conditionalOp) {
      case 'equals':
        return conditionalValue === expectedValue;
      case 'not_equals':
        return conditionalValue !== expectedValue;
      case 'contains':
        return conditionalValue?.includes(expectedValue || '') || false;
      case 'is_empty':
        return !conditionalValue || conditionalValue.trim() === '';
      case 'is_not_empty':
        return !!conditionalValue && conditionalValue.trim() !== '';
      default:
        return true;
    }
  };

  const getSectionFields = (sectionId: string | null) => {
    if (!formData) return [];
    return formData.template.fields
      .filter((f) => {
        if (sectionId === 'default' || sectionId === null) {
          return !f.sectionId;
        }
        return f.sectionId === sectionId;
      })
      .sort((a, b) => a.order - b.order);
  };

  const getSortedSections = () => {
    if (!formData) return [];
    const sections = [...formData.template.sections].sort((a, b) => a.order - b.order);

    // If no sections, create a virtual "default" section
    if (sections.length === 0) {
      return [{
        id: 'default',
        title: formData.template.name,
        description: formData.template.description || null,
        order: 0,
        templateId: formData.template.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        isCollapsible: false,
      }];
    }
    return sections;
  };

  const validateSection = (sectionIndex: number): boolean => {
    if (!formData) return false;

    const sortedSections = getSortedSections();
    const section = sortedSections[sectionIndex];
    const sectionFields = getSectionFields(section?.id || null);
    const newErrors: Record<string, string> = {};

    sectionFields.forEach((field) => {
      if (!isFieldVisible(field)) return;

      // For signature fields, capture the signature data
      if (field.fieldType === 'SIGNATURE') {
        const sigRef = signatureRefs.current[field.id];
        if (sigRef && !sigRef.isEmpty()) {
          const sigData = sigRef.getSignatureData();
          if (sigData) {
            handleValueChange(field.id, sigData);
          }
        }
      }

      const error = validateField(field, values[field.id] || '');
      if (error) {
        newErrors[field.id] = error;
      }
    });

    setErrors((prev) => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateSection(currentSection)) {
      handleSaveProgress();
      const sortedSections = getSortedSections();
      setCurrentSection((prev) => Math.min(prev + 1, sortedSections.length - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentSection((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!formData) return;

    // Validate all sections
    let allValid = true;
    const allErrors: Record<string, string> = {};
    const sortedSections = getSortedSections();

    sortedSections.forEach((section) => {
      const sectionFields = getSectionFields(section?.id || null);
      sectionFields.forEach((field) => {
        if (!isFieldVisible(field)) return;

        // Capture signature data
        if (field.fieldType === 'SIGNATURE') {
          const sigRef = signatureRefs.current[field.id];
          if (sigRef && !sigRef.isEmpty()) {
            const sigData = sigRef.getSignatureData();
            if (sigData) {
              values[field.id] = sigData;
            }
          }
        }

        const error = validateField(field, values[field.id] || '');
        if (error) {
          allErrors[field.id] = error;
          allValid = false;
        }
      });
    });

    if (!allValid) {
      setErrors(allErrors);
      // Find first section with error and navigate to it
      for (let i = 0; i < sortedSections.length; i++) {
        const section = sortedSections[i];
        const sectionFields = getSectionFields(section?.id || null);
        if (sectionFields.some((f) => allErrors[f.id])) {
          setCurrentSection(i);
          break;
        }
      }
      return;
    }

    setIsSubmitting(true);

    const responses = Object.entries(values).map(([fieldId, value]) => ({
      fieldId,
      value,
    }));

    submitForm.mutate({
      token,
      responses,
    });

    setIsSubmitting(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Form Not Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              {error?.message || 'This form link is invalid or has expired. Please contact the office for a new form link.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if already submitted
  if (formData.status === 'COMPLETED' || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Form Submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Thank you! Your form has been submitted successfully. You may close this page.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700">
                <strong>What&apos;s next?</strong> Our team will review your information before your appointment.
                If we have any questions, we&apos;ll reach out to you.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { template } = formData;
  const sortedSections = getSortedSections();
  const currentSectionData = sortedSections[currentSection];
  const currentFields = getSectionFields(currentSectionData?.id || null);
  const progress = ((currentSection + 1) / sortedSections.length) * 100;

  // Parse options from JSON if needed
  const getFieldOptions = (field: typeof template.fields[0]): string[] => {
    if (!field.options) return [];
    if (Array.isArray(field.options)) {
      // Could be array of strings or array of { value, label }
      return field.options.map((opt: unknown) => {
        if (typeof opt === 'string') return opt;
        if (typeof opt === 'object' && opt !== null && 'label' in opt) {
          return (opt as { label: string }).label;
        }
        return String(opt);
      });
    }
    return [];
  };

  const renderField = (field: typeof template.fields[0]) => {
    if (!isFieldVisible(field)) return null;

    const value = values[field.id] || '';
    const fieldError = errors[field.id];
    const options = getFieldOptions(field);

    const commonProps = {
      id: field.id,
      'aria-invalid': !!fieldError,
      'aria-describedby': fieldError ? `${field.id}-error` : field.helpText ? `${field.id}-help` : undefined,
    };

    switch (field.fieldType) {
      case 'TEXT':
      case 'EMAIL':
      case 'PHONE':
      case 'NUMBER':
      case 'CURRENCY':
        return (
          <Input
            {...commonProps}
            type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'PHONE' ? 'tel' : field.fieldType === 'NUMBER' || field.fieldType === 'CURRENCY' ? 'number' : 'text'}
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.placeholder || undefined}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'SSN':
        return (
          <Input
            {...commonProps}
            type="password"
            value={value}
            onChange={(e) => {
              // Only allow digits and dashes
              const cleaned = e.target.value.replace(/[^\d-]/g, '');
              handleValueChange(field.id, cleaned);
            }}
            placeholder="XXX-XX-XXXX"
            maxLength={11}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'TEXTAREA':
        return (
          <Textarea
            {...commonProps}
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.placeholder || undefined}
            rows={4}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'DATE':
        return (
          <Input
            {...commonProps}
            type="date"
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'TIME':
        return (
          <Input
            {...commonProps}
            type="time"
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'DATETIME':
        return (
          <Input
            {...commonProps}
            type="datetime-local"
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            className={cn(fieldError && 'border-destructive')}
          />
        );

      case 'SELECT':
        return (
          <Select
            value={value}
            onValueChange={(v) => handleValueChange(field.id, v)}
          >
            <SelectTrigger className={cn(fieldError && 'border-destructive')}>
              <SelectValue placeholder={field.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt, i) => (
                <SelectItem key={i} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'RADIO':
        return (
          <RadioGroup
            value={value}
            onValueChange={(v) => handleValueChange(field.id, v)}
            className="space-y-2"
          >
            {options.map((opt, i) => (
              <div key={i} className="flex items-center space-x-2">
                <RadioGroupItem value={opt} id={`${field.id}-${i}`} />
                <Label htmlFor={`${field.id}-${i}`} className="font-normal cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'CHECKBOX':
        if (options.length > 1) {
          // Multi-select checkboxes
          const selectedValues = value ? value.split(',') : [];
          return (
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field.id}-${i}`}
                    checked={selectedValues.includes(opt)}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...selectedValues, opt]
                        : selectedValues.filter((v) => v !== opt);
                      handleValueChange(field.id, newValues.join(','));
                    }}
                  />
                  <Label htmlFor={`${field.id}-${i}`} className="font-normal cursor-pointer">
                    {opt}
                  </Label>
                </div>
              ))}
            </div>
          );
        } else {
          // Single boolean checkbox
          return (
            <div className="flex items-center space-x-2">
              <Checkbox
                id={field.id}
                checked={value === 'true'}
                onCheckedChange={(checked) => handleValueChange(field.id, String(checked))}
              />
              <Label htmlFor={field.id} className="font-normal cursor-pointer">
                {options[0] || 'Yes'}
              </Label>
            </div>
          );
        }

      case 'SIGNATURE':
        return (
          <div className="space-y-2">
            <SignaturePad
              ref={(ref) => {
                signatureRefs.current[field.id] = ref;
              }}
              className={cn(fieldError && 'border-destructive')}
            />
            <p className="text-xs text-muted-foreground">
              Sign in the box above using your mouse or finger
            </p>
          </div>
        );

      case 'FILE':
        return (
          <div className="space-y-2">
            <Input
              {...commonProps}
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // For now, store the filename - actual upload handled by server
                  handleValueChange(field.id, file.name);
                }
              }}
              className={cn(fieldError && 'border-destructive')}
            />
          </div>
        );

      case 'HEADING':
        return (
          <h3 className="text-lg font-semibold text-gray-900">
            {field.label}
          </h3>
        );

      case 'PARAGRAPH':
        return (
          <p className="text-gray-600 whitespace-pre-wrap">
            {field.placeholder || field.label}
          </p>
        );

      default:
        return (
          <Input
            {...commonProps}
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.placeholder || undefined}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">{template.name}</h1>
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              Section {currentSection + 1} of {sortedSections.length}
            </span>
            <span className="text-muted-foreground">
              {Math.round(progress)}% complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {lastSaved && (
            <p className="text-xs text-muted-foreground mt-2">
              Progress saved {lastSaved.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Form Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>{currentSectionData?.title || 'Form'}</CardTitle>
            {currentSectionData?.description && (
              <CardDescription>{currentSectionData.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {currentFields.map((field) => {
              if (!isFieldVisible(field)) return null;
              if (field.fieldType === 'HEADING' || field.fieldType === 'PARAGRAPH') {
                return <div key={field.id}>{renderField(field)}</div>;
              }

              return (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id} className={cn(field.isRequired && "after:content-['*'] after:text-destructive after:ml-0.5")}>
                    {field.label}
                  </Label>
                  {renderField(field)}
                  {field.helpText && (
                    <p id={`${field.id}-help`} className="text-sm text-muted-foreground">
                      {field.helpText}
                    </p>
                  )}
                  {errors[field.id] && (
                    <p id={`${field.id}-error`} className="text-sm text-destructive" role="alert">
                      {errors[field.id]}
                    </p>
                  )}
                </div>
              );
            })}

            {errors.submit && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.submit}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentSection === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {currentSection < sortedSections.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Submit Form
                </>
              )}
            </Button>
          )}
        </div>

        {/* Mobile-friendly save button */}
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveProgress}
            disabled={saveProgress.isPending}
          >
            {saveProgress.isPending ? 'Saving...' : 'Save Progress'}
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          <p>Your information is secure and confidential.</p>
          <p className="mt-1">Having trouble? Contact our office for assistance.</p>
        </div>
      </footer>
    </div>
  );
}
