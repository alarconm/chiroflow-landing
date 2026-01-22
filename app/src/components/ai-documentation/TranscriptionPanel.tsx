'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Loader2,
  User,
  Stethoscope,
  Edit,
  Save,
  Volume2,
  Radio,
  Clock,
  AlertCircle,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  id: string;
  speaker: 'provider' | 'patient' | 'unknown';
  text: string;
  timestamp: number;
  confidence?: number;
}

interface TranscriptionPanelProps {
  encounterId: string;
  onTranscriptReady?: (transcript: string) => void;
  onRequestSOAPGeneration?: (transcript: string) => void;
  disabled?: boolean;
}

export function TranscriptionPanel({
  encounterId,
  onTranscriptReady,
  onRequestSOAPGeneration,
  disabled = false,
}: TranscriptionPanelProps) {
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isAmbientMode, setIsAmbientMode] = useState(false);
  const [transcriptionId, setTranscriptionId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // tRPC mutations
  const startMutation = trpc.aiDoc.startTranscription.useMutation({
    onSuccess: (data) => {
      setTranscriptionId(data.transcriptionId);
      toast.success('Transcription started');
    },
    onError: (error) => toast.error(error.message),
  });

  const stopMutation = trpc.aiDoc.stopTranscription.useMutation({
    onSuccess: (data) => {
      setIsRecording(false);
      setIsPaused(false);
      if (data.transcript) {
        onTranscriptReady?.(data.transcript);
      }
      toast.success('Transcription completed');
    },
    onError: (error) => toast.error(error.message),
  });

  const pauseMutation = trpc.aiDoc.pauseTranscription.useMutation({
    onSuccess: () => {
      setIsPaused(true);
      toast.info('Transcription paused');
    },
    onError: (error) => toast.error(error.message),
  });

  const resumeMutation = trpc.aiDoc.resumeTranscription.useMutation({
    onSuccess: () => {
      setIsPaused(false);
      toast.info('Transcription resumed');
    },
    onError: (error) => toast.error(error.message),
  });

  const processChunkMutation = trpc.aiDoc.processAudioChunk.useMutation({
    onSuccess: (data) => {
      if (data.segment) {
        setSegments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${data.segment.chunkIndex}`,
            speaker: data.segment.speaker,
            text: data.segment.text,
            timestamp: data.segment.startTime,
            confidence: data.segment.confidence,
          },
        ]);
      }
    },
  });

  const updateTranscriptMutation = trpc.aiDoc.updateTranscript.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      toast.success('Transcript updated');
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleAmbientMutation = trpc.aiDoc.toggleAmbientMode.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.enabled ? 'Ambient mode enabled' : 'Ambient mode disabled');
    },
    onError: (error) => toast.error(error.message),
  });

  // Audio visualization
  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording && !isPaused) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel((average / 255) * 100);
    }
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, [isRecording, isPaused]);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analysis
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;

      let chunks: Blob[] = [];
      let chunkCount = 0;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && transcriptionId) {
          chunks.push(event.data);
          chunkCount++;

          // Send chunk every 5 seconds (5 chunks at 1 second intervals)
          if (chunkCount >= 5) {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              const audioData = base64.split(',')[1];
              processChunkMutation.mutate({
                transcriptionId: transcriptionId!,
                audioData: audioData,
                chunkIndex: Math.floor(duration / 5),
              });
            };
            reader.readAsDataURL(blob);
            chunks = [];
            chunkCount = 0;
          }
        }
      };

      mediaRecorder.start(1000); // Collect data every 1 second

      // Start API transcription
      await startMutation.mutateAsync({
        encounterId,
        mode: isAmbientMode ? 'AMBIENT' : 'DICTATION',
      });

      setIsRecording(true);
      setDuration(0);
      setSegments([]);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      // Start audio visualization
      updateAudioLevel();
    } catch (error) {
      toast.error('Microphone access denied');
    }
  };

  // Stop recording
  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      setAudioLevel(0);

      if (transcriptionId) {
        await stopMutation.mutateAsync({ transcriptionId });
      }
    }
  };

  // Pause/Resume recording
  const togglePause = async () => {
    if (!transcriptionId) return;

    if (isPaused) {
      await resumeMutation.mutateAsync({ transcriptionId });
      mediaRecorderRef.current?.resume();
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      await pauseMutation.mutateAsync({ transcriptionId });
      mediaRecorderRef.current?.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  // Toggle ambient mode
  const handleAmbientToggle = async (enabled: boolean) => {
    setIsAmbientMode(enabled);
    await toggleAmbientMutation.mutateAsync({
      encounterId,
      enabled,
    });
  };

  // Edit transcript
  const startEditing = () => {
    const fullText = segments.map((s) => s.text).join('\n\n');
    setEditText(fullText);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!transcriptionId) return;
    await updateTranscriptMutation.mutateAsync({
      transcriptionId,
      transcript: editText,
    });
  };

  // Get full transcript text
  const getFullTranscript = () => {
    return segments.map((s) => `[${s.speaker.toUpperCase()}]: ${s.text}`).join('\n\n');
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Speaker icon
  const SpeakerIcon = ({ speaker }: { speaker: string }) => {
    switch (speaker) {
      case 'provider':
        return <Stethoscope className="h-4 w-4 text-blue-500" />;
      case 'patient':
        return <User className="h-4 w-4 text-green-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Mic className="h-5 w-5 text-purple-500" />
              Transcription
            </CardTitle>
            {isRecording && (
              <Badge
                variant="outline"
                className={cn(
                  'animate-pulse',
                  isPaused ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                )}
              >
                <Radio className="h-3 w-3 mr-1" />
                {isPaused ? 'Paused' : 'Recording'}
              </Badge>
            )}
          </div>
          {isRecording && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatDuration(duration)}
            </div>
          )}
        </div>
        <CardDescription>
          Real-time transcription with speaker identification
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!isRecording ? (
            <Button
              onClick={startRecording}
              disabled={disabled || startMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              {startMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Start Recording
            </Button>
          ) : (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={togglePause}
                      variant="outline"
                      size="icon"
                      disabled={pauseMutation.isPending || resumeMutation.isPending}
                    >
                      {isPaused ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Pause className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isPaused ? 'Resume' : 'Pause'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                onClick={stopRecording}
                variant="destructive"
                disabled={stopMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                Stop
              </Button>
            </>
          )}

          <Separator orientation="vertical" className="h-8 hidden sm:block" />

          {/* Ambient Mode Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="ambient-mode"
              checked={isAmbientMode}
              onCheckedChange={handleAmbientToggle}
              disabled={isRecording}
            />
            <Label
              htmlFor="ambient-mode"
              className="text-sm cursor-pointer flex items-center gap-1"
            >
              <Volume2 className="h-4 w-4" />
              Ambient
            </Label>
          </div>
        </div>

        {/* Audio Level Indicator */}
        {isRecording && !isPaused && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Audio Level</span>
              <span>{Math.round(audioLevel)}%</span>
            </div>
            <Progress value={audioLevel} className="h-2" />
          </div>
        )}

        {/* Transcript View */}
        <div className="flex-1 min-h-0">
          {isEditing ? (
            <div className="space-y-2 h-full flex flex-col">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 min-h-[200px] font-mono text-sm resize-none"
                placeholder="Edit transcript..."
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  disabled={updateTranscriptMutation.isPending}
                >
                  {updateTranscriptMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : segments.length > 0 ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Transcript ({segments.length} segments)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditing}
                  disabled={isRecording}
                >
                  <Edit className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              </div>
              <ScrollArea className="flex-1 border rounded-md" ref={scrollRef}>
                <div className="p-3 space-y-3">
                  {segments.map((segment) => (
                    <div key={segment.id} className="flex gap-2">
                      <div className="flex-shrink-0 mt-1">
                        <SpeakerIcon speaker={segment.speaker} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium capitalize">
                            {segment.speaker}
                          </span>
                          {segment.confidence && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                segment.confidence >= 0.9
                                  ? 'bg-green-50 text-green-700'
                                  : segment.confidence >= 0.7
                                  ? 'bg-yellow-50 text-yellow-700'
                                  : 'bg-red-50 text-red-700'
                              )}
                            >
                              {Math.round(segment.confidence * 100)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {segment.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Generate SOAP Button */}
              {!isRecording && segments.length > 0 && (
                <Button
                  className="mt-3 w-full"
                  onClick={() => onRequestSOAPGeneration?.(getFullTranscript())}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Generate SOAP from Transcript
                </Button>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-muted-foreground">
              <div>
                <Mic className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {isRecording
                    ? 'Listening... speak to see transcript'
                    : 'Click "Start Recording" to begin transcription'}
                </p>
                {isAmbientMode && !isRecording && (
                  <p className="text-xs mt-2 text-purple-600">
                    Ambient mode enabled - will capture natural conversation
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
