'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import {
  Megaphone,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Calendar,
  ArrowLeft,
  Play,
  Pause,
  BarChart3,
} from 'lucide-react';

interface CampaignDetailsProps {
  campaignId: string;
  onBack?: () => void;
}

export function CampaignDetails({ campaignId, onBack }: CampaignDetailsProps) {
  const { data: campaign, isLoading } = trpc.marketing.getCampaign.useQuery({ id: campaignId });

  const updateStatus = trpc.marketing.updateCampaignStatus.useMutation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Campaign not found</h3>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const budget = campaign.budget ? Number(campaign.budget) : 0;
  const actualSpend = campaign.actualSpend ? Number(campaign.actualSpend) : 0;
  const totalRevenue = campaign.totalRevenue ? Number(campaign.totalRevenue) : 0;
  const roi = budget > 0 ? ((totalRevenue - budget) / budget * 100) : 0;
  const spendProgress = budget > 0 ? (actualSpend / budget * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-6 w-6" />
              {campaign.name}
            </h1>
            <p className="text-muted-foreground">{campaign.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{campaign.campaignType}</Badge>
          <Badge>{campaign.status}</Badge>
          {campaign.status === 'ACTIVE' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus.mutate({ id: campaign.id, status: 'PAUSED' })}
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {campaign.status === 'PAUSED' && (
            <Button
              size="sm"
              onClick={() => updateStatus.mutate({ id: campaign.id, status: 'ACTIVE' })}
            >
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.totalLeads}</div>
            {campaign.targetLeads && (
              <p className="text-xs text-muted-foreground">
                Target: {campaign.targetLeads}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.totalConversions}</div>
            {campaign.totalClicks > 0 && (
              <p className="text-xs text-muted-foreground">
                {((campaign.totalConversions / campaign.totalClicks) * 100).toFixed(1)}% rate
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            {campaign.targetRevenue && (
              <p className="text-xs text-muted-foreground">
                Target: ${Number(campaign.targetRevenue).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Return on investment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget & Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Budget & Spend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {budget > 0 ? (
              <>
                <div className="flex justify-between text-sm">
                  <span>Spent: ${actualSpend.toFixed(2)}</span>
                  <span>Budget: ${budget.toFixed(2)}</span>
                </div>
                <Progress value={Math.min(spendProgress, 100)} />
                <p className="text-sm text-muted-foreground">
                  {spendProgress.toFixed(1)}% of budget used
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No budget set</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date:</span>
              <span>{campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End Date:</span>
              <span>{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'Not set'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{campaign.totalImpressions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Impressions</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{campaign.totalClicks.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Clicks</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">
                {campaign.totalImpressions > 0
                  ? ((campaign.totalClicks / campaign.totalImpressions) * 100).toFixed(2)
                  : '0'}%
              </p>
              <p className="text-sm text-muted-foreground">Click Rate</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">
                {campaign.totalClicks > 0
                  ? ((campaign.totalConversions / campaign.totalClicks) * 100).toFixed(2)
                  : '0'}%
              </p>
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* UTM Parameters */}
      {(campaign.utmSource || campaign.utmMedium || campaign.utmCampaign) && (
        <Card>
          <CardHeader>
            <CardTitle>Tracking Parameters</CardTitle>
            <CardDescription>UTM parameters for attribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {campaign.utmSource && (
                <div>
                  <span className="text-muted-foreground">Source:</span>{' '}
                  <span className="font-medium">{campaign.utmSource}</span>
                </div>
              )}
              {campaign.utmMedium && (
                <div>
                  <span className="text-muted-foreground">Medium:</span>{' '}
                  <span className="font-medium">{campaign.utmMedium}</span>
                </div>
              )}
              {campaign.utmCampaign && (
                <div>
                  <span className="text-muted-foreground">Campaign:</span>{' '}
                  <span className="font-medium">{campaign.utmCampaign}</span>
                </div>
              )}
              {campaign.utmContent && (
                <div>
                  <span className="text-muted-foreground">Content:</span>{' '}
                  <span className="font-medium">{campaign.utmContent}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
