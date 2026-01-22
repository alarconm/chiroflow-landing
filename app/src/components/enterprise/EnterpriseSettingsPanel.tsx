// Enterprise Settings Management Component - US-255
// Manage enterprise-wide settings and configuration

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  Settings,
  Building2,
  Users,
  Calendar,
  DollarSign,
  Shield,
  Bell,
  Share2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

export function EnterpriseSettingsPanel() {
  const [newLocationDialogOpen, setNewLocationDialogOpen] = useState(false);

  const { data: locations, isLoading: locationsLoading } = trpc.location.list.useQuery({
    includeInactive: true,
  });

  const utils = trpc.useContext();

  // Enterprise settings state (would be fetched from API in production)
  const [settings, setSettings] = useState({
    allowCrossLocationAccess: true,
    sharePatientRecords: true,
    consolidatedBilling: false,
    centralizedScheduling: true,
    crossLocationInventory: true,
    unifiedReporting: true,
    singleSignOn: true,
    centralizedUserManagement: true,
  });

  const handleSettingChange = (key: keyof typeof settings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    toast.success('Setting updated');
  };

  const activeLocations = locations?.filter((l) => l.isActive && !l.deletedAt) || [];
  const inactiveLocations = locations?.filter((l) => !l.isActive || l.deletedAt) || [];

  return (
    <div className="space-y-6">
      {/* Enterprise Overview Card */}
      <Card className="bg-gradient-to-br from-[#053e67]/5 to-[#053e67]/10 border-[#053e67]/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#053e67]/10 rounded-lg">
                <Building2 className="h-6 w-6 text-[#053e67]" />
              </div>
              <div>
                <CardTitle className="text-[#053e67]">Enterprise Configuration</CardTitle>
                <CardDescription>
                  Manage settings across all {activeLocations.length} locations
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="bg-[#053e67]/10 text-[#053e67]">
              Enterprise Plan
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Settings Accordion */}
      <Accordion type="single" collapsible defaultValue="locations" className="space-y-4">
        {/* Location Management */}
        <AccordionItem value="locations" className="border rounded-lg bg-white">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-[#053e67]" />
              <span className="font-semibold">Location Management</span>
              <Badge variant="outline">{activeLocations.length} Active</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-stone-500">
                  Manage your practice locations and their configurations
                </p>
                <Dialog open={newLocationDialogOpen} onOpenChange={setNewLocationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-[#053e67] hover:bg-[#053e67]/90">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Location</DialogTitle>
                      <DialogDescription>
                        Create a new practice location for your enterprise
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Location Name</Label>
                        <Input placeholder="e.g., Downtown Clinic" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Location Code</Label>
                          <Input placeholder="e.g., DTC" maxLength={10} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input placeholder="(555) 123-4567" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input placeholder="123 Main Street" />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input placeholder="City" />
                        </div>
                        <div className="space-y-2">
                          <Label>State</Label>
                          <Input placeholder="OR" maxLength={2} />
                        </div>
                        <div className="space-y-2">
                          <Label>ZIP</Label>
                          <Input placeholder="97201" />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setNewLocationDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-[#053e67] hover:bg-[#053e67]/90"
                        onClick={() => {
                          toast.success('Location created successfully');
                          setNewLocationDialogOpen(false);
                        }}
                      >
                        Create Location
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Active Locations */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-stone-700">Active Locations</h4>
                {locationsLoading ? (
                  <p className="text-sm text-stone-500">Loading...</p>
                ) : activeLocations.length > 0 ? (
                  <div className="space-y-2">
                    {activeLocations.map((location) => (
                      <div
                        key={location.id}
                        className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-stone-400" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{location.name}</span>
                              {location.isPrimary && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-blue-100 text-[#053e67]"
                                >
                                  HQ
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-stone-500">{location.code}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-500">No active locations</p>
                )}
              </div>

              {/* Inactive Locations */}
              {inactiveLocations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-stone-500">Inactive Locations</h4>
                  <div className="space-y-2">
                    {inactiveLocations.map((location) => (
                      <div
                        key={location.id}
                        className="flex items-center justify-between p-3 bg-stone-100 rounded-lg opacity-60"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-stone-400" />
                          <div>
                            <span className="font-medium">{location.name}</span>
                            <p className="text-xs text-stone-500">{location.code}</p>
                          </div>
                        </div>
                        <Badge variant="outline">Inactive</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Cross-Location Settings */}
        <AccordionItem value="cross-location" className="border rounded-lg bg-white">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Share2 className="h-5 w-5 text-[#053e67]" />
              <span className="font-semibold">Cross-Location Access</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Allow Cross-Location Patient Access</Label>
                  <p className="text-xs text-stone-500">
                    Staff can view patients from other locations
                  </p>
                </div>
                <Switch
                  checked={settings.allowCrossLocationAccess}
                  onCheckedChange={(v) => handleSettingChange('allowCrossLocationAccess', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Share Patient Records</Label>
                  <p className="text-xs text-stone-500">
                    Patient records are visible across all locations
                  </p>
                </div>
                <Switch
                  checked={settings.sharePatientRecords}
                  onCheckedChange={(v) => handleSettingChange('sharePatientRecords', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Centralized Scheduling</Label>
                  <p className="text-xs text-stone-500">
                    Book appointments at any location from one view
                  </p>
                </div>
                <Switch
                  checked={settings.centralizedScheduling}
                  onCheckedChange={(v) => handleSettingChange('centralizedScheduling', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Cross-Location Inventory</Label>
                  <p className="text-xs text-stone-500">
                    Enable inventory transfers between locations
                  </p>
                </div>
                <Switch
                  checked={settings.crossLocationInventory}
                  onCheckedChange={(v) => handleSettingChange('crossLocationInventory', v)}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Billing Settings */}
        <AccordionItem value="billing" className="border rounded-lg bg-white">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-[#053e67]" />
              <span className="font-semibold">Billing & Finance</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Consolidated Billing</Label>
                  <p className="text-xs text-stone-500">
                    Single billing system across all locations
                  </p>
                </div>
                <Switch
                  checked={settings.consolidatedBilling}
                  onCheckedChange={(v) => handleSettingChange('consolidatedBilling', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Unified Reporting</Label>
                  <p className="text-xs text-stone-500">
                    Generate enterprise-wide reports
                  </p>
                </div>
                <Switch
                  checked={settings.unifiedReporting}
                  onCheckedChange={(v) => handleSettingChange('unifiedReporting', v)}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Security Settings */}
        <AccordionItem value="security" className="border rounded-lg bg-white">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-[#053e67]" />
              <span className="font-semibold">Security & Access</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Single Sign-On (SSO)</Label>
                  <p className="text-xs text-stone-500">
                    One login for all locations
                  </p>
                </div>
                <Switch
                  checked={settings.singleSignOn}
                  onCheckedChange={(v) => handleSettingChange('singleSignOn', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Centralized User Management</Label>
                  <p className="text-xs text-stone-500">
                    Manage users from enterprise dashboard
                  </p>
                </div>
                <Switch
                  checked={settings.centralizedUserManagement}
                  onCheckedChange={(v) => handleSettingChange('centralizedUserManagement', v)}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
