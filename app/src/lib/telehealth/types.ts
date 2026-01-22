/**
 * Telehealth Types
 * Epic 21: Telehealth & Virtual Care
 *
 * Type definitions for video provider integration
 */

import { TelehealthProvider, TelehealthSessionStatus } from '@prisma/client';

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Base configuration for all video providers
 */
export interface VideoProviderConfig {
  /** API key or account SID */
  apiKey: string;
  /** API secret or auth token */
  apiSecret: string;
  /** Optional webhook URL for events */
  webhookUrl?: string;
  /** Optional webhook secret for verification */
  webhookSecret?: string;
  /** Environment (development, production) */
  environment?: 'development' | 'production';
}

/**
 * Twilio-specific configuration
 */
export interface TwilioConfig extends VideoProviderConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  /** Optional status callback URL */
  statusCallbackUrl?: string;
}

/**
 * Zoom-specific configuration
 */
export interface ZoomConfig extends VideoProviderConfig {
  clientId: string;
  clientSecret: string;
  /** SDK key for web client */
  sdkKey?: string;
  /** SDK secret for web client */
  sdkSecret?: string;
  /** Zoom webhook verification token */
  verificationToken?: string;
}

/**
 * Google Meet-specific configuration
 */
export interface GoogleMeetConfig extends VideoProviderConfig {
  /** Service account credentials JSON */
  serviceAccountKey: string;
  /** Delegated user email for domain-wide delegation */
  delegatedUserEmail?: string;
}

// ============================================
// ROOM TYPES
// ============================================

/**
 * Request to create a video room
 */
export interface CreateRoomRequest {
  /** Unique identifier for the room (e.g., appointment ID) */
  roomName: string;
  /** Display name for the room */
  displayName?: string;
  /** Scheduled start time */
  scheduledStartTime: Date;
  /** Scheduled end time */
  scheduledEndTime: Date;
  /** Maximum participants allowed */
  maxParticipants?: number;
  /** Enable recording */
  recordingEnabled?: boolean;
  /** Enable waiting room */
  waitingRoomEnabled?: boolean;
  /** Passcode for the room */
  passcode?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
}

/**
 * Result of creating a video room
 */
export interface CreateRoomResult {
  success: boolean;
  /** Provider-specific room ID */
  roomId?: string;
  /** Room name/unique identifier */
  roomName?: string;
  /** URL for the host to join */
  hostUrl?: string;
  /** URL for participants to join */
  participantUrl?: string;
  /** Passcode if required */
  passcode?: string;
  /** Room creation timestamp */
  createdAt?: Date;
  /** Room expiration timestamp */
  expiresAt?: Date;
  /** Error message if failed */
  errorMessage?: string;
  /** Error code if failed */
  errorCode?: string;
}

/**
 * Room status information
 */
export interface RoomStatus {
  roomId: string;
  roomName: string;
  status: 'active' | 'completed' | 'expired' | 'not_found';
  participantCount: number;
  duration?: number;
  startedAt?: Date;
  endedAt?: Date;
}

// ============================================
// TOKEN TYPES
// ============================================

/**
 * Request to generate an access token for a room
 */
export interface GenerateTokenRequest {
  /** Room identifier */
  roomName: string;
  /** Participant identity (user ID) */
  identity: string;
  /** Participant display name */
  displayName: string;
  /** Is this participant a host/provider */
  isHost?: boolean;
  /** Token expiration in seconds */
  expirationSeconds?: number;
  /** Additional grants/permissions */
  grants?: {
    canPublish?: boolean;
    canSubscribe?: boolean;
    canShareScreen?: boolean;
    canRecord?: boolean;
  };
}

/**
 * Result of generating an access token
 */
export interface GenerateTokenResult {
  success: boolean;
  /** Access token for the video service */
  token?: string;
  /** Token expiration timestamp */
  expiresAt?: Date;
  /** Join URL with embedded token (if supported) */
  joinUrl?: string;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================
// PARTICIPANT TYPES
// ============================================

/**
 * Participant information
 */
export interface Participant {
  identity: string;
  displayName: string;
  isHost: boolean;
  joinedAt: Date;
  leftAt?: Date;
  audioEnabled: boolean;
  videoEnabled: boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Request to manage a participant
 */
export interface ParticipantAction {
  roomName: string;
  participantIdentity: string;
  action: 'mute' | 'unmute' | 'disconnect' | 'spotlight';
}

// ============================================
// RECORDING TYPES
// ============================================

/**
 * Request to start recording
 */
export interface StartRecordingRequest {
  roomName: string;
  /** Recording layout (speaker view, gallery, etc.) */
  layout?: 'speaker' | 'gallery' | 'grid';
  /** Video resolution */
  resolution?: '720p' | '1080p';
  /** Audio only recording */
  audioOnly?: boolean;
}

/**
 * Recording result
 */
export interface RecordingResult {
  success: boolean;
  /** Recording ID */
  recordingId?: string;
  /** Recording status */
  status?: 'recording' | 'processing' | 'completed' | 'failed';
  /** Recording URL (when completed) */
  url?: string;
  /** Duration in seconds */
  duration?: number;
  /** File size in bytes */
  fileSize?: number;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================
// WEBHOOK TYPES
// ============================================

/**
 * Webhook event from video provider
 */
export interface VideoWebhookEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** Room identifier */
  roomName?: string;
  /** Participant identity */
  participantIdentity?: string;
  /** Recording ID (for recording events) */
  recordingId?: string;
  /** Raw event data */
  data: Record<string, unknown>;
}

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  event?: VideoWebhookEvent;
  errorMessage?: string;
}

// ============================================
// QUALITY METRICS
// ============================================

/**
 * Connection quality metrics
 */
export interface QualityMetrics {
  roomName: string;
  participantIdentity: string;
  /** Timestamp of metrics */
  timestamp: Date;
  /** Round-trip time in ms */
  rtt?: number;
  /** Jitter in ms */
  jitter?: number;
  /** Packet loss percentage */
  packetLoss?: number;
  /** Bitrate in kbps */
  bitrate?: number;
  /** Overall quality score (0-100) */
  qualityScore?: number;
}

// ============================================
// PROVIDER CAPABILITY FLAGS
// ============================================

/**
 * Capabilities supported by a video provider
 */
export interface ProviderCapabilities {
  /** Supports waiting room */
  waitingRoom: boolean;
  /** Supports recording */
  recording: boolean;
  /** Supports screen sharing */
  screenShare: boolean;
  /** Supports chat */
  chat: boolean;
  /** Supports background blur/virtual backgrounds */
  virtualBackground: boolean;
  /** Supports breakout rooms */
  breakoutRooms: boolean;
  /** Maximum participants */
  maxParticipants: number;
  /** Supports HIPAA compliance */
  hipaaCompliant: boolean;
  /** Supports end-to-end encryption */
  e2eEncryption: boolean;
}

// ============================================
// PROVIDER STATUS
// ============================================

/**
 * Provider health status
 */
export interface ProviderStatus {
  provider: TelehealthProvider;
  /** Is provider available */
  available: boolean;
  /** Status message */
  message?: string;
  /** Last checked timestamp */
  lastChecked: Date;
  /** Latency in ms */
  latency?: number;
}

// ============================================
// TELEHEALTH DOCUMENTATION TYPES (US-220)
// ============================================

/**
 * Place of Service (POS) codes for telehealth billing
 * Per CMS guidelines
 */
export const TELEHEALTH_PLACE_OF_SERVICE = {
  /** Telehealth provided in patient's home */
  HOME: '10',
  /** Telehealth provided other than in patient's home */
  NON_HOME: '02',
  /** Office (for originating site) */
  OFFICE: '11',
  /** Patient's home (as originating site) */
  PATIENT_HOME: '12',
} as const;

export type TelehealthPlaceOfService =
  typeof TELEHEALTH_PLACE_OF_SERVICE[keyof typeof TELEHEALTH_PLACE_OF_SERVICE];

/**
 * Telehealth billing modifiers
 * Per CMS and commercial payer guidelines
 */
export const TELEHEALTH_MODIFIERS = {
  /** Synchronous telemedicine service rendered via real-time interactive audio and video */
  MODIFIER_95: '95',
  /** Via interactive audio and video telecommunication systems */
  MODIFIER_GT: 'GT',
  /** Telehealth services for diagnosis, evaluation, or treatment, of a mental health disorder */
  MODIFIER_FQ: 'FQ',
  /** Service furnished using audio-only communication technology */
  MODIFIER_93: '93',
  /** Originating site: Hospital or critical access hospital */
  MODIFIER_GQ: 'GQ',
} as const;

export type TelehealthModifier =
  typeof TELEHEALTH_MODIFIERS[keyof typeof TELEHEALTH_MODIFIERS];

/**
 * Technology type used for telehealth visit
 */
export type TelehealthTechnologyType =
  | 'audio_video'
  | 'audio_only'
  | 'store_and_forward'
  | 'remote_monitoring';

/**
 * Telehealth-specific SOAP note content
 */
export interface TelehealthSOAPContent {
  // Standard SOAP sections
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;

  // Telehealth-specific fields
  telehealthDetails: {
    /** Technology used (audio/video, audio-only, etc.) */
    technologyUsed: TelehealthTechnologyType;
    /** Any technical issues encountered */
    technicalIssues?: string;
    /** Quality of connection */
    connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
    /** Whether patient could be adequately assessed via telehealth */
    adequateAssessment: boolean;
    /** If not adequate, reason why */
    inadequateAssessmentReason?: string;
    /** Follow-up recommendations (in-person vs continued telehealth) */
    followUpRecommendation: 'telehealth' | 'in_person' | 'either';
  };
}

/**
 * Patient location for telehealth (required for billing)
 */
export interface TelehealthPatientLocation {
  /** City where patient is located */
  city: string;
  /** State where patient is located */
  state: string;
  /** Is the patient at their home? */
  isPatientHome: boolean;
  /** Type of location (home, office, etc.) */
  locationType?: string;
}

/**
 * Provider location for telehealth
 */
export interface TelehealthProviderLocation {
  /** City where provider is located */
  city: string;
  /** State where provider is located */
  state: string;
  /** Facility name if applicable */
  facilityName?: string;
}

/**
 * Telehealth documentation for an encounter
 */
export interface TelehealthDocumentation {
  /** Telehealth session ID */
  sessionId: string;
  /** Encounter ID */
  encounterId: string;

  /** Patient location */
  patientLocation: TelehealthPatientLocation;
  /** Provider location */
  providerLocation: TelehealthProviderLocation;

  /** Technology used */
  technologyUsed: TelehealthTechnologyType;
  /** Any technical issues */
  technicalIssues?: string;

  /** Consent verified before session? */
  consentVerified: boolean;
  /** Consent ID if applicable */
  consentId?: string;

  /** Place of service code */
  placeOfServiceCode: TelehealthPlaceOfService;
  /** Telehealth modifier for billing */
  telehealthModifier: TelehealthModifier;

  /** Additional billing modifiers */
  additionalModifiers?: string[];

  /** Documentation timestamp */
  documentedAt: Date;
  /** Documented by user ID */
  documentedBy: string;
}

/**
 * Telehealth SOAP note template structure
 */
export interface TelehealthSOAPTemplate {
  name: string;
  description: string;
  category: 'TELEHEALTH';

  subjectiveTemplate: {
    defaultText: string;
    sections: Array<{
      id: string;
      label: string;
      type: 'text' | 'textarea' | 'checkbox' | 'select';
      placeholder?: string;
      defaultValue?: string | boolean;
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
    }>;
    prompts: string[];
  };

  objectiveTemplate: {
    defaultText: string;
    sections: Array<{
      id: string;
      label: string;
      type: 'text' | 'textarea' | 'checkbox' | 'select';
      placeholder?: string;
      defaultValue?: string | boolean;
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
    }>;
    prompts: string[];
  };

  assessmentTemplate: {
    defaultText: string;
    prompts: string[];
  };

  planTemplate: {
    defaultText: string;
    sections: Array<{
      id: string;
      label: string;
      type: 'text' | 'textarea' | 'checkbox' | 'select';
      placeholder?: string;
      defaultValue?: string | boolean;
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
    }>;
    prompts: string[];
  };

  /** Telehealth-specific template sections */
  telehealthSections: {
    technology: {
      label: string;
      options: Array<{ value: TelehealthTechnologyType; label: string }>;
    };
    connectionQuality: {
      label: string;
      options: Array<{ value: string; label: string }>;
    };
    patientLocation: {
      required: boolean;
      fields: Array<{
        id: string;
        label: string;
        type: 'text' | 'select';
        required?: boolean;
      }>;
    };
    providerLocation: {
      required: boolean;
      fields: Array<{
        id: string;
        label: string;
        type: 'text' | 'select';
        required?: boolean;
      }>;
    };
    consentVerification: {
      required: boolean;
      label: string;
    };
  };

  /** Billing defaults for telehealth */
  billingDefaults: {
    placeOfServiceCode: TelehealthPlaceOfService;
    defaultModifier: TelehealthModifier;
  };
}

/**
 * Default telehealth SOAP note template
 */
export const DEFAULT_TELEHEALTH_SOAP_TEMPLATE: TelehealthSOAPTemplate = {
  name: 'Telehealth Visit',
  description: 'Standard template for telehealth/virtual care visits',
  category: 'TELEHEALTH',

  subjectiveTemplate: {
    defaultText: `Chief Complaint: {{patient.firstName}} presents via telehealth for {{chiefComplaint}}.

History of Present Illness:
- Onset:
- Location:
- Duration:
- Character:
- Aggravating factors:
- Relieving factors:
- Associated symptoms:
- Prior treatments tried:

Review of Systems (Limited via telehealth):
Patient reports: `,
    sections: [
      {
        id: 'painLevel',
        label: 'Current Pain Level (0-10)',
        type: 'select',
        options: Array.from({ length: 11 }, (_, i) => ({
          value: String(i),
          label: String(i),
        })),
        required: true,
      },
      {
        id: 'changesFromLastVisit',
        label: 'Changes Since Last Visit',
        type: 'textarea',
        placeholder: 'Describe any changes in condition since last visit...',
      },
    ],
    prompts: [
      'Patient reports improvement with home exercises',
      'Pain is well-controlled',
      'Symptoms have worsened since last visit',
      'New symptoms reported',
      'Compliance with treatment plan is good',
    ],
  },

  objectiveTemplate: {
    defaultText: `Telehealth Examination:
Visit conducted via: Real-time audio and video telecommunication

Visual Observation:
- General appearance: Patient appears {{generalAppearance}} via video
- Posture observed:
- Gait (if demonstrated):
- Range of motion (patient-demonstrated):

Limitations of telehealth examination noted: Physical palpation not possible via telehealth. Assessment based on patient demonstration and verbal description.

Technology Quality:
- Connection: {{connectionQuality}}
- Video quality: Adequate for visual assessment
- Audio quality: Clear communication established`,
    sections: [
      {
        id: 'generalAppearance',
        label: 'General Appearance',
        type: 'select',
        options: [
          { value: 'well_comfortable', label: 'Well and comfortable' },
          { value: 'mild_discomfort', label: 'In mild discomfort' },
          { value: 'moderate_discomfort', label: 'In moderate discomfort' },
          { value: 'significant_distress', label: 'In significant distress' },
        ],
        required: true,
      },
      {
        id: 'patientDemonstratedROM',
        label: 'Patient-Demonstrated Range of Motion',
        type: 'textarea',
        placeholder: 'Document ROM as demonstrated by patient...',
      },
      {
        id: 'visualObservations',
        label: 'Additional Visual Observations',
        type: 'textarea',
        placeholder: 'Document any relevant visual observations...',
      },
    ],
    prompts: [
      'Patient demonstrates full active ROM',
      'Limited ROM observed on video',
      'Antalgic posture noted',
      'Normal gait observed',
      'Guarded movements observed',
    ],
  },

  assessmentTemplate: {
    defaultText: `Assessment:
1. {{primaryDiagnosis}}
   - Status:
   - Response to treatment:

Appropriateness of Telehealth:
- Able to adequately assess patient condition via telehealth: {{adequateAssessment}}
- Telehealth limitations acknowledged and documented

Clinical Decision Making:
- Complexity: {{complexityLevel}}
- Data reviewed: History, patient-reported symptoms, visual observation via video`,
    prompts: [
      'Condition appropriate for continued telehealth management',
      'In-person evaluation recommended for next visit',
      'Patient is progressing as expected',
      'Modification to treatment plan indicated',
      'Refer for imaging/specialist evaluation',
    ],
  },

  planTemplate: {
    defaultText: `Plan:
1. Treatment Recommendations:
   -

2. Patient Education Provided:
   - Home exercises reviewed via telehealth
   - Activity modifications discussed

3. Follow-up:
   - {{followUpRecommendation}}
   - Next appointment: {{nextAppointment}}

4. Additional Notes:
   - Patient verbally consented to telehealth visit
   - Telehealth consent on file verified: {{consentVerified}}
   - Patient location documented for billing compliance`,
    sections: [
      {
        id: 'followUpType',
        label: 'Follow-up Visit Type',
        type: 'select',
        options: [
          { value: 'telehealth', label: 'Continue with telehealth' },
          { value: 'in_person', label: 'In-person visit recommended' },
          { value: 'either', label: 'Either modality appropriate' },
        ],
        required: true,
      },
      {
        id: 'homeExercises',
        label: 'Home Exercises Prescribed',
        type: 'textarea',
        placeholder: 'List exercises discussed/demonstrated...',
      },
    ],
    prompts: [
      'Continue current treatment plan',
      'Return for in-person evaluation in 2 weeks',
      'Return via telehealth in 1 week',
      'Home exercise program reinforced',
      'Call office if symptoms worsen',
    ],
  },

  telehealthSections: {
    technology: {
      label: 'Technology Used',
      options: [
        { value: 'audio_video', label: 'Real-time Audio & Video' },
        { value: 'audio_only', label: 'Audio Only' },
        { value: 'store_and_forward', label: 'Store and Forward' },
        { value: 'remote_monitoring', label: 'Remote Patient Monitoring' },
      ],
    },
    connectionQuality: {
      label: 'Connection Quality',
      options: [
        { value: 'excellent', label: 'Excellent - No issues' },
        { value: 'good', label: 'Good - Minor issues' },
        { value: 'fair', label: 'Fair - Some disruption' },
        { value: 'poor', label: 'Poor - Significant issues' },
      ],
    },
    patientLocation: {
      required: true,
      fields: [
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'select', required: true },
        { id: 'isHome', label: 'Patient at Home?', type: 'select', required: true },
      ],
    },
    providerLocation: {
      required: true,
      fields: [
        { id: 'city', label: 'City', type: 'text', required: true },
        { id: 'state', label: 'State', type: 'select', required: true },
      ],
    },
    consentVerification: {
      required: true,
      label: 'Telehealth consent verified and on file',
    },
  },

  billingDefaults: {
    placeOfServiceCode: '10', // Patient's home (most common for telehealth)
    defaultModifier: '95', // Synchronous telemedicine via audio/video
  },
};

// ============================================
// REMOTE MONITORING TYPES (US-222)
// ============================================

/**
 * Types of remote monitoring submissions
 */
export type RemoteSubmissionType =
  | 'PHOTO'
  | 'VIDEO'
  | 'PAIN_DIARY'
  | 'EXERCISE'
  | 'ACTIVITY'
  | 'QUESTIONNAIRE';

/**
 * Status of remote submissions
 */
export type RemoteSubmissionStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'FLAGGED'
  | 'ARCHIVED';

/**
 * Alert types for remote monitoring
 */
export type RemoteAlertType =
  | 'new_submission'
  | 'high_pain'
  | 'missed_exercise'
  | 'follow_up_needed'
  | 'activity_change';

/**
 * Alert priority levels
 */
export type RemoteAlertPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Pain diary entry data
 */
export interface PainDiaryEntry {
  painLevel: number;       // 0-10 scale
  painLocation: string;    // Body area
  painNotes?: string;      // Additional notes
  triggers?: string[];     // What caused/worsened the pain
  relievers?: string[];    // What helped the pain
  timestamp: Date;
}

/**
 * Exercise completion data
 */
export interface ExerciseSubmission {
  exerciseId?: string;
  exerciseName: string;
  duration?: number;       // Seconds
  reps?: number;
  sets?: number;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'too_hard';
  feedback?: string;
  videoUrl?: string;       // If patient recorded themselves
}

/**
 * Activity tracking data
 */
export interface ActivityData {
  activityType: string;    // steps, walking, etc.
  value: number;
  unit: string;            // steps, miles, minutes
  source?: string;         // Device/app name
  startTime?: Date;
  endTime?: Date;
}

/**
 * Remote monitoring submission request
 */
export interface CreateRemoteSubmissionRequest {
  patientId: string;
  submissionType: RemoteSubmissionType;
  title?: string;
  description?: string;

  // For media submissions
  mediaFile?: {
    content: string;       // Base64 encoded
    mimeType: string;
    fileName: string;
  };

  // For pain diary
  painDiary?: PainDiaryEntry;

  // For exercise submissions
  exercise?: ExerciseSubmission;

  // For activity tracking
  activity?: ActivityData;

  // For questionnaires
  questionnaireResponses?: Record<string, unknown>;

  // Optional links
  telehealthSessionId?: string;
  encounterId?: string;
}

/**
 * Remote monitoring submission with full details
 */
export interface RemoteSubmissionDetails {
  id: string;
  patientId: string;
  patientName?: string;
  submissionType: RemoteSubmissionType;
  status: RemoteSubmissionStatus;

  title?: string;
  description?: string;

  // Media
  mediaUrl?: string;
  mediaMimeType?: string;
  thumbnailUrl?: string;

  // Pain diary
  painLevel?: number;
  painLocation?: string;
  painNotes?: string;

  // Exercise
  exerciseName?: string;
  exerciseDuration?: number;
  exerciseReps?: number;
  exerciseSets?: number;
  exerciseFeedback?: string;

  // Activity
  activityType?: string;
  activityValue?: number;
  activityUnit?: string;
  activitySource?: string;

  // Questionnaire
  questionnaireResponses?: Record<string, unknown>;

  // Review info
  reviewedAt?: Date;
  reviewedById?: string;
  reviewerName?: string;
  reviewNotes?: string;
  followUpRequired: boolean;
  followUpNotes?: string;

  // Timestamps
  submittedAt: Date;
  createdAt: Date;

  // Attachments
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
    thumbnailUrl?: string;
  }>;
}

/**
 * Provider alert for remote monitoring
 */
export interface RemoteMonitoringAlertDetails {
  id: string;
  alertType: RemoteAlertType;
  priority: RemoteAlertPriority;
  message: string;

  patientId: string;
  patientName?: string;

  submissionId?: string;
  submissionType?: RemoteSubmissionType;

  isRead: boolean;
  readAt?: Date;
  isDismissed: boolean;
  dismissedAt?: Date;

  createdAt: Date;
}

/**
 * Asynchronous review workflow request
 */
export interface ReviewSubmissionRequest {
  submissionId: string;
  reviewNotes?: string;
  followUpRequired: boolean;
  followUpNotes?: string;
  attachToEncounter?: boolean;
  newEncounterId?: string;
}

/**
 * Pre-defined pain locations for body diagram
 */
export const PAIN_LOCATIONS = [
  'Neck (Cervical)',
  'Upper Back (Thoracic)',
  'Lower Back (Lumbar)',
  'Sacrum/Tailbone',
  'Left Shoulder',
  'Right Shoulder',
  'Left Arm',
  'Right Arm',
  'Left Hand/Wrist',
  'Right Hand/Wrist',
  'Left Hip',
  'Right Hip',
  'Left Leg',
  'Right Leg',
  'Left Knee',
  'Right Knee',
  'Left Foot/Ankle',
  'Right Foot/Ankle',
  'Headache',
  'Other',
] as const;

export type PainLocation = typeof PAIN_LOCATIONS[number];

/**
 * Pre-defined exercise categories
 */
export const EXERCISE_CATEGORIES = [
  'Stretching',
  'Strengthening',
  'Range of Motion',
  'Balance',
  'Core Stability',
  'Posture Correction',
  'Other',
] as const;

export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number];
