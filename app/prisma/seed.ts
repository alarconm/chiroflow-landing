import { PrismaClient, Role, FormFieldType } from '@prisma/client';
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

async function main() {
  console.log('🌱 Starting seed...');

  // Create test organization
  const organization = await prisma.organization.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Chiropractic',
      subdomain: 'demo',
      settings: {
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        appointmentDuration: 30,
      },
    },
  });

  console.log(`✅ Created organization: ${organization.name}`);

  // Hash password for admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'admin@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'admin@demo.chiroflow.app',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.OWNER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create a provider user
  const providerUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'provider@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'provider@demo.chiroflow.app',
      passwordHash: await bcrypt.hash('provider123', 10),
      firstName: 'Dr. Jane',
      lastName: 'Smith',
      role: Role.PROVIDER,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created provider user: ${providerUser.email}`);

  // Create a staff user
  const staffUser = await prisma.user.upsert({
    where: {
      email_organizationId: {
        email: 'staff@demo.chiroflow.app',
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      email: 'staff@demo.chiroflow.app',
      passwordHash: await bcrypt.hash('staff123', 10),
      firstName: 'John',
      lastName: 'Doe',
      role: Role.STAFF,
      organizationId: organization.id,
    },
  });

  console.log(`✅ Created staff user: ${staffUser.email}`);

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
