import { AIBillingDashboard } from '@/components/ai-billing';

export const metadata = {
  title: 'AI Billing Agent | ChiroFlow',
  description: 'Autonomous billing operations with AI-powered claim scrubbing, denial prediction, and payment matching',
};

export default function AIBillingPage() {
  return <AIBillingDashboard />;
}
