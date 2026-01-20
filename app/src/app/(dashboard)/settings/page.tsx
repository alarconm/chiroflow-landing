'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { Building2, MapPin, Phone, Globe, Clock } from 'lucide-react';

// Common US timezones
const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

type FormData = {
  name: string;
  practiceName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  timezone: string;
};

export default function SettingsPage() {
  const { isAtLeast, isLoading: permissionsLoading } = usePermissions();
  const canEdit = isAtLeast('ADMIN');

  const { data: org, isLoading: orgLoading } = trpc.organization.get.useQuery();
  const updateOrg = trpc.organization.update.useMutation({
    onSuccess: () => {
      toast.success('Settings saved successfully');
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    practiceName: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    website: '',
    timezone: 'America/New_York',
  });

  // Initialize form data when org loads
  const settings = org?.settings as Record<string, unknown> | undefined;
  const address = settings?.address as Record<string, string> | undefined;

  if (org && !hasChanges && formData.name === '') {
    setFormData({
      name: org.name || '',
      practiceName: (settings?.practiceName as string) || '',
      street: address?.street || '',
      city: address?.city || '',
      state: address?.state || '',
      zip: address?.zip || '',
      phone: (settings?.phone as string) || '',
      website: (settings?.website as string) || '',
      timezone: (settings?.timezone as string) || 'America/New_York',
    });
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleCancel = () => {
    if (org) {
      setFormData({
        name: org.name || '',
        practiceName: (settings?.practiceName as string) || '',
        street: address?.street || '',
        city: address?.city || '',
        state: address?.state || '',
        zip: address?.zip || '',
        phone: (settings?.phone as string) || '',
        website: (settings?.website as string) || '',
        timezone: (settings?.timezone as string) || 'America/New_York',
      });
    }
    setHasChanges(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    updateOrg.mutate({
      name: formData.name,
      settings: {
        practiceName: formData.practiceName,
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: 'US',
        },
        phone: formData.phone,
        website: formData.website || undefined,
        timezone: formData.timezone,
      },
    });
  };

  if (orgLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization profile and preferences.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Organization Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-cyan-500" />
              <CardTitle>Organization Profile</CardTitle>
            </div>
            <CardDescription>
              Basic information about your chiropractic practice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  disabled={!canEdit}
                  placeholder="My Chiropractic Clinic"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="practiceName">Practice Name (DBA)</Label>
                <Input
                  id="practiceName"
                  value={formData.practiceName}
                  onChange={(e) => handleChange('practiceName', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Smith Family Chiropractic"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-cyan-500" />
              <CardTitle>Practice Address</CardTitle>
            </div>
            <CardDescription>Where patients can find your practice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street Address</Label>
              <Input
                id="street"
                value={formData.street}
                onChange={(e) => handleChange('street', e.target.value)}
                disabled={!canEdit}
                placeholder="123 Main Street, Suite 100"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Portland"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  disabled={!canEdit}
                  placeholder="OR"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => handleChange('zip', e.target.value)}
                  disabled={!canEdit}
                  placeholder="97201"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Preferences */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-cyan-500" />
              <CardTitle>Contact & Preferences</CardTitle>
            </div>
            <CardDescription>Contact information and system preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  disabled={!canEdit}
                  placeholder="(503) 555-0100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    disabled={!canEdit}
                    placeholder="https://mychiropractor.com"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => handleChange('timezone', value)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="timezone" className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {canEdit && (
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={!hasChanges || updateOrg.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!hasChanges || updateOrg.isPending}
              className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600"
            >
              {updateOrg.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}

        {!canEdit && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              You don&apos;t have permission to edit settings. Contact your administrator if you
              need to make changes.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
