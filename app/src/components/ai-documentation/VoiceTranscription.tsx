'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mic, MicOff, Loader2, Check, AlertCircle } from 'lucide-react';

interface VoiceTranscriptionProps {
  encounterId: string;
  onTranscriptionComplete: (text: string) => void;
  disabled?: boolean;
}

export function VoiceTranscription({
  encounterId,
  onTranscriptionComplete,
  disabled = false,
}: VoiceTranscriptionProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState<{
    text: string;
    confidence: number;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const transcribeMutation = trpc.aiDocumentation.transcribe.useMutation({
    onSuccess: (data) => {
      setTranscriptionResult({
        text: data.text,
        confidence: data.confidence,
      });
      onTranscriptionComplete(data.text);
      toast({
        title: 'Transcription complete',
        description: `Confidence: ${Math.round(data.confidence * 100)}%`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Transcription failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio analysis for visual feedback
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Update audio level visualization
      const updateLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel((average / 255) * 100);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio level animation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setAudioLevel(0);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create blob and convert to base64
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.onloadend = () => {
          const base64 = reader.result as string;
          const audioData = base64.split(',')[1]; // Remove data URL prefix

          transcribeMutation.mutate({
            audioData,
            mimeType: 'audio/webm',
            encounterId,
          });
        };

        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setDuration(0);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to use voice transcription.',
        variant: 'destructive',
      });
    }
  }, [encounterId, toast, transcribeMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Voice Transcription
        </CardTitle>
        <CardDescription>
          Record audio to automatically generate SOAP note content
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled || transcribeMutation.isPending}
            variant={isRecording ? 'destructive' : 'default'}
            size="lg"
            className="w-32"
          >
            {transcribeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing
              </>
            ) : isRecording ? (
              <>
                <MicOff className="mr-2 h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" />
                Record
              </>
            )}
          </Button>

          {isRecording && (
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Recording...</span>
                <span className="font-mono">{formatDuration(duration)}</span>
              </div>
              <Progress value={audioLevel} className="h-2" />
            </div>
          )}
        </div>

        {transcriptionResult && (
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="font-medium">Transcription Result</span>
              </div>
              <Badge
                variant="outline"
                className={`${getConfidenceColor(transcriptionResult.confidence)} text-white border-0`}
              >
                {Math.round(transcriptionResult.confidence * 100)}% confidence
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {transcriptionResult.text}
            </p>
          </div>
        )}

        {transcriptionResult === null && !isRecording && !transcribeMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>Click Record to start voice dictation</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
