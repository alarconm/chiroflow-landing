'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Command, Volume2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Voice command types
interface VoiceCommand {
  command: string;
  aliases: string[];
  description: string;
  action: () => void;
  category: 'navigation' | 'transcription' | 'soap' | 'codes' | 'compliance' | 'general';
}

interface VoiceCommandContextType {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  registerCommand: (command: VoiceCommand) => void;
  unregisterCommand: (commandName: string) => void;
  showHelp: () => void;
  lastCommand: string | null;
  confidence: number;
}

const VoiceCommandContext = createContext<VoiceCommandContextType | null>(null);

export function useVoiceCommands() {
  const context = useContext(VoiceCommandContext);
  if (!context) {
    throw new Error('useVoiceCommands must be used within a VoiceCommandProvider');
  }
  return context;
}

// Speech Recognition types (not fully typed in TS)
interface SpeechRecognitionEventResult {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

// Browser SpeechRecognition interface
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface VoiceCommandProviderProps {
  children: ReactNode;
  wakeWord?: string;
  continuous?: boolean;
}

export function VoiceCommandProvider({
  children,
  wakeWord = 'hey chiroflow',
  continuous = true,
}: VoiceCommandProviderProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [commands, setCommands] = useState<Map<string, VoiceCommand>>(new Map());
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [recognition, setRecognition] = useState<SpeechRecognitionInstance | null>(null);
  const [isAwake, setIsAwake] = useState(false);
  const [awakeTimeout, setAwakeTimeout] = useState<NodeJS.Timeout | null>(null);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      setIsSupported(true);
      const recognitionInstance = new SpeechRecognitionAPI();
      recognitionInstance.continuous = continuous;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      setRecognition(recognitionInstance);
    }
  }, [continuous]);

  // Default commands
  useEffect(() => {
    const defaultCommands: VoiceCommand[] = [
      {
        command: 'help',
        aliases: ['show commands', 'what can you do', 'voice commands'],
        description: 'Show available voice commands',
        action: () => setShowHelpDialog(true),
        category: 'general',
      },
      {
        command: 'stop listening',
        aliases: ['stop', 'pause listening', 'mute'],
        description: 'Stop voice command listening',
        action: () => stopListening(),
        category: 'general',
      },
    ];

    defaultCommands.forEach((cmd) => {
      setCommands((prev) => new Map(prev).set(cmd.command, cmd));
    });
  }, []);

  // Process speech
  const processTranscript = useCallback(
    (transcript: string, conf: number) => {
      const normalizedTranscript = transcript.toLowerCase().trim();

      // Check for wake word
      if (normalizedTranscript.includes(wakeWord.toLowerCase())) {
        setIsAwake(true);
        toast.success('Listening for command...', { duration: 2000 });

        // Auto-sleep after 10 seconds
        if (awakeTimeout) clearTimeout(awakeTimeout);
        const timeout = setTimeout(() => {
          setIsAwake(false);
        }, 10000);
        setAwakeTimeout(timeout);
        return;
      }

      // Only process commands when awake (or if no wake word required)
      if (!isAwake && wakeWord) return;

      // Find matching command
      for (const [name, cmd] of commands) {
        const allTriggers = [name, ...cmd.aliases].map((t) => t.toLowerCase());

        for (const trigger of allTriggers) {
          if (normalizedTranscript.includes(trigger)) {
            setLastCommand(name);
            setConfidence(conf);

            // Execute command
            try {
              cmd.action();
              toast.success(`Command: "${name}"`, { duration: 1500 });
            } catch (error) {
              toast.error(`Failed to execute: ${name}`);
            }

            // Reset wake state
            setIsAwake(false);
            if (awakeTimeout) clearTimeout(awakeTimeout);
            return;
          }
        }
      }
    },
    [commands, isAwake, wakeWord, awakeTimeout]
  );

  // Set up recognition handlers
  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event: SpeechRecognitionEventResult) => {
      const result = event.results[event.resultIndex];
      if (result.isFinal) {
        const transcript = result[0].transcript;
        const conf = result[0].confidence;
        processTranscript(transcript, conf);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied for voice commands');
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Restart if continuous mode
      if (isListening && continuous) {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }
    };
  }, [recognition, processTranscript, isListening, continuous]);

  // Start listening
  const startListening = useCallback(() => {
    if (!recognition || !isSupported) {
      toast.error('Voice commands not supported in this browser');
      return;
    }

    try {
      recognition.start();
      setIsListening(true);
      toast.success('Voice commands active', { duration: 2000 });
    } catch {
      // Already started
    }
  }, [recognition, isSupported]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
      setIsAwake(false);
      if (awakeTimeout) clearTimeout(awakeTimeout);
    }
  }, [recognition, awakeTimeout]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Register command
  const registerCommand = useCallback((command: VoiceCommand) => {
    setCommands((prev) => new Map(prev).set(command.command, command));
  }, []);

  // Unregister command
  const unregisterCommand = useCallback((commandName: string) => {
    setCommands((prev) => {
      const next = new Map(prev);
      next.delete(commandName);
      return next;
    });
  }, []);

  // Show help
  const showHelp = useCallback(() => {
    setShowHelpDialog(true);
  }, []);

  // Group commands by category
  const groupedCommands = Array.from(commands.values()).reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, VoiceCommand[]>
  );

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    transcription: 'Transcription',
    soap: 'SOAP Notes',
    codes: 'Coding',
    compliance: 'Compliance',
    general: 'General',
  };

  return (
    <VoiceCommandContext.Provider
      value={{
        isListening,
        isSupported,
        startListening,
        stopListening,
        toggleListening,
        registerCommand,
        unregisterCommand,
        showHelp,
        lastCommand,
        confidence,
      }}
    >
      {children}

      {/* Voice Command Help Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Command className="h-5 w-5" />
              Voice Commands
            </DialogTitle>
            <DialogDescription>
              Say "{wakeWord}" followed by a command
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 pr-4">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium mb-2">
                    {categoryLabels[category] || category}
                  </h4>
                  <div className="space-y-2">
                    {cmds.map((cmd) => (
                      <div
                        key={cmd.command}
                        className="flex items-start gap-3 p-2 rounded-lg bg-muted/50"
                      >
                        <Badge variant="outline" className="mt-0.5">
                          {cmd.command}
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm">{cmd.description}</p>
                          {cmd.aliases.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Also: {cmd.aliases.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Volume2 className="h-4 w-4" />
              <span>Wake word: "{wakeWord}"</span>
            </div>
            <Button onClick={() => setShowHelpDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </VoiceCommandContext.Provider>
  );
}

// Voice Command Status Indicator Component
interface VoiceCommandIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VoiceCommandIndicator({
  showLabel = true,
  size = 'md',
  className,
}: VoiceCommandIndicatorProps) {
  const { isListening, isSupported, toggleListening, showHelp } = useVoiceCommands();

  if (!isSupported) return null;

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant={isListening ? 'default' : 'outline'}
        size="icon"
        className={cn(
          sizeClasses[size],
          isListening && 'bg-green-500 hover:bg-green-600 animate-pulse'
        )}
        onClick={toggleListening}
      >
        {isListening ? (
          <Mic className={iconSizes[size]} />
        ) : (
          <MicOff className={cn(iconSizes[size], 'text-muted-foreground')} />
        )}
      </Button>

      {showLabel && (
        <div className="flex flex-col">
          <span className="text-xs font-medium">
            {isListening ? 'Voice Active' : 'Voice Off'}
          </span>
          <button
            onClick={showHelp}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <HelpCircle className="h-3 w-3" />
            Commands
          </button>
        </div>
      )}
    </div>
  );
}

// Hook to register voice commands for a component
export function useRegisterVoiceCommands(commands: VoiceCommand[]) {
  const { registerCommand, unregisterCommand } = useVoiceCommands();

  useEffect(() => {
    commands.forEach((cmd) => registerCommand(cmd));

    return () => {
      commands.forEach((cmd) => unregisterCommand(cmd.command));
    };
  }, [commands, registerCommand, unregisterCommand]);
}
