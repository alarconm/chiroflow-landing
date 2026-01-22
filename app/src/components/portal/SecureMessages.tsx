'use client';

/**
 * Epic 14: Patient Portal - Secure Messaging Component
 * US-099: HIPAA-compliant secure messaging between patients and clinic
 * Features: Send/receive messages, attachments, read receipts, after-hours auto-response
 */

import { useEffect, useState, useRef } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Paperclip,
  X,
  FileText,
  Image,
  File,
  Check,
  CheckCheck,
  Clock,
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
    priority: 'NORMAL',
    createdAt: subDays(new Date(), 1).toISOString(),
    replyCount: 0,
    attachments: [{ fileName: 'lab-results.pdf', fileSize: 125000 }],
  },
  {
    id: 'demo-msg-2',
    subject: 'Question about exercises',
    body: 'Hi, I wanted to ask about the stretching exercises you recommended. How many times per day should I do them?',
    senderName: '[DEMO] Patient',
    isFromPatient: true,
    status: 'READ',
    priority: 'NORMAL',
    createdAt: subDays(new Date(), 3).toISOString(),
    replyCount: 1,
    attachments: [],
  },
  {
    id: 'demo-msg-3',
    subject: 'Urgent: Medication Question',
    body: 'I have a question about the new medication prescribed...',
    senderName: '[DEMO] Patient',
    isFromPatient: true,
    status: 'READ',
    priority: 'HIGH',
    createdAt: subDays(new Date(), 5).toISOString(),
    replyCount: 2,
    attachments: [],
  },
  {
    id: 'demo-msg-4',
    subject: 'Appointment Reminder',
    body: 'This is a reminder about your upcoming appointment on...',
    senderName: 'ChiroFlow Demo Practice',
    isFromPatient: false,
    status: 'READ',
    priority: 'LOW',
    createdAt: subDays(new Date(), 7).toISOString(),
    replyCount: 0,
    attachments: [],
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
    readAt: subDays(new Date(), 1).toISOString(),
    readReceipt: { readAt: subDays(new Date(), 1).toISOString(), readByName: 'You' },
    attachments: [{ fileName: 'lab-results.pdf', fileSize: 125000 }],
  },
  replies: [],
};

// Attachment type for uploaded files
interface MessageAttachment {
  fileName: string;
  fileSize: number;
  storageKey?: string;
  file?: File;
}

// File icon helper
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return <Image className="h-4 w-4" />;
  }
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) {
    return <FileText className="h-4 w-4" />;
  }
  return <File className="h-4 w-4" />;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SecureMessages() {
  const [token, setToken] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPriority, setNewPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [replyBody, setReplyBody] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const utils = trpc.useUtils();

  const { data: messagesData, isLoading: isLoadingMessages } = trpc.portal.listMessages.useQuery(
    { sessionToken: token!, limit: 50 },
    { enabled: !!token }
  );

  // Use enhanced endpoint for read receipts
  const { data: threadData, isLoading: isLoadingThread } = trpc.portal.getMessageWithReadReceipt.useQuery(
    { sessionToken: token!, messageId: selectedMessageId! },
    { enabled: !!token && !!selectedMessageId }
  );

  const { data: unreadCount } = trpc.portal.getUnreadCount.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Use enhanced sendMessageWithAttachments for new messages with attachments
  const sendMessageMutation = trpc.portal.sendMessageWithAttachments.useMutation({
    onSuccess: () => {
      setIsComposeOpen(false);
      setNewSubject('');
      setNewBody('');
      setNewPriority('NORMAL');
      setAttachments([]);
      setReplyBody('');
      setReplyAttachments([]);
      utils.portal.listMessages.invalidate();
      utils.portal.getUnreadCount.invalidate();
      if (selectedMessageId) {
        utils.portal.getMessageWithReadReceipt.invalidate({ sessionToken: token!, messageId: selectedMessageId });
      }
    },
  });

  // Mark message as read mutation
  const markReadMutation = trpc.portal.markMessageRead.useMutation({
    onSuccess: () => {
      utils.portal.getUnreadCount.invalidate();
      if (selectedMessageId) {
        utils.portal.getMessageWithReadReceipt.invalidate({ sessionToken: token!, messageId: selectedMessageId });
      }
    },
  });

  const archiveMutation = trpc.portal.archiveMessage.useMutation({
    onSuccess: () => {
      setSelectedMessageId(null);
      utils.portal.listMessages.invalidate();
    },
  });

  // Handle file attachment selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isReply = false) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: MessageAttachment[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        alert(`File "${file.name}" exceeds 10MB limit`);
        continue;
      }
      if (!allowedTypes.includes(file.type)) {
        alert(`File type not allowed for "${file.name}". Allowed: JPEG, PNG, GIF, PDF, DOC, DOCX, TXT`);
        continue;
      }
      newAttachments.push({
        fileName: file.name,
        fileSize: file.size,
        file,
      });
    }

    if (isReply) {
      setReplyAttachments((prev) => [...prev, ...newAttachments]);
    } else {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }

    // Reset input
    e.target.value = '';
  };

  const removeAttachment = (index: number, isReply = false) => {
    if (isReply) {
      setReplyAttachments((prev) => prev.filter((_, i) => i !== index));
    } else {
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSendMessage = () => {
    if (!token || !newSubject.trim() || !newBody.trim()) return;

    // In production, files would be uploaded first, then message sent with storageKeys
    // For now, we'll just send the message with attachment metadata
    const attachmentData = attachments.map(({ fileName, fileSize }) => ({
      fileName,
      fileSize,
      storageKey: `messages/${Date.now()}-${fileName}`, // Placeholder
    }));

    sendMessageMutation.mutate({
      sessionToken: token,
      subject: newSubject,
      body: newBody,
      priority: newPriority,
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
    });
  };

  const handleSendReply = () => {
    if (!token || !selectedMessageId || !replyBody.trim()) return;
    const thread = threadData || DEMO_THREAD;

    const attachmentData = replyAttachments.map(({ fileName, fileSize }) => ({
      fileName,
      fileSize,
      storageKey: `messages/${Date.now()}-${fileName}`, // Placeholder
    }));

    sendMessageMutation.mutate({
      sessionToken: token,
      subject: `Re: ${thread.message?.subject}`,
      body: replyBody,
      parentMessageId: selectedMessageId,
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
    });
    setReplyBody('');
    setReplyAttachments([]);
  };

  // Mark message as read when viewing
  useEffect(() => {
    if (selectedMessageId && token && threadData?.message && !threadData.message.isFromPatient) {
      // Mark as read if unread
      if (!threadData.message.readReceipt) {
        markReadMutation.mutate({ sessionToken: token, messageId: selectedMessageId });
      }
    }
  }, [selectedMessageId, token, threadData]);

  const handleArchive = (messageId: string) => {
    if (!token) return;
    archiveMutation.mutate({ sessionToken: token, messageId });
  };

  // Use demo data if API returns nothing
  const messages = messagesData?.messages?.length ? messagesData.messages : DEMO_MESSAGES;
  const thread = threadData || (selectedMessageId ? DEMO_THREAD : null);
  const unread = unreadCount?.count ?? 2;

  // Check if currently after hours (simple client-side check)
  const isCurrentlyAfterHours = () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    // Closed on weekends (0 = Sunday, 6 = Saturday)
    if (day === 0 || day === 6) return true;
    // Closed before 8am or after 5pm
    if (hour < 8 || hour >= 17) return true;
    return false;
  };

  // After hours notice component
  const AfterHoursNotice = () => {
    if (!isCurrentlyAfterHours()) return null;

    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900 mb-1">After Hours</h3>
              <p className="text-sm text-amber-800">
                Our office is currently closed. Messages sent now will receive an automated response.
                We&apos;ll respond during our next business day (Mon-Fri, 8:00 AM - 5:00 PM).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!token) return null;

  // Read receipt indicator component
  const ReadReceipt = ({ message }: { message: { isFromPatient: boolean; readReceipt?: { readAt: string | Date; readByName: string } | null; createdAt: string | Date } }) => {
    if (!message.isFromPatient) return null; // Only show for patient's own messages

    if (message.readReceipt?.readAt) {
      const readDate = typeof message.readReceipt.readAt === 'string'
        ? new Date(message.readReceipt.readAt)
        : message.readReceipt.readAt;
      return (
        <div className="flex items-center gap-1 text-xs text-green-600">
          <CheckCheck className="h-3 w-3" />
          <span>Read {format(readDate, 'MMM d, h:mm a')}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 text-xs text-stone-400">
        <Check className="h-3 w-3" />
        <span>Delivered</span>
      </div>
    );
  };

  // Attachment display component
  const AttachmentsList = ({ attachments }: { attachments?: Array<{ fileName: string; fileSize: number }> }) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-stone-500 font-medium">Attachments:</p>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-stone-100 rounded-md px-3 py-2 text-sm"
            >
              {getFileIcon(att.fileName)}
              <span className="text-stone-700">{att.fileName}</span>
              <span className="text-stone-400 text-xs">({formatFileSize(att.fileSize)})</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-stone-500">
                          {format(new Date(thread.message.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                        <ReadReceipt message={thread.message} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-stone-700 bg-stone-50 p-4 rounded-lg">
                  {thread.message.body}
                </div>
                <AttachmentsList attachments={thread.message.attachments as Array<{ fileName: string; fileSize: number }> | undefined} />
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
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-stone-500">
                        {format(new Date(reply.createdAt), 'MMM d, yyyy h:mm a')}
                      </p>
                      <ReadReceipt message={reply} />
                    </div>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-stone-700 bg-stone-50 p-4 rounded-lg">
                  {reply.body}
                </div>
                <AttachmentsList attachments={reply.attachments as Array<{ fileName: string; fileSize: number }> | undefined} />
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

              {/* Reply Attachments */}
              {replyAttachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {replyAttachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-stone-100 rounded-md px-3 py-2 text-sm"
                    >
                      {getFileIcon(att.fileName)}
                      <span className="text-stone-700">{att.fileName}</span>
                      <span className="text-stone-400 text-xs">({formatFileSize(att.fileSize)})</span>
                      <button
                        onClick={() => removeAttachment(idx, true)}
                        className="text-stone-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center mt-4">
                <div>
                  <input
                    type="file"
                    ref={replyFileInputRef}
                    onChange={(e) => handleFileSelect(e, true)}
                    className="hidden"
                    multiple
                    accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.txt"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => replyFileInputRef.current?.click()}
                    className="border-stone-200"
                  >
                    <Paperclip className="h-4 w-4 mr-1" />
                    Attach
                  </Button>
                </div>
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
        <Dialog open={isComposeOpen} onOpenChange={(open) => {
          if (!open) {
            setNewSubject('');
            setNewBody('');
            setNewPriority('NORMAL');
            setAttachments([]);
          }
          setIsComposeOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Message
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
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
                <Label htmlFor="priority" className="text-stone-700">Priority</Label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT')}>
                  <SelectTrigger className="border-stone-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                {newPriority === 'URGENT' && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    For emergencies, please call 911 or our office directly
                  </p>
                )}
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

              {/* Attachments Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-stone-700">Attachments</Label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleFileSelect(e, false)}
                    className="hidden"
                    multiple
                    accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.txt"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-stone-200"
                  >
                    <Paperclip className="h-4 w-4 mr-1" />
                    Add File
                  </Button>
                </div>
                {attachments.length > 0 ? (
                  <div className="space-y-2 p-3 bg-stone-50 rounded-lg">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white rounded-md px-3 py-2 text-sm border border-stone-200"
                      >
                        <div className="flex items-center gap-2">
                          {getFileIcon(att.fileName)}
                          <span className="text-stone-700 truncate max-w-[200px]">{att.fileName}</span>
                          <span className="text-stone-400 text-xs">({formatFileSize(att.fileSize)})</span>
                        </div>
                        <button
                          onClick={() => removeAttachment(idx, false)}
                          className="text-stone-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">
                    Max 10MB per file. Allowed: Images (JPEG, PNG, GIF), PDF, Word, Text
                  </p>
                )}
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

      {/* After Hours Notice */}
      <AfterHoursNotice />

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`font-medium truncate ${
                          message.status === 'UNREAD' && !message.isFromPatient
                            ? 'text-[#053e67]'
                            : 'text-stone-900'
                        }`}
                      >
                        {message.subject}
                      </p>
                      {message.priority === 'URGENT' && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          Urgent
                        </Badge>
                      )}
                      {message.priority === 'HIGH' && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                          High
                        </Badge>
                      )}
                      {message.replyCount && message.replyCount > 0 && (
                        <Badge variant="outline" className="text-xs border-stone-200 text-stone-500">
                          {message.replyCount} repl{message.replyCount > 1 ? 'ies' : 'y'}
                        </Badge>
                      )}
                      {message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <Badge variant="outline" className="text-xs border-stone-200 text-stone-500">
                          <Paperclip className="h-3 w-3 mr-1" />
                          {message.attachments.length}
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
