'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { BillingOverview } from '@/components/billing/BillingOverview';
import { EnhancedClaimsTab } from '@/components/billing/EnhancedClaimsTab';
import { SuperbillsTab } from '@/components/billing/SuperbillsTab';
import { PatientBalancesTab } from '@/components/billing/PatientBalancesTab';
import { PaymentProcessingTab } from '@/components/billing/PaymentProcessingTab';
import { FeeScheduleTab } from '@/components/billing/FeeScheduleTab';
import { ARAgingReport } from '@/components/billing/ARAgingReport';
import { ChargesList } from '@/components/billing/ChargesList';
import { startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
  FileText,
  Receipt,
  Users,
  CreditCard,
  DollarSign,
  PieChart,
  FileBarChart,
} from 'lucide-react';

export default function BillingDashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [activeTab, setActiveTab] = useState('claims');

  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['claims', 'superbills', 'balances', 'payments', 'fees', 'charges', 'aging'].includes(tab)) {
      setActiveTab(tab);
      router.replace('/billing', { scroll: false });
    }
  }, [searchParams, router]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'post-payment':
        setActiveTab('payments');
        break;
      case 'submit-claims':
        setActiveTab('claims');
        break;
      case 'generate-superbill':
        setActiveTab('superbills');
        break;
      case 'patient-statements':
        setActiveTab('balances');
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Billing Dashboard</h2>
          <p className="text-muted-foreground">
            Manage claims, payments, superbills, and revenue tracking
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
      </div>

      {/* Overview Section with Quick Actions */}
      <BillingOverview dateRange={dateRange} onQuickAction={handleQuickAction} />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-7 lg:w-fit">
          <TabsTrigger value="claims" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Claims</span>
          </TabsTrigger>
          <TabsTrigger value="superbills" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Superbills</span>
          </TabsTrigger>
          <TabsTrigger value="balances" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Balances</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="fees" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Fee Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="charges" className="flex items-center gap-2">
            <FileBarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Charges</span>
          </TabsTrigger>
          <TabsTrigger value="aging" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            <span className="hidden sm:inline">AR Aging</span>
          </TabsTrigger>
        </TabsList>

        {/* Claims Management Tab */}
        <TabsContent value="claims" className="space-y-4">
          <EnhancedClaimsTab dateRange={dateRange} />
        </TabsContent>

        {/* Superbills Tab */}
        <TabsContent value="superbills" className="space-y-4">
          <SuperbillsTab dateRange={dateRange} />
        </TabsContent>

        {/* Patient Balances Tab */}
        <TabsContent value="balances" className="space-y-4">
          <PatientBalancesTab />
        </TabsContent>

        {/* Payment Processing Tab */}
        <TabsContent value="payments" className="space-y-4">
          <PaymentProcessingTab dateRange={dateRange} />
        </TabsContent>

        {/* Fee Schedule Tab */}
        <TabsContent value="fees" className="space-y-4">
          <FeeScheduleTab />
        </TabsContent>

        {/* Unbilled Charges Tab */}
        <TabsContent value="charges" className="space-y-4">
          <ChargesList />
        </TabsContent>

        {/* AR Aging Tab */}
        <TabsContent value="aging" className="space-y-4">
          <ARAgingReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
