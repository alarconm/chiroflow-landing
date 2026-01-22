// Enterprise Dashboard Page - US-255
// Epic 25 - Multi-Location Enterprise
// Route: /enterprise

'use client';

import { EnterpriseDashboard } from '@/components/enterprise';

export default function EnterprisePage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <EnterpriseDashboard />
    </div>
  );
}
