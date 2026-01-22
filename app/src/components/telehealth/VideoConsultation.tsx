'use client';

/**
 * Video Consultation Component
 * Epic 21: Telehealth & Virtual Care - US-219
 *
 * Full video consultation interface with:
 * - Full-screen video component
 * - Picture-in-picture self view
 * - Mute/unmute audio and video
 * - Screen sharing capability
 * - Chat sidebar for text communication
 * - Session timer display
 * - End session button with confirmation
 * - Connection quality indicator
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trpc } from '@/trpc/client';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  MonitorUp,
  MonitorOff,
  MessageSquare,
  X,
  Send,
  Maximize,
  Minimize,
  Clock,
  Wifi,
  WifiOff,
  WifiLow,
  AlertTriangle,
  User,
  Settings,
  MoreVertical,
  PictureInPicture,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface VideoConsultationProps {
  sessionId: string;
  isHost?: boolean;
  patientName?: string;
  providerName?: string;
  onSessionEnd?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'local' | 'remote';
  senderName: string;
  text: string;
  timestamp: Date;
}

type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

// ============================================
// COMPONENT
// ============================================

export function VideoConsultation({
  sessionId,
  isHost = false,
  patientName,
  providerName,
  onSessionEnd,
}: VideoConsultationProps) {
  // ==========================================
  // STATE
  // ==========================================

  // Media states
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // UI states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Session states
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('good');
  const [qualityDetails, setQualityDetails] = useState({
    rtt: 0,
    packetLoss: 0,
    bitrate: 0,
  });

  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // ==========================================
  // MUTATIONS
  // ==========================================

  const endSessionMutation = trpc.telehealth.endSession.useMutation({
    onSuccess: () => {
      cleanup();
      onSessionEnd?.();
    },
  });

  const reportTechnicalIssueMutation = trpc.telehealth.reportTechnicalIssue.useMutation();

  // ==========================================
  // MEDIA SETUP
  // ==========================================

  // Initialize local media
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Start session timer
        setSessionStartTime(new Date());
      } catch (error) {
        console.error('Failed to initialize media:', error);
        reportTechnicalIssueMutation.mutate({
          sessionId,
          issueType: 'video',
          description: 'Failed to initialize camera/microphone',
        });
      }
    };

    initializeMedia();

    return () => {
      cleanup();
    };
  }, [sessionId]);

  // Simulate remote stream for demo (in real implementation, this would come from WebRTC)
  useEffect(() => {
    // For demo purposes, mirror local stream to remote
    // In production, this would be the actual remote peer connection
    if (localStream && remoteVideoRef.current) {
      // Create a placeholder for remote video
      remoteVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ==========================================
  // SESSION TIMER
  // ==========================================

  useEffect(() => {
    if (!sessionStartTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diffMs = now.getTime() - sessionStartTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      setElapsedTime(
        `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // ==========================================
  // CONNECTION QUALITY SIMULATION
  // ==========================================

  useEffect(() => {
    // Simulate connection quality monitoring
    const interval = setInterval(() => {
      // Random simulation for demo - in production, use actual WebRTC stats
      const rtt = Math.floor(Math.random() * 150) + 20;
      const packetLoss = Math.random() * 5;
      const bitrate = Math.floor(Math.random() * 2000) + 1000;

      setQualityDetails({ rtt, packetLoss, bitrate });

      // Determine quality based on metrics
      if (rtt < 50 && packetLoss < 1) {
        setConnectionQuality('excellent');
      } else if (rtt < 100 && packetLoss < 2) {
        setConnectionQuality('good');
      } else if (rtt < 200 && packetLoss < 5) {
        setConnectionQuality('fair');
      } else {
        setConnectionQuality('poor');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ==========================================
  // CONTROLS AUTO-HIDE
  // ==========================================

  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // ==========================================
  // SCROLL CHAT TO BOTTOM
  // ==========================================

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [chatMessages, isChatOpen]);

  // ==========================================
  // CLEANUP
  // ==========================================

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }
  }, [localStream, screenStream]);

  // ==========================================
  // MEDIA CONTROLS
  // ==========================================

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, [localStream]);

  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        setScreenStream(stream);
        setIsScreenSharing(true);

        // Handle when user stops sharing via browser UI
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setScreenStream(null);
          setIsScreenSharing(false);
        });
      } catch (error) {
        console.error('Failed to start screen sharing:', error);
      }
    }
  }, [isScreenSharing, screenStream]);

  // ==========================================
  // PICTURE-IN-PICTURE
  // ==========================================

  const togglePip = useCallback(async () => {
    if (!localVideoRef.current) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else if (document.pictureInPictureEnabled) {
        await localVideoRef.current.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }, []);

  // ==========================================
  // FULLSCREEN
  // ==========================================

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, []);

  // ==========================================
  // CHAT
  // ==========================================

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'local',
      senderName: isHost ? providerName || 'Provider' : patientName || 'Patient',
      text: newMessage.trim(),
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, message]);
    setNewMessage('');

    // In production, this would send via WebRTC data channel
  }, [newMessage, isHost, providerName, patientName]);

  // Simulate receiving messages (for demo)
  useEffect(() => {
    const interval = setInterval(() => {
      // Random chance to receive a demo message
      if (Math.random() > 0.95) {
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          sender: 'remote',
          senderName: isHost ? patientName || 'Patient' : providerName || 'Provider',
          text: 'Can you hear me clearly?',
          timestamp: new Date(),
        };
        setChatMessages((prev) => [...prev, message]);
        if (!isChatOpen) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isHost, patientName, providerName, isChatOpen]);

  // ==========================================
  // END SESSION
  // ==========================================

  const handleEndSession = useCallback(() => {
    const connectionQualityMap = {
      excellent: 'good' as const,
      good: 'good' as const,
      fair: 'fair' as const,
      poor: 'poor' as const,
      disconnected: 'poor' as const,
    };

    endSessionMutation.mutate({
      sessionId,
      connectionQuality: connectionQualityMap[connectionQuality],
      audioQuality: connectionQualityMap[connectionQuality],
      videoQuality: connectionQualityMap[connectionQuality],
      technicalNotes: qualityDetails.rtt > 100 ? 'Some latency during session' : undefined,
    });
  }, [sessionId, connectionQuality, qualityDetails, endSessionMutation]);

  // ==========================================
  // CONNECTION QUALITY ICON
  // ==========================================

  const getConnectionIcon = () => {
    switch (connectionQuality) {
      case 'excellent':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'good':
        return <Wifi className="h-4 w-4 text-green-400" />;
      case 'fair':
        return <WifiLow className="h-4 w-4 text-yellow-500" />;
      case 'poor':
        return <WifiLow className="h-4 w-4 text-red-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-red-600" />;
    }
  };

  const getConnectionLabel = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'fair':
        return 'Fair';
      case 'poor':
        return 'Poor';
      case 'disconnected':
        return 'Disconnected';
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className={cn(
          'relative bg-black w-full',
          isFullscreen ? 'fixed inset-0 z-50' : 'h-[600px] rounded-lg overflow-hidden'
        )}
      >
        {/* Main Video (Remote Stream or Screen Share) */}
        <div className="absolute inset-0">
          {isScreenSharing && screenStream ? (
            <video
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
              ref={(el) => {
                if (el) el.srcObject = screenStream;
              }}
            />
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}

          {/* No Remote Video Placeholder */}
          {!remoteStream && !isScreenSharing && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center text-white">
                <User className="h-24 w-24 mx-auto mb-4 opacity-50" />
                <p className="text-lg">
                  Waiting for {isHost ? patientName || 'patient' : providerName || 'provider'}...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Self View (Picture-in-Picture Style) - Mobile responsive */}
        <div
          className={cn(
            'absolute bottom-24 right-4 rounded-lg overflow-hidden',
            'w-32 h-24 sm:w-48 sm:h-36', // Smaller on mobile
            'bg-gray-800 shadow-lg border-2 border-gray-700',
            'transition-all duration-300 hover:scale-105 cursor-move',
            isPipActive && 'opacity-0'
          )}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'w-full h-full object-cover',
              !isVideoEnabled && 'hidden'
            )}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <VideoOff className="h-8 w-8 text-gray-500" />
            </div>
          )}
          {/* Muted indicator */}
          {!isAudioEnabled && (
            <div className="absolute bottom-2 left-2">
              <MicOff className="h-4 w-4 text-red-500" />
            </div>
          )}
          {/* PiP button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
                onClick={togglePip}
              >
                <PictureInPicture className="h-3 w-3 text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Picture-in-Picture</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Top Bar - Session Info */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 p-4',
            'bg-gradient-to-b from-black/60 to-transparent',
            'transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Session Timer */}
              <Badge variant="secondary" className="bg-black/50 text-white gap-2">
                <Clock className="h-3 w-3" />
                {elapsedTime}
              </Badge>

              {/* Connection Quality */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'bg-black/50 text-white gap-2 cursor-help',
                      connectionQuality === 'poor' && 'animate-pulse'
                    )}
                  >
                    {getConnectionIcon()}
                    {getConnectionLabel()}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    <p>RTT: {qualityDetails.rtt}ms</p>
                    <p>Packet Loss: {qualityDetails.packetLoss.toFixed(1)}%</p>
                    <p>Bitrate: {qualityDetails.bitrate} kbps</p>
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Screen Sharing Indicator */}
              {isScreenSharing && (
                <Badge variant="secondary" className="bg-green-600 text-white gap-2">
                  <MonitorUp className="h-3 w-3" />
                  Sharing Screen
                </Badge>
              )}
            </div>

            {/* Participant Name */}
            <div className="text-white text-sm">
              {isHost ? patientName || 'Patient' : providerName || 'Provider'}
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 p-4',
            'bg-gradient-to-t from-black/60 to-transparent',
            'transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
            {/* Mute/Unmute Audio */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isAudioEnabled ? 'secondary' : 'destructive'}
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12"
                  onClick={toggleAudio}
                >
                  {isAudioEnabled ? (
                    <Mic className="h-5 w-5" />
                  ) : (
                    <MicOff className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isAudioEnabled ? 'Mute' : 'Unmute'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Toggle Video */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isVideoEnabled ? 'secondary' : 'destructive'}
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12"
                  onClick={toggleVideo}
                >
                  {isVideoEnabled ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <VideoOff className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Screen Share */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isScreenSharing ? 'default' : 'secondary'}
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12 hidden sm:flex"
                  onClick={toggleScreenShare}
                >
                  {isScreenSharing ? (
                    <MonitorOff className="h-5 w-5" />
                  ) : (
                    <MonitorUp className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Chat Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isChatOpen ? 'default' : 'secondary'}
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12 relative"
                  onClick={() => setIsChatOpen(!isChatOpen)}
                >
                  <MessageSquare className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Chat</p>
              </TooltipContent>
            </Tooltip>

            {/* Fullscreen Toggle - hidden on mobile as it's automatic */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12 hidden sm:flex"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="h-5 w-5" />
                  ) : (
                    <Maximize className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</p>
              </TooltipContent>
            </Tooltip>

            {/* End Call */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="lg"
                  className="rounded-full h-10 w-10 sm:h-12 sm:w-12"
                  onClick={() => setShowEndDialog(true)}
                >
                  <PhoneOff className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>End session</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Chat Sidebar - Mobile responsive (full width on small screens) */}
        <div
          className={cn(
            'absolute top-0 right-0 h-full bg-white dark:bg-gray-900',
            'w-full sm:w-80', // Full width on mobile
            'transform transition-transform duration-300 ease-in-out',
            'flex flex-col shadow-lg z-20',
            isChatOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Chat</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsChatOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {chatMessages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col',
                      msg.sender === 'local' ? 'items-end' : 'items-start'
                    )}
                  >
                    <span className="text-xs text-muted-foreground mb-1">
                      {msg.senderName}
                    </span>
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 max-w-[85%]',
                        msg.sender === 'local'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <p className="text-sm">{msg.text}</p>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* Chat Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* End Session Confirmation Dialog */}
        <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End Telehealth Session?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to end this session? This will disconnect both participants
                and save the session record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleEndSession}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                End Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Poor Connection Warning */}
        {connectionQuality === 'poor' && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2">
            <Badge variant="destructive" className="gap-2 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              Poor connection - Video quality may be reduced
            </Badge>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
