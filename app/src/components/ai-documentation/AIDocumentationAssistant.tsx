'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Brain,
  Mic,
  Wand2,
  FileCode,
  ShieldCheck,
  PanelRightOpen,
  PanelRightClose,
  Settings,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Child components
import { TranscriptionPanel } from './TranscriptionPanel';
import { SOAPGenerationPanel } from './SOAPGenerationPanel';
import { CodeSuggestionSidebar } from './CodeSuggestionSidebar';
import { ComplianceAlertsDisplay } from './ComplianceAlertsDisplay';
import {
  VoiceCommandProvider,
  VoiceCommandIndicator,
  useVoiceCommands,
  useRegisterVoiceCommands,
} from './VoiceCommandProvider';

interface SOAPContent {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

interface AIDocumentationAssistantProps {
  encounterId: string;
  soapContent?: SOAPContent;
  onApplySOAP?: (content: SOAPContent) => void;
  onApplySection?: (section: keyof SOAPContent, content: string) => void;
  onSelectCodes?: (icd10: string[], cpt: string[]) => void;
  onSectionFocus?: (section: string) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
  position?: 'right' | 'bottom';
}

// Inner component to use voice commands context
function AIDocumentationAssistantInner({
  encounterId,
  soapContent,
  onApplySOAP,
  onApplySection,
  onSelectCodes,
  onSectionFocus,
  disabled = false,
  defaultExpanded = true,
  position = 'right',
}: AIDocumentationAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState('transcribe');
  const [transcript, setTranscript] = useState<string>('');
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [isAmbientMode, setIsAmbientMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Voice commands integration
  const { isListening, registerCommand } = useVoiceCommands();

  // Register voice commands for AI documentation
  useRegisterVoiceCommands([
    {
      command: 'start transcription',
      aliases: ['record', 'start recording', 'begin transcription'],
      description: 'Start voice transcription',
      action: () => setActiveTab('transcribe'),
      category: 'transcription',
    },
    {
      command: 'stop transcription',
      aliases: ['stop recording', 'end transcription'],
      description: 'Stop voice transcription',
      action: () => {
        // Would trigger stop in TranscriptionPanel
        setActiveTab('transcribe');
      },
      category: 'transcription',
    },
    {
      command: 'generate soap',
      aliases: ['create soap', 'make soap note', 'generate note'],
      description: 'Generate SOAP note from transcription',
      action: () => setActiveTab('soap'),
      category: 'soap',
    },
    {
      command: 'suggest codes',
      aliases: ['get codes', 'billing codes', 'show codes'],
      description: 'Get AI code suggestions',
      action: () => setActiveTab('codes'),
      category: 'codes',
    },
    {
      command: 'check compliance',
      aliases: ['compliance check', 'audit check', 'verify compliance'],
      description: 'Run compliance check',
      action: () => setActiveTab('compliance'),
      category: 'compliance',
    },
    {
      command: 'toggle ambient',
      aliases: ['ambient mode', 'toggle ambient mode'],
      description: 'Toggle ambient listening mode',
      action: () => setIsAmbientMode((prev) => !prev),
      category: 'transcription',
    },
    {
      command: 'expand panel',
      aliases: ['show panel', 'open assistant'],
      description: 'Expand AI assistant panel',
      action: () => setIsExpanded(true),
      category: 'navigation',
    },
    {
      command: 'collapse panel',
      aliases: ['hide panel', 'close assistant', 'minimize'],
      description: 'Collapse AI assistant panel',
      action: () => setIsExpanded(false),
      category: 'navigation',
    },
  ]);

  // Handlers
  const handleTranscriptReady = useCallback((text: string) => {
    setTranscript(text);
    // Optionally auto-switch to SOAP generation
    setActiveTab('soap');
  }, []);

  const handleSOAPGeneration = useCallback((generatedTranscript: string) => {
    setTranscript(generatedTranscript);
    setActiveTab('soap');
  }, []);

  const handleAutoFix = useCallback(
    (issueId: string, fixContent: string) => {
      // The fix content would be applied to the appropriate section
      // This is handled by the parent component via onApplySection
    },
    []
  );

  // Tabs configuration
  const tabs = [
    {
      id: 'transcribe',
      label: 'Transcribe',
      icon: Mic,
      shortLabel: 'T',
    },
    {
      id: 'soap',
      label: 'SOAP',
      icon: Wand2,
      shortLabel: 'S',
    },
    {
      id: 'codes',
      label: 'Codes',
      icon: FileCode,
      shortLabel: 'C',
    },
    {
      id: 'compliance',
      label: 'Compliance',
      icon: ShieldCheck,
      shortLabel: 'V',
    },
  ];

  // Collapsed view
  if (!isExpanded) {
    return (
      <div className="flex flex-col items-center gap-2 p-2 bg-background border rounded-lg shadow-sm">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(true)}
                className="h-10 w-10"
              >
                <Brain className="h-5 w-5 text-purple-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Expand AI Assistant</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Quick action buttons */}
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TooltipProvider key={tab.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTab === tab.id ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsExpanded(true);
                    }}
                    className="h-9 w-9"
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>{tab.label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}

        {/* Voice indicator */}
        <VoiceCommandIndicator showLabel={false} size="sm" />
      </div>
    );
  }

  // Full expanded view
  return (
    <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-500" />
          <span className="font-semibold">AI Documentation Assistant</span>
          {isAmbientMode && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
              <Volume2 className="h-3 w-3 mr-1" />
              Ambient
            </Badge>
          )}
          {isListening && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 animate-pulse">
              <Mic className="h-3 w-3 mr-1" />
              Listening
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <VoiceCommandIndicator showLabel={false} size="sm" />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowSidebar(!showSidebar)}
                >
                  {showSidebar ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showSidebar ? 'Hide sidebar' : 'Show sidebar'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsExpanded(false)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          {/* Main Panel */}
          <ResizablePanel defaultSize={showSidebar ? 65 : 100} minSize={50}>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
            >
              <TabsList className="grid grid-cols-4 mx-3 mt-3">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.shortLabel}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <div className="flex-1 overflow-hidden p-3">
                <TabsContent value="transcribe" className="h-full m-0">
                  <TranscriptionPanel
                    encounterId={encounterId}
                    onTranscriptReady={handleTranscriptReady}
                    onRequestSOAPGeneration={handleSOAPGeneration}
                    disabled={disabled}
                  />
                </TabsContent>

                <TabsContent value="soap" className="h-full m-0">
                  <SOAPGenerationPanel
                    encounterId={encounterId}
                    transcript={transcript}
                    onApplySOAP={onApplySOAP}
                    onApplySection={onApplySection}
                    disabled={disabled}
                  />
                </TabsContent>

                <TabsContent value="codes" className="h-full m-0">
                  <CodeSuggestionSidebar
                    encounterId={encounterId}
                    draftNoteId={selectedDraftId || undefined}
                    onSelectCodes={onSelectCodes}
                    disabled={disabled}
                  />
                </TabsContent>

                <TabsContent value="compliance" className="h-full m-0">
                  <ComplianceAlertsDisplay
                    encounterId={encounterId}
                    draftNoteId={selectedDraftId || undefined}
                    onSectionFocus={onSectionFocus}
                    onAutoFix={handleAutoFix}
                    disabled={disabled}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </ResizablePanel>

          {/* Sidebar */}
          {showSidebar && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={25} maxSize={45}>
                <div className="h-full p-3 overflow-auto">
                  {activeTab === 'transcribe' || activeTab === 'soap' ? (
                    <CodeSuggestionSidebar
                      encounterId={encounterId}
                      draftNoteId={selectedDraftId || undefined}
                      onSelectCodes={onSelectCodes}
                      disabled={disabled}
                      compact
                    />
                  ) : (
                    <ComplianceAlertsDisplay
                      encounterId={encounterId}
                      draftNoteId={selectedDraftId || undefined}
                      onSectionFocus={onSectionFocus}
                      onAutoFix={handleAutoFix}
                      disabled={disabled}
                      compact
                    />
                  )}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Quick Actions Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="ambient-footer"
              checked={isAmbientMode}
              onCheckedChange={setIsAmbientMode}
              disabled={disabled}
            />
            <Label htmlFor="ambient-footer" className="text-xs cursor-pointer">
              Ambient Mode
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('soap')}
            disabled={disabled || !transcript}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Quick Generate
          </Button>
        </div>
      </div>
    </div>
  );
}

// Main export with VoiceCommandProvider wrapper
export function AIDocumentationAssistant(props: AIDocumentationAssistantProps) {
  return (
    <VoiceCommandProvider wakeWord="hey chiroflow">
      <AIDocumentationAssistantInner {...props} />
    </VoiceCommandProvider>
  );
}

// Sheet version for mobile/overlay use
interface AIDocumentationSheetProps extends AIDocumentationAssistantProps {
  trigger?: React.ReactNode;
}

export function AIDocumentationSheet({
  trigger,
  ...props
}: AIDocumentationSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon">
            <Brain className="h-5 w-5 text-purple-500" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <AIDocumentationAssistant {...props} defaultExpanded />
      </SheetContent>
    </Sheet>
  );
}
