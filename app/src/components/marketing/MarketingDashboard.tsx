'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import {
  Users,
  UserPlus,
  Star,
  Megaphone,
  BarChart3,
  Gift,
  TrendingUp,
} from 'lucide-react';
import { MarketingStats } from './MarketingStats';
import { ReferralProgramManager } from './ReferralProgramManager';
import { ReferralList } from './ReferralList';
import { LeadList } from './LeadList';
import { CampaignList } from './CampaignList';
import { ReviewRequestList } from './ReviewRequestList';

export function MarketingDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing & Referrals</h1>
          <p className="text-muted-foreground">
            Patient acquisition, referral programs, and marketing campaigns
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="referrals" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span className="hidden sm:inline">Referrals</span>
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Leads</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Campaigns</span>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="programs" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Programs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <MarketingStats startDate={dateRange?.from} endDate={dateRange?.to} />
        </TabsContent>

        <TabsContent value="referrals" className="space-y-6">
          <ReferralList />
        </TabsContent>

        <TabsContent value="leads" className="space-y-6">
          <LeadList />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <CampaignList />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <ReviewRequestList />
        </TabsContent>

        <TabsContent value="programs" className="space-y-6">
          <ReferralProgramManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
