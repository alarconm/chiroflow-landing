'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UserPlus,
  Users,
  BookOpen,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Settings,
  FileText,
  RefreshCw,
  Calendar,
  Target,
  Zap,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  assignedModules: number;
  completedModules: number;
  pendingAssignments: number;
}

interface TrainingModule {
  id: string;
  name: string;
  type: string;
  duration: number;
  requiredFor: string[];
  isRequired: boolean;
}

interface AssignmentTemplate {
  id: string;
  name: string;
  description: string;
  moduleCount: number;
  targetRole: string[];
}

// Demo data
const demoStaffMembers: StaffMember[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah@clinic.com',
    role: 'STAFF',
    assignedModules: 8,
    completedModules: 8,
    pendingAssignments: 0,
  },
  {
    id: '2',
    name: 'Mike Chen',
    email: 'mike@clinic.com',
    role: 'STAFF',
    assignedModules: 8,
    completedModules: 6,
    pendingAssignments: 2,
  },
  {
    id: '3',
    name: 'Emily Davis',
    email: 'emily@clinic.com',
    role: 'BILLER',
    assignedModules: 6,
    completedModules: 4,
    pendingAssignments: 2,
  },
  {
    id: '4',
    name: 'James Wilson',
    email: 'james@clinic.com',
    role: 'STAFF',
    assignedModules: 8,
    completedModules: 2,
    pendingAssignments: 6,
  },
];

const demoModules: TrainingModule[] = [
  { id: '1', name: 'HIPAA Privacy Training', type: 'COMPLIANCE', duration: 45, requiredFor: ['STAFF', 'BILLER', 'PROVIDER'], isRequired: true },
  { id: '2', name: 'Billing Compliance', type: 'COMPLIANCE', duration: 60, requiredFor: ['BILLER', 'STAFF'], isRequired: true },
  { id: '3', name: 'Front Desk Excellence', type: 'SKILL_BUILDING', duration: 90, requiredFor: ['STAFF'], isRequired: false },
  { id: '4', name: 'Phone Script Mastery', type: 'SKILL_BUILDING', duration: 60, requiredFor: ['STAFF'], isRequired: false },
  { id: '5', name: 'EHR System Training', type: 'SYSTEM', duration: 120, requiredFor: ['STAFF', 'BILLER', 'PROVIDER'], isRequired: true },
  { id: '6', name: 'Insurance Verification', type: 'SKILL_BUILDING', duration: 45, requiredFor: ['BILLER', 'STAFF'], isRequired: false },
];

const demoTemplates: AssignmentTemplate[] = [
  { id: 't1', name: 'New Staff Onboarding', description: 'Complete onboarding package for front desk staff', moduleCount: 8, targetRole: ['STAFF'] },
  { id: 't2', name: 'Biller Certification', description: 'Required training for billing specialists', moduleCount: 6, targetRole: ['BILLER'] },
  { id: 't3', name: 'Compliance Refresh', description: 'Annual compliance training renewal', moduleCount: 3, targetRole: ['STAFF', 'BILLER', 'PROVIDER'] },
  { id: 't4', name: 'Phone Skills Bootcamp', description: 'Intensive phone communication training', moduleCount: 4, targetRole: ['STAFF'] },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getCompletionStatus(completed: number, total: number) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  if (percentage === 100) {
    return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Complete</Badge>;
  }
  if (percentage >= 50) {
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
  }
  if (percentage > 0) {
    return <Badge className="bg-yellow-500 text-white"><Clock className="h-3 w-3 mr-1" />Started</Badge>;
  }
  return <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />Not Started</Badge>;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface AssignTrainingDialogProps {
  staff: StaffMember;
  modules: TrainingModule[];
}

function AssignTrainingDialog({ staff, modules }: AssignTrainingDialogProps) {
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleAssign = async () => {
    setIsAssigning(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsAssigning(false);
    setSelectedModules([]);
  };

  const totalDuration = modules
    .filter((m) => selectedModules.includes(m.id))
    .reduce((acc, m) => acc + m.duration, 0);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Assign Training to {staff.name}
        </DialogTitle>
        <DialogDescription>
          Select training modules to assign. Due dates are optional.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
        {modules.map((module) => (
          <div
            key={module.id}
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              selectedModules.includes(module.id) ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
            }`}
            onClick={() => toggleModule(module.id)}
          >
            <Checkbox
              checked={selectedModules.includes(module.id)}
              onCheckedChange={() => toggleModule(module.id)}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{module.name}</p>
                {module.isRequired && (
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{module.type.replace('_', ' ')}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(module.duration)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 py-2 border-t">
        <div className="flex-1">
          <Label className="text-sm text-muted-foreground">Due Date (Optional)</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Selected: {selectedModules.length} modules</p>
          <p className="text-sm font-medium">Total: {formatDuration(totalDuration)}</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={isAssigning}>
          Cancel
        </Button>
        <Button onClick={handleAssign} disabled={selectedModules.length === 0 || isAssigning}>
          {isAssigning ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Assign {selectedModules.length} Module{selectedModules.length !== 1 ? 's' : ''}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface BulkAssignDialogProps {
  staff: StaffMember[];
  templates: AssignmentTemplate[];
}

function BulkAssignDialog({ staff, templates }: BulkAssignDialogProps) {
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const toggleStaff = (staffId: string) => {
    setSelectedStaff((prev) =>
      prev.includes(staffId)
        ? prev.filter((id) => id !== staffId)
        : [...prev, staffId]
    );
  };

  const selectAll = () => {
    setSelectedStaff(staff.map((s) => s.id));
  };

  const clearAll = () => {
    setSelectedStaff([]);
  };

  const handleBulkAssign = async () => {
    setIsAssigning(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsAssigning(false);
    setSelectedStaff([]);
    setSelectedTemplate('');
  };

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Bulk Assign Training
        </DialogTitle>
        <DialogDescription>
          Assign a training template to multiple staff members at once.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Template Selection */}
        <div>
          <Label>Training Template</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>{template.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {template.moduleCount} modules
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplateData && (
            <p className="text-sm text-muted-foreground mt-1">
              {selectedTemplateData.description}
            </p>
          )}
        </div>

        {/* Staff Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Select Staff Members</Label>
            <div className="space-x-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-[250px] overflow-y-auto border rounded-lg p-2">
            {staff.map((member) => (
              <div
                key={member.id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  selectedStaff.includes(member.id)
                    ? 'bg-primary/10 border border-primary'
                    : 'hover:bg-muted border border-transparent'
                }`}
                onClick={() => toggleStaff(member.id)}
              >
                <Checkbox
                  checked={selectedStaff.includes(member.id)}
                  onCheckedChange={() => toggleStaff(member.id)}
                />
                <Avatar className="h-8 w-8">
                  {member.avatar && <AvatarImage src={member.avatar} alt={member.name} />}
                  <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-sm">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
                {getCompletionStatus(member.completedModules, member.assignedModules)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={isAssigning}>
          Cancel
        </Button>
        <Button
          onClick={handleBulkAssign}
          disabled={selectedStaff.length === 0 || !selectedTemplate || isAssigning}
        >
          {isAssigning ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Assign to {selectedStaff.length} Staff
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface ManagerAssignmentToolsProps {
  showDemoData?: boolean;
}

export function ManagerAssignmentTools({ showDemoData = true }: ManagerAssignmentToolsProps) {
  const [selectedRole, setSelectedRole] = useState<string>('all');

  // Use demo data
  const staffMembers = showDemoData ? demoStaffMembers : [];
  const modules = showDemoData ? demoModules : [];
  const templates = showDemoData ? demoTemplates : [];
  const isLoading = false;

  // Filter staff by role
  const filteredStaff = staffMembers.filter(
    (s) => selectedRole === 'all' || s.role === selectedRole
  );

  // Calculate stats
  const totalPending = staffMembers.reduce((acc, s) => acc + s.pendingAssignments, 0);
  const fullyTrained = staffMembers.filter(
    (s) => s.completedModules === s.assignedModules && s.assignedModules > 0
  ).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Manager Assignment Tools
            </CardTitle>
            <CardDescription>
              Assign training modules and track team progress
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Zap className="h-4 w-4 mr-2" />
                  Auto-Assign Required
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Auto-Assign Required Training</DialogTitle>
                  <DialogDescription>
                    Automatically assign all required compliance training to staff who haven't completed it.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    This will assign missing required training to all staff based on their role.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span>Staff members affected</span>
                      <Badge>{staffMembers.filter((s) => s.pendingAssignments > 0).length}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span>Total assignments to create</span>
                      <Badge>{totalPending}</Badge>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button>
                    <Zap className="h-4 w-4 mr-2" />
                    Auto-Assign All
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Users className="h-4 w-4 mr-2" />
                  Bulk Assign
                </Button>
              </DialogTrigger>
              <BulkAssignDialog staff={staffMembers} templates={templates} />
            </Dialog>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{staffMembers.length} staff members</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>{fullyTrained} fully trained</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span>{totalPending} pending assignments</span>
          </div>
        </div>

        {/* Filter */}
        <div className="mt-4">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="STAFF">Staff</SelectItem>
              <SelectItem value="BILLER">Biller</SelectItem>
              <SelectItem value="PROVIDER">Provider</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {filteredStaff.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  {member.avatar && <AvatarImage src={member.avatar} alt={member.name} />}
                  <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                </Avatar>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{member.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {member.role}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {member.completedModules}/{member.assignedModules} modules
                    </span>
                    {member.pendingAssignments > 0 && (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Clock className="h-3 w-3" />
                        {member.pendingAssignments} pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {getCompletionStatus(member.completedModules, member.assignedModules)}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign
                    </Button>
                  </DialogTrigger>
                  <AssignTrainingDialog staff={member} modules={modules} />
                </Dialog>
              </div>
            </div>
          ))}

          {filteredStaff.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No staff members found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
