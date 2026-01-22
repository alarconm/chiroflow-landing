'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { FileText, Download, Send, Printer, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PatientStatementsProps {
  patientId: string;
}

export function PatientStatements({ patientId }: PatientStatementsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const generateStatement = trpc.ledger.generateStatement.useMutation({
    onSuccess: () => {
      toast({
        title: 'Statement generated',
        description: 'A new statement has been created.',
      });
      setIsGenerating(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setIsGenerating(false);
    },
  });

  const handleGenerateStatement = () => {
    setIsGenerating(true);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    generateStatement.mutate({
      patientId,
      startDate,
      endDate,
      includeZeroBalance: false,
    });
  };

  // Mock statements - in real implementation, these would come from an API
  const statements = [
    {
      id: '1',
      date: new Date(),
      periodStart: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      totalDue: 250.0,
      status: 'sent',
    },
    {
      id: '2',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodStart: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      totalDue: 125.0,
      status: 'paid',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Patient Statements</CardTitle>
            <CardDescription>Generate and manage billing statements</CardDescription>
          </div>
          <Button onClick={handleGenerateStatement} disabled={isGenerating}>
            <Plus className="mr-2 h-4 w-4" />
            {isGenerating ? 'Generating...' : 'Generate Statement'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {statements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No statements generated</p>
            <p className="text-sm">Generate a statement to send to the patient</p>
          </div>
        ) : (
          <div className="space-y-4">
            {statements.map((statement) => (
              <div
                key={statement.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium">
                      Statement - {format(statement.date, 'MMMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Period: {format(statement.periodStart, 'MMM d')} -{' '}
                      {format(statement.periodEnd, 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold">${statement.totalDue.toFixed(2)}</p>
                    <Badge
                      variant={
                        statement.status === 'paid'
                          ? 'default'
                          : statement.status === 'sent'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {statement.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" title="Print">
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                    {statement.status !== 'paid' && (
                      <Button variant="ghost" size="icon" title="Send">
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
