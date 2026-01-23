'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/dialog';
import {
  BookOpen,
  Video,
  FileText,
  GraduationCap,
  Shield,
  Phone,
  Search,
  Plus,
  Play,
  Clock,
  Users,
  Star,
  CheckCircle,
  Settings,
  Edit,
  Eye,
  BarChart3,
} from 'lucide-react';

interface TrainingModule {
  id: string;
  name: string;
  type: string;
  description: string;
  duration: number; // minutes
  requiredFor: string[];
  prerequisiteModules: string[];
  passingScore: number;
  completionCount: number;
  averageScore: number;
  isActive: boolean;
  tags: string[];
  contentSections: number;
  hasQuiz: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TrainingScenario {
  id: string;
  name: string;
  type: string;
  description: string;
  difficulty: string;
  duration: number;
  completionCount: number;
  averageScore: number;
  isActive: boolean;
  tags: string[];
}

// Demo data for training modules
const demoModules: TrainingModule[] = [
  {
    id: '1',
    name: 'HIPAA Privacy Fundamentals',
    type: 'COMPLIANCE',
    description: 'Essential HIPAA privacy rules and patient confidentiality requirements',
    duration: 45,
    requiredFor: ['STAFF', 'BILLER', 'PROVIDER', 'ADMIN'],
    prerequisiteModules: [],
    passingScore: 80,
    completionCount: 24,
    averageScore: 88,
    isActive: true,
    tags: ['hipaa', 'compliance', 'privacy'],
    contentSections: 5,
    hasQuiz: true,
    createdAt: '2023-06-01',
    updatedAt: '2024-01-10',
  },
  {
    id: '2',
    name: 'Front Desk Excellence',
    type: 'SKILL_BUILDING',
    description: 'Customer service skills for front desk staff including phone etiquette and patient interaction',
    duration: 60,
    requiredFor: ['STAFF'],
    prerequisiteModules: [],
    passingScore: 75,
    completionCount: 18,
    averageScore: 82,
    isActive: true,
    tags: ['customer-service', 'phone', 'front-desk'],
    contentSections: 8,
    hasQuiz: true,
    createdAt: '2023-08-15',
    updatedAt: '2024-01-05',
  },
  {
    id: '3',
    name: 'Billing & Insurance Basics',
    type: 'ONBOARDING',
    description: 'Introduction to medical billing, insurance verification, and claims processing',
    duration: 90,
    requiredFor: ['BILLER', 'STAFF'],
    prerequisiteModules: ['1'],
    passingScore: 80,
    completionCount: 12,
    averageScore: 79,
    isActive: true,
    tags: ['billing', 'insurance', 'claims'],
    contentSections: 10,
    hasQuiz: true,
    createdAt: '2023-09-01',
    updatedAt: '2024-01-08',
  },
  {
    id: '4',
    name: 'EHR System Training',
    type: 'SYSTEM',
    description: 'Complete guide to using the ChiroFlow EHR system',
    duration: 120,
    requiredFor: ['STAFF', 'BILLER', 'PROVIDER', 'ADMIN'],
    prerequisiteModules: [],
    passingScore: 70,
    completionCount: 28,
    averageScore: 85,
    isActive: true,
    tags: ['ehr', 'system', 'software'],
    contentSections: 12,
    hasQuiz: true,
    createdAt: '2023-07-01',
    updatedAt: '2024-01-12',
  },
  {
    id: '5',
    name: 'Workplace Safety',
    type: 'COMPLIANCE',
    description: 'OSHA workplace safety guidelines and emergency procedures',
    duration: 30,
    requiredFor: ['STAFF', 'BILLER', 'PROVIDER', 'ADMIN'],
    prerequisiteModules: [],
    passingScore: 85,
    completionCount: 22,
    averageScore: 91,
    isActive: true,
    tags: ['safety', 'osha', 'emergency'],
    contentSections: 4,
    hasQuiz: true,
    createdAt: '2023-05-15',
    updatedAt: '2023-12-20',
  },
];

// Demo data for practice scenarios
const demoScenarios: TrainingScenario[] = [
  {
    id: 's1',
    name: 'New Patient Scheduling Call',
    type: 'SCHEDULING_CALL',
    description: 'Handle first-time patient inquiries and schedule appointments',
    difficulty: 'BEGINNER',
    duration: 5,
    completionCount: 45,
    averageScore: 84,
    isActive: true,
    tags: ['scheduling', 'new-patient', 'phone'],
  },
  {
    id: 's2',
    name: 'Upset Patient - Long Wait',
    type: 'COMPLAINT_HANDLING',
    description: 'Handle a frustrated patient complaining about wait times',
    difficulty: 'ADVANCED',
    duration: 8,
    completionCount: 28,
    averageScore: 72,
    isActive: true,
    tags: ['complaint', 'difficult', 'de-escalation'],
  },
  {
    id: 's3',
    name: 'Insurance Coverage Explanation',
    type: 'BILLING_INQUIRY',
    description: 'Explain insurance benefits and coverage to patients',
    difficulty: 'INTERMEDIATE',
    duration: 6,
    completionCount: 32,
    averageScore: 78,
    isActive: true,
    tags: ['insurance', 'billing', 'explanation'],
  },
  {
    id: 's4',
    name: 'Emergency Triage Call',
    type: 'EMERGENCY_TRIAGE',
    description: 'Assess urgency of patient symptoms and provide appropriate guidance',
    difficulty: 'EXPERT',
    duration: 10,
    completionCount: 15,
    averageScore: 68,
    isActive: true,
    tags: ['emergency', 'triage', 'critical'],
  },
];

function getTypeIcon(type: string) {
  switch (type) {
    case 'COMPLIANCE':
      return <Shield className="h-4 w-4 text-blue-600" />;
    case 'SKILL_BUILDING':
      return <GraduationCap className="h-4 w-4 text-green-600" />;
    case 'ONBOARDING':
      return <BookOpen className="h-4 w-4 text-purple-600" />;
    case 'SYSTEM':
      return <Settings className="h-4 w-4 text-orange-600" />;
    case 'SCHEDULING_CALL':
    case 'BILLING_INQUIRY':
    case 'COMPLAINT_HANDLING':
    case 'EMERGENCY_TRIAGE':
      return <Phone className="h-4 w-4 text-teal-600" />;
    default:
      return <FileText className="h-4 w-4 text-gray-600" />;
  }
}

function getTypeBadge(type: string) {
  const labels: Record<string, string> = {
    COMPLIANCE: 'Compliance',
    SKILL_BUILDING: 'Skill Building',
    ONBOARDING: 'Onboarding',
    SYSTEM: 'System Training',
    SCHEDULING_CALL: 'Scheduling',
    BILLING_INQUIRY: 'Billing',
    COMPLAINT_HANDLING: 'Complaint',
    EMERGENCY_TRIAGE: 'Emergency',
  };

  const colors: Record<string, string> = {
    COMPLIANCE: 'bg-blue-100 text-blue-700',
    SKILL_BUILDING: 'bg-green-100 text-green-700',
    ONBOARDING: 'bg-purple-100 text-purple-700',
    SYSTEM: 'bg-orange-100 text-orange-700',
    SCHEDULING_CALL: 'bg-teal-100 text-teal-700',
    BILLING_INQUIRY: 'bg-indigo-100 text-indigo-700',
    COMPLAINT_HANDLING: 'bg-red-100 text-red-700',
    EMERGENCY_TRIAGE: 'bg-rose-100 text-rose-700',
  };

  return (
    <Badge className={colors[type] || 'bg-gray-100 text-gray-700'}>
      {labels[type] || type}
    </Badge>
  );
}

function getDifficultyBadge(difficulty: string) {
  const colors: Record<string, string> = {
    BEGINNER: 'bg-green-100 text-green-700 border-green-300',
    INTERMEDIATE: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    ADVANCED: 'bg-orange-100 text-orange-700 border-orange-300',
    EXPERT: 'bg-red-100 text-red-700 border-red-300',
  };

  return (
    <Badge variant="outline" className={colors[difficulty] || ''}>
      {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
    </Badge>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface ModuleDetailsDialogProps {
  module: TrainingModule;
}

function ModuleDetailsDialog({ module }: ModuleDetailsDialogProps) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {getTypeIcon(module.type)}
          {module.name}
        </DialogTitle>
        <DialogDescription>{module.description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="flex flex-wrap gap-2">
          {getTypeBadge(module.type)}
          {module.hasQuiz && <Badge variant="outline">Has Quiz</Badge>}
          {!module.isActive && <Badge variant="destructive">Inactive</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(module.duration)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Passing Score</p>
            <p className="font-medium">{module.passingScore}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Completions</p>
            <p className="font-medium flex items-center gap-1">
              <Users className="h-3 w-3" />
              {module.completionCount}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Average Score</p>
            <p className="font-medium flex items-center gap-1">
              <Star className="h-3 w-3" />
              {module.averageScore}%
            </p>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground text-sm mb-2">Required For</p>
          <div className="flex flex-wrap gap-1">
            {module.requiredFor.map((role) => (
              <Badge key={role} variant="secondary" className="text-xs">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {module.tags.length > 0 && (
          <div>
            <p className="text-muted-foreground text-sm mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {module.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" className="flex-1">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button className="flex-1">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

interface TrainingContentLibraryProps {
  showDemoData?: boolean;
}

export function TrainingContentLibrary({ showDemoData = true }: TrainingContentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'modules' | 'scenarios'>('modules');

  // Use demo data
  const modules = showDemoData ? demoModules : [];
  const scenarios = showDemoData ? demoScenarios : [];
  const isLoading = false;

  // Filter modules
  const filteredModules = modules.filter((module) => {
    const matchesSearch =
      searchQuery === '' ||
      module.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      module.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      module.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'all' || module.type === typeFilter;

    return matchesSearch && matchesType;
  });

  // Filter scenarios
  const filteredScenarios = scenarios.filter((scenario) => {
    const matchesSearch =
      searchQuery === '' ||
      scenario.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scenario.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scenario.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'all' || scenario.type === typeFilter;

    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
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
              <BookOpen className="h-5 w-5" />
              Training Content Library
            </CardTitle>
            <CardDescription>
              Manage training modules and practice scenarios
            </CardDescription>
          </div>

          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Content
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={activeTab === 'modules' ? 'default' : 'outline'}
            onClick={() => setActiveTab('modules')}
            size="sm"
          >
            <FileText className="h-4 w-4 mr-1" />
            Modules ({modules.length})
          </Button>
          <Button
            variant={activeTab === 'scenarios' ? 'default' : 'outline'}
            onClick={() => setActiveTab('scenarios')}
            size="sm"
          >
            <Video className="h-4 w-4 mr-1" />
            Practice Scenarios ({scenarios.length})
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {activeTab === 'modules' ? (
                <>
                  <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                  <SelectItem value="SKILL_BUILDING">Skill Building</SelectItem>
                  <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                  <SelectItem value="SYSTEM">System</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="SCHEDULING_CALL">Scheduling</SelectItem>
                  <SelectItem value="BILLING_INQUIRY">Billing</SelectItem>
                  <SelectItem value="COMPLAINT_HANDLING">Complaint</SelectItem>
                  <SelectItem value="EMERGENCY_TRIAGE">Emergency</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {activeTab === 'modules' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredModules.map((module) => (
              <Dialog key={module.id}>
                <DialogTrigger asChild>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        {getTypeIcon(module.type)}
                        {!module.isActive && (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>

                      <h4 className="font-semibold mb-1 line-clamp-1">{module.name}</h4>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {module.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(module.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {module.completionCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {module.averageScore}%
                        </span>
                      </div>

                      <div className="mt-3 flex gap-1">
                        {getTypeBadge(module.type)}
                        {module.hasQuiz && (
                          <Badge variant="outline" className="text-xs">
                            Quiz
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </DialogTrigger>
                <ModuleDetailsDialog module={module} />
              </Dialog>
            ))}

            {filteredModules.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No modules found</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredScenarios.map((scenario) => (
              <Card key={scenario.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    {getTypeIcon(scenario.type)}
                    {getDifficultyBadge(scenario.difficulty)}
                  </div>

                  <h4 className="font-semibold mb-1 line-clamp-1">{scenario.name}</h4>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {scenario.description}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(scenario.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {scenario.completionCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {scenario.averageScore}%
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    {getTypeBadge(scenario.type)}
                    <Button size="sm">
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredScenarios.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No scenarios found</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
