'use client';

/**
 * Epic 12: AI Communication Agent - Natural Language Booking Demo
 *
 * Demonstrates the natural language appointment booking capability.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  Send,
  Bot,
  User,
  Loader2,
  CheckCircle,
  Clock,
  MapPin,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface NLBookingDemoProps {
  patientId: string;
  onBookingComplete?: (appointmentId: string) => void;
  className?: string;
}

export function NLBookingDemo({
  patientId,
  onBookingComplete,
  className,
}: NLBookingDemoProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      content: "Hi! I can help you schedule an appointment using natural language. Try saying something like:\n\n- \"I need to schedule a checkup for next Tuesday\"\n- \"Book me an appointment with Dr. Smith tomorrow morning\"\n- \"I want the earliest available adjustment\"",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [pendingBooking, setPendingBooking] = useState<{
    appointmentTypeId?: string;
    appointmentTypeName?: string;
    providerId?: string;
    providerName?: string;
    preferredDate?: Date;
    step: 'type' | 'provider' | 'date' | 'time' | 'confirm';
  } | null>(null);
  const [bookingComplete, setBookingComplete] = useState(false);

  // Process booking request mutation
  const processBooking = trpc.aiCommunication.processBookingRequest.useMutation({
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: data.message,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      if (data.updatedBooking) {
        setPendingBooking(data.updatedBooking as typeof pendingBooking);
      }

      if (data.bookingComplete && data.appointmentId) {
        setBookingComplete(true);
        onBookingComplete?.(data.appointmentId);
      }
    },
  });

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    processBooking.mutate({
      message: inputValue,
      patientId,
      pendingBooking: pendingBooking
        ? {
            ...pendingBooking,
            preferredDate: pendingBooking.preferredDate,
          }
        : undefined,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestedAction = (action: string) => {
    setInputValue(action);
    setTimeout(() => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        content: action,
        sender: 'user',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      processBooking.mutate({
        message: action,
        patientId,
        pendingBooking: pendingBooking
          ? {
              ...pendingBooking,
              preferredDate: pendingBooking.preferredDate,
            }
          : undefined,
      });
    }, 100);
  };

  const getSuggestedActions = () => {
    if (!pendingBooking) {
      return [
        'I need a new patient exam',
        'Schedule a follow-up visit',
        'I just need an adjustment',
      ];
    }

    switch (pendingBooking.step) {
      case 'type':
        return [
          'New patient exam',
          'Follow-up visit',
          'Adjustment only',
        ];
      case 'provider':
        return [
          'Any available provider',
          'The earliest available',
        ];
      case 'date':
        return [
          'Tomorrow',
          'Next Monday',
          'The first available',
        ];
      case 'time':
        return [
          'Morning',
          'Afternoon',
          'The earliest time',
        ];
      case 'confirm':
        return [
          'Yes, confirm my appointment',
          "No, let's change the time",
        ];
      default:
        return [];
    }
  };

  const resetBooking = () => {
    setPendingBooking(null);
    setBookingComplete(false);
    setMessages([
      {
        id: 'welcome',
        content: "Hi! I can help you schedule an appointment using natural language. Try saying something like:\n\n- \"I need to schedule a checkup for next Tuesday\"\n- \"Book me an appointment with Dr. Smith tomorrow morning\"\n- \"I want the earliest available adjustment\"",
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <Card className={cn('flex flex-col h-[600px]', className)}>
      <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <CardTitle className="text-lg">Natural Language Booking</CardTitle>
          </div>
          {bookingComplete && (
            <Badge variant="secondary" className="bg-green-500 text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Booked
            </Badge>
          )}
        </div>
        <CardDescription className="text-primary-foreground/80">
          Schedule appointments using conversational language
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Booking progress indicator */}
        {pendingBooking && !bookingComplete && (
          <div className="p-4 border-b bg-muted/50">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Booking progress:</span>
              <div className="flex items-center gap-1">
                {['type', 'provider', 'date', 'time', 'confirm'].map((step, index) => (
                  <React.Fragment key={step}>
                    {index > 0 && <span className="text-muted-foreground">-</span>}
                    <Badge
                      variant={
                        step === pendingBooking.step
                          ? 'default'
                          : ['type', 'provider', 'date', 'time', 'confirm'].indexOf(step) <
                            ['type', 'provider', 'date', 'time', 'confirm'].indexOf(pendingBooking.step)
                          ? 'secondary'
                          : 'outline'
                      }
                      className="text-xs capitalize"
                    >
                      {step}
                    </Badge>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {pendingBooking.appointmentTypeName && (
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground">Type:</span>{' '}
                <span className="font-medium">{pendingBooking.appointmentTypeName}</span>
              </div>
            )}
            {pendingBooking.providerName && (
              <div className="text-sm">
                <span className="text-muted-foreground">Provider:</span>{' '}
                <span className="font-medium">{pendingBooking.providerName}</span>
              </div>
            )}
            {pendingBooking.preferredDate && (
              <div className="text-sm">
                <span className="text-muted-foreground">Date:</span>{' '}
                <span className="font-medium">
                  {format(new Date(pendingBooking.preferredDate), 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Booking complete card */}
        {bookingComplete && (
          <div className="p-4 border-b bg-green-50">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">Appointment Booked!</h4>
                <p className="text-sm text-green-700 mt-1">
                  Your appointment has been successfully scheduled.
                </p>
                {pendingBooking && (
                  <div className="mt-3 space-y-1 text-sm text-green-800">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {pendingBooking.preferredDate &&
                          format(new Date(pendingBooking.preferredDate), 'EEEE, MMMM d, yyyy')}
                      </span>
                    </div>
                    {pendingBooking.appointmentTypeName && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{pendingBooking.appointmentTypeName}</span>
                      </div>
                    )}
                    {pendingBooking.providerName && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{pendingBooking.providerName}</span>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={resetBooking}
                >
                  Book Another Appointment
                </Button>
              </div>
            </div>
          </div>
        )}

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
                </div>
                {message.sender === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {processBooking.isPending && (
              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested actions */}
        {!bookingComplete && getSuggestedActions().length > 0 && (
          <div className="px-4 py-2 border-t flex flex-wrap gap-2">
            {getSuggestedActions().map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestedAction(action)}
                disabled={processBooking.isPending}
              >
                {action}
              </Button>
            ))}
          </div>
        )}

        {/* Input area */}
        {!bookingComplete && (
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type your request..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={processBooking.isPending}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || processBooking.isPending}
                size="icon"
              >
                {processBooking.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NLBookingDemo;
