'use client';

/**
 * Epic 12: AI Communication Agent - Chat History
 *
 * Displays chat session history for staff review.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  MessageSquare,
  User,
  Bot,
  Clock,
  Filter,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import type { AIIntent, ChatSessionStatus } from '@prisma/client';

// Extended session type to include relations from Prisma query
// Using a looser type with optional patient/messages relations
type SessionWithRelations = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
  status: ChatSessionStatus;
  summary: string | null;
  source?: string;
  patientId: string | null;
  satisfactionScore: number | null;
  context?: {
    detectedIntents?: AIIntent[];
    [key: string]: unknown;
  };
  patient?: {
    demographics?: {
      firstName?: string;
      lastName?: string;
    };
  };
  messages?: {
    id: string;
    content?: string;
    senderType: string;
    createdAt: Date;
    detectedIntent?: AIIntent | null;
    confidence?: number | null;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
};

interface ChatHistoryProps {
  patientId?: string;
  className?: string;
}

export function ChatHistory({ patientId, className }: ChatHistoryProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChatSessionStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch chat sessions
  const { data: sessionsData, isLoading: sessionsLoading } = trpc.aiCommunication.getChatHistory.useQuery({
    patientId,
    limit: 50,
    offset: 0,
  });

  // Fetch selected session details
  const { data: sessionDetails, isLoading: detailsLoading } = trpc.aiCommunication.getChatHistory.useQuery(
    { sessionId: selectedSessionId! },
    { enabled: !!selectedSessionId }
  );

  const sessions = (sessionsData?.sessions || []) as SessionWithRelations[];
  const selectedSession = sessionDetails?.sessions?.[0] as SessionWithRelations | undefined;

  const getStatusBadge = (status: ChatSessionStatus) => {
    const variants: Record<ChatSessionStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      ACTIVE: { variant: 'default', label: 'Active' },
      ENDED: { variant: 'secondary', label: 'Ended' },
      ABANDONED: { variant: 'outline', label: 'Abandoned' },
      TRANSFERRED: { variant: 'destructive', label: 'Transferred' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getIntentLabel = (intent: AIIntent) => {
    const labels: Record<string, string> = {
      BOOKING: 'Booking',
      RESCHEDULE: 'Reschedule',
      CANCEL: 'Cancel',
      FAQ_INSURANCE: 'Insurance FAQ',
      FAQ_HOURS: 'Hours FAQ',
      FAQ_SERVICES: 'Services FAQ',
      FAQ_LOCATION: 'Location FAQ',
      FAQ_GENERAL: 'General FAQ',
      COMPLAINT: 'Complaint',
      COMPLIMENT: 'Compliment',
      GENERAL: 'General',
      UNKNOWN: 'Unknown',
    };
    return labels[intent] || intent;
  };

  const filteredSessions = sessions.filter((session) => {
    if (statusFilter !== 'all' && session.status !== statusFilter) return false;
    if (searchQuery) {
      // Use type assertion for sessions that include patient relation
      const sessionWithPatient = session as typeof session & { patient?: { demographics?: { firstName?: string; lastName?: string } } };
      const patientName = sessionWithPatient.patient?.demographics
        ? `${sessionWithPatient.patient.demographics.firstName || ''} ${sessionWithPatient.patient.demographics.lastName || ''}`.toLowerCase()
        : '';
      const sessionWithMessages = session as typeof session & { messages?: { content?: string }[] };
      const lastMessage = sessionWithMessages.messages?.[0]?.content?.toLowerCase() || '';
      const query = searchQuery.toLowerCase();
      if (!patientName.includes(query) && !lastMessage.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className={cn('flex gap-4', className)}>
      {/* Sessions list */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat History
          </CardTitle>
          <CardDescription>
            {sessionsData?.total || 0} chat sessions
          </CardDescription>

          {/* Filters */}
          <div className="flex gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ChatSessionStatus | 'all')}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="ESCALATED">Escalated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {sessionsLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No chat sessions found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={cn(
                      'w-full p-4 text-left hover:bg-muted/50 transition-colors',
                      selectedSessionId === session.id && 'bg-muted'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">
                            {(() => {
                              const sessionWithPatient = session as typeof session & { patient?: { demographics?: { firstName?: string; lastName?: string } } };
                              return sessionWithPatient.patient?.demographics
                                ? `${sessionWithPatient.patient.demographics.firstName || ''} ${sessionWithPatient.patient.demographics.lastName || ''}`
                                : 'Anonymous';
                            })()}
                          </span>
                          {getStatusBadge(session.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {(() => {
                            const sessionWithMessages = session as typeof session & { messages?: { content?: string }[] };
                            return sessionWithMessages.messages?.[0]?.content || 'No messages';
                          })()}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}
                          <span>-</span>
                          <span className="capitalize">{session.source}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Session details dialog */}
      <Dialog
        open={!!selectedSessionId}
        onOpenChange={() => setSelectedSessionId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat Session Details
            </DialogTitle>
          </DialogHeader>

          {detailsLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : selectedSession ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Session info */}
              <div className="border-b pb-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Patient:</span>{' '}
                    <span className="font-medium">
                      {selectedSession.patient?.demographics
                        ? `${selectedSession.patient.demographics.firstName} ${selectedSession.patient.demographics.lastName}`
                        : 'Anonymous'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    {getStatusBadge(selectedSession.status)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Started:</span>{' '}
                    {format(new Date(selectedSession.createdAt), 'MMM d, yyyy h:mm a')}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="capitalize">{selectedSession.source}</span>
                  </div>
                </div>

                {/* Detected intents */}
                {selectedSession.context?.detectedIntents && (
                  <div className="mt-4">
                    <span className="text-sm text-muted-foreground">Detected Intents:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedSession.context.detectedIntents as AIIntent[]).map((intent, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {getIntentLabel(intent)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1">
                <div className="space-y-4 pr-4">
                  {selectedSession.messages?.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-2',
                        message.senderType === 'USER' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.senderType !== 'PATIENT' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className="max-w-[80%]">
                        <div
                          className={cn(
                            'rounded-lg px-3 py-2',
                            message.senderType === 'USER'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{format(new Date(message.createdAt), 'h:mm a')}</span>
                          {(message.detectedIntent as AIIntent | null | undefined) && (
                            <Badge variant="outline" className="text-xs">
                              {getIntentLabel(message.detectedIntent as AIIntent)}
                            </Badge>
                          )}
                          {(message.confidence as number | null) !== null && (
                            <span>({Math.round((message.confidence as number) * 100)}%)</span>
                          )}
                        </div>
                      </div>
                      {message.senderType === 'USER' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              Session not found
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChatHistory;
