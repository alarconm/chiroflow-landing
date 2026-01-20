'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPin, Phone, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// US states for dropdown
const usStates = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// Form validation schema
const contactSchema = z.object({
  isPrimary: z.boolean(),
  contactPreference: z.enum(['EMAIL', 'PHONE', 'SMS', 'MAIL']),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string(),
  homePhone: z.string().optional(),
  mobilePhone: z.string().optional(),
  workPhone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  allowSms: z.boolean(),
  allowEmail: z.boolean(),
  allowVoicemail: z.boolean(),
});

export type ContactFormData = z.infer<typeof contactSchema>;

interface PatientContactFormProps {
  initialData?: Partial<ContactFormData>;
  onSubmit: (data: ContactFormData) => void | Promise<void>;
  isLoading?: boolean;
  showSubmitButton?: boolean;
}

// Format phone number as user types
const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
};

export function PatientContactForm({
  initialData,
  onSubmit,
  isLoading = false,
  showSubmitButton = true,
}: PatientContactFormProps) {
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      isPrimary: initialData?.isPrimary ?? true,
      contactPreference: initialData?.contactPreference ?? 'PHONE',
      addressLine1: initialData?.addressLine1 ?? '',
      addressLine2: initialData?.addressLine2 ?? '',
      city: initialData?.city ?? '',
      state: initialData?.state ?? '',
      zipCode: initialData?.zipCode ?? '',
      country: initialData?.country ?? 'US',
      homePhone: initialData?.homePhone ?? '',
      mobilePhone: initialData?.mobilePhone ?? '',
      workPhone: initialData?.workPhone ?? '',
      email: initialData?.email ?? '',
      allowSms: initialData?.allowSms ?? true,
      allowEmail: initialData?.allowEmail ?? true,
      allowVoicemail: initialData?.allowVoicemail ?? true,
    },
  });

  const handlePhoneChange = (
    field: 'homePhone' | 'mobilePhone' | 'workPhone',
    value: string
  ) => {
    form.setValue(field, formatPhoneNumber(value));
  };

  const handleSubmit = form.handleSubmit(onSubmit);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Address */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-cyan-500" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="addressLine1">Street Address</Label>
            <Input
              id="addressLine1"
              {...form.register('addressLine1')}
              placeholder="123 Main Street"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine2">Address Line 2</Label>
            <Input
              id="addressLine2"
              {...form.register('addressLine2')}
              placeholder="Apt 4B, Suite 100, etc."
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                {...form.register('city')}
                placeholder="Portland"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select
                value={form.watch('state') || ''}
                onValueChange={(value) => form.setValue('state', value)}
                disabled={isLoading}
              >
                <SelectTrigger id="state">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {usStates.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                {...form.register('zipCode')}
                placeholder="97201"
                maxLength={10}
                disabled={isLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone Numbers */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5 text-cyan-500" />
            Phone Numbers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="mobilePhone">Mobile Phone</Label>
              <Input
                id="mobilePhone"
                type="tel"
                value={form.watch('mobilePhone') || ''}
                onChange={(e) => handlePhoneChange('mobilePhone', e.target.value)}
                placeholder="(555) 123-4567"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="homePhone">Home Phone</Label>
              <Input
                id="homePhone"
                type="tel"
                value={form.watch('homePhone') || ''}
                onChange={(e) => handlePhoneChange('homePhone', e.target.value)}
                placeholder="(555) 123-4567"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workPhone">Work Phone</Label>
              <Input
                id="workPhone"
                type="tel"
                value={form.watch('workPhone') || ''}
                onChange={(e) => handlePhoneChange('workPhone', e.target.value)}
                placeholder="(555) 123-4567"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register('allowSms')}
                className="rounded border-gray-300"
                disabled={isLoading}
              />
              Allow SMS/Text
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register('allowVoicemail')}
                className="rounded border-gray-300"
                disabled={isLoading}
              />
              Allow Voicemail
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-cyan-500" />
            Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              {...form.register('email')}
              placeholder="patient@example.com"
              disabled={isLoading}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...form.register('allowEmail')}
              className="rounded border-gray-300"
              disabled={isLoading}
            />
            Allow email communications
          </label>
        </CardContent>
      </Card>

      {/* Contact Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-cyan-500" />
            Contact Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contactPreference">Preferred Contact Method</Label>
            <Select
              value={form.watch('contactPreference')}
              onValueChange={(value) =>
                form.setValue('contactPreference', value as ContactFormData['contactPreference'])
              }
              disabled={isLoading}
            >
              <SelectTrigger id="contactPreference">
                <SelectValue placeholder="Select preferred method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHONE">Phone Call</SelectItem>
                <SelectItem value="SMS">Text Message (SMS)</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="MAIL">Mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      {showSubmitButton && (
        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600"
          >
            {isLoading ? 'Saving...' : 'Save Contact Info'}
          </Button>
        </div>
      )}
    </form>
  );
}

export default PatientContactForm;
