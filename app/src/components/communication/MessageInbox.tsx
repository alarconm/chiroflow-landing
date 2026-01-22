'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/trpc/client';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Search,
  Mail,
  MessageSquare,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  User,
  RefreshCw,
  Filter,
  Inbox,
} from 'lucide-react';

type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ' | 'BOUNCED';
type MessageDirection = 'OUTBOUND' | 'INBOUND';
type CommunicationChannel = 'SMS' | 'EMAIL' | 'VOICE' | 'PORTAL' | 'IN_APP';

interface Message {
  id: string;
  channel: CommunicationChannel;
  direction: MessageDirection;
  status: MessageStatus;
  subject?: string | null;
  body: string;
  recipient?: string | null;
  sender?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  statusMessage?: string | null;
  createdAt: Date;
  patient: {
    id: string;
    demographics: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}

const statusConfig: Record<MessageStatus, { icon: React.ReactNode; color: string; label: string }> = {
  PENDING: { icon: <Clock className="h-3 w-3" />, color: 'bg-yellow-500', label: 'Pending' },
  SENT: { icon: <Check className="h-3 w-3" />, color: 'bg-blue-500', label: 'Sent' },
  DELIVERED: { icon: <CheckCheck className="h-3 w-3" />, color: 'bg-green-500', label: 'Delivered' },
  FAILED: { icon: <AlertCircle className="h-3 w-3" />, color: 'bg-red-500', label: 'Failed' },
  READ: { icon: <CheckCheck className="h-3 w-3" />, color: 'bg-purple-500', label: 'Read' },
  BOUNCED: { icon: <AlertCircle className="h-3 w-3" />, color: 'bg-orange-500', label: 'Bounced' },
};

const channelIcons: Record<CommunicationChannel, React.ReactNode> = {
  SMS: <MessageSquare className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
  VOICE: <Phone className="h-4 w-4" />,
  PORTAL: <Inbox className="h-4 w-4" />,
  IN_APP: <AlertCircle className="h-4 w-4" />,
};

export function MessageInbox() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<MessageStatus | 'ALL'>('ALL');

  const { data: messagesData, isLoading, refetch } = trpc.communication.listMessages.useQuery({
    channel: channelFilter !== 'ALL' ? channelFilter : undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    limit: 50,
  });

  const messages = messagesData?.messages;

  const filteredMessages = messages?.filter((m: Message) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const firstName = m.patient?.demographics?.firstName || '';
    const lastName = m.patient?.demographics?.lastName || '';
    return (
      firstName.toLowerCase().includes(query) ||
      lastName.toLowerCase().includes(query) ||
      m.body.toLowerCase().includes(query) ||
      (m.subject?.toLowerCase().includes(query) ?? false)
    );
  });

  const MessageItem = ({ message, isSelected }: { message: Message; isSelected: boolean }) => {
    const status = statusConfig[message.status];
    const isOutbound = message.direction === 'OUTBOUND';

    return (
      <button
        className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
          isSelected ? 'bg-muted' : ''
        }`}
        onClick={() => setSelectedMessage(message)}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">
                {message.patient?.demographics?.firstName || 'Unknown'} {message.patient?.demographics?.lastName || 'Patient'}
              </p>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">{channelIcons[message.channel]}</span>
              {isOutbound ? (
                <ArrowUpRight className="h-3 w-3 text-blue-500" />
              ) : (
                <ArrowDownLeft className="h-3 w-3 text-green-500" />
              )}
              <Badge variant="outline" className="text-xs px-1 py-0">
                <span className={`h-1.5 w-1.5 rounded-full ${status.color} mr-1`} />
                {status.label}
              </Badge>
            </div>
            {message.subject && (
              <p className="text-sm font-medium mt-1 truncate">{message.subject}</p>
            )}
            <p className="text-sm text-muted-foreground truncate mt-0.5">{message.body}</p>
          </div>
        </div>
      </button>
    );
  };

  const MessageDetail = ({ message }: { message: Message }) => {
    const status = statusConfig[message.status];
    const isOutbound = message.direction === 'OUTBOUND';

    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {message.patient?.demographics?.firstName || 'Unknown'} {message.patient?.demographics?.lastName || 'Patient'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isOutbound ? `To: ${message.recipient}` : `From: ${message.sender}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                {channelIcons[message.channel]}
                {message.channel}
              </Badge>
              <Badge variant={message.status === 'FAILED' ? 'destructive' : 'secondary'}>
                {status.icon}
                <span className="ml-1">{status.label}</span>
              </Badge>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {message.subject && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">Subject</p>
              <p className="font-medium">{message.subject}</p>
            </div>
          )}

          <div
            className={`p-4 rounded-lg ${
              isOutbound ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.body}</p>
          </div>

          <div className="mt-4 space-y-2">
            <Separator />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Created: {format(new Date(message.createdAt), 'PPpp')}
              </p>
              {message.sentAt && (
                <p>Sent: {format(new Date(message.sentAt), 'PPpp')}</p>
              )}
              {message.deliveredAt && (
                <p>Delivered: {format(new Date(message.deliveredAt), 'PPpp')}</p>
              )}
              {message.readAt && (
                <p>Read: {format(new Date(message.readAt), 'PPpp')}</p>
              )}
              {message.statusMessage && (
                <p className="text-destructive">
                  Failure reason: {message.statusMessage}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-3 gap-4 h-[600px]">
      {/* Message List */}
      <Card className="col-span-1 flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Messages</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={channelFilter}
                onValueChange={(v) => setChannelFilter(v as CommunicationChannel | 'ALL')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Channels</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as MessageStatus | 'ALL')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="READ">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading messages...</div>
            ) : filteredMessages?.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No messages found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredMessages?.map((message: Message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isSelected={selectedMessage?.id === message.id}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Message Detail */}
      <Card className="col-span-2 overflow-hidden">
        {selectedMessage ? (
          <MessageDetail message={selectedMessage} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a message to view details</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
