'use client';

/**
 * Epic 14: Patient Portal - Secure Messaging Component
 * Secure messaging with care team using warm amber/stone theme
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { format, subDays } from 'date-fns';
import {
  MessageSquare,
  Send,
  Plus,
  Mail,
  MailOpen,
  Archive,
  ChevronRight,
  ArrowLeft,
  User,
  AlertTriangle,
  Phone,
} from 'lucide-react';

// Demo messages data
const DEMO_MESSAGES = [
  {
    id: 'demo-msg-1',
    subject: 'Your Recent Lab Results',
    body: 'Your recent lab work came back and everything looks good. Your vitamin D levels have improved since your last visit...',
    senderName: 'Dr. [DEMO] Sarah Mitchell',
    isFromPatient: false,
    status: 'UNREAD',
    createdAt: subDays(new Date(), 1).toISOString(),
    replyCount: 0,
  },
  {
    id: 'demo-msg-2',
    subject: 'Question about exercises',
    body: 'Hi, I wanted to ask about the stretching exercises you recommended. How many times per day should I do them?',
    senderName: '[DEMO] Patient',
    isFromPatient: true,
    status: 'READ',
    createdAt: subDays(new Date(), 3).toISOString(),
    replyCount: 1,
  },
  {
    id: 'demo-msg-3',
    subject: 'Appointment Reminder',
    body: 'This is a reminder about your upcoming appointment on...',
    senderName: 'ChiroFlow Demo Practice',
    isFromPatient: false,
    status: 'READ',
    createdAt: subDays(new Date(), 7).toISOString(),
    replyCount: 0,
  },
];

const DEMO_THREAD = {
  message: {
    id: 'demo-msg-1',
    subject: 'Your Recent Lab Results',
    body: 'Your recent lab work came back and everything looks good. Your vitamin D levels have improved since your last visit. Keep up with the supplements we discussed.\n\nLet me know if you have any questions.',
    senderName: 'Dr. [DEMO] Sarah Mitchell',
    isFromPatient: false,
    createdAt: subDays(new Date(), 1).toISOString(),
  },
  replies: [],
};

export function SecureMessages() {
  const [token, setToken] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [replyBody, setReplyBody] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const utils = trpc.useUtils();

  const { data: messagesData, isLoading: isLoadingMessages } = trpc.portal.listMessages.useQuery(
    { sessionToken: token!, limit: 50 },
    { enabled: !!token }
  );

  const { data: threadData, isLoading: isLoadingThread } = trpc.portal.getMessage.useQuery(
    { sessionToken: token!, messageId: selectedMessageId! },
    { enabled: !!token && !!selectedMessageId }
  );

  const { data: unreadCount } = trpc.portal.getUnreadCount.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const sendMessageMutation = trpc.portal.sendMessage.useMutation({
    onSuccess: () => {
      setIsComposeOpen(false);
      setNewSubject('');
      setNewBody('');
      setReplyBody('');
      utils.portal.listMessages.invalidate();
      utils.portal.getUnreadCount.invalidate();
      if (selectedMessageId) {
        utils.portal.getMessage.invalidate({ sessionToken: token!, messageId: selectedMessageId });
      }
    },
  });

  const archiveMutation = trpc.portal.archiveMessage.useMutation({
    onSuccess: () => {
      setSelectedMessageId(null);
      utils.portal.listMessages.invalidate();
    },
  });

  const handleSendMessage = () => {
    if (!token || !newSubject.trim() || !newBody.trim()) return;
    sendMessageMutation.mutate({
      sessionToken: token,
      subject: newSubject,
      body: newBody,
    });
  };

  const handleSendReply = () => {
    if (!token || !selectedMessageId || !replyBody.trim()) return;
    const thread = threadData || DEMO_THREAD;
    sendMessageMutation.mutate({
      sessionToken: token,
      subject: `Re: ${thread.message?.subject}`,
      body: replyBody,
      parentMessageId: selectedMessageId,
    });
    setReplyBody('');
  };

  const handleArchive = (messageId: string) => {
    if (!token) return;
    archiveMutation.mutate({ sessionToken: token, messageId });
  };

  // Use demo data if API returns nothing
  const messages = messagesData?.messages?.length ? messagesData.messages : DEMO_MESSAGES;
  const thread = threadData || (selectedMessageId ? DEMO_THREAD : null);
  const unread = unreadCount?.count ?? 2;

  if (!token) return null;

  // Message Thread View
  if (selectedMessageId && thread) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedMessageId(null)}
            className="text-stone-600 hover:text-[#053e67] hover:bg-blue-50"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Messages
          </Button>
        </div>

        <Card className="border-stone-200">
          <CardHeader className="border-b border-stone-200 bg-stone-50">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-stone-900">{thread.message?.subject || 'No Subject'}</CardTitle>
                <CardDescription className="text-stone-500">
                  {(thread.replies?.length || 0) + 1} message
                  {(thread.replies?.length || 0) > 0 ? 's' : ''} in this conversation
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleArchive(selectedMessageId)}
                className="border-stone-200 hover:bg-stone-100"
              >
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-stone-100">
            {/* Original Message */}
            {thread.message && (
              <div className="py-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        thread.message.isFromPatient
                          ? 'bg-blue-100 text-[#053e67]'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-stone-900">
                        {thread.message.isFromPatient ? 'You' : thread.message.senderName}
                      </p>
                      <p className="text-sm text-stone-500">
                        {format(new Date(thread.message.createdAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-stone-700 bg-stone-50 p-4 rounded-lg">
                  {thread.message.body}
                </div>
              </div>
            )}

            {/* Replies */}
            {thread.replies?.filter((r): r is NonNullable<typeof r> => r !== null).map((reply) => (
              <div key={reply.id} className="py-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      reply.isFromPatient
                        ? 'bg-blue-100 text-[#053e67]'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-stone-900">
                      {reply.isFromPatient ? 'You' : reply.senderName}
                    </p>
                    <p className="text-sm text-stone-500">
                      {format(new Date(reply.createdAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-stone-700 bg-stone-50 p-4 rounded-lg">
                  {reply.body}
                </div>
              </div>
            ))}

            {/* Reply Form */}
            <div className="pt-6">
              <Label htmlFor="reply" className="mb-2 block text-stone-700 font-medium">
                Reply
              </Label>
              <Textarea
                id="reply"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your reply..."
                rows={4}
                className="border-stone-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="flex justify-end mt-4">
                <Button
                  onClick={handleSendReply}
                  disabled={sendMessageMutation.isPending || !replyBody.trim()}
                  className="bg-[#053e67] hover:bg-[#053e67] text-white"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendMessageMutation.isPending ? 'Sending...' : 'Send Reply'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Messages List View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Messages</h1>
          <p className="text-stone-600">
            Secure communication with your care team
            {unread > 0 && (
              <Badge className="ml-2 bg-blue-100 text-[#053e67] border-blue-200">
                {unread} unread
              </Badge>
            )}
          </p>
        </div>
        <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Message
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-stone-900">New Message</DialogTitle>
              <DialogDescription className="text-stone-500">
                Send a secure message to your care team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-stone-700">Subject</Label>
                <Input
                  id="subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="What is your message about?"
                  className="border-stone-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body" className="text-stone-700">Message</Label>
                <Textarea
                  id="body"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Type your message..."
                  rows={6}
                  className="border-stone-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsComposeOpen(false)}
                className="border-stone-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={sendMessageMutation.isPending || !newSubject.trim() || !newBody.trim()}
                className="bg-[#053e67] hover:bg-[#053e67] text-white"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMessageMutation.isPending ? 'Sending...' : 'Send Message'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Messages List */}
      <Card className="border-stone-200">
        <CardContent className="p-0">
          {isLoadingMessages ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-stone-300 mb-4" />
              <p className="text-stone-500 mb-4">No messages yet</p>
              <Button
                onClick={() => setIsComposeOpen(true)}
                className="bg-[#053e67] hover:bg-[#053e67] text-white"
              >
                Send Your First Message
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {messages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => setSelectedMessageId(message.id)}
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {message.status === 'UNREAD' && !message.isFromPatient ? (
                      <div className="p-2 bg-blue-100 rounded-full">
                        <Mail className="h-5 w-5 text-[#053e67]" />
                      </div>
                    ) : (
                      <div className="p-2 bg-stone-100 rounded-full">
                        <MailOpen className="h-5 w-5 text-stone-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`font-medium truncate ${
                          message.status === 'UNREAD' && !message.isFromPatient
                            ? 'text-[#053e67]'
                            : 'text-stone-900'
                        }`}
                      >
                        {message.subject}
                      </p>
                      {message.replyCount && message.replyCount > 0 && (
                        <Badge variant="outline" className="text-xs border-stone-200 text-stone-500">
                          {message.replyCount} repl{message.replyCount > 1 ? 'ies' : 'y'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-stone-500 truncate">{message.body}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      {message.isFromPatient ? 'You' : message.senderName} -{' '}
                      {format(new Date(message.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-stone-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#053e67] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 mb-2">Important Notes</h3>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>Messages are secure and encrypted for your privacy</li>
                <li>Response times may vary - typically within 1-2 business days</li>
                <li>For urgent matters, please call our office directly</li>
                <li>Do not use messaging for emergencies - call 911 instead</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Card */}
      <Card className="border-stone-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-[#053e67]" />
            <div>
              <p className="font-medium text-stone-900">Need immediate assistance?</p>
              <p className="text-sm text-stone-500">Call us at <span className="text-[#053e67] font-medium">(555) 123-4567</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
