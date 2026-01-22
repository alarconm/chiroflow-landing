// Legacy components (kept for backwards compatibility)
export { VoiceTranscription } from './VoiceTranscription';
export { CodeSuggestions } from './CodeSuggestions';
export { ComplianceChecker } from './ComplianceChecker';
export { AIAssistantPanel } from './AIAssistantPanel';

// New AI Documentation Assistant UI (Epic 32 - US-322)
export { AIDocumentationAssistant, AIDocumentationSheet } from './AIDocumentationAssistant';
export { TranscriptionPanel } from './TranscriptionPanel';
export { SOAPGenerationPanel } from './SOAPGenerationPanel';
export { CodeSuggestionSidebar } from './CodeSuggestionSidebar';
export { ComplianceAlertsDisplay } from './ComplianceAlertsDisplay';
export {
  VoiceCommandProvider,
  VoiceCommandIndicator,
  useVoiceCommands,
  useRegisterVoiceCommands,
} from './VoiceCommandProvider';
