import { QAAgentDashboard } from '@/components/ai-qa';

export const metadata = {
  title: 'AI Quality Assurance Dashboard | ChiroFlow',
  description: 'AI-powered quality assurance dashboard for documentation, coding, compliance, and clinical quality monitoring with provider performance comparison, risk indicators, and audit tracking',
};

export default function AIQAPage() {
  return <QAAgentDashboard />;
}
