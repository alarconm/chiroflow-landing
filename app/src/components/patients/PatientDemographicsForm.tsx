'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInYears, differenceInMonths } from 'date-fns';
import { CalendarIcon, Eye, EyeOff, User, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Form validation schema
const demographicsSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  preferredName: z.string().optional(),
  dateOfBirth: z.date({ message: 'Date of birth is required' }),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY']),
  pronouns: z.string().optional(),
  ssn: z.string().optional(),
  language: z.string(),
  ethnicity: z.string().optional(),
  race: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  notes: z.string().optional(),
});

export type DemographicsFormData = z.infer<typeof demographicsSchema>;

// Contact preference schema (for contact section)
const contactPreferenceSchema = z.enum(['EMAIL', 'PHONE', 'SMS', 'MAIL']);
export type ContactPreference = z.infer<typeof contactPreferenceSchema>;

interface PatientDemographicsFormProps {
  initialData?: Partial<DemographicsFormData>;
  onSubmit: (data: DemographicsFormData) => void | Promise<void>;
  isLoading?: boolean;
  mode?: 'create' | 'edit';
  showContactPreference?: boolean;
  contactPreference?: ContactPreference;
  onContactPreferenceChange?: (value: ContactPreference) => void;
}

// Gender options
const genderOptions = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'NON_BINARY', label: 'Non-binary' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

// Common pronouns
const pronounOptions = [
  { value: 'he/him', label: 'He/Him' },
  { value: 'she/her', label: 'She/Her' },
  { value: 'they/them', label: 'They/Them' },
  { value: 'he/they', label: 'He/They' },
  { value: 'she/they', label: 'She/They' },
  { value: 'other', label: 'Other (specify)' },
];

// Marital status options
const maritalStatusOptions = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
  { value: 'domestic_partner', label: 'Domestic Partner' },
];

// Contact preference options
const contactPreferenceOptions = [
  { value: 'PHONE', label: 'Phone Call' },
  { value: 'SMS', label: 'Text Message (SMS)' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MAIL', label: 'Mail' },
];

// Language options
const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ru', label: 'Russian' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'ar', label: 'Arabic' },
  { value: 'other', label: 'Other' },
];

export function PatientDemographicsForm({
  initialData,
  onSubmit,
  isLoading = false,
  mode = 'create',
  showContactPreference = false,
  contactPreference = 'PHONE',
  onContactPreferenceChange,
}: PatientDemographicsFormProps) {
  const [showSSN, setShowSSN] = useState(false);
  const [customPronouns, setCustomPronouns] = useState(false);

  const form = useForm<DemographicsFormData>({
    resolver: zodResolver(demographicsSchema),
    defaultValues: {
      firstName: initialData?.firstName ?? '',
      middleName: initialData?.middleName ?? '',
      lastName: initialData?.lastName ?? '',
      preferredName: initialData?.preferredName ?? '',
      dateOfBirth: initialData?.dateOfBirth,
      gender: initialData?.gender ?? 'PREFER_NOT_TO_SAY',
      pronouns: initialData?.pronouns ?? '',
      ssn: initialData?.ssn ?? '',
      language: initialData?.language ?? 'en',
      ethnicity: initialData?.ethnicity ?? '',
      race: initialData?.race ?? '',
      maritalStatus: initialData?.maritalStatus ?? '',
      occupation: initialData?.occupation ?? '',
      employer: initialData?.employer ?? '',
      notes: initialData?.notes ?? '',
    },
  });

  const watchedDOB = form.watch('dateOfBirth');
  const watchedPronouns = form.watch('pronouns');

  // Calculate age from DOB
  const age = useMemo(() => {
    if (!watchedDOB) return null;
    const years = differenceInYears(new Date(), watchedDOB);
    if (years < 2) {
      const months = differenceInMonths(new Date(), watchedDOB);
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  }, [watchedDOB]);

  // Format SSN for display (mask all but last 4)
  const formatSSNInput = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 5) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 9)}`;
  };

  const maskSSN = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 4) return cleaned;
    const masked = '*'.repeat(Math.max(0, cleaned.length - 4));
    const last4 = cleaned.slice(-4);
    if (cleaned.length <= 3) return masked;
    if (cleaned.length <= 5) return `***-${masked.slice(3) || ''}${last4.slice(0, cleaned.length - 3)}`;
    return `***-**-${last4}`;
  };

  const handleSSNChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSSNInput(e.target.value);
    form.setValue('ssn', formatted);
  };

  const handleSubmit = form.handleSubmit(onSubmit);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-[#053e67]/50" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                {...form.register('firstName')}
                placeholder="John"
                disabled={isLoading}
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">Middle Name</Label>
              <Input
                id="middleName"
                {...form.register('middleName')}
                placeholder="Michael"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lastName"
                {...form.register('lastName')}
                placeholder="Smith"
                disabled={isLoading}
              />
              {form.formState.errors.lastName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredName">Preferred Name</Label>
              <Input
                id="preferredName"
                {...form.register('preferredName')}
                placeholder="Johnny"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* DOB and Age */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>
                Date of Birth <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !watchedDOB && 'text-muted-foreground'
                    )}
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watchedDOB ? (
                      <>
                        {format(watchedDOB, 'MMMM d, yyyy')}
                        {age && (
                          <span className="ml-auto text-muted-foreground">
                            ({age} old)
                          </span>
                        )}
                      </>
                    ) : (
                      'Select date of birth'
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={watchedDOB}
                    onSelect={(date) => form.setValue('dateOfBirth', date as Date)}
                    disabled={(date) => date > new Date()}
                    autoFocus
                    captionLayout="dropdown"
                    startMonth={new Date(1900, 0)}
                    endMonth={new Date()}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.dateOfBirth && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.dateOfBirth.message}
                </p>
              )}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={form.watch('gender')}
                onValueChange={(value) =>
                  form.setValue('gender', value as DemographicsFormData['gender'])
                }
                disabled={isLoading}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pronouns */}
            <div className="space-y-2">
              <Label htmlFor="pronouns">Pronouns</Label>
              {customPronouns ? (
                <Input
                  id="pronouns"
                  {...form.register('pronouns')}
                  placeholder="Enter pronouns"
                  disabled={isLoading}
                />
              ) : (
                <Select
                  value={watchedPronouns || ''}
                  onValueChange={(value) => {
                    if (value === 'other') {
                      setCustomPronouns(true);
                      form.setValue('pronouns', '');
                    } else {
                      form.setValue('pronouns', value);
                    }
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger id="pronouns">
                    <SelectValue placeholder="Select pronouns" />
                  </SelectTrigger>
                  <SelectContent>
                    {pronounOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* SSN */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ssn">Social Security Number</Label>
              <div className="relative">
                <Input
                  id="ssn"
                  type={showSSN ? 'text' : 'password'}
                  value={
                    showSSN
                      ? form.watch('ssn') || ''
                      : maskSSN(form.watch('ssn') || '')
                  }
                  onChange={handleSSNChange}
                  placeholder="XXX-XX-XXXX"
                  maxLength={11}
                  disabled={isLoading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSSN(!showSSN)}
                  disabled={isLoading}
                >
                  {showSSN ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                For insurance verification and HIPAA compliance
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="language">Preferred Language</Label>
              <Select
                value={form.watch('language')}
                onValueChange={(value) => form.setValue('language', value)}
                disabled={isLoading}
              >
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marital Status */}
            <div className="space-y-2">
              <Label htmlFor="maritalStatus">Marital Status</Label>
              <Select
                value={form.watch('maritalStatus') || ''}
                onValueChange={(value) => form.setValue('maritalStatus', value)}
                disabled={isLoading}
              >
                <SelectTrigger id="maritalStatus">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {maritalStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Heart className="h-5 w-5 text-[#053e67]/50" />
            Additional Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                {...form.register('occupation')}
                placeholder="Software Engineer"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employer">Employer</Label>
              <Input
                id="employer"
                {...form.register('employer')}
                placeholder="Acme Inc."
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ethnicity">Ethnicity</Label>
              <Input
                id="ethnicity"
                {...form.register('ethnicity')}
                placeholder="Optional"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="race">Race</Label>
              <Input
                id="race"
                {...form.register('race')}
                placeholder="Optional"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              {...form.register('notes')}
              placeholder="Notes visible only to staff..."
              rows={3}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact Preference - optional section */}
      {showContactPreference && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Contact Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="contactPreference">
                Preferred Contact Method
              </Label>
              <Select
                value={contactPreference}
                onValueChange={(value) =>
                  onContactPreferenceChange?.(value as ContactPreference)
                }
                disabled={isLoading}
              >
                <SelectTrigger id="contactPreference">
                  <SelectValue placeholder="Select contact method" />
                </SelectTrigger>
                <SelectContent>
                  {contactPreferenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
        >
          {isLoading
            ? 'Saving...'
            : mode === 'create'
            ? 'Create Patient'
            : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

export default PatientDemographicsForm;
