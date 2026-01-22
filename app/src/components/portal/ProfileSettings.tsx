'use client';

/**
 * Epic 14: Patient Portal - Profile Settings Component
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import {
  User,
  Lock,
  Bell,
  Shield,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

export function ProfileSettings() {
  const [token, setToken] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Profile form state
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification preferences
  const [emailAppointmentReminders, setEmailAppointmentReminders] = useState(true);
  const [smsAppointmentReminders, setSmsAppointmentReminders] = useState(false);
  const [emailStatementNotifications, setEmailStatementNotifications] = useState(true);
  const [emailMessageNotifications, setEmailMessageNotifications] = useState(true);

  // Messages
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [preferencesSuccess, setPreferencesSuccess] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: profileData, isLoading: isLoadingProfile } = trpc.portal.getProfile.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const { data: preferencesData, isLoading: isLoadingPreferences } = trpc.portal.getPreferences.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Set initial values when data loads
  useEffect(() => {
    if (profileData) {
      setEmail(profileData.email || '');
      setPhone(profileData.phone || '');
    }
  }, [profileData]);

  useEffect(() => {
    if (preferencesData) {
      setEmailAppointmentReminders(preferencesData.notifyAppointmentReminders ?? true);
      setSmsAppointmentReminders(preferencesData.smsNotifications ?? false);
      setEmailStatementNotifications(preferencesData.notifyBillingStatements ?? true);
      setEmailMessageNotifications(preferencesData.notifyNewMessages ?? true);
    }
  }, [preferencesData]);

  const updateProfileMutation = trpc.portal.updateProfile.useMutation({
    onSuccess: () => {
      setProfileSuccess('Profile updated successfully');
      setProfileError(null);
      setTimeout(() => setProfileSuccess(null), 3000);
    },
    onError: (err) => {
      setProfileError(err.message);
      setProfileSuccess(null);
    },
  });

  const changePasswordMutation = trpc.portal.changePassword.useMutation({
    onSuccess: () => {
      setPasswordSuccess('Password changed successfully');
      setPasswordError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 3000);
    },
    onError: (err) => {
      setPasswordError(err.message);
      setPasswordSuccess(null);
    },
  });

  const updatePreferencesMutation = trpc.portal.updatePreferences.useMutation({
    onSuccess: () => {
      setPreferencesSuccess('Preferences saved');
      setTimeout(() => setPreferencesSuccess(null), 3000);
    },
  });

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    updateProfileMutation.mutate({ sessionToken: token, email, phone });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    changePasswordMutation.mutate({
      sessionToken: token,
      currentPassword,
      newPassword,
    });
  };

  const handleUpdatePreferences = () => {
    if (!token) return;
    updatePreferencesMutation.mutate({
      sessionToken: token,
      notifyAppointmentReminders: emailAppointmentReminders,
      smsNotifications: smsAppointmentReminders,
      notifyBillingStatements: emailStatementNotifications,
      notifyNewMessages: emailMessageNotifications,
    });
  };

  if (!token) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-gray-600">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your contact information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {profileSuccess && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      {profileSuccess}
                    </AlertDescription>
                  </Alert>
                )}
                {profileError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{profileError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={profileData?.firstName || ''} disabled />
                    <p className="text-xs text-gray-500">
                      Contact us to update your name
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={profileData?.lastName || ''} disabled />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    value={
                      profileData?.dateOfBirth
                        ? new Date(profileData.dateOfBirth).toLocaleDateString()
                        : ''
                    }
                    disabled
                  />
                  <p className="text-xs text-gray-500">
                    Contact us to update your date of birth
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {passwordSuccess && (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        {passwordSuccess}
                      </AlertDescription>
                    </Alert>
                  )}
                  {passwordError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{passwordError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Must be at least 8 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={changePasswordMutation.isPending}>
                      {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Use a unique password that you don&apos;t use elsewhere
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Include a mix of letters, numbers, and symbols
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Never share your password with anyone
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Log out when using shared computers
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to receive updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {preferencesSuccess && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {preferencesSuccess}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <h3 className="font-medium">Quick Settings</h3>
                <div className="space-y-4 pl-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Reminders</p>
                      <p className="text-sm text-gray-500">
                        Receive appointment reminders via email
                      </p>
                    </div>
                    <Switch
                      checked={emailAppointmentReminders}
                      onCheckedChange={(checked) => {
                        setEmailAppointmentReminders(checked);
                        handleUpdatePreferences();
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">SMS Reminders</p>
                      <p className="text-sm text-gray-500">
                        Receive appointment reminders via text message
                      </p>
                    </div>
                    <Switch
                      checked={smsAppointmentReminders}
                      onCheckedChange={(checked) => {
                        setSmsAppointmentReminders(checked);
                        handleUpdatePreferences();
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Statement Notifications</p>
                      <p className="text-sm text-gray-500">
                        Get notified when new statements are available
                      </p>
                    </div>
                    <Switch
                      checked={emailStatementNotifications}
                      onCheckedChange={(checked) => {
                        setEmailStatementNotifications(checked);
                        handleUpdatePreferences();
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Message Notifications</p>
                      <p className="text-sm text-gray-500">
                        Get notified when you receive a new message
                      </p>
                    </div>
                    <Switch
                      checked={emailMessageNotifications}
                      onCheckedChange={(checked) => {
                        setEmailMessageNotifications(checked);
                        handleUpdatePreferences();
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <Alert className="bg-blue-50 border-blue-200">
                  <Bell className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    For advanced options including reminder timing, marketing preferences, and more,
                    visit the{' '}
                    <a href="/portal/notifications" className="font-medium underline hover:no-underline">
                      full Notification Preferences page
                    </a>
                    .
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
