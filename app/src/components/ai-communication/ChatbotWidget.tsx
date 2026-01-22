'use client';

/**
 * Epic 12: AI Communication Agent - Chatbot Widget
 *
 * Interactive chatbot widget for patient inquiries.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import type { AIIntent } from '@prisma/client';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  intent?: AIIntent;
  confidence?: number;
}

interface SuggestedAction {
  type: 'button' | 'quickReply' | 'link';
  label: string;
  value: string;
  url?: string;
}

interface ChatbotWidgetProps {
  patientId?: string;
  source?: string;
  onBookingComplete?: (appointmentId: string) => void;
  className?: string;
  embedded?: boolean;
}

export function ChatbotWidget({
  patientId,
  source = 'portal',
  onBookingComplete,
  className,
  embedded = false,
}: ChatbotWidgetProps) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // Start chat session mutation
  const startSession = trpc.aiCommunication.startChatSession.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      // Add welcome message
      setMessages([
        {
          id: 'welcome',
          content: `Hello${data.context?.patientName ? ` ${data.context.patientName.split(' ')[0]}` : ''}! I'm your AI assistant. How can I help you today? I can help with:\n\n- Scheduling appointments\n- Answering insurance questions\n- Finding office hours and location\n- Answering common questions`,
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
      setSuggestedActions([
        { type: 'quickReply', label: 'Schedule appointment', value: 'book_appointment' },
        { type: 'quickReply', label: 'Insurance questions', value: 'insurance_questions' },
        { type: 'quickReply', label: 'Office hours', value: 'office_hours' },
      ]);
    },
  });

  // Send message mutation
  const sendMessage = trpc.aiCommunication.sendChatMessage.useMutation({
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: data.messageId,
        content: data.response,
        sender: 'ai',
        timestamp: new Date(),
        intent: data.intent,
        confidence: data.confidence,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setSuggestedActions(data.suggestedActions || []);

      // Check if booking was completed
      if (data.context?.pendingBooking?.selectedSlot && onBookingComplete) {
        // In a real scenario, the booking would return an appointmentId
        onBookingComplete('appointment-created');
      }
    },
  });

  // End session mutation
  const endSession = trpc.aiCommunication.endChatSession.useMutation();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize session when opened
  useEffect(() => {
    if (isOpen && !sessionId) {
      startSession.mutate({ patientId, source });
    }
  }, [isOpen, sessionId, patientId, source, startSession]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    if (sessionId) {
      endSession.mutate({ sessionId });
    }
    setIsOpen(false);
    setSessionId(null);
    setMessages([]);
    setSuggestedActions([]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setSuggestedActions([]);

    sendMessage.mutate({
      sessionId,
      message: inputValue,
    });
  };

  const handleQuickReply = (action: SuggestedAction) => {
    if (action.type === 'link' && action.url) {
      window.open(action.url, '_blank');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: action.label,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setSuggestedActions([]);

    if (sessionId) {
      sendMessage.mutate({
        sessionId,
        message: action.value,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getIntentBadge = (intent?: AIIntent) => {
    if (!intent) return null;
    const intentLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      BOOKING: { label: 'Booking', variant: 'default' },
      RESCHEDULE: { label: 'Reschedule', variant: 'secondary' },
      CANCEL: { label: 'Cancel', variant: 'destructive' },
      FAQ_INSURANCE: { label: 'Insurance', variant: 'outline' },
      FAQ_HOURS: { label: 'Hours', variant: 'outline' },
      FAQ_SERVICES: { label: 'Services', variant: 'outline' },
      FAQ_LOCATION: { label: 'Location', variant: 'outline' },
      GENERAL: { label: 'General', variant: 'secondary' },
    };
    const config = intentLabels[intent] || { label: intent, variant: 'secondary' as const };
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
  };

  // Floating button when closed
  if (!embedded && !isOpen) {
    return (
      <Button
        onClick={handleOpen}
        className={cn(
          'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg',
          className
        )}
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        embedded
          ? 'h-full w-full'
          : 'fixed bottom-6 right-6 w-96 max-h-[600px] shadow-xl z-50',
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <CardTitle className="text-lg font-semibold">AI Assistant</CardTitle>
        </div>
        {!embedded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8 text-primary-foreground hover:bg-primary/90"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0 flex flex-col h-[500px]">
        {/* Messages area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.sender === 'ai' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2',
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.sender === 'ai' && message.intent && (
                    <div className="mt-1 flex items-center gap-2">
                      {getIntentBadge(message.intent)}
                    </div>
                  )}
                </div>
                {message.sender === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {sendMessage.isPending && (
              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Suggested actions */}
        {suggestedActions.length > 0 && (
          <div className="px-4 py-2 border-t flex flex-wrap gap-2">
            {suggestedActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleQuickReply(action)}
                disabled={sendMessage.isPending}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendMessage.isPending || !sessionId}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || sendMessage.isPending || !sessionId}
              size="icon"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ChatbotWidget;
