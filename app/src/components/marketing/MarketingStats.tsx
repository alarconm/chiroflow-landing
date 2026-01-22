'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import {
  Users,
  UserPlus,
  Star,
  DollarSign,
  TrendingUp,
  Award,
  Target,
  Percent,
} from 'lucide-react';

interface MarketingStatsProps {
  startDate?: Date;
  endDate?: Date;
}

export function MarketingStats({ startDate, endDate }: MarketingStatsProps) {
  const { data: summary, isLoading } = trpc.marketing.getDashboardSummary.useQuery({
    startDate,
    endDate,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Referrals Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.referrals.total}</div>
            <p className="text-xs text-muted-foreground">
              {summary.referrals.completed} completed, {summary.referrals.pending} pending
            </p>
          </CardContent>
        </Card>

        {/* Referral Conversion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referral Conversion</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.referrals.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              ${(summary.referrals.totalReferrerRewards + summary.referrals.totalRefereeRewards).toFixed(2)} in rewards issued
            </p>
          </CardContent>
        </Card>

        {/* Leads Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.leads.total}</div>
            <p className="text-xs text-muted-foreground">
              {summary.leads.conversionRate.toFixed(1)}% conversion rate
            </p>
          </CardContent>
        </Card>

        {/* Lead Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.leads.averageScore.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Higher score = more engaged
            </p>
          </CardContent>
        </Card>

        {/* Reviews Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Review Requests</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.reviews.total}</div>
            <p className="text-xs text-muted-foreground">
              {summary.reviews.responseRate.toFixed(1)}% response rate
            </p>
          </CardContent>
        </Card>

        {/* Average Rating */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.reviews.averageRating?.toFixed(1) || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              From collected reviews
            </p>
          </CardContent>
        </Card>

        {/* Campaigns Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.campaigns.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              {summary.campaigns.totalLeads} leads generated
            </p>
          </CardContent>
        </Card>

        {/* Campaign ROI */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campaign ROI</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.campaigns.overallRoi !== null
                ? `${summary.campaigns.overallRoi.toFixed(0)}%`
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              ${summary.campaigns.totalRevenue.toFixed(2)} revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Referrers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Patients with the most successful referrals</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topReferrers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrals yet</p>
            ) : (
              <div className="space-y-4">
                {summary.topReferrers.map((referrer, index) => (
                  <div key={referrer.patientId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {referrer.patient?.demographics?.firstName}{' '}
                          {referrer.patient?.demographics?.lastName}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      {referrer.referralCount} referrals
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
            <CardDescription>Best performing marketing campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet</p>
            ) : (
              <div className="space-y-4">
                {summary.topCampaigns.map((campaign, index) => (
                  <div key={campaign.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {campaign.campaignType.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {campaign.totalConversions} conversions
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.totalLeads} leads
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead Sources Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Sources</CardTitle>
          <CardDescription>Where your leads are coming from</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(summary.leads.bySource).map(([source, count]) => (
              <div key={source} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm capitalize">{source.toLowerCase().replace('_', ' ')}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
