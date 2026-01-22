import { PrismaClient, Role, FormFieldType, EncounterType, AssessmentType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ============================================
// CHIROPRACTIC FORM TEMPLATES
// ============================================

interface SeedField {
  fieldType: FormFieldType;
  label: string;
  name: string;
  placeholder?: string;
  helpText?: string;
  isRequired?: boolean;
  options?: Array<{ value: string; label: string }>;
  mapsToPatient?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

interface SeedSection {
  title: string;
  description?: string;
  fields: SeedField[];
}

interface SeedTemplate {
  name: string;
  description: string;
  sections: SeedSection[];
}

const CHIROPRACTIC_TEMPLATES: SeedTemplate[] = [
  // 1. PATIENT DEMOGRAPHICS FORM
  {
    name: 'Patient Demographics',
    description: 'Collect patient contact and demographic information. Fields auto-populate patient record.',
    sections: [
      {
        title: 'Personal Information',
        description: 'Basic patient identification',
        fields: [
          { fieldType: 'TEXT', label: 'First Name', name: 'firstName', isRequired: true, mapsToPatient: 'demographics.firstName', maxLength: 100 },
          { fieldType: 'TEXT', label: 'Middle Name', name: 'middleName', mapsToPatient: 'demographics.middleName', maxLength: 100 },
          { fieldType: 'TEXT', label: 'Last Name', name: 'lastName', isRequired: true, mapsToPatient: 'demographics.lastName', maxLength: 100 },
          { fieldType: 'TEXT', label: 'Preferred Name', name: 'preferredName', mapsToPatient: 'demographics.preferredName', placeholder: 'Name you prefer to be called', maxLength: 100 },
          { fieldType: 'DATE', label: 'Date of Birth', name: 'dateOfBirth', isRequired: true, mapsToPatient: 'demographics.dateOfBirth' },
          { fieldType: 'SELECT', label: 'Gender', name: 'gender', isRequired: true, mapsToPatient: 'demographics.gender', options: [
            { value: 'MALE', label: 'Male' },
            { value: 'FEMALE', label: 'Female' },
            { value: 'OTHER', label: 'Other' },
            { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
          ]},
          { fieldType: 'SSN', label: 'Social Security Number', name: 'ssn', helpText: 'Required for insurance billing', mapsToPatient: 'demographics.ssn' },
        ],
      },
      {
        title: 'Contact Information',
        fields: [
          { fieldType: 'EMAIL', label: 'Email Address', name: 'email', isRequired: true, mapsToPatient: 'contact.email' },
          { fieldType: 'PHONE', label: 'Primary Phone', name: 'phone', isRequired: true, mapsToPatient: 'contact.phone' },
          { fieldType: 'SELECT', label: 'Phone Type', name: 'phoneType', options: [
            { value: 'MOBILE', label: 'Mobile' },
            { value: 'HOME', label: 'Home' },
            { value: 'WORK', label: 'Work' },
          ]},
          { fieldType: 'PHONE', label: 'Alternate Phone', name: 'altPhone' },
          { fieldType: 'CHECKBOX', label: 'OK to leave voicemail', name: 'okVoicemail' },
          { fieldType: 'CHECKBOX', label: 'OK to send text messages', name: 'okText' },
        ],
      },
      {
        title: 'Address',
        fields: [
          { fieldType: 'TEXT', label: 'Street Address', name: 'street1', isRequired: true, mapsToPatient: 'address.street1', maxLength: 200 },
          { fieldType: 'TEXT', label: 'Apt/Suite/Unit', name: 'street2', mapsToPatient: 'address.street2', maxLength: 100 },
          { fieldType: 'TEXT', label: 'City', name: 'city', isRequired: true, mapsToPatient: 'address.city', maxLength: 100 },
          { fieldType: 'TEXT', label: 'State', name: 'state', isRequired: true, mapsToPatient: 'address.state', maxLength: 50 },
          { fieldType: 'TEXT', label: 'ZIP Code', name: 'zip', isRequired: true, mapsToPatient: 'address.postalCode', pattern: '^\\d{5}(-\\d{4})?$', patternMessage: 'Enter a valid ZIP code (e.g., 12345 or 12345-6789)' },
        ],
      },
      {
        title: 'Emergency Contact',
        fields: [
          { fieldType: 'TEXT', label: 'Emergency Contact Name', name: 'emergencyName', isRequired: true, mapsToPatient: 'emergency.name', maxLength: 200 },
          { fieldType: 'TEXT', label: 'Relationship', name: 'emergencyRelationship', isRequired: true, mapsToPatient: 'emergency.relationship', maxLength: 50 },
          { fieldType: 'PHONE', label: 'Emergency Contact Phone', name: 'emergencyPhone', isRequired: true, mapsToPatient: 'emergency.phone' },
        ],
      },
    ],
  },

  // 2. NEW PATIENT HEALTH HISTORY
  {
    name: 'New Patient Health History',
    description: 'Comprehensive health history intake for new patients.',
    sections: [
      {
        title: 'Current Complaint',
        description: 'Tell us about your main reason for visiting today',
        fields: [
          { fieldType: 'TEXTAREA', label: 'What brings you in today?', name: 'chiefComplaint', isRequired: true, maxLength: 2000, placeholder: 'Please describe your main concern or reason for this visit' },
          { fieldType: 'DATE', label: 'When did this problem start?', name: 'symptomOnset', isRequired: true },
          { fieldType: 'SELECT', label: 'How did this problem start?', name: 'symptomCause', isRequired: true, options: [
            { value: 'GRADUAL', label: 'Gradually over time' },
            { value: 'SUDDEN', label: 'Suddenly' },
            { value: 'INJURY', label: 'Injury/Accident' },
            { value: 'UNKNOWN', label: 'Unknown/Not sure' },
          ]},
          { fieldType: 'TEXTAREA', label: 'Describe how the injury occurred (if applicable)', name: 'injuryDescription', maxLength: 1000 },
          { fieldType: 'SELECT', label: 'Rate your pain level (0-10)', name: 'painLevel', isRequired: true, options: [
            { value: '0', label: '0 - No pain' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5 - Moderate' },
            { value: '6', label: '6' },
            { value: '7', label: '7' },
            { value: '8', label: '8' },
            { value: '9', label: '9' },
            { value: '10', label: '10 - Worst possible' },
          ]},
          { fieldType: 'CHECKBOX_GROUP', label: 'What makes it worse?', name: 'aggravatingFactors', options: [
            { value: 'sitting', label: 'Sitting' },
            { value: 'standing', label: 'Standing' },
            { value: 'walking', label: 'Walking' },
            { value: 'lying', label: 'Lying down' },
            { value: 'bending', label: 'Bending' },
            { value: 'lifting', label: 'Lifting' },
            { value: 'twisting', label: 'Twisting' },
            { value: 'driving', label: 'Driving' },
          ]},
          { fieldType: 'CHECKBOX_GROUP', label: 'What makes it better?', name: 'relievingFactors', options: [
            { value: 'rest', label: 'Rest' },
            { value: 'ice', label: 'Ice' },
            { value: 'heat', label: 'Heat' },
            { value: 'medication', label: 'Medication' },
            { value: 'stretching', label: 'Stretching' },
            { value: 'nothing', label: 'Nothing helps' },
          ]},
        ],
      },
      {
        title: 'Past Medical History',
        fields: [
          { fieldType: 'CHECKBOX_GROUP', label: 'Have you ever been diagnosed with any of the following?', name: 'pastConditions', options: [
            { value: 'diabetes', label: 'Diabetes' },
            { value: 'heart_disease', label: 'Heart Disease' },
            { value: 'high_blood_pressure', label: 'High Blood Pressure' },
            { value: 'cancer', label: 'Cancer' },
            { value: 'arthritis', label: 'Arthritis' },
            { value: 'osteoporosis', label: 'Osteoporosis' },
            { value: 'fibromyalgia', label: 'Fibromyalgia' },
            { value: 'thyroid', label: 'Thyroid Disorder' },
            { value: 'stroke', label: 'Stroke' },
            { value: 'epilepsy', label: 'Epilepsy/Seizures' },
          ]},
          { fieldType: 'TEXTAREA', label: 'List any surgeries you have had', name: 'surgeries', maxLength: 1000, placeholder: 'Include type of surgery and year' },
          { fieldType: 'TEXTAREA', label: 'List any current medications', name: 'medications', maxLength: 1000, placeholder: 'Include name and dosage' },
          { fieldType: 'TEXTAREA', label: 'List any allergies', name: 'allergies', maxLength: 500, placeholder: 'Include medication and food allergies' },
          { fieldType: 'RADIO', label: 'Have you received chiropractic care before?', name: 'priorChiropractic', isRequired: true, options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]},
          { fieldType: 'TEXTAREA', label: 'If yes, describe your experience', name: 'priorChiropracticDetails', maxLength: 500 },
        ],
      },
      {
        title: 'Family History',
        fields: [
          { fieldType: 'CHECKBOX_GROUP', label: 'Do any family members have the following conditions?', name: 'familyHistory', options: [
            { value: 'heart_disease', label: 'Heart Disease' },
            { value: 'diabetes', label: 'Diabetes' },
            { value: 'cancer', label: 'Cancer' },
            { value: 'arthritis', label: 'Arthritis' },
            { value: 'osteoporosis', label: 'Osteoporosis' },
            { value: 'spine_problems', label: 'Spine/Back Problems' },
          ]},
        ],
      },
      {
        title: 'Lifestyle',
        fields: [
          { fieldType: 'SELECT', label: 'How would you describe your occupation?', name: 'occupationType', options: [
            { value: 'sedentary', label: 'Mostly sitting (desk work)' },
            { value: 'light', label: 'Light activity (standing, walking)' },
            { value: 'moderate', label: 'Moderate activity' },
            { value: 'heavy', label: 'Heavy physical labor' },
            { value: 'retired', label: 'Retired' },
            { value: 'student', label: 'Student' },
          ]},
          { fieldType: 'TEXT', label: 'Occupation/Job Title', name: 'occupation', maxLength: 100 },
          { fieldType: 'SELECT', label: 'How often do you exercise?', name: 'exerciseFrequency', options: [
            { value: 'never', label: 'Never' },
            { value: 'rarely', label: 'Rarely (1-2x/month)' },
            { value: 'sometimes', label: 'Sometimes (1-2x/week)' },
            { value: 'regular', label: 'Regularly (3-4x/week)' },
            { value: 'daily', label: 'Daily' },
          ]},
          { fieldType: 'RADIO', label: 'Do you smoke or use tobacco?', name: 'tobacco', options: [
            { value: 'never', label: 'Never' },
            { value: 'former', label: 'Former smoker' },
            { value: 'current', label: 'Current smoker' },
          ]},
          { fieldType: 'SELECT', label: 'How many hours of sleep do you typically get?', name: 'sleepHours', options: [
            { value: 'less_4', label: 'Less than 4 hours' },
            { value: '4_6', label: '4-6 hours' },
            { value: '6_8', label: '6-8 hours' },
            { value: 'more_8', label: 'More than 8 hours' },
          ]},
          { fieldType: 'SELECT', label: 'How would you rate your stress level?', name: 'stressLevel', options: [
            { value: 'low', label: 'Low' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'high', label: 'High' },
            { value: 'very_high', label: 'Very High' },
          ]},
        ],
      },
    ],
  },

  // 3. PAIN ASSESSMENT FORM
  {
    name: 'Pain Assessment',
    description: 'Detailed pain evaluation with location and symptom tracking.',
    sections: [
      {
        title: 'Pain Location',
        description: 'Mark all areas where you experience pain',
        fields: [
          { fieldType: 'CHECKBOX_GROUP', label: 'Where do you feel pain? (Check all that apply)', name: 'painLocations', isRequired: true, options: [
            { value: 'head', label: 'Head' },
            { value: 'neck', label: 'Neck' },
            { value: 'upper_back', label: 'Upper Back' },
            { value: 'mid_back', label: 'Mid Back' },
            { value: 'lower_back', label: 'Lower Back' },
            { value: 'left_shoulder', label: 'Left Shoulder' },
            { value: 'right_shoulder', label: 'Right Shoulder' },
            { value: 'left_arm', label: 'Left Arm/Elbow' },
            { value: 'right_arm', label: 'Right Arm/Elbow' },
            { value: 'left_wrist_hand', label: 'Left Wrist/Hand' },
            { value: 'right_wrist_hand', label: 'Right Wrist/Hand' },
            { value: 'left_hip', label: 'Left Hip' },
            { value: 'right_hip', label: 'Right Hip' },
            { value: 'left_leg', label: 'Left Leg/Knee' },
            { value: 'right_leg', label: 'Right Leg/Knee' },
            { value: 'left_ankle_foot', label: 'Left Ankle/Foot' },
            { value: 'right_ankle_foot', label: 'Right Ankle/Foot' },
          ]},
        ],
      },
      {
        title: 'Pain Characteristics',
        fields: [
          { fieldType: 'SELECT', label: 'Current Pain Level (0-10)', name: 'currentPain', isRequired: true, options: [
            { value: '0', label: '0 - No pain' },
            { value: '1', label: '1 - Minimal' },
            { value: '2', label: '2' },
            { value: '3', label: '3 - Mild' },
            { value: '4', label: '4' },
            { value: '5', label: '5 - Moderate' },
            { value: '6', label: '6' },
            { value: '7', label: '7 - Severe' },
            { value: '8', label: '8' },
            { value: '9', label: '9 - Very Severe' },
            { value: '10', label: '10 - Worst Possible' },
          ]},
          { fieldType: 'SELECT', label: 'Pain at its worst', name: 'worstPain', options: [
            { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' },
            { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' },
            { value: '6', label: '6' }, { value: '7', label: '7' }, { value: '8', label: '8' },
            { value: '9', label: '9' }, { value: '10', label: '10' },
          ]},
          { fieldType: 'SELECT', label: 'Pain at its best', name: 'bestPain', options: [
            { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' },
            { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' },
            { value: '6', label: '6' }, { value: '7', label: '7' }, { value: '8', label: '8' },
            { value: '9', label: '9' }, { value: '10', label: '10' },
          ]},
          { fieldType: 'CHECKBOX_GROUP', label: 'How would you describe your pain?', name: 'painType', options: [
            { value: 'sharp', label: 'Sharp' },
            { value: 'dull', label: 'Dull' },
            { value: 'aching', label: 'Aching' },
            { value: 'burning', label: 'Burning' },
            { value: 'throbbing', label: 'Throbbing' },
            { value: 'stabbing', label: 'Stabbing' },
            { value: 'shooting', label: 'Shooting' },
            { value: 'tingling', label: 'Tingling/Pins & Needles' },
            { value: 'numbness', label: 'Numbness' },
          ]},
          { fieldType: 'SELECT', label: 'How often do you experience pain?', name: 'painFrequency', options: [
            { value: 'constant', label: 'Constant (always there)' },
            { value: 'frequent', label: 'Frequent (most of the day)' },
            { value: 'intermittent', label: 'Intermittent (comes and goes)' },
            { value: 'occasional', label: 'Occasional (few times a day)' },
            { value: 'rare', label: 'Rare (few times a week)' },
          ]},
        ],
      },
      {
        title: 'Functional Impact',
        description: 'How does pain affect your daily life?',
        fields: [
          { fieldType: 'SELECT', label: 'How does pain affect your work?', name: 'workImpact', options: [
            { value: 'none', label: 'No impact' },
            { value: 'mild', label: 'Mild difficulty' },
            { value: 'moderate', label: 'Moderate difficulty' },
            { value: 'severe', label: 'Severe difficulty' },
            { value: 'unable', label: 'Unable to work' },
          ]},
          { fieldType: 'SELECT', label: 'How does pain affect your sleep?', name: 'sleepImpact', options: [
            { value: 'none', label: 'No impact' },
            { value: 'mild', label: 'Occasional sleep disruption' },
            { value: 'moderate', label: 'Frequent sleep disruption' },
            { value: 'severe', label: 'Severe sleep disruption' },
            { value: 'unable', label: 'Unable to sleep due to pain' },
          ]},
          { fieldType: 'SELECT', label: 'How does pain affect your daily activities?', name: 'dailyImpact', options: [
            { value: 'none', label: 'No impact' },
            { value: 'mild', label: 'Mild limitation' },
            { value: 'moderate', label: 'Moderate limitation' },
            { value: 'severe', label: 'Severe limitation' },
            { value: 'unable', label: 'Unable to perform daily activities' },
          ]},
        ],
      },
      {
        title: 'Treatment Goals',
        fields: [
          { fieldType: 'TEXTAREA', label: 'What are your goals for treatment?', name: 'treatmentGoals', maxLength: 1000, placeholder: 'What do you hope to achieve? What activities would you like to return to?' },
        ],
      },
    ],
  },

  // 4. HIPAA AUTHORIZATION
  {
    name: 'HIPAA Authorization',
    description: 'HIPAA Privacy Notice acknowledgment and authorization for use of health information.',
    sections: [
      {
        title: 'Notice of Privacy Practices',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Privacy Notice', name: 'privacyNotice', helpText: 'Our Notice of Privacy Practices describes how we may use and disclose your protected health information (PHI) to carry out treatment, payment, or health care operations, and for other purposes that are permitted or required by law. It also describes your rights regarding your PHI.' },
        ],
      },
      {
        title: 'Acknowledgment',
        fields: [
          { fieldType: 'CHECKBOX', label: 'I acknowledge that I have received a copy of this office\'s Notice of Privacy Practices', name: 'acknowledgeReceived', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I understand that I may revoke this authorization in writing at any time, except to the extent that action has already been taken in reliance on this authorization', name: 'acknowledgeRevoke', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I understand that my treatment, payment, enrollment, or eligibility for benefits will not be conditioned on the signing of this authorization except where permitted by law', name: 'acknowledgeCondition', isRequired: true },
        ],
      },
      {
        title: 'Release Authorization',
        description: 'Please indicate who may receive information about your care',
        fields: [
          { fieldType: 'CHECKBOX', label: 'I authorize the release of my health information to my spouse/partner', name: 'releaseSpouse' },
          { fieldType: 'CHECKBOX', label: 'I authorize the release of my health information to my family members', name: 'releaseFamily' },
          { fieldType: 'TEXT', label: 'Names of authorized persons (if applicable)', name: 'authorizedPersons', maxLength: 500, placeholder: 'List names of specific people who may receive information' },
        ],
      },
      {
        title: 'Signature',
        fields: [
          { fieldType: 'SIGNATURE', label: 'Patient/Guardian Signature', name: 'signature', isRequired: true },
          { fieldType: 'DATE', label: 'Date', name: 'signatureDate', isRequired: true },
          { fieldType: 'TEXT', label: 'Printed Name', name: 'printedName', isRequired: true, maxLength: 200 },
          { fieldType: 'TEXT', label: 'Relationship to Patient (if signing as guardian)', name: 'relationship', maxLength: 100, placeholder: 'Self, Parent, Legal Guardian, etc.' },
        ],
      },
    ],
  },

  // 5. FINANCIAL POLICY
  {
    name: 'Financial Policy Agreement',
    description: 'Payment terms, insurance billing, and financial responsibility acknowledgment.',
    sections: [
      {
        title: 'Payment Policy',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Policy', name: 'paymentPolicy', helpText: 'Payment is due at the time of service unless prior arrangements have been made. We accept cash, check, and most major credit cards. If you have insurance, we will submit claims on your behalf as a courtesy, but you are ultimately responsible for any amounts not covered by your insurance.' },
        ],
      },
      {
        title: 'Insurance Information',
        fields: [
          { fieldType: 'RADIO', label: 'Do you have health insurance?', name: 'hasInsurance', isRequired: true, options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No, I will be self-pay' },
          ]},
          { fieldType: 'PARAGRAPH', label: 'Insurance Note', name: 'insuranceNote', helpText: 'If you have insurance, please provide your insurance card at check-in. We will verify your benefits and explain any patient responsibility, including copays, coinsurance, and deductibles.' },
        ],
      },
      {
        title: 'Cancellation Policy',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Policy', name: 'cancellationPolicy', helpText: 'We request at least 24 hours notice for appointment cancellations. Repeated no-shows or late cancellations may result in a $25 fee.' },
        ],
      },
      {
        title: 'Acknowledgment & Agreement',
        fields: [
          { fieldType: 'CHECKBOX', label: 'I understand and agree to the payment policy stated above', name: 'agreePayment', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I understand and agree to the cancellation policy stated above', name: 'agreeCancellation', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I authorize the release of any medical information necessary to process insurance claims', name: 'authorizeRelease', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I authorize payment of benefits directly to the provider', name: 'authorizePayment', isRequired: true },
        ],
      },
      {
        title: 'Signature',
        fields: [
          { fieldType: 'SIGNATURE', label: 'Patient/Responsible Party Signature', name: 'signature', isRequired: true },
          { fieldType: 'DATE', label: 'Date', name: 'signatureDate', isRequired: true },
          { fieldType: 'TEXT', label: 'Printed Name', name: 'printedName', isRequired: true, maxLength: 200 },
        ],
      },
    ],
  },

  // 6. INFORMED CONSENT FOR TREATMENT
  {
    name: 'Informed Consent for Chiropractic Treatment',
    description: 'Consent for chiropractic examination and treatment with risk disclosure.',
    sections: [
      {
        title: 'Nature of Chiropractic Care',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Description', name: 'treatmentDescription', helpText: 'Chiropractic care involves the assessment, diagnosis, and treatment of conditions of the spine, nervous system, and joints. Treatment typically includes spinal manipulation/adjustment, soft tissue therapies, rehabilitative exercises, and lifestyle advice. The chiropractor uses their hands or specialized instruments to apply controlled force to joints, particularly the spine, to improve range of motion and relieve pain.' },
        ],
      },
      {
        title: 'Potential Benefits',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Benefits', name: 'benefits', helpText: 'Benefits of chiropractic care may include relief from musculoskeletal pain, improved joint function and mobility, enhanced nervous system function, and overall improved quality of life. However, there is no guarantee of results.' },
        ],
      },
      {
        title: 'Potential Risks',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Risks', name: 'risks', helpText: 'As with any healthcare treatment, there are potential risks associated with chiropractic care. The most common risks include temporary soreness, stiffness, or aching in the treatment area, which typically resolve within 24-48 hours. Rare but more serious risks include fracture, disc injury, stroke (associated with neck manipulation), nerve damage, or muscle injury. These serious risks are extremely rare but have been reported in scientific literature.' },
        ],
      },
      {
        title: 'Alternatives',
        fields: [
          { fieldType: 'PARAGRAPH', label: 'Alternatives', name: 'alternatives', helpText: 'Alternative treatments may include rest, prescription or over-the-counter medications, physical therapy, acupuncture, massage therapy, or surgery. You have the right to discuss these alternatives with your chiropractor or other healthcare providers.' },
        ],
      },
      {
        title: 'Patient Consent',
        fields: [
          { fieldType: 'CHECKBOX', label: 'I have read and understand the information provided about chiropractic care, including the potential benefits and risks', name: 'acknowledgeInfo', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I have had the opportunity to ask questions and have had them answered to my satisfaction', name: 'acknowledgeQuestions', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I understand that results are not guaranteed', name: 'acknowledgeNoGuarantee', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I consent to chiropractic examination and treatment', name: 'consentTreatment', isRequired: true },
          { fieldType: 'CHECKBOX', label: 'I understand I may withdraw consent at any time', name: 'acknowledgeWithdraw', isRequired: true },
        ],
      },
      {
        title: 'Signature',
        fields: [
          { fieldType: 'SIGNATURE', label: 'Patient/Guardian Signature', name: 'signature', isRequired: true },
          { fieldType: 'DATE', label: 'Date', name: 'signatureDate', isRequired: true },
          { fieldType: 'TEXT', label: 'Printed Name', name: 'printedName', isRequired: true, maxLength: 200 },
          { fieldType: 'TEXT', label: 'Relationship to Patient (if signing as guardian)', name: 'relationship', maxLength: 100 },
        ],
      },
    ],
  },
];

/**
 * Seed chiropractic form templates for an organization
 */
async function seedFormTemplates(organizationId: string) {
  console.log('📋 Seeding chiropractic form templates...');

  for (const templateData of CHIROPRACTIC_TEMPLATES) {
    // Check if template already exists
    const existingTemplate = await prisma.formTemplate.findFirst({
      where: {
        organizationId,
        name: templateData.name,
        isSystem: true,
      },
    });

    if (existingTemplate) {
      console.log(`   ⏭️  Template "${templateData.name}" already exists, skipping`);
      continue;
    }

    // Create template
    const template = await prisma.formTemplate.create({
      data: {
        organizationId,
        name: templateData.name,
        description: templateData.description,
        isSystem: true,
        isActive: true,
        isDraft: false,
        publishedAt: new Date(),
        version: 1,
      },
    });

    let sectionOrder = 0;
    let fieldOrder = 0;

    // Create sections and fields
    for (const sectionData of templateData.sections) {
      const section = await prisma.formSection.create({
        data: {
          templateId: template.id,
          title: sectionData.title,
          description: sectionData.description,
          order: sectionOrder++,
        },
      });

      // Create fields in this section
      for (const fieldData of sectionData.fields) {
        await prisma.formField.create({
          data: {
            templateId: template.id,
            sectionId: section.id,
            fieldType: fieldData.fieldType,
            label: fieldData.label,
            name: fieldData.name,
            placeholder: fieldData.placeholder,
            helpText: fieldData.helpText,
            isRequired: fieldData.isRequired || false,
            order: fieldOrder++,
            options: fieldData.options as object,
            mapsToPatient: fieldData.mapsToPatient,
            minLength: fieldData.minLength,
            maxLength: fieldData.maxLength,
            pattern: fieldData.pattern,
            patternMessage: fieldData.patternMessage,
          },
        });
      }
    }

    console.log(`   ✅ Created template: ${templateData.name} (${templateData.sections.length} sections)`);
  }

  console.log('✅ Form templates seeded successfully');
}

// ============================================
// SOAP NOTE TEMPLATES
// ============================================

interface SOAPTemplateData {
  name: string;
  description: string;
  category: EncounterType;
  subjectiveTemplate: object;
  objectiveTemplate: object;
  assessmentTemplate: object;
  planTemplate: object;
}

const SOAP_NOTE_TEMPLATES: SOAPTemplateData[] = [
  {
    name: 'Initial Evaluation',
    description: 'Comprehensive first visit examination and documentation',
    category: 'INITIAL_EVAL',
    subjectiveTemplate: {
      sections: [
        { title: 'Chief Complaint', prompt: 'Patient presents with {{chiefComplaint}}.' },
        { title: 'History of Present Illness', prompt: 'The patient reports that the symptoms began {{onset}}. Pain is described as {{painDescription}} and rated {{painLevel}}/10. Aggravating factors include {{aggravating}}. Relieving factors include {{relieving}}.' },
        { title: 'Past Medical History', prompt: 'PMH: {{pmh}}' },
        { title: 'Medications', prompt: 'Current medications: {{medications}}' },
        { title: 'Allergies', prompt: 'Allergies: {{allergies}}' },
        { title: 'Social History', prompt: 'Occupation: {{occupation}}. Exercise: {{exercise}}. Tobacco: {{tobacco}}.' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Vital Signs', prompt: 'BP: {{bp}}, HR: {{hr}}, Height: {{height}}, Weight: {{weight}}' },
        { title: 'Observation', prompt: 'Posture: {{posture}}. Gait: {{gait}}. General appearance: {{appearance}}.' },
        { title: 'Palpation', prompt: 'Tenderness noted at {{tenderness}}. Muscle tone: {{muscleTone}}. Trigger points: {{triggerPoints}}.' },
        { title: 'Range of Motion', prompt: 'Cervical ROM: Flexion {{cFlexion}}°, Extension {{cExtension}}°, R/L Rotation {{cRotation}}°, R/L Lateral Flexion {{cLatFlex}}°.\nLumbar ROM: Flexion {{lFlexion}}°, Extension {{lExtension}}°, R/L Rotation {{lRotation}}°, R/L Lateral Flexion {{lLatFlex}}°.' },
        { title: 'Orthopedic Tests', prompt: '{{orthoTests}}' },
        { title: 'Neurological', prompt: 'DTRs: {{dtrs}}. Sensation: {{sensation}}. Motor strength: {{motorStrength}}.' },
        { title: 'Spinal Examination', prompt: 'Subluxations/Fixations noted at: {{subluxations}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Diagnoses', prompt: '1. {{dx1}}\n2. {{dx2}}\n3. {{dx3}}' },
        { title: 'Clinical Impression', prompt: '{{clinicalImpression}}' },
        { title: 'Prognosis', prompt: 'Prognosis is {{prognosis}} with appropriate treatment.' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Treatment Performed', prompt: '- Chiropractic manipulation: {{adjustments}}\n- Soft tissue therapy: {{softTissue}}\n- Modalities: {{modalities}}\n- Exercises: {{exercises}}' },
        { title: 'Treatment Plan', prompt: 'Recommended {{visitsPerWeek}}x/week for {{weeks}} weeks ({{totalVisits}} visits total).' },
        { title: 'Goals', prompt: 'Short-term: {{shortTermGoals}}\nLong-term: {{longTermGoals}}' },
        { title: 'Home Care Instructions', prompt: '{{homeInstructions}}' },
        { title: 'Follow-up', prompt: 'Return for follow-up in {{followUp}}.' },
      ],
    },
  },
  {
    name: 'Follow-up Visit',
    description: 'Standard follow-up/maintenance visit documentation',
    category: 'FOLLOW_UP',
    subjectiveTemplate: {
      sections: [
        { title: 'Progress Report', prompt: 'Patient reports {{progressReport}}. Pain level is {{painLevel}}/10 (was {{previousPain}}/10 at last visit).' },
        { title: 'Response to Treatment', prompt: 'Response to previous treatment: {{treatmentResponse}}.' },
        { title: 'New Complaints', prompt: '{{newComplaints}}' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Observation', prompt: 'Posture {{postureChange}}. Gait: {{gait}}.' },
        { title: 'Palpation', prompt: '{{palpationFindings}}' },
        { title: 'Motion', prompt: '{{motionFindings}}' },
        { title: 'Spinal Examination', prompt: 'Subluxations/Fixations: {{subluxations}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Assessment', prompt: '{{assessmentNotes}}' },
        { title: 'Progress', prompt: 'Patient is {{progressStatus}} with current treatment plan.' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Treatment Performed', prompt: '- CMT: {{adjustments}}\n- Additional: {{additionalTreatment}}' },
        { title: 'Plan', prompt: '{{planNotes}}' },
        { title: 'Next Visit', prompt: 'Continue current treatment plan. Next visit: {{nextVisit}}.' },
      ],
    },
  },
  {
    name: 'Re-evaluation',
    description: 'Progress re-evaluation with outcome measures',
    category: 'RE_EVALUATION',
    subjectiveTemplate: {
      sections: [
        { title: 'Overall Progress', prompt: 'Patient has completed {{visitsCompleted}} of {{totalVisits}} planned visits. Overall improvement: {{overallImprovement}}%.' },
        { title: 'Subjective Improvement', prompt: 'Patient reports: {{subjectiveImprovement}}' },
        { title: 'Functional Status', prompt: 'ADL impact: {{adlStatus}}. Work status: {{workStatus}}. Sleep quality: {{sleepQuality}}.' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Comparative Examination', prompt: 'Compared to initial evaluation:\n- ROM: {{romComparison}}\n- Palpation: {{palpationComparison}}\n- Orthopedic tests: {{orthoComparison}}' },
        { title: 'Outcome Measures', prompt: '{{outcomeAssessment}} Score: {{currentScore}} (Initial: {{initialScore}}, Change: {{scoreChange}})' },
        { title: 'Current Findings', prompt: '{{currentFindings}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Progress Assessment', prompt: '{{progressAssessment}}' },
        { title: 'Goals Status', prompt: 'Short-term goals: {{shortTermStatus}}\nLong-term goals: {{longTermStatus}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Recommendations', prompt: '{{recommendations}}' },
        { title: 'Modified Treatment Plan', prompt: '{{modifiedPlan}}' },
        { title: 'Anticipated Discharge', prompt: '{{dischargeAnticipation}}' },
      ],
    },
  },
  {
    name: 'Discharge Summary',
    description: 'Final visit documentation and discharge planning',
    category: 'DISCHARGE',
    subjectiveTemplate: {
      sections: [
        { title: 'Treatment Summary', prompt: 'Patient received {{totalVisits}} visits over {{treatmentDuration}}.' },
        { title: 'Patient Status at Discharge', prompt: '{{dischargeStatus}}' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Final Examination', prompt: '{{finalExamFindings}}' },
        { title: 'Outcome Comparison', prompt: 'Initial {{outcomeAssessment}}: {{initialScore}}\nFinal {{outcomeAssessment}}: {{finalScore}}\nImprovement: {{improvement}}%' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Discharge Assessment', prompt: '{{dischargeAssessment}}' },
        { title: 'Goals Achieved', prompt: '{{goalsAchieved}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Home Exercise Program', prompt: '{{hep}}' },
        { title: 'Self-Care Instructions', prompt: '{{selfCare}}' },
        { title: 'Follow-up Recommendations', prompt: '{{followUpRec}}' },
        { title: 'Referrals', prompt: '{{referrals}}' },
      ],
    },
  },
  {
    name: 'Workers Compensation',
    description: 'Documentation for workers comp cases with required elements',
    category: 'WORKERS_COMP',
    subjectiveTemplate: {
      sections: [
        { title: 'Injury Information', prompt: 'Date of injury: {{doi}}. Employer: {{employer}}. Job title: {{jobTitle}}.' },
        { title: 'Mechanism of Injury', prompt: '{{mechanismOfInjury}}' },
        { title: 'Current Symptoms', prompt: '{{currentSymptoms}}. Pain level: {{painLevel}}/10.' },
        { title: 'Work Status', prompt: 'Current work status: {{workStatus}}. Restrictions: {{restrictions}}.' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Physical Examination', prompt: '{{physicalExam}}' },
        { title: 'Functional Capacity', prompt: '{{functionalCapacity}}' },
        { title: 'Work-Related Findings', prompt: '{{workRelatedFindings}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Work-Related Diagnoses', prompt: '{{diagnoses}}' },
        { title: 'Causation Statement', prompt: 'Based on the history and examination findings, it is my professional opinion that the patient\'s condition is {{causationStatement}} related to the work injury of {{doi}}.' },
        { title: 'MMI Status', prompt: 'Maximum Medical Improvement: {{mmiStatus}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Treatment Performed', prompt: '{{treatmentPerformed}}' },
        { title: 'Treatment Plan', prompt: '{{treatmentPlan}}' },
        { title: 'Work Restrictions', prompt: '{{workRestrictions}}' },
        { title: 'Return to Work', prompt: 'Anticipated return to {{returnToWork}}.' },
        { title: 'Next Review', prompt: '{{nextReview}}' },
      ],
    },
  },
  {
    name: 'Acute Injury',
    description: 'Documentation for acute injuries and pain episodes',
    category: 'ACUTE',
    subjectiveTemplate: {
      sections: [
        { title: 'Presenting Complaint', prompt: 'Patient presents with acute {{injury}} of {{duration}} duration.' },
        { title: 'Mechanism of Injury', prompt: '{{mechanismOfInjury}}' },
        { title: 'Current Symptoms', prompt: 'Pain: {{painLevel}}/10. Location: {{painLocation}}. Quality: {{painQuality}}.' },
        { title: 'Aggravating/Relieving Factors', prompt: 'Worse with: {{aggravating}}. Better with: {{relieving}}.' },
        { title: 'Red Flag Screening', prompt: 'Denies: {{redFlagsNegative}}. Reports: {{redFlagsPositive}}.' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Inspection', prompt: 'Observation: {{inspection}}. Swelling: {{swelling}}. Discoloration: {{discoloration}}.' },
        { title: 'Palpation', prompt: 'Point tenderness at {{tenderness}}. Muscle spasm: {{spasm}}.' },
        { title: 'Range of Motion', prompt: '{{rom}}' },
        { title: 'Orthopedic/Neurological', prompt: '{{orthoNeuro}}' },
        { title: 'Spinal Findings', prompt: 'Subluxations/Fixations: {{subluxations}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Diagnosis', prompt: '{{diagnoses}}' },
        { title: 'Severity', prompt: 'Acute {{condition}} - {{severity}} presentation.' },
        { title: 'Clinical Impression', prompt: '{{clinicalImpression}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Acute Treatment', prompt: '- CMT: {{adjustments}}\n- Modalities: {{modalities}}\n- Ice/Heat: {{thermal}}' },
        { title: 'Activity Modifications', prompt: '{{activityMod}}' },
        { title: 'Home Care', prompt: 'PRICE protocol: {{priceProtocol}}' },
        { title: 'Follow-up', prompt: 'Return in {{followUp}} for re-assessment. Seek emergency care if {{redFlagWarnings}}.' },
      ],
    },
  },
  {
    name: 'Maintenance Care',
    description: 'Documentation for ongoing wellness and maintenance visits',
    category: 'MAINTENANCE',
    subjectiveTemplate: {
      sections: [
        { title: 'Wellness Check', prompt: 'Patient presents for maintenance/wellness care. Overall status: {{overallStatus}}.' },
        { title: 'Interval History', prompt: 'Since last visit: {{intervalHistory}}. No new complaints: {{noNewComplaints}}.' },
        { title: 'Functional Status', prompt: 'ADLs: {{adlStatus}}. Work: {{workStatus}}. Exercise: {{exerciseStatus}}.' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'General Assessment', prompt: 'Posture: {{posture}}. Gait: {{gait}}. General appearance: good.' },
        { title: 'Palpation', prompt: '{{palpationFindings}}' },
        { title: 'Spinal Motion', prompt: 'Overall mobility: {{mobilityAssessment}}' },
        { title: 'Maintenance Findings', prompt: 'Subluxations noted at: {{subluxations}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Wellness Assessment', prompt: 'Patient is {{maintenanceStatus}} on maintenance care.' },
        { title: 'Spinal Health', prompt: '{{spinalHealth}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Treatment', prompt: 'CMT: {{adjustments}}' },
        { title: 'Wellness Recommendations', prompt: '{{wellnessRec}}' },
        { title: 'Next Visit', prompt: 'Continue maintenance schedule. Next visit in {{nextVisit}}.' },
      ],
    },
  },
  {
    name: 'Personal Injury',
    description: 'Documentation for motor vehicle accident and personal injury cases',
    category: 'PERSONAL_INJURY',
    subjectiveTemplate: {
      sections: [
        { title: 'Accident Information', prompt: 'Date of accident: {{doa}}. Type: {{accidentType}}. Vehicle: {{vehiclePosition}}.' },
        { title: 'Accident Description', prompt: '{{accidentDescription}}' },
        { title: 'Onset of Symptoms', prompt: '{{symptomOnset}}' },
        { title: 'Current Symptoms', prompt: '{{currentSymptoms}}. Pain level: {{painLevel}}/10.' },
        { title: 'Prior History', prompt: '{{priorHistory}}' },
      ],
    },
    objectiveTemplate: {
      sections: [
        { title: 'Physical Examination', prompt: '{{physicalExam}}' },
        { title: 'Cervical Examination', prompt: '{{cervicalExam}}' },
        { title: 'Lumbar Examination', prompt: '{{lumbarExam}}' },
        { title: 'Neurological Examination', prompt: '{{neuroExam}}' },
      ],
    },
    assessmentTemplate: {
      sections: [
        { title: 'Diagnoses', prompt: '{{diagnoses}}' },
        { title: 'Causation', prompt: 'The injuries sustained are {{causationRelation}} related to the motor vehicle accident of {{doa}}.' },
        { title: 'Pre-existing Conditions', prompt: '{{preexistingConditions}}' },
      ],
    },
    planTemplate: {
      sections: [
        { title: 'Treatment Plan', prompt: '{{treatmentPlan}}' },
        { title: 'Referrals', prompt: '{{referrals}}' },
        { title: 'Prognosis', prompt: '{{prognosis}}' },
        { title: 'Disability Status', prompt: '{{disabilityStatus}}' },
      ],
    },
  },
];

/**
 * Seed SOAP note templates
 */
async function seedSOAPNoteTemplates(organizationId: string) {
  console.log('📝 Seeding SOAP note templates...');

  for (const templateData of SOAP_NOTE_TEMPLATES) {
    const existingTemplate = await prisma.noteTemplate.findFirst({
      where: {
        organizationId,
        name: templateData.name,
        isSystem: true,
      },
    });

    if (existingTemplate) {
      console.log(`   ⏭️  SOAP Template "${templateData.name}" already exists, skipping`);
      continue;
    }

    await prisma.noteTemplate.create({
      data: {
        organizationId,
        name: templateData.name,
        description: templateData.description,
        category: templateData.category,
        subjectiveTemplate: templateData.subjectiveTemplate,
        objectiveTemplate: templateData.objectiveTemplate,
        assessmentTemplate: templateData.assessmentTemplate,
        planTemplate: templateData.planTemplate,
        isSystem: true,
        isActive: true,
      },
    });

    console.log(`   ✅ Created SOAP template: ${templateData.name}`);
  }

  console.log('✅ SOAP note templates seeded successfully');
}

// ============================================
// OUTCOME ASSESSMENT TEMPLATES
// ============================================

interface AssessmentTemplateData {
  name: string;
  assessmentType: AssessmentType;
  description: string;
  questions: object[];
  maxScore: number;
  scoringMethod: string;
  interpretation: object[];
}

const OUTCOME_ASSESSMENT_TEMPLATES: AssessmentTemplateData[] = [
  {
    name: 'Oswestry Disability Index (ODI)',
    assessmentType: 'ODI',
    description: 'Standard assessment for low back pain disability',
    maxScore: 50,
    scoringMethod: 'sum',
    questions: [
      { id: 1, text: 'Pain Intensity', options: [
        { value: 0, label: 'I have no pain at the moment' },
        { value: 1, label: 'The pain is very mild at the moment' },
        { value: 2, label: 'The pain is moderate at the moment' },
        { value: 3, label: 'The pain is fairly severe at the moment' },
        { value: 4, label: 'The pain is very severe at the moment' },
        { value: 5, label: 'The pain is the worst imaginable at the moment' },
      ]},
      { id: 2, text: 'Personal Care (washing, dressing)', options: [
        { value: 0, label: 'I can look after myself normally without causing extra pain' },
        { value: 1, label: 'I can look after myself normally but it causes extra pain' },
        { value: 2, label: 'It is painful to look after myself and I am slow and careful' },
        { value: 3, label: 'I need some help but manage most of my personal care' },
        { value: 4, label: 'I need help every day in most aspects of self-care' },
        { value: 5, label: 'I do not get dressed, I wash with difficulty and stay in bed' },
      ]},
      { id: 3, text: 'Lifting', options: [
        { value: 0, label: 'I can lift heavy weights without extra pain' },
        { value: 1, label: 'I can lift heavy weights but it gives extra pain' },
        { value: 2, label: 'Pain prevents me from lifting heavy weights off the floor' },
        { value: 3, label: 'Pain prevents me from lifting heavy weights but I can manage light weights' },
        { value: 4, label: 'I can lift very light weights' },
        { value: 5, label: 'I cannot lift or carry anything at all' },
      ]},
      { id: 4, text: 'Walking', options: [
        { value: 0, label: 'Pain does not prevent me walking any distance' },
        { value: 1, label: 'Pain prevents me from walking more than 1 mile' },
        { value: 2, label: 'Pain prevents me from walking more than 1/2 mile' },
        { value: 3, label: 'Pain prevents me from walking more than 100 yards' },
        { value: 4, label: 'I can only walk using a stick or crutches' },
        { value: 5, label: 'I am in bed most of the time' },
      ]},
      { id: 5, text: 'Sitting', options: [
        { value: 0, label: 'I can sit in any chair as long as I like' },
        { value: 1, label: 'I can only sit in my favorite chair as long as I like' },
        { value: 2, label: 'Pain prevents me from sitting more than 1 hour' },
        { value: 3, label: 'Pain prevents me from sitting more than 30 minutes' },
        { value: 4, label: 'Pain prevents me from sitting more than 10 minutes' },
        { value: 5, label: 'Pain prevents me from sitting at all' },
      ]},
      { id: 6, text: 'Standing', options: [
        { value: 0, label: 'I can stand as long as I want without extra pain' },
        { value: 1, label: 'I can stand as long as I want but it gives me extra pain' },
        { value: 2, label: 'Pain prevents me from standing for more than 1 hour' },
        { value: 3, label: 'Pain prevents me from standing for more than 30 minutes' },
        { value: 4, label: 'Pain prevents me from standing for more than 10 minutes' },
        { value: 5, label: 'Pain prevents me from standing at all' },
      ]},
      { id: 7, text: 'Sleeping', options: [
        { value: 0, label: 'My sleep is never disturbed by pain' },
        { value: 1, label: 'My sleep is occasionally disturbed by pain' },
        { value: 2, label: 'Because of pain I have less than 6 hours sleep' },
        { value: 3, label: 'Because of pain I have less than 4 hours sleep' },
        { value: 4, label: 'Because of pain I have less than 2 hours sleep' },
        { value: 5, label: 'Pain prevents me from sleeping at all' },
      ]},
      { id: 8, text: 'Social Life', options: [
        { value: 0, label: 'My social life is normal and gives me no extra pain' },
        { value: 1, label: 'My social life is normal but increases the degree of pain' },
        { value: 2, label: 'Pain has no significant effect on my social life apart from limiting energetic interests' },
        { value: 3, label: 'Pain has restricted my social life and I do not go out as often' },
        { value: 4, label: 'Pain has restricted my social life to my home' },
        { value: 5, label: 'I have no social life because of pain' },
      ]},
      { id: 9, text: 'Traveling', options: [
        { value: 0, label: 'I can travel anywhere without pain' },
        { value: 1, label: 'I can travel anywhere but it gives me extra pain' },
        { value: 2, label: 'Pain is bad but I manage journeys over 2 hours' },
        { value: 3, label: 'Pain restricts me to journeys of less than 1 hour' },
        { value: 4, label: 'Pain restricts me to short necessary journeys under 30 minutes' },
        { value: 5, label: 'Pain prevents me from traveling except to receive treatment' },
      ]},
      { id: 10, text: 'Employment/Homemaking', options: [
        { value: 0, label: 'My normal homemaking/job activities do not cause pain' },
        { value: 1, label: 'My normal activities cause pain but I can perform them' },
        { value: 2, label: 'I can perform most activities but pain prevents more demanding ones' },
        { value: 3, label: 'Pain prevents me from doing anything but light duties' },
        { value: 4, label: 'Pain prevents me from doing even light duties' },
        { value: 5, label: 'Pain prevents me from performing any job or homemaking chore' },
      ]},
    ],
    interpretation: [
      { min: 0, max: 20, label: 'Minimal disability', description: 'Can cope with most living activities' },
      { min: 21, max: 40, label: 'Moderate disability', description: 'Experiences more pain with daily activities' },
      { min: 41, max: 60, label: 'Severe disability', description: 'Pain is a significant problem' },
      { min: 61, max: 80, label: 'Crippled', description: 'Back pain impinges on all aspects of life' },
      { min: 81, max: 100, label: 'Bed-bound or exaggerating', description: 'Patient is either bed-bound or exaggerating symptoms' },
    ],
  },
  {
    name: 'Neck Disability Index (NDI)',
    assessmentType: 'NDI',
    description: 'Standard assessment for neck pain disability',
    maxScore: 50,
    scoringMethod: 'sum',
    questions: [
      { id: 1, text: 'Pain Intensity', options: [
        { value: 0, label: 'I have no pain at the moment' },
        { value: 1, label: 'The pain is very mild at the moment' },
        { value: 2, label: 'The pain is moderate at the moment' },
        { value: 3, label: 'The pain is fairly severe at the moment' },
        { value: 4, label: 'The pain is very severe at the moment' },
        { value: 5, label: 'The pain is the worst imaginable at the moment' },
      ]},
      { id: 2, text: 'Personal Care', options: [
        { value: 0, label: 'I can look after myself normally without causing extra pain' },
        { value: 1, label: 'I can look after myself normally but it causes extra pain' },
        { value: 2, label: 'It is painful to look after myself and I am slow and careful' },
        { value: 3, label: 'I need some help but manage most of my personal care' },
        { value: 4, label: 'I need help every day in most aspects of self-care' },
        { value: 5, label: 'I do not get dressed, wash with difficulty and stay in bed' },
      ]},
      { id: 3, text: 'Lifting', options: [
        { value: 0, label: 'I can lift heavy weights without extra pain' },
        { value: 1, label: 'I can lift heavy weights but it gives extra pain' },
        { value: 2, label: 'Pain prevents me lifting heavy weights off the floor' },
        { value: 3, label: 'Pain prevents me lifting heavy weights but I can manage light weights' },
        { value: 4, label: 'I can only lift very light weights' },
        { value: 5, label: 'I cannot lift or carry anything at all' },
      ]},
      { id: 4, text: 'Reading', options: [
        { value: 0, label: 'I can read as much as I want with no pain in my neck' },
        { value: 1, label: 'I can read as much as I want with slight pain in my neck' },
        { value: 2, label: 'I can read as much as I want with moderate pain in my neck' },
        { value: 3, label: 'I cannot read as much as I want because of moderate pain' },
        { value: 4, label: 'I can hardly read at all because of severe neck pain' },
        { value: 5, label: 'I cannot read at all' },
      ]},
      { id: 5, text: 'Headaches', options: [
        { value: 0, label: 'I have no headaches at all' },
        { value: 1, label: 'I have slight headaches which come infrequently' },
        { value: 2, label: 'I have moderate headaches which come infrequently' },
        { value: 3, label: 'I have moderate headaches which come frequently' },
        { value: 4, label: 'I have severe headaches which come frequently' },
        { value: 5, label: 'I have headaches almost all the time' },
      ]},
      { id: 6, text: 'Concentration', options: [
        { value: 0, label: 'I can concentrate fully when I want with no difficulty' },
        { value: 1, label: 'I can concentrate fully with slight difficulty' },
        { value: 2, label: 'I have a fair degree of difficulty concentrating' },
        { value: 3, label: 'I have a lot of difficulty concentrating' },
        { value: 4, label: 'I have a great deal of difficulty concentrating' },
        { value: 5, label: 'I cannot concentrate at all' },
      ]},
      { id: 7, text: 'Work', options: [
        { value: 0, label: 'I can do as much work as I want to' },
        { value: 1, label: 'I can only do my usual work but no more' },
        { value: 2, label: 'I can do most of my usual work but no more' },
        { value: 3, label: 'I cannot do my usual work' },
        { value: 4, label: 'I can hardly do any work at all' },
        { value: 5, label: 'I cannot do any work at all' },
      ]},
      { id: 8, text: 'Driving', options: [
        { value: 0, label: 'I can drive my car without any neck pain' },
        { value: 1, label: 'I can drive as long as I want with slight neck pain' },
        { value: 2, label: 'I can drive as long as I want with moderate neck pain' },
        { value: 3, label: 'I cannot drive as long as I want because of moderate pain' },
        { value: 4, label: 'I can hardly drive at all because of severe neck pain' },
        { value: 5, label: 'I cannot drive my car at all' },
      ]},
      { id: 9, text: 'Sleeping', options: [
        { value: 0, label: 'I have no trouble sleeping' },
        { value: 1, label: 'My sleep is slightly disturbed (less than 1 hour sleepless)' },
        { value: 2, label: 'My sleep is mildly disturbed (1-2 hours sleepless)' },
        { value: 3, label: 'My sleep is moderately disturbed (2-3 hours sleepless)' },
        { value: 4, label: 'My sleep is greatly disturbed (3-5 hours sleepless)' },
        { value: 5, label: 'My sleep is completely disturbed (5-7 hours sleepless)' },
      ]},
      { id: 10, text: 'Recreation', options: [
        { value: 0, label: 'I am able to engage in all recreational activities with no neck pain' },
        { value: 1, label: 'I am able to engage in all activities with some pain in my neck' },
        { value: 2, label: 'I can engage in most but not all recreational activities due to pain' },
        { value: 3, label: 'I can only engage in a few recreational activities due to pain' },
        { value: 4, label: 'I can hardly do any recreational activities due to pain' },
        { value: 5, label: 'I cannot do any recreational activities at all' },
      ]},
    ],
    interpretation: [
      { min: 0, max: 4, label: 'No disability', description: 'Normal function' },
      { min: 5, max: 14, label: 'Mild disability', description: 'Minimal impact on daily activities' },
      { min: 15, max: 24, label: 'Moderate disability', description: 'Can manage most daily activities' },
      { min: 25, max: 34, label: 'Severe disability', description: 'Daily activities significantly affected' },
      { min: 35, max: 50, label: 'Complete disability', description: 'Completely disabled' },
    ],
  },
  {
    name: 'Visual Analog Scale (VAS)',
    assessmentType: 'VAS_PAIN',
    description: 'Simple 0-10 pain rating scale',
    maxScore: 10,
    scoringMethod: 'direct',
    questions: [
      { id: 1, text: 'Please rate your current pain level', type: 'scale', min: 0, max: 10, minLabel: 'No Pain', maxLabel: 'Worst Possible Pain' },
    ],
    interpretation: [
      { min: 0, max: 0, label: 'No pain', description: 'Pain-free' },
      { min: 1, max: 3, label: 'Mild pain', description: 'Nagging, annoying, but does not interfere with daily activities' },
      { min: 4, max: 6, label: 'Moderate pain', description: 'Interferes significantly with daily activities' },
      { min: 7, max: 10, label: 'Severe pain', description: 'Disabling; unable to perform daily activities' },
    ],
  },
  {
    name: 'Numeric Pain Rating Scale (NPRS)',
    assessmentType: 'NPRS',
    description: 'Numeric 0-10 pain rating with multiple time points',
    maxScore: 10,
    scoringMethod: 'average',
    questions: [
      { id: 1, text: 'Current pain level (right now)', type: 'scale', min: 0, max: 10 },
      { id: 2, text: 'Average pain level (over the past week)', type: 'scale', min: 0, max: 10 },
      { id: 3, text: 'Worst pain level (over the past week)', type: 'scale', min: 0, max: 10 },
      { id: 4, text: 'Best pain level (over the past week)', type: 'scale', min: 0, max: 10 },
    ],
    interpretation: [
      { min: 0, max: 0, label: 'No pain', description: 'Pain-free' },
      { min: 1, max: 3, label: 'Mild pain', description: 'Nagging, annoying' },
      { min: 4, max: 6, label: 'Moderate pain', description: 'Interferes with daily activities' },
      { min: 7, max: 10, label: 'Severe pain', description: 'Disabling' },
    ],
  },
];

/**
 * Seed outcome assessment templates
 */
async function seedAssessmentTemplates(organizationId: string) {
  console.log('📊 Seeding outcome assessment templates...');

  for (const templateData of OUTCOME_ASSESSMENT_TEMPLATES) {
    const existingTemplate = await prisma.assessmentTemplate.findFirst({
      where: {
        organizationId,
        name: templateData.name,
        isSystem: true,
      },
    });

    if (existingTemplate) {
      console.log(`   ⏭️  Assessment Template "${templateData.name}" already exists, skipping`);
      continue;
    }

    await prisma.assessmentTemplate.create({
      data: {
        organizationId,
        name: templateData.name,
        assessmentType: templateData.assessmentType,
        description: templateData.description,
        questions: templateData.questions,
        maxScore: templateData.maxScore,
        scoringMethod: templateData.scoringMethod,
        interpretation: templateData.interpretation,
        isSystem: true,
        isActive: true,
      },
    });

    console.log(`   ✅ Created assessment template: ${templateData.name}`);
  }

  console.log('✅ Outcome assessment templates seeded successfully');
}

/**
 * Seed common ICD-10 and CPT codes for chiropractic
 */
async function seedCommonCodes() {
  console.log('🏥 Seeding common chiropractic codes...');

  // Common chiropractic ICD-10 codes
  const icd10Codes = [
    { code: 'M54.5', description: 'Low back pain', category: 'M54', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M54.2', description: 'Cervicalgia', category: 'M54', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M54.6', description: 'Pain in thoracic spine', category: 'M54', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M54.16', description: 'Radiculopathy, lumbar region', category: 'M54', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M54.12', description: 'Radiculopathy, cervical region', category: 'M54', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M47.812', description: 'Spondylosis without myelopathy, cervical region', category: 'M47', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M47.816', description: 'Spondylosis without myelopathy, lumbar region', category: 'M47', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M99.01', description: 'Segmental dysfunction, cervical region', category: 'M99', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M99.03', description: 'Segmental dysfunction, lumbar region', category: 'M99', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M99.04', description: 'Segmental dysfunction, sacral region', category: 'M99', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'G89.29', description: 'Other chronic pain', category: 'G89', chapter: 'Nervous System', isChiroCommon: true },
    { code: 'M25.511', description: 'Pain in right shoulder', category: 'M25', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'M25.512', description: 'Pain in left shoulder', category: 'M25', chapter: 'Musculoskeletal', isChiroCommon: true },
    { code: 'S13.4XXA', description: 'Sprain of cervical spine, initial encounter', category: 'S13', chapter: 'Injury', isChiroCommon: true },
    { code: 'S33.5XXA', description: 'Sprain of lumbar spine, initial encounter', category: 'S33', chapter: 'Injury', isChiroCommon: true },
  ];

  for (const code of icd10Codes) {
    await prisma.iCD10Code.upsert({
      where: { code: code.code },
      update: {},
      create: code,
    });
  }

  console.log(`   ✅ Seeded ${icd10Codes.length} ICD-10 codes`);

  // Common chiropractic CPT codes
  const cptCodes = [
    { code: '98940', description: 'Chiropractic manipulative treatment (CMT); 1-2 spinal regions', shortDesc: 'CMT 1-2 regions', category: 'Chiro Manipulation', isChiroCommon: true, timeMinutes: 15 },
    { code: '98941', description: 'Chiropractic manipulative treatment (CMT); 3-4 spinal regions', shortDesc: 'CMT 3-4 regions', category: 'Chiro Manipulation', isChiroCommon: true, timeMinutes: 15 },
    { code: '98942', description: 'Chiropractic manipulative treatment (CMT); 5 spinal regions', shortDesc: 'CMT 5 regions', category: 'Chiro Manipulation', isChiroCommon: true, timeMinutes: 15 },
    { code: '98943', description: 'Chiropractic manipulative treatment (CMT); extraspinal, 1 or more regions', shortDesc: 'CMT extraspinal', category: 'Chiro Manipulation', isChiroCommon: true, timeMinutes: 15 },
    { code: '99202', description: 'Office visit, new patient, level 2', shortDesc: 'New patient L2', category: 'E/M', isChiroCommon: true, timeMinutes: 15 },
    { code: '99203', description: 'Office visit, new patient, level 3', shortDesc: 'New patient L3', category: 'E/M', isChiroCommon: true, timeMinutes: 30 },
    { code: '99204', description: 'Office visit, new patient, level 4', shortDesc: 'New patient L4', category: 'E/M', isChiroCommon: true, timeMinutes: 45 },
    { code: '99212', description: 'Office visit, established patient, level 2', shortDesc: 'Est patient L2', category: 'E/M', isChiroCommon: true, timeMinutes: 10 },
    { code: '99213', description: 'Office visit, established patient, level 3', shortDesc: 'Est patient L3', category: 'E/M', isChiroCommon: true, timeMinutes: 15 },
    { code: '99214', description: 'Office visit, established patient, level 4', shortDesc: 'Est patient L4', category: 'E/M', isChiroCommon: true, timeMinutes: 25 },
    { code: '97140', description: 'Manual therapy techniques', shortDesc: 'Manual therapy', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97110', description: 'Therapeutic exercises', shortDesc: 'Ther exercises', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97112', description: 'Neuromuscular reeducation', shortDesc: 'Neuromuscular', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97530', description: 'Therapeutic activities', shortDesc: 'Ther activities', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97012', description: 'Mechanical traction', shortDesc: 'Traction', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97014', description: 'Electrical stimulation (unattended)', shortDesc: 'E-stim unatten', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97032', description: 'Electrical stimulation (attended)', shortDesc: 'E-stim attended', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97035', description: 'Ultrasound', shortDesc: 'Ultrasound', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
    { code: '97010', description: 'Hot or cold packs', shortDesc: 'Hot/cold packs', category: 'Physical Medicine', isChiroCommon: true, timeMinutes: 15 },
  ];

  for (const code of cptCodes) {
    await prisma.cPTCode.upsert({
      where: { code: code.code },
      update: {},
      create: code,
    });
  }

  console.log(`   ✅ Seeded ${cptCodes.length} CPT codes`);
  console.log('✅ Common codes seeded successfully');
}

// ============================================
// COMMON INSURANCE PAYERS
// ============================================
async function seedInsurancePayers() {
  console.log('🏢 Seeding common insurance payers...');

  // Common insurance payers with EDI payer IDs
  const payers = [
    // Medicare
    {
      name: 'Medicare Part B',
      payerId: '00882', // National Medicare ID
      electronicPayerId: '00882',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 365,
      notes: 'Federal health insurance for 65+ and disabled',
    },
    {
      name: 'Medicare Advantage',
      payerId: '00886',
      electronicPayerId: '00886',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 365,
    },
    // Medicaid
    {
      name: 'Medicaid',
      payerId: 'XXXXX', // State-specific
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 365,
      notes: 'State Medicaid - update payer ID for your state',
    },
    // Major National Insurers
    {
      name: 'Aetna',
      payerId: '60054',
      electronicPayerId: '60054',
      address1: 'P.O. Box 981106',
      city: 'El Paso',
      state: 'TX',
      zip: '79998-1106',
      phone: '1-800-872-3862',
      website: 'https://www.aetna.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Anthem Blue Cross Blue Shield',
      payerId: '47198',
      electronicPayerId: '47198',
      phone: '1-800-331-1476',
      website: 'https://www.anthem.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Blue Cross Blue Shield',
      payerId: '00060',
      electronicPayerId: '00060',
      phone: '1-888-630-2583',
      website: 'https://www.bcbs.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
      notes: 'Generic BCBS - use state-specific payer ID when available',
    },
    {
      name: 'Cigna',
      payerId: '62308',
      electronicPayerId: '62308',
      address1: 'P.O. Box 188061',
      city: 'Chattanooga',
      state: 'TN',
      zip: '37422-8061',
      phone: '1-800-997-1654',
      website: 'https://www.cigna.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'UnitedHealthcare',
      payerId: '87726',
      electronicPayerId: '87726',
      address1: 'P.O. Box 740800',
      city: 'Atlanta',
      state: 'GA',
      zip: '30374-0800',
      phone: '1-800-842-2656',
      website: 'https://www.uhc.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Humana',
      payerId: '61101',
      electronicPayerId: '61101',
      address1: 'P.O. Box 14601',
      city: 'Lexington',
      state: 'KY',
      zip: '40512-4601',
      phone: '1-800-448-6262',
      website: 'https://www.humana.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Kaiser Permanente',
      payerId: '91617',
      electronicPayerId: '91617',
      phone: '1-800-464-4000',
      website: 'https://www.kaiserpermanente.org',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    // Workers Compensation / Auto
    {
      name: 'SAIF Corporation',
      payerId: 'SAIF1',
      claimSubmissionMethod: 'paper',
      acceptsEdi: false,
      timelyFilingDays: 60,
      notes: 'Oregon Workers Compensation',
    },
    {
      name: 'Liberty Mutual',
      payerId: '13193',
      electronicPayerId: '13193',
      phone: '1-800-344-0197',
      website: 'https://www.libertymutual.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
      notes: 'Workers Comp and Auto',
    },
    {
      name: 'State Farm',
      payerId: '25143',
      electronicPayerId: '25143',
      phone: '1-800-782-8332',
      website: 'https://www.statefarm.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
      notes: 'Auto and PI claims',
    },
    // Regional / Other
    {
      name: 'Regence BlueCross BlueShield of Oregon',
      payerId: '00851',
      electronicPayerId: '00851',
      phone: '1-888-344-6347',
      website: 'https://www.regence.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Providence Health Plan',
      payerId: '00653',
      electronicPayerId: '00653',
      phone: '1-800-878-4445',
      website: 'https://www.providencehealthplan.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'Moda Health',
      payerId: '00823',
      electronicPayerId: '00823',
      phone: '1-877-605-3229',
      website: 'https://www.modahealth.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    {
      name: 'PacificSource Health Plans',
      payerId: '93029',
      electronicPayerId: '93029',
      phone: '1-888-977-9299',
      website: 'https://www.pacificsource.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
    },
    // Chiro-specific networks
    {
      name: 'ChiroHealth USA',
      payerId: 'CHUSA',
      claimSubmissionMethod: 'portal',
      acceptsEdi: false,
      timelyFilingDays: 180,
      notes: 'Chiropractic network - submit via provider portal',
    },
    {
      name: 'American Specialty Health (ASH)',
      payerId: '38333',
      electronicPayerId: '38333',
      phone: '1-800-972-4226',
      website: 'https://www.ashcompanies.com',
      claimSubmissionMethod: 'electronic',
      acceptsEdi: true,
      timelyFilingDays: 90,
      notes: 'Chiropractic network for multiple carriers',
    },
    // Self-pay placeholder
    {
      name: 'Self-Pay / Cash',
      payerId: 'SELFPAY',
      claimSubmissionMethod: 'paper',
      acceptsEdi: false,
      timelyFilingDays: 0,
      notes: 'Patient self-pay - no claim submission required',
    },
  ];

  for (const payer of payers) {
    // Use upsert with payerId as unique identifier (or name if no payerId)
    const existing = payer.payerId
      ? await prisma.insurancePayer.findFirst({ where: { payerId: payer.payerId } })
      : await prisma.insurancePayer.findFirst({ where: { name: payer.name } });

    if (!existing) {
      await prisma.insurancePayer.create({
        data: payer,
      });
    }
  }

  console.log(`   ✅ Seeded ${payers.length} common insurance payers`);
  console.log('✅ Insurance payers seeded successfully');
}

async function main() {
  console.log('🌱 Starting seed...');

  // Create test organization - Central Oregon Chiropractic
  const organization = await prisma.organization.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Central Oregon Chiropractic',
      subdomain: 'demo',
      settings: {
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        appointmentDuration: 30,
        address: {
          street: '1020 SW Indian Ave, Ste 100',
          city: 'Redmond',
          state: 'OR',
          zip: '97756',
        },
        phone: '(541) 923-6024',
        tagline: 'Gets You Back to Living',
      },
    },
  });

  console.log(`✅ Created organization: ${organization.name}`);

  // Hash password for admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create admin user - Front desk manager
  const adminUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'admin@centraloregonchiro.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'admin@centraloregonchiro.app',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Manager',
      role: Role.OWNER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create provider user - Dr. Kent Rookstool (Primary)
  const providerUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'dr.rookstool@centraloregonchiro.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'dr.rookstool@centraloregonchiro.app',
      passwordHash: await bcrypt.hash('provider123', 10),
      firstName: 'Kent',
      lastName: 'Rookstool',
      role: Role.PROVIDER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created provider user: ${providerUser.email}`);

  // Create second provider user - Dr. Jeffrey
  const providerUser2 = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'dr.jeffrey@centraloregonchiro.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'dr.jeffrey@centraloregonchiro.app',
      passwordHash: await bcrypt.hash('provider123', 10),
      firstName: 'Jeffrey',
      lastName: 'Physician',
      role: Role.PROVIDER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created provider user: ${providerUser2.email}`);

  // Create a staff user - Front desk
  const staffUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'frontdesk@centraloregonchiro.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'frontdesk@centraloregonchiro.app',
      passwordHash: await bcrypt.hash('staff123', 10),
      firstName: 'Lisa',
      lastName: 'Thompson',
      role: Role.STAFF,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created staff user: ${staffUser.email}`);

  // ============================================
  // PROVIDERS - Dr. Kent Rookstool & Dr. Jeffrey
  // ============================================
  console.log('👨‍⚕️ Creating Central Oregon Chiropractic providers...');

  const provider = await prisma.provider.upsert({
    where: {
      userId: providerUser.id,
    },
    update: {},
    create: {
      userId: providerUser.id,
      organizationId: organization.id,
      title: 'Dr.',
      specialty: 'Chiropractic',
      npiNumber: '1234567890',
      licenseNumber: 'DC-OR-12345',
      color: '#053e67', // Central Oregon Chiropractic dark blue
      isActive: true,
    },
  });

  console.log(`   ✅ Created provider: Dr. ${providerUser.firstName} ${providerUser.lastName}`);

  const provider2 = await prisma.provider.upsert({
    where: {
      userId: providerUser2.id,
    },
    update: {},
    create: {
      userId: providerUser2.id,
      organizationId: organization.id,
      title: 'Dr.',
      specialty: 'Chiropractic',
      npiNumber: '1234567891',
      licenseNumber: 'DC-OR-12346',
      color: '#c90000', // Central Oregon Chiropractic red accent
      isActive: true,
    },
  });

  console.log(`   ✅ Created provider: Dr. ${providerUser2.firstName} ${providerUser2.lastName}`);

  // ============================================
  // DEMO APPOINTMENT TYPES
  // ============================================
  console.log('📋 Creating DEMO appointment types...');

  const appointmentTypes = [
    { name: '[DEMO] New Patient Exam', code: 'NPE', duration: 45, color: '#10B981' },
    { name: '[DEMO] Follow-up Visit', code: 'FU', duration: 30, color: '#3B82F6' },
    { name: '[DEMO] Re-evaluation', code: 'RE', duration: 45, color: '#8B5CF6' },
    { name: '[DEMO] Adjustment Only', code: 'ADJ', duration: 15, color: '#F59E0B' },
  ];

  const createdAppointmentTypes: Record<string, { id: string }> = {};
  for (const apptType of appointmentTypes) {
    const created = await prisma.appointmentType.upsert({
      where: {
        code_organizationId: {
          code: apptType.code,
          organizationId: organization.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: apptType.name,
        code: apptType.code,
        duration: apptType.duration,
        color: apptType.color,
        isActive: true,
      },
    });
    createdAppointmentTypes[apptType.code] = created;
    console.log(`   ✅ Created appointment type: ${apptType.name}`);
  }

  // ============================================
  // DEMO PATIENTS - Clearly labeled as demo data
  // ============================================
  console.log('👥 Creating DEMO patients...');

  // Demo patients - Redmond, OR area with typical chiropractic presentations
  const demoPatients = [
    { firstName: '[DEMO] James', lastName: 'Peterson', dateOfBirth: new Date('1975-03-15'), gender: 'MALE' as const }, // Auto accident, neck pain
    { firstName: '[DEMO] Michelle', lastName: 'Reynolds', dateOfBirth: new Date('1988-07-22'), gender: 'FEMALE' as const }, // Pregnancy back pain
    { firstName: '[DEMO] Brandon', lastName: 'Miller', dateOfBirth: new Date('1982-11-08'), gender: 'MALE' as const }, // Workers comp, lifting injury
    { firstName: '[DEMO] Jessica', lastName: 'Henderson', dateOfBirth: new Date('1995-01-30'), gender: 'FEMALE' as const }, // Sports injury, volleyball
    { firstName: '[DEMO] Steven', lastName: 'Campbell', dateOfBirth: new Date('1958-05-12'), gender: 'MALE' as const }, // Chronic low back, golfer
    { firstName: '[DEMO] Heather', lastName: 'Wright', dateOfBirth: new Date('1990-09-18'), gender: 'FEMALE' as const }, // Desk worker, upper back
    { firstName: '[DEMO] Tyler', lastName: 'Hansen', dateOfBirth: new Date('2010-12-05'), gender: 'MALE' as const }, // Pediatric, sports
    { firstName: '[DEMO] Kimberly', lastName: 'Cooper', dateOfBirth: new Date('1985-04-25'), gender: 'FEMALE' as const }, // Sciatica
  ];

  const createdPatients: Array<{ id: string; mrn: string; firstName: string; lastName: string }> = [];
  for (let i = 0; i < demoPatients.length; i++) {
    const patientData = demoPatients[i];
    const mrn = `DEMO-${String(i + 1).padStart(5, '0')}`;

    // First create the patient
    const patient = await prisma.patient.upsert({
      where: {
        mrn_organizationId: {
          mrn: mrn,
          organizationId: organization.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        mrn: mrn,
        status: 'ACTIVE',
      },
    });

    // Then create or update the demographics
    await prisma.patientDemographics.upsert({
      where: {
        patientId: patient.id,
      },
      update: {},
      create: {
        patientId: patient.id,
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        dateOfBirth: patientData.dateOfBirth,
        gender: patientData.gender,
      },
    });

    createdPatients.push({
      id: patient.id,
      mrn: mrn,
      firstName: patientData.firstName,
      lastName: patientData.lastName,
    });
    console.log(`   ✅ Created patient: ${patientData.firstName} ${patientData.lastName} (MRN: ${mrn})`);
  }

  // ============================================
  // DEMO APPOINTMENTS - Today and upcoming
  // ============================================
  console.log('📅 Creating DEMO appointments...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to create appointment times
  const createTime = (daysFromNow: number, hour: number, minute: number = 0) => {
    const date = new Date(today);
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hour, minute, 0, 0);
    return date;
  };

  const demoAppointments = [
    // TODAY's appointments
    { patientIdx: 0, start: createTime(0, 9, 0), typeCode: 'FU', status: 'COMPLETED' as const, notes: '[DEMO] Morning follow-up', complaint: 'Lower back pain' },
    { patientIdx: 1, start: createTime(0, 10, 0), typeCode: 'NPE', status: 'CHECKED_IN' as const, notes: '[DEMO] New patient evaluation', complaint: 'Neck stiffness' },
    { patientIdx: 2, start: createTime(0, 11, 0), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Sports injury follow-up', complaint: 'Shoulder pain' },
    { patientIdx: 3, start: createTime(0, 14, 0), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Afternoon appointment', complaint: 'Mid-back pain' },
    { patientIdx: 4, start: createTime(0, 15, 30), typeCode: 'RE', status: 'SCHEDULED' as const, notes: '[DEMO] Progress check', complaint: 'Sciatica' },

    // TOMORROW's appointments
    { patientIdx: 5, start: createTime(1, 9, 0), typeCode: 'NPE', status: 'SCHEDULED' as const, notes: '[DEMO] New patient', complaint: 'Posture issues' },
    { patientIdx: 6, start: createTime(1, 10, 30), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Hip pain follow-up', complaint: 'Hip pain' },
    { patientIdx: 7, start: createTime(1, 14, 0), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Pregnancy care', complaint: 'Pregnancy back pain' },

    // THIS WEEK appointments
    { patientIdx: 0, start: createTime(2, 11, 0), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Back pain follow-up', complaint: 'Lower back pain' },
    { patientIdx: 1, start: createTime(3, 9, 30), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Neck progress check', complaint: 'Neck stiffness' },
    { patientIdx: 2, start: createTime(4, 14, 30), typeCode: 'FU', status: 'SCHEDULED' as const, notes: '[DEMO] Shoulder rehab', complaint: 'Shoulder pain' },

    // PAST appointments (for history)
    { patientIdx: 0, start: createTime(-1, 10, 0), typeCode: 'NPE', status: 'COMPLETED' as const, notes: '[DEMO] Initial evaluation', complaint: 'Lower back pain' },
    { patientIdx: 1, start: createTime(-3, 14, 0), typeCode: 'NPE', status: 'COMPLETED' as const, notes: '[DEMO] First visit', complaint: 'Neck stiffness' },
    { patientIdx: 4, start: createTime(-7, 9, 0), typeCode: 'NPE', status: 'COMPLETED' as const, notes: '[DEMO] Sciatica evaluation', complaint: 'Sciatica' },
    { patientIdx: 3, start: createTime(-2, 11, 0), typeCode: 'FU', status: 'NO_SHOW' as const, notes: '[DEMO] Patient did not arrive', complaint: 'Mid-back pain' },
  ];

  for (const apptData of demoAppointments) {
    const apptType = createdAppointmentTypes[apptData.typeCode];
    const endTime = new Date(apptData.start);
    endTime.setMinutes(endTime.getMinutes() + (apptData.typeCode === 'NPE' || apptData.typeCode === 'RE' ? 45 : 30));

    await prisma.appointment.create({
      data: {
        organizationId: organization.id,
        patientId: createdPatients[apptData.patientIdx].id,
        providerId: provider.id,
        appointmentTypeId: apptType.id,
        startTime: apptData.start,
        endTime: endTime,
        status: apptData.status,
        notes: apptData.notes,
        chiefComplaint: apptData.complaint,
      },
    });
  }

  console.log(`   ✅ Created ${demoAppointments.length} DEMO appointments`);

  // ============================================
  // DEMO ENCOUNTERS - For completed appointments
  // ============================================
  console.log('📝 Creating DEMO encounters...');

  const completedAppointments = await prisma.appointment.findMany({
    where: {
      organizationId: organization.id,
      status: 'COMPLETED',
    },
    include: {
      patient: {
        include: { demographics: true },
      },
    },
  });

  for (const appt of completedAppointments) {
    const encounter = await prisma.encounter.create({
      data: {
        organizationId: organization.id,
        patientId: appt.patientId,
        providerId: appt.providerId,
        appointmentId: appt.id,
        encounterType: 'FOLLOW_UP',
        status: 'COMPLETED',
        encounterDate: appt.startTime,
        chiefComplaint: appt.chiefComplaint,
        signedAt: new Date(),
        signedBy: provider.userId,
      },
    });

    // Create a SOAP note for the encounter
    const patientName = appt.patient.demographics?.firstName || 'Patient';
    await prisma.sOAPNote.create({
      data: {
        encounterId: encounter.id,
        subjective: `[DEMO] Patient ${patientName} presents with ${appt.chiefComplaint || 'complaint'}. Reports pain level 6/10.`,
        objective: '[DEMO] Posture: Mild forward head posture. Gait: Normal. ROM: Cervical flexion 40°, extension 45°. Palpation reveals tenderness at C5-C6.',
        assessment: '[DEMO] M54.2 - Cervicalgia; M99.01 - Segmental dysfunction, cervical region',
        plan: '[DEMO] CMT performed C3-C7. Continue 2x/week for 4 weeks. Home exercises: chin tucks, cervical stretches.',
        version: 1,
        isLocked: true,
      },
    });

    console.log(`   ✅ Created encounter for ${patientName}`);
  }

  // ============================================
  // DEMO CLAIMS - Billing data
  // ============================================
  console.log('💰 Creating DEMO claims...');

  const encounters = await prisma.encounter.findMany({
    where: {
      patient: {
        organizationId: organization.id,
      },
    },
    include: {
      patient: {
        include: { demographics: true },
      },
    },
  });

  for (const enc of encounters) {
    // Create charges for each encounter
    const charge = await prisma.charge.create({
      data: {
        organizationId: organization.id,
        patientId: enc.patientId,
        providerId: enc.providerId,
        encounterId: enc.id,
        serviceDate: enc.encounterDate,
        cptCode: '98941',
        description: '[DEMO] CMT 3-4 spinal regions',
        units: 1,
        fee: 75.00,
        balance: 15.00,
        status: 'BILLED',
      },
    });

    // Create claims
    const isPaid = Math.random() > 0.3;
    await prisma.claim.create({
      data: {
        organizationId: organization.id,
        patientId: enc.patientId,
        encounterId: enc.id,
        claimNumber: `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        status: isPaid ? 'PAID' : 'SUBMITTED',
        totalCharges: 75.00,
        totalPaid: isPaid ? 60.00 : 0,
        submittedDate: new Date(),
        paidDate: isPaid ? new Date() : null,
      },
    });

    console.log(`   ✅ Created claim for encounter ${enc.id}`);
  }

  console.log('   ✅ Created DEMO billing data');

  // Create initial audit log entry
  await prisma.auditLog.create({
    data: {
      action: 'SEED',
      entityType: 'System',
      entityId: null,
      changes: {
        description: 'Database seeded with initial data',
      },
      userId: adminUser.id,
      organizationId: organization.id,
    },
  });

  console.log('✅ Created initial audit log');

  // Seed form templates
  await seedFormTemplates(organization.id);

  // Seed SOAP note templates
  await seedSOAPNoteTemplates(organization.id);

  // Seed outcome assessment templates
  await seedAssessmentTemplates(organization.id);

  // Seed common ICD-10 and CPT codes
  await seedCommonCodes();

  // Seed common insurance payers
  await seedInsurancePayers();

  console.log('🎉 Seed completed successfully!');
  console.log('\n📋 Test credentials:');
  console.log('   Admin: admin@demo.chiroflow.app / admin123');
  console.log('   Provider: provider@demo.chiroflow.app / provider123');
  console.log('   Staff: staff@demo.chiroflow.app / staff123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
