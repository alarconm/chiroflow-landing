/**
 * AI Clinical Decision Support Agent Router (Epic 39)
 *
 * Provides real-time clinical decision support including:
 * - Diagnosis suggestions based on symptoms and findings
 * - Treatment recommendations with evidence-based guidance
 * - Contraindication alerts for patient safety
 * - Clinical guidelines integration
 * - Outcome prediction and referral recommendations
 */

import { z } from 'zod';
import { router, providerProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { env } from '@/lib/env';
import type { Prisma } from '@prisma/client';

// ============================================
// Constants and Types
// ============================================

// Common chiropractic red flags
const RED_FLAGS = {
  // Serious spinal pathology indicators
  cauda_equina: {
    keywords: ['bladder dysfunction', 'bowel dysfunction', 'saddle anesthesia', 'bilateral leg weakness', 'urinary retention', 'fecal incontinence'],
    severity: 'CRITICAL' as const,
    message: 'URGENT: Potential cauda equina syndrome. Immediate referral required.',
    recommendation: 'Immediate emergency department referral for MRI and surgical consultation.',
  },
  malignancy: {
    keywords: ['unexplained weight loss', 'history of cancer', 'night pain', 'progressive symptoms', 'age over 50 with new onset'],
    severity: 'HIGH' as const,
    message: 'Red flag for potential malignancy. Further investigation needed.',
    recommendation: 'Consider imaging and laboratory workup. Refer to oncology if suspicion persists.',
  },
  fracture: {
    keywords: ['trauma', 'osteoporosis', 'steroid use', 'severe pain', 'point tenderness'],
    severity: 'HIGH' as const,
    message: 'Potential fracture risk. Imaging recommended before manipulation.',
    recommendation: 'X-ray or advanced imaging before proceeding with spinal manipulation.',
  },
  infection: {
    keywords: ['fever', 'recent infection', 'immunocompromised', 'iv drug use', 'night sweats', 'chills'],
    severity: 'HIGH' as const,
    message: 'Red flag for potential spinal infection.',
    recommendation: 'Consider laboratory workup (CBC, ESR, CRP) and imaging. Refer to primary care.',
  },
  vascular: {
    keywords: ['tearing pain', 'pulsatile mass', 'history of vascular disease', 'abdominal aneurysm'],
    severity: 'CRITICAL' as const,
    message: 'URGENT: Potential vascular emergency.',
    recommendation: 'Immediate emergency department referral for vascular evaluation.',
  },
  cervical_artery: {
    keywords: ['dizziness with neck movement', 'vertigo', 'diplopia', 'dysarthria', 'dysphagia', 'drop attacks', 'nystagmus'],
    severity: 'HIGH' as const,
    message: 'Cervical artery dysfunction risk factors present.',
    recommendation: 'Perform cervical artery screening tests. Consider modified treatment approach.',
  },
};

// Common chiropractic ICD-10 codes with descriptions
const CHIRO_ICD10_CODES = [
  { code: 'M54.5', description: 'Low back pain', region: 'lumbar', common: true },
  { code: 'M54.50', description: 'Low back pain, unspecified', region: 'lumbar', common: true },
  { code: 'M54.51', description: 'Vertebrogenic low back pain', region: 'lumbar', common: true },
  { code: 'M54.2', description: 'Cervicalgia', region: 'cervical', common: true },
  { code: 'M54.6', description: 'Pain in thoracic spine', region: 'thoracic', common: true },
  { code: 'M54.9', description: 'Dorsalgia, unspecified', region: 'general', common: true },
  { code: 'M99.01', description: 'Segmental and somatic dysfunction of cervical region', region: 'cervical', common: true },
  { code: 'M99.02', description: 'Segmental and somatic dysfunction of thoracic region', region: 'thoracic', common: true },
  { code: 'M99.03', description: 'Segmental and somatic dysfunction of lumbar region', region: 'lumbar', common: true },
  { code: 'M99.04', description: 'Segmental and somatic dysfunction of sacral region', region: 'sacral', common: true },
  { code: 'M99.05', description: 'Segmental and somatic dysfunction of pelvic region', region: 'pelvic', common: true },
  { code: 'M53.0', description: 'Cervicocranial syndrome', region: 'cervical', common: true },
  { code: 'M53.1', description: 'Cervicobrachial syndrome', region: 'cervical', common: true },
  { code: 'M53.2X1', description: 'Spinal instability, occipito-atlanto-axial region', region: 'cervical', common: false },
  { code: 'M47.812', description: 'Spondylosis without myelopathy, cervical region', region: 'cervical', common: true },
  { code: 'M47.816', description: 'Spondylosis without myelopathy, lumbar region', region: 'lumbar', common: true },
  { code: 'M51.16', description: 'Intervertebral disc degeneration, lumbar region', region: 'lumbar', common: true },
  { code: 'M51.26', description: 'Other intervertebral disc degeneration, lumbar region', region: 'lumbar', common: true },
  { code: 'G89.29', description: 'Other chronic pain', region: 'general', common: true },
  { code: 'M62.830', description: 'Muscle spasm of back', region: 'general', common: true },
  { code: 'M79.3', description: 'Panniculitis, unspecified', region: 'general', common: false },
  { code: 'S13.4XXA', description: 'Sprain of ligaments of cervical spine, initial encounter', region: 'cervical', common: true },
  { code: 'S33.5XXA', description: 'Sprain of ligaments of lumbar spine, initial encounter', region: 'lumbar', common: true },
  { code: 'M79.1', description: 'Myalgia, unspecified', region: 'general', common: true },
  { code: 'R51.9', description: 'Headache, unspecified', region: 'cervical', common: true },
  { code: 'M54.41', description: 'Lumbago with sciatica, right side', region: 'lumbar', common: true },
  { code: 'M54.42', description: 'Lumbago with sciatica, left side', region: 'lumbar', common: true },
];

// Evidence level schema
const evidenceLevelSchema = z.enum(['HIGH', 'MODERATE', 'LOW', 'VERY_LOW', 'EXPERT']);

// ============================================
// US-373: Treatment Recommendation Constants
// ============================================

// Chiropractic technique database
const CHIRO_TECHNIQUES = [
  { name: 'Diversified Technique', category: 'manual', description: 'High-velocity, low-amplitude thrusts to restore joint movement', evidence: 'HIGH' as const },
  { name: 'Gonstead Technique', category: 'manual', description: 'Specific adjustments using detailed analysis and X-rays', evidence: 'MODERATE' as const },
  { name: 'Activator Method', category: 'instrument', description: 'Low-force mechanical instrument adjusting', evidence: 'HIGH' as const },
  { name: 'Thompson Drop Technique', category: 'manual', description: 'Drop table assists adjustment with gravity', evidence: 'MODERATE' as const },
  { name: 'Flexion-Distraction', category: 'manual', description: 'Gentle stretching for disc conditions', evidence: 'HIGH' as const },
  { name: 'Cox Flexion-Distraction', category: 'manual', description: 'Specialized technique for disc herniation', evidence: 'HIGH' as const },
  { name: 'SOT (Sacro-Occipital Technique)', category: 'manual', description: 'Focuses on relationship between sacrum and occiput', evidence: 'MODERATE' as const },
  { name: 'Toggle Recoil', category: 'manual', description: 'Upper cervical specific adjustment', evidence: 'LOW' as const },
  { name: 'NUCCA', category: 'manual', description: 'Precise upper cervical adjustment', evidence: 'MODERATE' as const },
  { name: 'ART (Active Release Technique)', category: 'soft_tissue', description: 'Soft tissue treatment for adhesions', evidence: 'HIGH' as const },
  { name: 'Graston Technique', category: 'instrument', description: 'Instrument-assisted soft tissue mobilization', evidence: 'HIGH' as const },
  { name: 'Myofascial Release', category: 'soft_tissue', description: 'Manual therapy for fascial restrictions', evidence: 'MODERATE' as const },
  { name: 'Trigger Point Therapy', category: 'soft_tissue', description: 'Targets myofascial trigger points', evidence: 'HIGH' as const },
  { name: 'Electrical Muscle Stimulation', category: 'therapy', description: 'EMS for pain and muscle activation', evidence: 'MODERATE' as const },
  { name: 'Ultrasound Therapy', category: 'therapy', description: 'Deep tissue heating for healing', evidence: 'MODERATE' as const },
  { name: 'Cold Laser Therapy', category: 'therapy', description: 'Low-level laser for tissue healing', evidence: 'MODERATE' as const },
  { name: 'Spinal Decompression', category: 'therapy', description: 'Mechanical traction for disc conditions', evidence: 'MODERATE' as const },
  { name: 'Kinesio Taping', category: 'adjunct', description: 'Elastic therapeutic taping', evidence: 'LOW' as const },
  { name: 'McKenzie Method', category: 'exercise', description: 'Directional preference exercises', evidence: 'HIGH' as const },
  { name: 'Stabilization Exercises', category: 'exercise', description: 'Core and spinal stabilization', evidence: 'HIGH' as const },
];

// Treatment frequency guidelines based on condition acuity
const FREQUENCY_GUIDELINES = {
  acute: {
    initial: '3x/week for 2-4 weeks',
    transition: '2x/week for 2-4 weeks',
    maintenance: '1x/week as needed',
    totalVisits: '12-24 visits over 6-12 weeks',
  },
  subacute: {
    initial: '2-3x/week for 2-4 weeks',
    transition: '1-2x/week for 4-6 weeks',
    maintenance: '1x/2 weeks or PRN',
    totalVisits: '10-18 visits over 8-12 weeks',
  },
  chronic: {
    initial: '2x/week for 4-6 weeks',
    transition: '1x/week for 4-8 weeks',
    maintenance: '1-2x/month ongoing',
    totalVisits: '16-24+ visits, ongoing management',
  },
  wellness: {
    initial: 'N/A',
    transition: 'N/A',
    maintenance: '1x/month to 1x/quarter',
    totalVisits: 'Ongoing wellness care',
  },
};

// Condition-specific treatment protocols
interface TreatmentProtocol {
  condition: string;
  icdCodes: string[];
  primaryTechniques: string[];
  adjunctTherapies: string[];
  exercises: string[];
  expectedOutcome: string;
  typicalDuration: string;
  prognosis: string;
  evidence: 'HIGH' | 'MODERATE' | 'LOW';
  alternatives: string[];
  contraindications: string[];
}

const TREATMENT_PROTOCOLS: TreatmentProtocol[] = [
  {
    condition: 'Acute Low Back Pain',
    icdCodes: ['M54.5', 'M54.50', 'M54.51'],
    primaryTechniques: ['Diversified Technique', 'Flexion-Distraction', 'Activator Method'],
    adjunctTherapies: ['Electrical Muscle Stimulation', 'Cold/Ice Therapy', 'Myofascial Release'],
    exercises: ['McKenzie Method', 'Stabilization Exercises', 'Walking Program'],
    expectedOutcome: 'Significant pain reduction (50%+) within 2-4 weeks; full recovery expected for most patients',
    typicalDuration: '4-8 weeks',
    prognosis: 'Excellent - 90% of acute LBP resolves within 6-8 weeks with appropriate care',
    evidence: 'HIGH',
    alternatives: ['Physical therapy referral', 'Medication management', 'Acupuncture'],
    contraindications: ['Cauda equina syndrome', 'Fracture', 'Infection', 'Malignancy'],
  },
  {
    condition: 'Chronic Low Back Pain',
    icdCodes: ['M54.5', 'M54.50', 'G89.29'],
    primaryTechniques: ['Flexion-Distraction', 'Cox Flexion-Distraction', 'Diversified Technique'],
    adjunctTherapies: ['Spinal Decompression', 'Myofascial Release', 'Trigger Point Therapy'],
    exercises: ['Stabilization Exercises', 'McKenzie Method', 'Aquatic Therapy'],
    expectedOutcome: 'Gradual improvement over 8-12 weeks; focus on functional improvement and pain management',
    typicalDuration: '12+ weeks with ongoing maintenance',
    prognosis: 'Good with consistent care - expect 30-50% improvement in pain/function',
    evidence: 'HIGH',
    alternatives: ['Multidisciplinary pain management', 'Cognitive behavioral therapy', 'Surgical consultation if indicated'],
    contraindications: ['Progressive neurological deficit', 'Severe spinal stenosis requiring surgery'],
  },
  {
    condition: 'Cervicalgia (Neck Pain)',
    icdCodes: ['M54.2'],
    primaryTechniques: ['Diversified Technique', 'Activator Method', 'NUCCA'],
    adjunctTherapies: ['ART (Active Release Technique)', 'Trigger Point Therapy', 'Electrical Muscle Stimulation'],
    exercises: ['Cervical Stabilization', 'Postural Exercises', 'Chin Tucks'],
    expectedOutcome: 'Pain reduction within 2-4 weeks; improved range of motion',
    typicalDuration: '4-8 weeks',
    prognosis: 'Good - most mechanical neck pain responds well to chiropractic care',
    evidence: 'HIGH',
    alternatives: ['Physical therapy', 'Massage therapy', 'Ergonomic modifications'],
    contraindications: ['Cervical fracture', 'Severe osteoporosis', 'Vertebral artery dissection risk'],
  },
  {
    condition: 'Thoracic Spine Pain',
    icdCodes: ['M54.6'],
    primaryTechniques: ['Diversified Technique', 'Thompson Drop Technique', 'Graston Technique'],
    adjunctTherapies: ['Myofascial Release', 'Trigger Point Therapy', 'Ultrasound Therapy'],
    exercises: ['Thoracic Extension Exercises', 'Foam Rolling', 'Postural Correction'],
    expectedOutcome: 'Improvement within 2-4 weeks with appropriate management',
    typicalDuration: '4-6 weeks',
    prognosis: 'Good - thoracic pain typically responds well to conservative care',
    evidence: 'MODERATE',
    alternatives: ['Physical therapy', 'Massage therapy', 'Yoga/Pilates'],
    contraindications: ['Rib fracture', 'Thoracic disc herniation with myelopathy'],
  },
  {
    condition: 'Lumbar Disc Herniation',
    icdCodes: ['M51.16', 'M51.26', 'M54.41', 'M54.42'],
    primaryTechniques: ['Cox Flexion-Distraction', 'Flexion-Distraction', 'Activator Method'],
    adjunctTherapies: ['Spinal Decompression', 'Cold Laser Therapy', 'Electrical Muscle Stimulation'],
    exercises: ['McKenzie Method', 'Core Stabilization', 'Nerve Gliding Exercises'],
    expectedOutcome: 'Gradual improvement over 6-12 weeks; reduction in radicular symptoms',
    typicalDuration: '8-12 weeks',
    prognosis: 'Good - 80%+ of disc herniations improve with conservative care',
    evidence: 'HIGH',
    alternatives: ['Epidural steroid injection', 'Physical therapy', 'Surgical consultation if progressive deficit'],
    contraindications: ['Cauda equina syndrome', 'Progressive neurological deficit', 'Severe motor weakness'],
  },
  {
    condition: 'Cervicogenic Headache',
    icdCodes: ['R51.9', 'M53.0'],
    primaryTechniques: ['NUCCA', 'Diversified Technique', 'Activator Method'],
    adjunctTherapies: ['ART (Active Release Technique)', 'Trigger Point Therapy', 'Myofascial Release'],
    exercises: ['Cervical Stabilization', 'Postural Correction', 'Stress Management'],
    expectedOutcome: 'Reduced headache frequency and intensity within 4-6 weeks',
    typicalDuration: '6-8 weeks',
    prognosis: 'Good - cervicogenic headaches respond well to cervical manipulation',
    evidence: 'HIGH',
    alternatives: ['Medication management', 'Physical therapy', 'Neurologist referral if atypical'],
    contraindications: ['Vertebrobasilar insufficiency', 'Cervical artery dissection risk factors'],
  },
  {
    condition: 'Segmental Dysfunction',
    icdCodes: ['M99.01', 'M99.02', 'M99.03', 'M99.04', 'M99.05'],
    primaryTechniques: ['Diversified Technique', 'Gonstead Technique', 'Thompson Drop Technique'],
    adjunctTherapies: ['Myofascial Release', 'Trigger Point Therapy'],
    exercises: ['Mobility Exercises', 'Stabilization Exercises', 'Stretching Program'],
    expectedOutcome: 'Improved joint mobility and reduced pain within 2-4 weeks',
    typicalDuration: '4-6 weeks',
    prognosis: 'Excellent - segmental dysfunction typically responds quickly to adjustment',
    evidence: 'MODERATE',
    alternatives: ['Physical therapy', 'Osteopathic manipulation'],
    contraindications: ['Fracture', 'Severe osteoporosis', 'Active infection'],
  },
  {
    condition: 'Muscle Spasm',
    icdCodes: ['M62.830', 'M79.1'],
    primaryTechniques: ['Diversified Technique', 'ART (Active Release Technique)', 'Trigger Point Therapy'],
    adjunctTherapies: ['Electrical Muscle Stimulation', 'Ultrasound Therapy', 'Cold/Heat Therapy'],
    exercises: ['Stretching Program', 'Foam Rolling', 'Strengthening'],
    expectedOutcome: 'Rapid relief within 1-2 weeks',
    typicalDuration: '2-4 weeks',
    prognosis: 'Excellent - muscle spasms typically resolve quickly with treatment',
    evidence: 'MODERATE',
    alternatives: ['Massage therapy', 'Muscle relaxants', 'Rest and ice'],
    contraindications: ['None specific to muscle spasm'],
  },
  {
    condition: 'Spondylosis',
    icdCodes: ['M47.812', 'M47.816'],
    primaryTechniques: ['Activator Method', 'Flexion-Distraction', 'Thompson Drop Technique'],
    adjunctTherapies: ['Myofascial Release', 'Cold Laser Therapy', 'Ultrasound Therapy'],
    exercises: ['Range of Motion Exercises', 'Core Stabilization', 'Low-Impact Aerobic Exercise'],
    expectedOutcome: 'Symptom management and functional improvement; degenerative changes are managed, not reversed',
    typicalDuration: 'Ongoing management',
    prognosis: 'Fair to Good - focus on symptom management and maintaining function',
    evidence: 'MODERATE',
    alternatives: ['Physical therapy', 'Anti-inflammatory medication', 'Injection therapy'],
    contraindications: ['Severe spinal stenosis', 'Myelopathy', 'Severe instability'],
  },
  {
    condition: 'Sprain/Strain (Cervical)',
    icdCodes: ['S13.4XXA'],
    primaryTechniques: ['Activator Method', 'Diversified Technique', 'ART (Active Release Technique)'],
    adjunctTherapies: ['Electrical Muscle Stimulation', 'Cold Therapy', 'Kinesio Taping'],
    exercises: ['Gentle Range of Motion', 'Isometric Strengthening', 'Postural Exercises'],
    expectedOutcome: 'Pain reduction and return to function within 4-8 weeks',
    typicalDuration: '4-8 weeks',
    prognosis: 'Good - most sprains/strains heal with appropriate care',
    evidence: 'MODERATE',
    alternatives: ['Physical therapy', 'Massage therapy', 'Rest and ice'],
    contraindications: ['Fracture', 'Ligamentous instability', 'Vascular injury'],
  },
  {
    condition: 'Sprain/Strain (Lumbar)',
    icdCodes: ['S33.5XXA'],
    primaryTechniques: ['Diversified Technique', 'Flexion-Distraction', 'Thompson Drop Technique'],
    adjunctTherapies: ['Electrical Muscle Stimulation', 'Cold/Heat Therapy', 'Myofascial Release'],
    exercises: ['McKenzie Method', 'Core Stabilization', 'Walking Program'],
    expectedOutcome: 'Pain reduction within 2-4 weeks; full recovery expected',
    typicalDuration: '4-6 weeks',
    prognosis: 'Good to Excellent - most lumbar sprains/strains heal well',
    evidence: 'MODERATE',
    alternatives: ['Physical therapy', 'Massage therapy', 'Short-term medication'],
    contraindications: ['Fracture', 'Severe ligament tear', 'Cauda equina symptoms'],
  },
];

// Patient preference considerations
const PATIENT_PREFERENCES = {
  lowForce: {
    techniques: ['Activator Method', 'SOT (Sacro-Occipital Technique)', 'Toggle Recoil'],
    reason: 'Patient prefers gentle, low-force adjustments',
  },
  noManual: {
    techniques: ['Activator Method', 'Electrical Muscle Stimulation', 'Cold Laser Therapy', 'Spinal Decompression'],
    reason: 'Patient prefers instrument-assisted or passive therapies',
  },
  activeInvolvement: {
    techniques: ['McKenzie Method', 'Stabilization Exercises', 'ART (Active Release Technique)'],
    reason: 'Patient wants active involvement in their care',
  },
  quickVisits: {
    techniques: ['Activator Method', 'Diversified Technique'],
    reason: 'Patient prefers shorter treatment sessions',
  },
};

// ============================================
// US-374: Contraindication Alert Constants
// ============================================

// Contraindication type definitions
type ContraindicationSeverity = 'ABSOLUTE' | 'RELATIVE' | 'PRECAUTION';
type AlertSeverityLevel = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

interface ContraindicationRule {
  id: string;
  name: string;
  type: ContraindicationSeverity;
  alertSeverity: AlertSeverityLevel;
  affectedProcedures: string[]; // Which procedures are contraindicated
  source: 'condition' | 'medication' | 'age' | 'surgery' | 'trauma' | 'red_flag' | 'general';
  keywords: string[];
  reason: string;
  recommendation: string;
  overridable: boolean;
  documentationRequired: boolean;
  reviewPeriod?: number; // Days until review if applicable
}

// Comprehensive contraindication rules database
const CONTRAINDICATION_RULES: ContraindicationRule[] = [
  // ==========================================
  // ABSOLUTE CONTRAINDICATIONS (Never perform)
  // ==========================================
  {
    id: 'ci-cauda-equina',
    name: 'Cauda Equina Syndrome',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Flexion-Distraction', 'Thompson Drop Technique', 'Toggle Recoil', 'NUCCA'],
    source: 'red_flag',
    keywords: ['cauda equina', 'bladder dysfunction', 'bowel dysfunction', 'saddle anesthesia', 'bilateral leg weakness', 'urinary retention', 'fecal incontinence'],
    reason: 'Cauda equina syndrome is a surgical emergency. Spinal manipulation is absolutely contraindicated.',
    recommendation: 'URGENT: Immediate emergency department referral for MRI and surgical consultation. Do not perform any spinal manipulation.',
    overridable: false,
    documentationRequired: true,
  },
  {
    id: 'ci-spinal-fracture',
    name: 'Acute Spinal Fracture',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Flexion-Distraction', 'Thompson Drop Technique', 'Toggle Recoil', 'NUCCA'],
    source: 'trauma',
    keywords: ['spinal fracture', 'vertebral fracture', 'compression fracture', 'burst fracture', 'unstable fracture'],
    reason: 'Spinal manipulation of unstable or acute fractures can cause neurological damage.',
    recommendation: 'Obtain imaging to rule out fracture before any manipulation. Refer to orthopedics or neurosurgery if fracture confirmed.',
    overridable: false,
    documentationRequired: true,
  },
  {
    id: 'ci-spinal-infection',
    name: 'Spinal Infection (Osteomyelitis/Discitis)',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Flexion-Distraction', 'Thompson Drop Technique'],
    source: 'condition',
    keywords: ['spinal infection', 'osteomyelitis', 'discitis', 'epidural abscess', 'vertebral osteomyelitis'],
    reason: 'Active spinal infection requires medical management. Manipulation can spread infection.',
    recommendation: 'Refer to infectious disease or primary care immediately. Monitor for fever, elevated ESR/CRP.',
    overridable: false,
    documentationRequired: true,
  },
  {
    id: 'ci-spinal-malignancy',
    name: 'Spinal Malignancy/Metastasis',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Flexion-Distraction', 'Thompson Drop Technique'],
    source: 'condition',
    keywords: ['spinal tumor', 'vertebral metastasis', 'spinal cancer', 'bone cancer', 'metastatic disease'],
    reason: 'Pathological bone weakness from tumor can cause fracture with manipulation.',
    recommendation: 'Refer to oncology. Imaging required before any manual therapy on affected region.',
    overridable: false,
    documentationRequired: true,
  },
  {
    id: 'ci-vascular-emergency',
    name: 'Vascular Emergency (AAA/Dissection)',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'All Manual Therapies'],
    source: 'red_flag',
    keywords: ['abdominal aortic aneurysm', 'aaa', 'aortic dissection', 'tearing pain', 'pulsatile mass'],
    reason: 'Vascular emergencies require immediate surgical intervention. Manipulation could be fatal.',
    recommendation: 'CALL 911. Immediate emergency department referral for vascular evaluation.',
    overridable: false,
    documentationRequired: true,
  },
  {
    id: 'ci-cervical-instability',
    name: 'Severe Cervical Instability',
    type: 'ABSOLUTE',
    alertSeverity: 'CRITICAL',
    affectedProcedures: ['Cervical Manipulation', 'Diversified Technique', 'NUCCA', 'Toggle Recoil', 'Gonstead Technique'],
    source: 'condition',
    keywords: ['atlantoaxial instability', 'os odontoideum', 'dens fracture', 'c1-c2 instability', 'down syndrome cervical', 'rheumatoid arthritis cervical'],
    reason: 'Cervical instability with manipulation can cause spinal cord injury.',
    recommendation: 'Flexion-extension X-rays required. Neurosurgical consultation if instability confirmed.',
    overridable: false,
    documentationRequired: true,
  },

  // ==========================================
  // HIGH SEVERITY RELATIVE CONTRAINDICATIONS
  // ==========================================
  {
    id: 'ci-anticoagulation',
    name: 'Anticoagulation Therapy',
    type: 'RELATIVE',
    alertSeverity: 'HIGH',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique', 'Gonstead Technique'],
    source: 'medication',
    keywords: ['warfarin', 'coumadin', 'eliquis', 'xarelto', 'apixaban', 'rivaroxaban', 'heparin', 'blood thinner', 'anticoagulant'],
    reason: 'Increased bleeding risk with manipulation. Higher risk of spinal hematoma or vertebral artery dissection.',
    recommendation: 'Use low-force techniques only. Check INR if on warfarin. Consider Activator Method or soft tissue techniques.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 30,
  },
  {
    id: 'ci-severe-osteoporosis',
    name: 'Severe Osteoporosis',
    type: 'RELATIVE',
    alertSeverity: 'HIGH',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Thompson Drop Technique'],
    source: 'condition',
    keywords: ['severe osteoporosis', 'osteoporotic fracture', 't-score below -3', 'pathological fracture', 'bone density severe'],
    reason: 'High risk of pathological fracture with manipulation forces.',
    recommendation: 'Use only low-force techniques (Activator, SOT). Review DEXA scan results. Consider soft tissue therapy only.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 90,
  },
  {
    id: 'ci-vertebral-artery-risk',
    name: 'Vertebrobasilar Insufficiency Risk',
    type: 'RELATIVE',
    alertSeverity: 'HIGH',
    affectedProcedures: ['Cervical Rotation Manipulation', 'Diversified Technique', 'Gonstead Technique'],
    source: 'condition',
    keywords: ['vertebral artery', 'vbi', 'vertebrobasilar insufficiency', 'dizziness with neck movement', 'drop attacks', 'dysarthria', 'diplopia', 'nystagmus'],
    reason: 'Increased risk of vertebral artery dissection with cervical rotation.',
    recommendation: 'Perform VBI screening tests. Avoid rotational cervical manipulation. Use modified techniques or flexion-only approaches.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 30,
  },
  {
    id: 'ci-recent-surgery',
    name: 'Recent Spinal Surgery',
    type: 'RELATIVE',
    alertSeverity: 'HIGH',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Gonstead Technique', 'Flexion-Distraction'],
    source: 'surgery',
    keywords: ['recent surgery', 'spinal fusion', 'laminectomy', 'discectomy', 'post-surgical', 'hardware', 'spinal surgery'],
    reason: 'Surgical sites need time to heal. Hardware may be present.',
    recommendation: 'Obtain surgical clearance. Wait minimum 6-12 weeks post-surgery. Avoid manipulation at surgical level.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 90,
  },
  {
    id: 'ci-progressive-neuro',
    name: 'Progressive Neurological Deficit',
    type: 'RELATIVE',
    alertSeverity: 'HIGH',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique', 'Flexion-Distraction'],
    source: 'red_flag',
    keywords: ['progressive weakness', 'worsening numbness', 'increasing deficit', 'myelopathy', 'progressive neuro'],
    reason: 'Progressive deficits may indicate cord compression requiring surgical intervention.',
    recommendation: 'Immediate neurological referral. MRI indicated. Hold manipulation until cleared.',
    overridable: true,
    documentationRequired: true,
  },

  // ==========================================
  // MODERATE SEVERITY CONTRAINDICATIONS
  // ==========================================
  {
    id: 'ci-mild-osteoporosis',
    name: 'Mild-Moderate Osteoporosis',
    type: 'RELATIVE',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique'],
    source: 'condition',
    keywords: ['osteoporosis', 'osteopenia', 'low bone density', 't-score -2'],
    reason: 'Reduced bone density increases fracture risk with high-force techniques.',
    recommendation: 'Use modified or low-force techniques. Consider Activator Method. Monitor closely.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 180,
  },
  {
    id: 'ci-pregnancy',
    name: 'Pregnancy',
    type: 'PRECAUTION',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['Prone Positioning', 'High-Force Lumbar Manipulation', 'Flexion-Distraction'],
    source: 'condition',
    keywords: ['pregnant', 'pregnancy', 'expecting', 'gestation'],
    reason: 'Positioning modifications needed. Some techniques require adjustment.',
    recommendation: 'Use pregnancy-modified techniques. Side-posture or specialized pregnancy pillows. Avoid deep abdominal pressure.',
    overridable: true,
    documentationRequired: true,
  },
  {
    id: 'ci-steroid-use',
    name: 'Long-term Corticosteroid Use',
    type: 'RELATIVE',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique'],
    source: 'medication',
    keywords: ['prednisone', 'corticosteroid', 'steroid use', 'long-term steroids', 'chronic steroid'],
    reason: 'Chronic steroid use can cause bone weakening and increased fracture risk.',
    recommendation: 'Use low-force techniques. Consider DEXA scan if not recent. Monitor for osteoporosis.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 90,
  },
  {
    id: 'ci-recent-trauma',
    name: 'Recent Significant Trauma',
    type: 'RELATIVE',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['Spinal Manipulation', 'Diversified Technique'],
    source: 'trauma',
    keywords: ['recent trauma', 'car accident', 'fall', 'injury', 'mva', 'motor vehicle accident'],
    reason: 'Recent trauma requires imaging to rule out occult fracture before manipulation.',
    recommendation: 'Obtain X-rays or appropriate imaging before manipulation. Use conservative approach initially.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 14,
  },
  {
    id: 'ci-inflammatory-arthritis',
    name: 'Inflammatory Arthritis (RA, AS)',
    type: 'RELATIVE',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['Cervical Manipulation', 'High-Velocity Manipulation'],
    source: 'condition',
    keywords: ['rheumatoid arthritis', 'ankylosing spondylitis', 'inflammatory arthritis', 'psoriatic arthritis', 'ra cervical'],
    reason: 'Inflammatory conditions can cause ligamentous laxity and joint instability.',
    recommendation: 'Screen for cervical involvement in RA. Use low-force techniques. Flexion-extension films if cervical work needed.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 90,
  },
  {
    id: 'ci-connective-tissue',
    name: 'Connective Tissue Disorder',
    type: 'RELATIVE',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique'],
    source: 'condition',
    keywords: ['ehlers-danlos', 'marfan syndrome', 'hypermobility', 'connective tissue disorder', 'joint hypermobility'],
    reason: 'Increased risk of joint injury and vascular complications.',
    recommendation: 'Use low-force techniques only. Focus on stabilization exercises. Avoid repeated manipulation.',
    overridable: true,
    documentationRequired: true,
    reviewPeriod: 90,
  },

  // ==========================================
  // AGE-SPECIFIC PRECAUTIONS
  // ==========================================
  {
    id: 'ci-elderly-general',
    name: 'Advanced Age (>75)',
    type: 'PRECAUTION',
    alertSeverity: 'MODERATE',
    affectedProcedures: ['High-Velocity Manipulation', 'Diversified Technique'],
    source: 'age',
    keywords: [],
    reason: 'Elderly patients have higher risk of osteoporosis and vascular complications.',
    recommendation: 'Screen for osteoporosis. Use low-force techniques. Consider Activator Method or soft tissue focus.',
    overridable: true,
    documentationRequired: false,
    reviewPeriod: 30,
  },
  {
    id: 'ci-pediatric-cervical',
    name: 'Pediatric Patient (<12) - Cervical',
    type: 'PRECAUTION',
    alertSeverity: 'LOW',
    affectedProcedures: ['Cervical Manipulation', 'High-Velocity Cervical Adjustment'],
    source: 'age',
    keywords: [],
    reason: 'Pediatric cervical spine has different biomechanics. Extra care required.',
    recommendation: 'Use pediatric-specific techniques. Lower force. Parental consent required. Consider specialized training.',
    overridable: true,
    documentationRequired: true,
  },

  // ==========================================
  // MEDICATION INTERACTIONS
  // ==========================================
  {
    id: 'ci-nsaid-bleeding',
    name: 'High-Dose NSAIDs',
    type: 'PRECAUTION',
    alertSeverity: 'LOW',
    affectedProcedures: ['Deep Tissue Massage', 'Aggressive Soft Tissue Work'],
    source: 'medication',
    keywords: ['nsaid', 'ibuprofen', 'naproxen', 'aspirin', 'high dose'],
    reason: 'NSAIDs can increase bruising and bleeding risk with aggressive soft tissue work.',
    recommendation: 'Use moderate pressure. Be aware of increased bruising risk. Inform patient.',
    overridable: true,
    documentationRequired: false,
  },
  {
    id: 'ci-muscle-relaxant',
    name: 'Muscle Relaxants',
    type: 'PRECAUTION',
    alertSeverity: 'LOW',
    affectedProcedures: ['Spinal Manipulation'],
    source: 'medication',
    keywords: ['muscle relaxant', 'flexeril', 'soma', 'baclofen', 'cyclobenzaprine', 'carisoprodol'],
    reason: 'Muscle relaxants may mask protective muscle guarding.',
    recommendation: 'Use lower force. Be aware patient may not guard normally. Proceed with caution.',
    overridable: true,
    documentationRequired: false,
  },
];

// ============================================
// US-375: Clinical Guidelines Database
// ============================================

// Built-in chiropractic clinical practice guidelines
interface ClinicalGuidelineData {
  code: string;
  name: string;
  source: string;
  version: string;
  condition: string;
  conditionCodes: string[];
  applicableRegions: string[];
  summary: string;
  recommendations: Array<{
    level: string;
    text: string;
    gradeOfRecommendation: 'A' | 'B' | 'C' | 'D' | 'I';
    strengthOfEvidence: 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';
  }>;
  evidenceLevel: 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW' | 'EXPERT';
  evidenceSummary: string;
  keyPoints: string[];
  redFlags: string[];
  referralCriteria: string[];
  contraindications: string[];
  precautions: string[];
  publicationDate: Date;
  citation: string;
  externalUrl?: string;
}

const CHIROPRACTIC_GUIDELINES: ClinicalGuidelineData[] = [
  {
    code: 'CCGPP-LBP-2016',
    name: 'CCGPP Guidelines for Chiropractic Quality Assurance and Practice Parameters - Low Back Pain',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2016',
    condition: 'Low Back Pain',
    conditionCodes: ['M54.5', 'M54.50', 'M54.51', 'M54.4', 'M54.41', 'M54.42', 'M54.9'],
    applicableRegions: ['lumbar', 'sacral', 'pelvic'],
    summary: 'Evidence-based recommendations for chiropractic management of low back pain. Spinal manipulation/mobilization is recommended as a treatment option for patients with acute, subacute, and chronic low back pain.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Spinal manipulation/mobilization is recommended for acute low back pain (< 6 weeks)',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Primary',
        text: 'Spinal manipulation/mobilization is recommended for subacute low back pain (6-12 weeks)',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Spinal manipulation/mobilization is recommended for chronic low back pain (> 12 weeks)',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Exercise therapy is recommended as an adjunct to manipulation',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Patient education and reassurance are recommended',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
    ],
    evidenceLevel: 'HIGH',
    evidenceSummary: 'High-quality evidence supports spinal manipulation as an effective treatment for low back pain with similar outcomes to other recommended treatments.',
    keyPoints: [
      'Perform thorough history and examination to rule out red flags',
      'Most patients improve significantly within 4-6 weeks',
      'Treatment frequency typically 2-3x/week initially, tapering as improvement occurs',
      'Combine manipulation with active care (exercise, advice)',
      'Reassess regularly and modify treatment if not responding',
    ],
    redFlags: [
      'Cauda equina syndrome symptoms',
      'Progressive neurological deficit',
      'Unexplained weight loss',
      'History of cancer',
      'Fever with back pain',
      'Recent significant trauma',
      'Saddle anesthesia',
      'Bilateral leg weakness',
    ],
    referralCriteria: [
      'Cauda equina syndrome - EMERGENCY referral',
      'Progressive neurological deficit - URGENT referral',
      'Suspected spinal infection or malignancy',
      'No improvement after 4-6 weeks of care',
      'Severe pain uncontrolled with conservative care',
    ],
    contraindications: [
      'Cauda equina syndrome',
      'Spinal fracture',
      'Spinal infection',
      'Spinal malignancy',
      'Severe osteoporosis',
      'Spinal cord compression',
    ],
    precautions: [
      'Anticoagulation therapy',
      'Moderate osteoporosis',
      'Pregnancy (use modified techniques)',
      'Inflammatory arthritis',
      'Recent spinal surgery',
    ],
    publicationDate: new Date('2016-01-01'),
    citation: 'Globe G, Farabaugh RJ, Hawk C, et al. Clinical Practice Guideline: Chiropractic Care for Low Back Pain. J Manipulative Physiol Ther. 2016;39(1):1-22.',
    externalUrl: 'https://www.sciencedirect.com/science/article/pii/S0161475415001621',
  },
  {
    code: 'CCGPP-NECK-2014',
    name: 'CCGPP Guidelines for Chiropractic Management of Neck Pain',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2014',
    condition: 'Neck Pain',
    conditionCodes: ['M54.2', 'M53.0', 'M53.1', 'M50.80', 'M50.90'],
    applicableRegions: ['cervical'],
    summary: 'Evidence-based recommendations for chiropractic management of mechanical neck pain. Cervical manipulation and mobilization are recommended as treatment options.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Cervical manipulation is recommended for acute/subacute neck pain',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Cervical mobilization is an effective alternative to manipulation',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Cervical and scapular strengthening exercises are recommended',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Postural correction and ergonomic advice are recommended',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Moderate evidence supports cervical manipulation and mobilization for neck pain. Exercise therapy has high-quality evidence as adjunct.',
    keyPoints: [
      'Screen for vertebrobasilar insufficiency risk factors',
      'Most mechanical neck pain resolves within 4-8 weeks',
      'Combine manual therapy with exercise for best outcomes',
      'Address ergonomic factors and postural habits',
      'Consider modified techniques for elderly patients',
    ],
    redFlags: [
      'Drop attacks or loss of consciousness',
      'Diplopia (double vision)',
      'Dysarthria (difficulty speaking)',
      'Dysphagia (difficulty swallowing)',
      'Dizziness with neck movement',
      'Nystagmus',
      'Upper motor neuron signs',
      'Cervical myelopathy symptoms',
    ],
    referralCriteria: [
      'Signs of cervical myelopathy - URGENT referral',
      'Suspected vertebral artery dissection - EMERGENCY referral',
      'Progressive neurological deficit',
      'Suspected infection or malignancy',
      'Failed 4-6 weeks of conservative care',
    ],
    contraindications: [
      'Cervical myelopathy',
      'Vertebral artery dissection',
      'Atlantoaxial instability',
      'Cervical fracture',
      'Spinal infection',
      'Spinal malignancy',
    ],
    precautions: [
      'Anticoagulation therapy',
      'Rheumatoid arthritis (screen for C1-C2 instability)',
      'Down syndrome (atlantoaxial instability)',
      'Connective tissue disorders',
      'Advanced age with osteoporosis',
      'Recent whiplash injury',
    ],
    publicationDate: new Date('2014-01-01'),
    citation: 'Bryans R, Decina P, Descarreaux M, et al. Evidence-Based Guidelines for the Chiropractic Treatment of Adults With Neck Pain. J Manipulative Physiol Ther. 2014;37(1):42-63.',
    externalUrl: 'https://www.sciencedirect.com/science/article/pii/S0161475413002480',
  },
  {
    code: 'CCGPP-HA-2011',
    name: 'CCGPP Evidence-Based Guidelines for Chiropractic Treatment of Headache',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2011',
    condition: 'Headache',
    conditionCodes: ['R51.9', 'G43.909', 'G44.209', 'M53.0', 'G44.1'],
    applicableRegions: ['cervical', 'cranial'],
    summary: 'Evidence-based recommendations for chiropractic management of headache disorders. Spinal manipulation may be used for cervicogenic headache and tension-type headache.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Spinal manipulation is recommended for cervicogenic headache',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Spinal manipulation may be considered for episodic tension-type headache',
        gradeOfRecommendation: 'C',
        strengthOfEvidence: 'LOW',
      },
      {
        level: 'Primary',
        text: 'Multimodal approach recommended for chronic tension-type headache',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Low-load exercise and stress management for tension headaches',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Moderate evidence supports spinal manipulation for cervicogenic headache. Evidence for migraine and tension headache is more limited.',
    keyPoints: [
      'Differentiate headache type (cervicogenic, tension, migraine)',
      'Cervicogenic headaches respond best to cervical manipulation',
      'Address cervical dysfunction contributing to headaches',
      'Consider trigger point therapy for myofascial component',
      'Lifestyle factors (sleep, stress, hydration) often contribute',
    ],
    redFlags: [
      'Sudden severe "thunderclap" headache',
      'Headache with fever and neck stiffness',
      'New headache after age 50',
      'Progressive worsening headache',
      'Headache with focal neurological signs',
      'Headache after trauma',
      'Headache with visual disturbances not typical for patient',
      'Papilledema',
    ],
    referralCriteria: [
      'Thunderclap headache - EMERGENCY referral (rule out SAH)',
      'Suspected meningitis - EMERGENCY referral',
      'New neurological deficits',
      'Suspected mass lesion or increased ICP',
      'Medication overuse headache requiring detox',
      'Refractory to conservative care',
    ],
    contraindications: [
      'Suspected intracranial pathology',
      'Cervical myelopathy',
      'Vertebral artery compromise',
      'Recent head injury with altered consciousness',
    ],
    precautions: [
      'History of migraine with aura',
      'Anticoagulation therapy',
      'Elderly with cervical spondylosis',
      'History of vertebrobasilar symptoms',
    ],
    publicationDate: new Date('2011-01-01'),
    citation: 'Bryans R, Descarreaux M, Duranleau M, et al. Evidence-Based Guidelines for the Chiropractic Treatment of Adults With Headache. J Manipulative Physiol Ther. 2011;34(5):274-289.',
    externalUrl: 'https://www.sciencedirect.com/science/article/pii/S0161475411000753',
  },
  {
    code: 'AHRQ-LBP-2017',
    name: 'AHRQ Noninvasive Treatments for Low Back Pain',
    source: 'Agency for Healthcare Research and Quality (AHRQ)',
    version: '2017',
    condition: 'Low Back Pain',
    conditionCodes: ['M54.5', 'M54.50', 'M54.51', 'M54.4', 'M54.9', 'M54.16', 'M54.17'],
    applicableRegions: ['lumbar', 'sacral'],
    summary: 'Systematic review of noninvasive treatments for low back pain. Recommends nonpharmacologic therapies as first-line treatment including spinal manipulation.',
    recommendations: [
      {
        level: 'First-line',
        text: 'Nonpharmacologic treatment should be first-line therapy for low back pain',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Primary',
        text: 'Spinal manipulation is effective for acute and chronic low back pain',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Exercise therapy is effective for chronic low back pain',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Heat therapy provides short-term relief for acute low back pain',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'HIGH',
    evidenceSummary: 'High-quality systematic review supporting spinal manipulation as part of multimodal nonpharmacologic treatment approach.',
    keyPoints: [
      'Nonpharmacologic treatments first before medications',
      'Spinal manipulation is one of several effective options',
      'Exercise is strongly recommended for chronic pain',
      'Multidisciplinary rehabilitation for complex cases',
      'Patient education and self-management are essential',
    ],
    redFlags: [
      'Cauda equina syndrome',
      'Progressive neurological deficit',
      'Severe neurological compromise',
      'Suspected spinal infection',
      'Suspected malignancy',
    ],
    referralCriteria: [
      'Red flag symptoms present',
      'No improvement with 4 weeks of care',
      'Consider specialty consultation for complex cases',
    ],
    contraindications: [
      'Spinal fracture',
      'Severe neurological deficit',
      'Spinal infection',
      'Malignancy',
    ],
    precautions: [
      'Osteoporosis',
      'Spondylolisthesis',
      'Prior spinal surgery',
    ],
    publicationDate: new Date('2017-02-01'),
    citation: 'Chou R, Deyo R, Friedly J, et al. Noninvasive Treatments for Low Back Pain. Comparative Effectiveness Review No. 169. AHRQ Publication No. 16-EHC004-EF.',
    externalUrl: 'https://effectivehealthcare.ahrq.gov/products/low-back-pain-treatment/research',
  },
  {
    code: 'ACP-LBP-2017',
    name: 'ACP Clinical Practice Guideline for Noninvasive Treatment of Low Back Pain',
    source: 'American College of Physicians (ACP)',
    version: '2017',
    condition: 'Low Back Pain',
    conditionCodes: ['M54.5', 'M54.50', 'M54.51', 'M54.4', 'M54.9'],
    applicableRegions: ['lumbar', 'sacral'],
    summary: 'Recommends that clinicians and patients select nonpharmacologic treatment for chronic low back pain, including spinal manipulation.',
    recommendations: [
      {
        level: 'Primary',
        text: 'For acute/subacute LBP: select nonpharmacologic treatment (superficial heat, massage, acupuncture, spinal manipulation)',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'For chronic LBP: initially select nonpharmacologic treatment (exercise, multidisciplinary rehabilitation, acupuncture, tai chi, yoga, spinal manipulation)',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Secondary',
        text: 'If nonpharmacologic therapy fails, consider NSAIDs as first-line medication',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
    ],
    evidenceLevel: 'HIGH',
    evidenceSummary: 'Strong recommendation for nonpharmacologic therapies including spinal manipulation as first-line treatment.',
    keyPoints: [
      'Nonpharmacologic therapies first',
      'Spinal manipulation is listed as effective option',
      'For chronic pain, exercise and multidisciplinary approaches recommended',
      'Medications only if nonpharmacologic therapy fails',
      'Avoid opioids except as last resort',
    ],
    redFlags: [
      'Signs of systemic disease',
      'Neurological deficits',
      'History of cancer',
    ],
    referralCriteria: [
      'Severe or progressive neurologic deficits',
      'Suspected serious underlying condition',
    ],
    contraindications: [],
    precautions: [],
    publicationDate: new Date('2017-04-01'),
    citation: 'Qaseem A, Wilt TJ, McLean RM, Forciea MA. Noninvasive Treatments for Acute, Subacute, and Chronic Low Back Pain: A Clinical Practice Guideline From the American College of Physicians. Ann Intern Med. 2017;166(7):514-530.',
    externalUrl: 'https://www.acponline.org/clinical-information/guidelines/guidelines',
  },
  {
    code: 'NICE-LBP-2016',
    name: 'NICE Guideline on Low Back Pain and Sciatica',
    source: 'National Institute for Health and Care Excellence (NICE)',
    version: '2016 (Updated 2020)',
    condition: 'Low Back Pain and Sciatica',
    conditionCodes: ['M54.5', 'M54.50', 'M54.51', 'M54.4', 'M54.41', 'M54.42', 'M54.3'],
    applicableRegions: ['lumbar', 'sacral'],
    summary: 'UK national guideline recommending manual therapy as part of a treatment package that includes exercise. Emphasizes self-management.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Consider manual therapy (spinal manipulation, mobilisation, soft tissue techniques) only as part of a treatment package including exercise',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Encourage people to continue with normal activities',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Primary',
        text: 'Offer a structured exercise programme',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Consider psychological therapies for chronic low back pain',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Manual therapy recommended when combined with exercise, not as standalone treatment.',
    keyPoints: [
      'Manual therapy should be combined with exercise',
      'Do not offer manual therapy alone',
      'Encourage self-management and continued activity',
      'Maximum 9 sessions of manual therapy over 12 weeks',
      'Group exercise programmes are cost-effective',
    ],
    redFlags: [
      'Cauda equina syndrome',
      'Spinal fracture',
      'Cancer',
      'Infection',
      'Abdominal aortic aneurysm',
    ],
    referralCriteria: [
      'Red flags present',
      'Severe, unrelenting pain',
      'Widespread neurological deficit',
    ],
    contraindications: [],
    precautions: [],
    publicationDate: new Date('2016-11-30'),
    citation: 'National Institute for Health and Care Excellence. Low back pain and sciatica in over 16s: assessment and management. NICE guideline [NG59]. 2016.',
    externalUrl: 'https://www.nice.org.uk/guidance/ng59',
  },
  {
    code: 'CCGPP-DISC-2014',
    name: 'CCGPP Guidelines for Chiropractic Management of Lumbar Disc Herniation',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2014',
    condition: 'Lumbar Disc Herniation',
    conditionCodes: ['M51.16', 'M51.26', 'M51.06', 'M51.17', 'M51.27'],
    applicableRegions: ['lumbar'],
    summary: 'Guidelines for conservative chiropractic management of lumbar disc herniation with radiculopathy.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Flexion-distraction technique is recommended for lumbar disc herniation',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Spinal manipulation may be considered for disc herniation without severe neurological deficit',
        gradeOfRecommendation: 'C',
        strengthOfEvidence: 'LOW',
      },
      {
        level: 'Adjunct',
        text: 'Core stabilization exercises recommended',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'McKenzie method may be beneficial',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Conservative care including flexion-distraction is effective for many disc herniations. 80%+ resolve without surgery.',
    keyPoints: [
      'Most disc herniations improve with conservative care',
      'Flexion-distraction is well-tolerated for disc patients',
      'Monitor for progressive neurological deficit',
      'Avoid high-velocity manipulation at affected level',
      'Consider surgical referral if no improvement in 6-8 weeks',
    ],
    redFlags: [
      'Cauda equina syndrome',
      'Progressive motor weakness',
      'Severe, unrelenting pain',
      'Significant sensory deficit',
    ],
    referralCriteria: [
      'Cauda equina syndrome - IMMEDIATE surgical referral',
      'Progressive neurological deficit',
      'Severe motor weakness (< 3/5)',
      'Failed 6-8 weeks of conservative care',
      'Intractable pain affecting quality of life',
    ],
    contraindications: [
      'Cauda equina syndrome',
      'Large central disc herniation with cord compression',
      'Progressive neurological deficit',
      'Severe motor weakness',
    ],
    precautions: [
      'Large disc extrusion',
      'Sequestered disc fragment',
      'History of failed back surgery',
      'Significant spondylolisthesis',
    ],
    publicationDate: new Date('2014-01-01'),
    citation: 'Leininger B, Bronfort G, Evans R, et al. Spinal manipulation or mobilization for radiculopathy: a systematic review. Phys Med Rehabil Clin N Am. 2011;22(1):105-125.',
  },
  {
    code: 'CCGPP-SPONDYLOSIS-2018',
    name: 'Chiropractic Management of Cervical and Lumbar Spondylosis',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2018',
    condition: 'Spondylosis',
    conditionCodes: ['M47.812', 'M47.816', 'M47.817', 'M47.892', 'M47.896'],
    applicableRegions: ['cervical', 'lumbar'],
    summary: 'Guidelines for chiropractic management of degenerative spine conditions with focus on symptom management and function.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Low-force techniques preferred for spondylosis management',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Instrument-assisted techniques (Activator) are appropriate options',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Exercise therapy for mobility and strength maintenance',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Patient education on activity modification',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Conservative management effective for symptom control. Degenerative changes themselves are not reversed but symptoms can be managed.',
    keyPoints: [
      'Goal is symptom management and function improvement',
      'Degenerative changes are common and often asymptomatic',
      'Use modified techniques appropriate for degenerative spine',
      'Regular exercise helps maintain mobility and strength',
      'Ongoing maintenance care often beneficial',
    ],
    redFlags: [
      'Cervical myelopathy signs',
      'Lumbar stenosis with neurogenic claudication',
      'Progressive neurological deficit',
      'Severe spinal stenosis',
    ],
    referralCriteria: [
      'Signs of myelopathy',
      'Severe neurogenic claudication limiting function',
      'Progressive neurological deficit',
    ],
    contraindications: [
      'Severe spinal stenosis with myelopathy',
      'Severe instability',
    ],
    precautions: [
      'Moderate stenosis',
      'Osteophyte formation',
      'Advanced degenerative changes',
      'History of compression fractures',
    ],
    publicationDate: new Date('2018-01-01'),
    citation: 'Farabaugh RJ, Dehen MD, Hawk C. Management of chronic spine-related conditions: consensus recommendations of a multidisciplinary panel. J Manipulative Physiol Ther. 2010;33(7):484-492.',
  },
  {
    code: 'CCGPP-THORACIC-2017',
    name: 'Evidence-Based Management of Thoracic Spine Pain',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2017',
    condition: 'Thoracic Spine Pain',
    conditionCodes: ['M54.6', 'M99.02', 'M54.14', 'M54.15'],
    applicableRegions: ['thoracic'],
    summary: 'Guidelines for evaluation and treatment of thoracic spine pain with chiropractic interventions.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Thoracic spinal manipulation is recommended for thoracic spine pain',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Primary',
        text: 'Mobilization techniques are an acceptable alternative',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Soft tissue techniques for associated myofascial dysfunction',
        gradeOfRecommendation: 'C',
        strengthOfEvidence: 'LOW',
      },
      {
        level: 'Adjunct',
        text: 'Postural exercises and ergonomic advice',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'MODERATE',
    evidenceSummary: 'Moderate evidence supports thoracic manipulation for thoracic spine pain.',
    keyPoints: [
      'Thoracic pain less studied than cervical/lumbar but manipulation appears effective',
      'Rule out visceral causes of thoracic pain (cardiac, pulmonary, GI)',
      'Address postural factors, especially with desk work',
      'Rib dysfunction often contributes to thoracic pain',
      'Most mechanical thoracic pain responds well to conservative care',
    ],
    redFlags: [
      'Chest pain with cardiac symptoms',
      'Shortness of breath',
      'History of cancer',
      'Recent trauma with severe pain',
      'Fever with thoracic pain',
    ],
    referralCriteria: [
      'Suspected cardiac or pulmonary cause',
      'Signs of malignancy',
      'Suspected rib fracture',
      'No improvement with 4 weeks of care',
    ],
    contraindications: [
      'Rib fracture',
      'Thoracic compression fracture',
      'Severe osteoporosis',
    ],
    precautions: [
      'Osteopenia',
      'Long-term steroid use',
      'Anterior chest wall pain (rule out cardiac)',
    ],
    publicationDate: new Date('2017-01-01'),
    citation: 'Walser RF, Meserve BB, Boucher TR. The effectiveness of thoracic spine manipulation for the management of musculoskeletal conditions: a systematic review and meta-analysis. J Man Manip Ther. 2009;17(4):237-246.',
  },
  {
    code: 'CCGPP-EXTREMITY-2018',
    name: 'Chiropractic Management of Extremity Conditions',
    source: 'Council on Chiropractic Guidelines and Practice Parameters (CCGPP)',
    version: '2018',
    condition: 'Extremity Conditions',
    conditionCodes: ['M25.50', 'M25.51', 'M25.52', 'M79.3', 'M77.10', 'M77.00', 'M75.10'],
    applicableRegions: ['extremity', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'],
    summary: 'Guidelines for chiropractic management of common extremity joint conditions.',
    recommendations: [
      {
        level: 'Primary',
        text: 'Extremity manipulation/mobilization may be beneficial for joint dysfunction',
        gradeOfRecommendation: 'C',
        strengthOfEvidence: 'LOW',
      },
      {
        level: 'Primary',
        text: 'Soft tissue techniques are recommended for associated myofascial dysfunction',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
      {
        level: 'Adjunct',
        text: 'Rehabilitation exercises are essential for extremity conditions',
        gradeOfRecommendation: 'A',
        strengthOfEvidence: 'HIGH',
      },
      {
        level: 'Adjunct',
        text: 'Address biomechanical factors and kinetic chain',
        gradeOfRecommendation: 'B',
        strengthOfEvidence: 'MODERATE',
      },
    ],
    evidenceLevel: 'LOW',
    evidenceSummary: 'Limited but promising evidence for extremity manipulation. Strong evidence for exercise rehabilitation.',
    keyPoints: [
      'Consider spinal contributions to extremity symptoms',
      'Address full kinetic chain',
      'Rehabilitation is critical for lasting improvement',
      'Rule out significant structural pathology',
      'Many extremity conditions respond to conservative care',
    ],
    redFlags: [
      'Suspected fracture',
      'Joint infection (hot, swollen, fever)',
      'Suspected tumor',
      'Neurovascular compromise',
      'Complete ligament rupture',
    ],
    referralCriteria: [
      'Suspected fracture - imaging needed',
      'Complete tendon/ligament rupture',
      'Suspected joint infection',
      'Failed conservative care after 6-8 weeks',
    ],
    contraindications: [
      'Acute fracture',
      'Joint infection',
      'Acute gout flare',
      'Severe joint instability',
    ],
    precautions: [
      'Rheumatoid arthritis (joint laxity)',
      'Joint replacement',
      'Significant osteoarthritis',
      'Hypermobility syndromes',
    ],
    publicationDate: new Date('2018-01-01'),
    citation: 'Brantingham JW, Cassa TK, Bonnefin D, et al. Manipulative and multimodal therapy for upper extremity and temporomandibular disorders: a systematic review. J Manipulative Physiol Ther. 2013;36(3):143-201.',
  },
];

// Procedure name mapping for CPT codes
const PROCEDURE_CPT_MAP: Record<string, string[]> = {
  'Spinal Manipulation': ['98940', '98941', '98942', '98943'],
  'Cervical Manipulation': ['98940', '98941'],
  'High-Velocity Manipulation': ['98940', '98941', '98942'],
  'Diversified Technique': ['98940', '98941', '98942'],
  'Gonstead Technique': ['98940', '98941', '98942'],
  'Flexion-Distraction': ['98940', '98941', '98942'],
  'Thompson Drop Technique': ['98940', '98941', '98942'],
  'Activator Method': ['98940', '98941', '98942'],
  'NUCCA': ['98940'],
  'Toggle Recoil': ['98940'],
  'SOT': ['98940', '98941'],
  'ART': ['97140'],
  'Myofascial Release': ['97140'],
  'Trigger Point Therapy': ['97140'],
  'Graston Technique': ['97140'],
  'Deep Tissue Massage': ['97140'],
  'Electrical Muscle Stimulation': ['97014', 'G0283'],
  'Ultrasound Therapy': ['97035'],
  'Cold Laser Therapy': ['97039'],
  'Spinal Decompression': ['97012'],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Check patient data against contraindication rules
 */
function checkContraindicationRules(
  procedure: string,
  procedureCode: string | null,
  patientData: {
    conditions?: string[];
    medications?: string[];
    age?: number;
    recentSurgeries?: Array<{ procedure: string; date: Date }>;
    recentTrauma?: Array<{ description: string; date: Date }>;
    clinicalNotes?: string;
  }
): Array<{
  rule: ContraindicationRule;
  matchedKeywords: string[];
  matchSource: string;
  severity: AlertSeverityLevel;
}> {
  const detectedContraindications: Array<{
    rule: ContraindicationRule;
    matchedKeywords: string[];
    matchSource: string;
    severity: AlertSeverityLevel;
  }> = [];

  const normalizedProcedure = procedure.toLowerCase();
  const normalizedNotes = (patientData.clinicalNotes || '').toLowerCase();

  for (const rule of CONTRAINDICATION_RULES) {
    // Check if this rule applies to the procedure
    const procedureMatches = rule.affectedProcedures.some(
      ap => normalizedProcedure.includes(ap.toLowerCase()) ||
            (procedureCode && PROCEDURE_CPT_MAP[ap]?.includes(procedureCode))
    );

    if (!procedureMatches && !rule.affectedProcedures.includes('All Manual Therapies')) {
      continue;
    }

    const matchedKeywords: string[] = [];
    let matchSource = '';

    // Check by source type
    switch (rule.source) {
      case 'condition':
        // Check patient conditions
        if (patientData.conditions) {
          for (const condition of patientData.conditions) {
            const normalizedCondition = condition.toLowerCase();
            for (const keyword of rule.keywords) {
              if (normalizedCondition.includes(keyword.toLowerCase())) {
                matchedKeywords.push(keyword);
                matchSource = `Condition: ${condition}`;
              }
            }
          }
        }
        // Also check clinical notes for condition keywords
        for (const keyword of rule.keywords) {
          if (normalizedNotes.includes(keyword.toLowerCase()) && !matchedKeywords.includes(keyword)) {
            matchedKeywords.push(keyword);
            matchSource = matchSource || 'Clinical notes';
          }
        }
        break;

      case 'medication':
        if (patientData.medications) {
          for (const med of patientData.medications) {
            const normalizedMed = med.toLowerCase();
            for (const keyword of rule.keywords) {
              if (normalizedMed.includes(keyword.toLowerCase())) {
                matchedKeywords.push(keyword);
                matchSource = `Medication: ${med}`;
              }
            }
          }
        }
        // Check notes for medication mentions
        for (const keyword of rule.keywords) {
          if (normalizedNotes.includes(keyword.toLowerCase()) && !matchedKeywords.includes(keyword)) {
            matchedKeywords.push(keyword);
            matchSource = matchSource || 'Clinical notes';
          }
        }
        break;

      case 'age':
        if (patientData.age !== undefined) {
          if (rule.id === 'ci-elderly-general' && patientData.age > 75) {
            matchedKeywords.push('age > 75');
            matchSource = `Patient age: ${patientData.age}`;
          }
          if (rule.id === 'ci-pediatric-cervical' && patientData.age < 12 &&
              normalizedProcedure.includes('cervical')) {
            matchedKeywords.push('age < 12');
            matchSource = `Patient age: ${patientData.age}`;
          }
        }
        break;

      case 'surgery':
        if (patientData.recentSurgeries && patientData.recentSurgeries.length > 0) {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

          for (const surgery of patientData.recentSurgeries) {
            const normalizedSurgery = surgery.procedure.toLowerCase();
            const isRecent = new Date(surgery.date) > sixMonthsAgo;

            if (isRecent) {
              for (const keyword of rule.keywords) {
                if (normalizedSurgery.includes(keyword.toLowerCase())) {
                  matchedKeywords.push(keyword);
                  matchSource = `Recent surgery: ${surgery.procedure}`;
                }
              }
            }
          }
        }
        // Check notes for surgery mentions
        for (const keyword of rule.keywords) {
          if (normalizedNotes.includes(keyword.toLowerCase()) && !matchedKeywords.includes(keyword)) {
            matchedKeywords.push(keyword);
            matchSource = matchSource || 'Clinical notes';
          }
        }
        break;

      case 'trauma':
        if (patientData.recentTrauma && patientData.recentTrauma.length > 0) {
          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

          for (const trauma of patientData.recentTrauma) {
            const normalizedTrauma = trauma.description.toLowerCase();
            const isRecent = new Date(trauma.date) > twoWeeksAgo;

            if (isRecent) {
              for (const keyword of rule.keywords) {
                if (normalizedTrauma.includes(keyword.toLowerCase())) {
                  matchedKeywords.push(keyword);
                  matchSource = `Recent trauma: ${trauma.description}`;
                }
              }
            }
          }
        }
        // Check notes for trauma keywords
        for (const keyword of rule.keywords) {
          if (normalizedNotes.includes(keyword.toLowerCase()) && !matchedKeywords.includes(keyword)) {
            matchedKeywords.push(keyword);
            matchSource = matchSource || 'Clinical notes';
          }
        }
        break;

      case 'red_flag':
      case 'general':
        // Check clinical notes for keywords
        for (const keyword of rule.keywords) {
          if (normalizedNotes.includes(keyword.toLowerCase())) {
            matchedKeywords.push(keyword);
            matchSource = 'Clinical notes';
          }
        }
        // Also check conditions
        if (patientData.conditions) {
          for (const condition of patientData.conditions) {
            const normalizedCondition = condition.toLowerCase();
            for (const keyword of rule.keywords) {
              if (normalizedCondition.includes(keyword.toLowerCase()) && !matchedKeywords.includes(keyword)) {
                matchedKeywords.push(keyword);
                matchSource = matchSource || `Condition: ${condition}`;
              }
            }
          }
        }
        break;
    }

    // If any keywords matched, add to detected
    if (matchedKeywords.length > 0) {
      detectedContraindications.push({
        rule,
        matchedKeywords: [...new Set(matchedKeywords)],
        matchSource,
        severity: rule.alertSeverity,
      });
    }
  }

  // Sort by severity (CRITICAL first)
  const severityOrder: Record<AlertSeverityLevel, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  detectedContraindications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return detectedContraindications;
}

/**
 * Generate AI-enhanced contraindication analysis using Claude API
 */
async function generateAIContraindicationAnalysis(context: {
  procedure: string;
  patientProfile: {
    age?: number;
    conditions?: string[];
    medications?: string[];
    allergies?: string[];
  };
  clinicalNotes?: string;
  existingContraindications?: string[];
}): Promise<{
  additionalContraindications: Array<{
    condition: string;
    type: ContraindicationSeverity;
    reason: string;
    recommendation: string;
  }>;
  safetyNotes: string[];
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
} | null> {
  // If no API key, return null to use rule-based only
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a clinical safety advisor for chiropractic practices.
Analyze patient information for contraindications to the proposed treatment.
Be thorough and conservative - patient safety is paramount.
Focus on chiropractic-specific contraindications.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

    const userPrompt = `Analyze contraindications for this patient and proposed treatment:

Proposed Procedure: ${context.procedure}

Patient Profile:
- Age: ${context.patientProfile.age || 'Unknown'}
- Conditions: ${context.patientProfile.conditions?.join(', ') || 'None listed'}
- Medications: ${context.patientProfile.medications?.join(', ') || 'None listed'}
- Allergies: ${context.patientProfile.allergies?.join(', ') || 'None listed'}

${context.clinicalNotes ? `Clinical Notes:\n${context.clinicalNotes}\n` : ''}

${context.existingContraindications?.length ? `Already Identified Contraindications:\n${context.existingContraindications.join('\n')}\n` : ''}

Respond with JSON:
{
  "additionalContraindications": [
    {
      "condition": "Name of contraindication",
      "type": "ABSOLUTE|RELATIVE|PRECAUTION",
      "reason": "Why this is contraindicated",
      "recommendation": "What to do instead"
    }
  ],
  "safetyNotes": ["Important safety considerations"],
  "overallRiskLevel": "LOW|MODERATE|HIGH|VERY_HIGH"
}

Only include contraindications NOT already identified. Focus on clinically significant findings.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return null;
    }

    const parsed = JSON.parse(content.text);
    return {
      additionalContraindications: Array.isArray(parsed.additionalContraindications)
        ? parsed.additionalContraindications.map((c: { condition?: string; type?: string; reason?: string; recommendation?: string }) => ({
            condition: c.condition || '',
            type: (['ABSOLUTE', 'RELATIVE', 'PRECAUTION'].includes(c.type || '') ? c.type : 'PRECAUTION') as ContraindicationSeverity,
            reason: c.reason || '',
            recommendation: c.recommendation || '',
          }))
        : [],
      safetyNotes: Array.isArray(parsed.safetyNotes) ? parsed.safetyNotes : [],
      overallRiskLevel: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'].includes(parsed.overallRiskLevel)
        ? parsed.overallRiskLevel
        : 'MODERATE',
    };
  } catch (error) {
    console.error('AI contraindication analysis error:', error);
    return null;
  }
}

/**
 * Analyze text for red flags
 */
function detectRedFlags(text: string): Array<{
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  message: string;
  recommendation: string;
  matchedKeywords: string[];
}> {
  const normalizedText = text.toLowerCase();
  const detectedFlags: Array<{
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
    message: string;
    recommendation: string;
    matchedKeywords: string[];
  }> = [];

  for (const [flagType, flagData] of Object.entries(RED_FLAGS)) {
    const matchedKeywords = flagData.keywords.filter(keyword =>
      normalizedText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      detectedFlags.push({
        type: flagType,
        severity: flagData.severity,
        message: flagData.message,
        recommendation: flagData.recommendation,
        matchedKeywords,
      });
    }
  }

  return detectedFlags;
}

/**
 * Extract keywords from clinical text for matching
 */
function extractClinicalKeywords(text: string): string[] {
  const normalizedText = text.toLowerCase();
  const keywords: string[] = [];

  // Body regions
  const regions = ['cervical', 'thoracic', 'lumbar', 'sacral', 'pelvic', 'neck', 'back', 'lower back', 'upper back', 'mid back'];
  regions.forEach(region => {
    if (normalizedText.includes(region)) keywords.push(region);
  });

  // Symptoms
  const symptoms = ['pain', 'stiffness', 'numbness', 'tingling', 'weakness', 'spasm', 'tension', 'headache', 'radiating', 'shooting'];
  symptoms.forEach(symptom => {
    if (normalizedText.includes(symptom)) keywords.push(symptom);
  });

  // Conditions
  const conditions = ['sciatica', 'radiculopathy', 'disc', 'spondylosis', 'subluxation', 'dysfunction', 'sprain', 'strain'];
  conditions.forEach(condition => {
    if (normalizedText.includes(condition)) keywords.push(condition);
  });

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Determine condition acuity from clinical findings
 */
function determineAcuity(chiefComplaint: string, subjective: string, history: string): 'acute' | 'subacute' | 'chronic' | 'wellness' {
  const text = `${chiefComplaint} ${subjective} ${history}`.toLowerCase();

  // Check for chronic indicators
  const chronicKeywords = ['chronic', 'years', 'months', 'long-term', 'ongoing', 'persistent', 'recurrent'];
  const hasChronicIndicators = chronicKeywords.some(keyword => text.includes(keyword));

  // Check for acute indicators
  const acuteKeywords = ['sudden', 'acute', 'yesterday', 'today', 'this morning', 'last night', 'days ago', 'recent injury', 'just started'];
  const hasAcuteIndicators = acuteKeywords.some(keyword => text.includes(keyword));

  // Check for wellness/maintenance
  const wellnessKeywords = ['wellness', 'maintenance', 'prevention', 'check-up', 'routine'];
  const hasWellnessIndicators = wellnessKeywords.some(keyword => text.includes(keyword));

  if (hasWellnessIndicators && !hasAcuteIndicators && !hasChronicIndicators) {
    return 'wellness';
  }
  if (hasChronicIndicators && !hasAcuteIndicators) {
    return 'chronic';
  }
  if (hasAcuteIndicators) {
    return 'acute';
  }
  // Default to subacute if no clear indicators
  return 'subacute';
}

/**
 * Find matching treatment protocol for a diagnosis code
 */
function findMatchingProtocol(diagnosisCode: string): TreatmentProtocol | null {
  return TREATMENT_PROTOCOLS.find(protocol =>
    protocol.icdCodes.some(code => diagnosisCode.startsWith(code.replace('XXA', '')) || code.startsWith(diagnosisCode))
  ) || null;
}

/**
 * Score technique suitability based on patient factors
 */
function scoreTechniqueSuitability(
  technique: typeof CHIRO_TECHNIQUES[0],
  patientFactors: {
    age?: number;
    preferences?: string[];
    conditions?: string[];
  }
): number {
  let score = 50; // Base score

  // Evidence level bonus
  if (technique.evidence === 'HIGH') score += 20;
  else if (technique.evidence === 'MODERATE') score += 10;

  // Patient preference matching
  if (patientFactors.preferences) {
    if (patientFactors.preferences.includes('lowForce') &&
        PATIENT_PREFERENCES.lowForce.techniques.includes(technique.name)) {
      score += 15;
    }
    if (patientFactors.preferences.includes('noManual') &&
        PATIENT_PREFERENCES.noManual.techniques.includes(technique.name)) {
      score += 15;
    }
    if (patientFactors.preferences.includes('activeInvolvement') &&
        PATIENT_PREFERENCES.activeInvolvement.techniques.includes(technique.name)) {
      score += 15;
    }
  }

  // Age considerations
  if (patientFactors.age) {
    if (patientFactors.age > 65 && technique.category === 'instrument') {
      score += 10; // Prefer instrument-assisted for elderly
    }
    if (patientFactors.age < 18 && technique.category === 'exercise') {
      score += 10; // Emphasize exercises for younger patients
    }
  }

  return Math.min(score, 100);
}

/**
 * Generate AI-enhanced treatment recommendations using Claude API
 */
async function generateAITreatmentRecommendations(context: {
  diagnosis: { code: string; description: string };
  patientProfile: { age?: number; gender?: string; preferences?: string[] };
  chiefComplaint: string;
  subjective?: string;
  objective?: string;
  existingTreatments?: string[];
  acuity: string;
}): Promise<{
  recommendation: string;
  techniques: string[];
  frequency: string;
  duration: string;
  expectedOutcome: string;
  alternatives: Array<{ approach: string; reason: string }>;
  evidence: string;
  citations: string[];
} | null> {
  // If no API key, return null to use rule-based suggestions
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a clinical decision support system for chiropractic practices.
Provide evidence-based treatment recommendations for chiropractic care.
Focus on musculoskeletal conditions and appropriate chiropractic techniques.
Be thorough but conservative - prioritize patient safety.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

    const userPrompt = `Provide treatment recommendations for this patient:

Diagnosis: ${context.diagnosis.code} - ${context.diagnosis.description}
Acuity: ${context.acuity}
Chief Complaint: ${context.chiefComplaint || 'Not specified'}

${context.patientProfile.age ? `Patient Age: ${context.patientProfile.age}` : ''}
${context.patientProfile.gender ? `Gender: ${context.patientProfile.gender}` : ''}
${context.patientProfile.preferences?.length ? `Preferences: ${context.patientProfile.preferences.join(', ')}` : ''}

${context.subjective ? `Patient Reports:\n${context.subjective}\n` : ''}
${context.objective ? `Examination Findings:\n${context.objective}\n` : ''}
${context.existingTreatments?.length ? `Current/Previous Treatments: ${context.existingTreatments.join(', ')}\n` : ''}

Respond with JSON:
{
  "recommendation": "Primary treatment recommendation summary",
  "techniques": ["Technique 1", "Technique 2"],
  "frequency": "Recommended visit frequency (e.g., 2-3x/week for 4 weeks)",
  "duration": "Expected treatment duration",
  "expectedOutcome": "Expected treatment outcome and timeline",
  "alternatives": [
    { "approach": "Alternative treatment", "reason": "Why this might be considered" }
  ],
  "evidence": "Evidence summary for recommendations",
  "citations": ["Clinical guideline or study references"]
}`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return null;
    }

    const parsed = JSON.parse(content.text);
    return {
      recommendation: parsed.recommendation || '',
      techniques: Array.isArray(parsed.techniques) ? parsed.techniques : [],
      frequency: parsed.frequency || '',
      duration: parsed.duration || '',
      expectedOutcome: parsed.expectedOutcome || '',
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      evidence: parsed.evidence || '',
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    };
  } catch (error) {
    console.error('AI treatment recommendation error:', error);
    return null;
  }
}

/**
 * Score a diagnosis code based on keyword matching
 */
function scoreDiagnosisMatch(
  code: typeof CHIRO_ICD10_CODES[0],
  keywords: string[],
  chiefComplaint: string
): number {
  let score = 0;
  const description = code.description.toLowerCase();
  const complaint = chiefComplaint.toLowerCase();

  // Direct match with chief complaint words
  const complaintWords = complaint.split(/\s+/);
  complaintWords.forEach(word => {
    if (word.length > 3 && description.includes(word)) {
      score += 20;
    }
  });

  // Keyword matches
  keywords.forEach(keyword => {
    if (description.includes(keyword)) {
      score += 15;
    }
    // Region-based matching
    if (code.region === 'lumbar' && (keyword === 'lower back' || keyword === 'lumbar')) {
      score += 25;
    }
    if (code.region === 'cervical' && (keyword === 'neck' || keyword === 'cervical')) {
      score += 25;
    }
    if (code.region === 'thoracic' && (keyword === 'upper back' || keyword === 'mid back' || keyword === 'thoracic')) {
      score += 25;
    }
  });

  // Bonus for common codes
  if (code.common) {
    score += 10;
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Generate AI diagnosis suggestions using Claude API
 */
async function generateAIDiagnosisSuggestions(context: {
  chiefComplaint: string;
  subjective?: string;
  objective?: string;
  patientHistory?: string;
  existingCodes?: string[];
}): Promise<Array<{
  code: string;
  description: string;
  confidence: number;
  reasoning: string;
  supportingFindings: string[];
}>> {
  // If no API key, use rule-based suggestions
  if (!env.ANTHROPIC_API_KEY) {
    return [];
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a clinical decision support system for chiropractic practices.
Analyze patient information and suggest appropriate ICD-10 diagnosis codes.
Focus on musculoskeletal conditions common in chiropractic care.
Be thorough but conservative - only suggest codes with clear clinical support.

IMPORTANT: Respond ONLY with valid JSON array, no markdown code blocks.`;

    const userPrompt = `Analyze this patient encounter and suggest appropriate ICD-10 diagnoses:

Chief Complaint: ${context.chiefComplaint || 'Not specified'}

${context.subjective ? `Patient Reports (Subjective):\n${context.subjective}\n` : ''}
${context.objective ? `Examination Findings (Objective):\n${context.objective}\n` : ''}
${context.patientHistory ? `Relevant History:\n${context.patientHistory}\n` : ''}
${context.existingCodes?.length ? `Previously Used Codes: ${context.existingCodes.join(', ')}\n` : ''}

Respond with a JSON array of diagnosis suggestions:
[
  {
    "code": "M54.5",
    "description": "Low back pain",
    "confidence": 85,
    "reasoning": "Clinical explanation for why this code is appropriate",
    "supportingFindings": ["specific finding 1", "specific finding 2"]
  }
]

Focus on common chiropractic ICD-10 codes:
- M54.x (back pain categories)
- M99.0x (segmental/somatic dysfunction)
- M53.x (other dorsopathies)
- M47.x (spondylosis)
- M51.x (disc disorders)
- S13.4/S33.5 (sprains)`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    // Parse the JSON response
    const parsed = JSON.parse(content.text);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(item => ({
      code: item.code || '',
      description: item.description || '',
      confidence: Math.min(Math.max(Number(item.confidence) || 0, 0), 100),
      reasoning: item.reasoning || '',
      supportingFindings: Array.isArray(item.supportingFindings) ? item.supportingFindings : [],
    }));
  } catch (error) {
    console.error('AI diagnosis suggestion error:', error);
    return [];
  }
}

// ============================================
// US-376: Outcome Prediction Helper Functions
// ============================================

/**
 * Determine symptom duration category based on clinical notes
 */
function determineSymptomDuration(text: string): 'acute' | 'subacute' | 'chronic' | 'unknown' {
  const lowerText = text.toLowerCase();

  // Check for explicit duration mentions
  const acutePatterns = [
    /\b(\d+)\s*(days?|day)\b/i,
    /\brecent(ly)?\b/,
    /\bsuddenly\b/,
    /\bjust started\b/,
    /\bthis (week|morning|yesterday)\b/,
    /\ba (few|couple) days\b/,
    /\b(1|2)\s*weeks?\b/,
  ];

  const subacutePatterns = [
    /\b(3|4|5|6|7|8)\s*weeks?\b/,
    /\b(1|2|3)\s*months?\b/,
    /\bfor weeks\b/,
    /\bgradual(ly)?\b/,
    /\bprogressive\b/,
  ];

  const chronicPatterns = [
    /\b(4|5|6|7|8|9|10|11|12)\s*months?\b/,
    /\byears?\b/,
    /\blong[- ]?term\b/,
    /\bchronic\b/,
    /\bpersistent\b/,
    /\bongoing\b/,
    /\bhistory of\b/,
    /\brecurrent\b/,
  ];

  // Check patterns in order of specificity
  for (const pattern of chronicPatterns) {
    if (pattern.test(lowerText)) return 'chronic';
  }

  for (const pattern of subacutePatterns) {
    if (pattern.test(lowerText)) return 'subacute';
  }

  for (const pattern of acutePatterns) {
    if (pattern.test(lowerText)) return 'acute';
  }

  return 'unknown';
}

/**
 * Identify risk factors from patient data
 */
function identifyRiskFactors(data: {
  age: number | null;
  symptomDuration: string;
  comorbidities: string[];
  chiefComplaint: string;
  subjective: string;
  objective: string;
}): string[] {
  const riskFactors: string[] = [];
  const combinedText = `${data.chiefComplaint} ${data.subjective} ${data.objective}`.toLowerCase();

  // Age-related risks
  if (data.age) {
    if (data.age > 65) riskFactors.push('Advanced age (>65)');
    if (data.age > 75) riskFactors.push('Elderly patient (>75)');
    if (data.age < 18) riskFactors.push('Pediatric patient');
  }

  // Duration-related risks
  if (data.symptomDuration === 'chronic') {
    riskFactors.push('Chronic symptom duration');
  }

  // Lifestyle factors
  if (/sedentary|inactive|desk job|sits? all day/i.test(combinedText)) {
    riskFactors.push('Sedentary lifestyle');
  }
  if (/smok(e|ing|er)/i.test(combinedText)) {
    riskFactors.push('Smoking history');
  }
  if (/overweight|obese|obes/i.test(combinedText)) {
    riskFactors.push('Overweight/obesity');
  }

  // Psychological factors
  if (/depress|anxiety|stress(ed|ful)?|anxious/i.test(combinedText)) {
    riskFactors.push('Psychological distress');
  }
  if (/fear[- ]?avoid|catastroph/i.test(combinedText)) {
    riskFactors.push('Fear avoidance behavior');
  }

  // Work-related factors
  if (/heavy lifting|physical labor|manual work/i.test(combinedText)) {
    riskFactors.push('Heavy physical work');
  }
  if (/worker'?s? comp|work[- ]?related|on the job/i.test(combinedText)) {
    riskFactors.push('Workers compensation case');
  }

  // Previous treatment failures
  if (/failed|not respond|didn'?t (help|work)|previous treatment/i.test(combinedText)) {
    riskFactors.push('Previous treatment failure');
  }

  // Comorbidity-related risks
  const highRiskConditions = ['diabetes', 'fibromyalgia', 'depression', 'anxiety', 'obesity'];
  for (const condition of data.comorbidities) {
    if (highRiskConditions.some(hrc => condition.toLowerCase().includes(hrc))) {
      riskFactors.push(`Comorbidity: ${condition}`);
    }
  }

  // Neurological involvement
  if (/radiating|radicular|sciatica|numbness|tingling|weakness/i.test(combinedText)) {
    riskFactors.push('Neurological involvement');
  }

  return riskFactors;
}

/**
 * Analyze similar cases for outcome comparison
 */
async function analyzeSimilarCases(
  prisma: any,
  params: {
    diagnosisCode: string;
    organizationId: string;
    ageRange?: { min: number; max: number };
    symptomDuration?: string;
  }
): Promise<{
  count: number;
  averageImprovement: number | null;
  distribution: { excellent: number; good: number; moderate: number; poor: number };
  anonymizedData: any;
}> {
  // Query for similar outcome predictions with recorded outcomes
  const whereClause: any = {
    organizationId: params.organizationId,
    conditionCode: { startsWith: params.diagnosisCode.substring(0, 5) },
    actualImprovement: { not: null },
  };

  if (params.ageRange) {
    whereClause.patientAge = {
      gte: params.ageRange.min,
      lte: params.ageRange.max,
    };
  }

  if (params.symptomDuration && params.symptomDuration !== 'unknown') {
    whereClause.symptomDuration = params.symptomDuration;
  }

  try {
    const similarCases = await prisma.outcomePrediction.findMany({
      where: whereClause,
      select: {
        actualImprovement: true,
        treatmentResponse: true,
        wasAccurate: true,
      },
      take: 100, // Limit for performance
    });

    if (similarCases.length === 0) {
      return {
        count: 0,
        averageImprovement: null,
        distribution: { excellent: 0, good: 0, moderate: 0, poor: 0 },
        anonymizedData: null,
      };
    }

    // Calculate statistics
    const improvements = similarCases
      .map((c: any) => Number(c.actualImprovement))
      .filter((i: number) => !isNaN(i));

    const avgImprovement = improvements.length > 0
      ? improvements.reduce((a: number, b: number) => a + b, 0) / improvements.length
      : null;

    // Distribution based on improvement percentage
    const distribution = {
      excellent: improvements.filter((i: number) => i >= 75).length,
      good: improvements.filter((i: number) => i >= 50 && i < 75).length,
      moderate: improvements.filter((i: number) => i >= 25 && i < 50).length,
      poor: improvements.filter((i: number) => i < 25).length,
    };

    return {
      count: similarCases.length,
      averageImprovement: avgImprovement,
      distribution,
      anonymizedData: {
        totalCases: similarCases.length,
        avgImprovement,
        outcomeDistribution: distribution,
      },
    };
  } catch (error) {
    // If table doesn't exist yet or query fails, return empty results
    return {
      count: 0,
      averageImprovement: null,
      distribution: { excellent: 0, good: 0, moderate: 0, poor: 0 },
      anonymizedData: null,
    };
  }
}

/**
 * Get baseline outcome expectation based on condition
 */
function getBaselineOutcome(diagnosisCode: string, symptomDuration: string): {
  description: string;
  expectedImprovement: number;
  timeline: string;
  confidence: number;
} {
  // Baseline outcomes by condition type
  const baselineByCode: Record<string, { improvement: number; timeline: string; description: string }> = {
    'M54.5': { improvement: 75, timeline: '4-8 weeks', description: 'Good prognosis for low back pain with conservative care' },
    'M54.2': { improvement: 70, timeline: '4-6 weeks', description: 'Good prognosis for neck pain with appropriate treatment' },
    'M54.6': { improvement: 75, timeline: '3-6 weeks', description: 'Thoracic pain typically responds well to treatment' },
    'M99.0': { improvement: 80, timeline: '2-4 weeks', description: 'Segmental dysfunction responds well to chiropractic care' },
    'M51.1': { improvement: 60, timeline: '6-12 weeks', description: 'Disc conditions may require longer treatment course' },
    'M47.8': { improvement: 55, timeline: '8-12 weeks', description: 'Spondylosis management focuses on function improvement' },
    'S13.4': { improvement: 70, timeline: '4-8 weeks', description: 'Cervical sprain typically resolves with care' },
    'S33.5': { improvement: 75, timeline: '4-8 weeks', description: 'Lumbar sprain typically resolves with care' },
  };

  // Find matching baseline
  let baseline = baselineByCode['M54.5']; // Default to LBP
  for (const [code, data] of Object.entries(baselineByCode)) {
    if (diagnosisCode.startsWith(code)) {
      baseline = data;
      break;
    }
  }

  // Adjust for symptom duration
  let improvement = baseline.improvement;
  let timeline = baseline.timeline;
  let confidence = 70;

  switch (symptomDuration) {
    case 'acute':
      improvement = Math.min(improvement + 15, 95);
      timeline = baseline.timeline.replace(/(\d+)-(\d+)/, (_, a, b) => `${Math.max(1, parseInt(a) - 2)}-${parseInt(b) - 2}`);
      confidence = 80;
      break;
    case 'subacute':
      // Keep baseline
      confidence = 75;
      break;
    case 'chronic':
      improvement = Math.max(improvement - 25, 30);
      timeline = baseline.timeline.replace(/(\d+)-(\d+) weeks/, (_, a, b) => `${parseInt(a) * 2}-${parseInt(b) * 2} weeks`);
      confidence = 60;
      break;
    default:
      confidence = 65;
  }

  return {
    description: baseline.description,
    expectedImprovement: improvement,
    timeline,
    confidence,
  };
}

/**
 * Adjust outcome prediction based on individual patient factors
 */
function adjustOutcomeForFactors(
  baseline: { description: string; expectedImprovement: number; timeline: string; confidence: number },
  factors: {
    age: number | null;
    riskFactors: string[];
    comorbidities: string[];
    symptomDuration: string;
    similarCasesAverage: number | null;
  }
): {
  description: string;
  expectedImprovement: number;
  timeline: string;
  confidence: number;
  favorableFactors: string[];
  unfavorableFactors: string[];
  neutralFactors: string[];
} {
  let improvement = baseline.expectedImprovement;
  let confidence = baseline.confidence;
  const favorableFactors: string[] = [];
  const unfavorableFactors: string[] = [];
  const neutralFactors: string[] = [];

  // Age adjustments
  if (factors.age) {
    if (factors.age < 40) {
      improvement += 5;
      favorableFactors.push('Younger age associated with better outcomes');
    } else if (factors.age > 65) {
      improvement -= 10;
      unfavorableFactors.push('Advanced age may slow recovery');
    } else {
      neutralFactors.push('Age within typical range');
    }
  }

  // Risk factor adjustments
  const highRiskFactors = [
    'Chronic symptom duration',
    'Previous treatment failure',
    'Psychological distress',
    'Workers compensation case',
    'Fear avoidance behavior',
  ];

  const moderateRiskFactors = [
    'Sedentary lifestyle',
    'Smoking history',
    'Overweight/obesity',
    'Heavy physical work',
    'Neurological involvement',
  ];

  for (const rf of factors.riskFactors) {
    if (highRiskFactors.some(hrf => rf.includes(hrf))) {
      improvement -= 10;
      confidence -= 5;
      unfavorableFactors.push(rf);
    } else if (moderateRiskFactors.some(mrf => rf.includes(mrf))) {
      improvement -= 5;
      unfavorableFactors.push(rf);
    }
  }

  // Comorbidity adjustments
  if (factors.comorbidities.length > 2) {
    improvement -= 10;
    unfavorableFactors.push('Multiple comorbidities');
  } else if (factors.comorbidities.length > 0) {
    improvement -= 5;
    neutralFactors.push('Some comorbidities present');
  } else {
    favorableFactors.push('No significant comorbidities');
  }

  // Incorporate similar cases data if available
  if (factors.similarCasesAverage !== null) {
    // Blend baseline with actual outcomes from similar cases
    const blendWeight = 0.3; // 30% weight to similar cases
    improvement = improvement * (1 - blendWeight) + factors.similarCasesAverage * blendWeight;
    confidence += 10; // More confident with real data
    favorableFactors.push(`Based on ${factors.similarCasesAverage.toFixed(0)}% avg improvement in similar cases`);
  }

  // Add favorable factors if no major risks
  if (factors.riskFactors.length === 0) {
    favorableFactors.push('No identified risk factors');
    improvement += 5;
  }

  if (factors.symptomDuration === 'acute') {
    favorableFactors.push('Acute presentation with good prognosis');
  }

  // Cap values
  improvement = Math.min(Math.max(improvement, 10), 95);
  confidence = Math.min(Math.max(confidence, 40), 95);

  // Update description based on adjustment
  let description = baseline.description;
  if (improvement >= 70) {
    description = `Good prognosis expected. ${baseline.description}`;
  } else if (improvement >= 50) {
    description = `Moderate improvement expected with consistent care. Some factors may affect recovery.`;
  } else {
    description = `Conservative improvement expected. Multiple factors may extend recovery time.`;
  }

  return {
    description,
    expectedImprovement: improvement,
    timeline: baseline.timeline,
    confidence,
    favorableFactors,
    unfavorableFactors,
    neutralFactors,
  };
}

/**
 * Calculate risk of condition becoming chronic
 */
function calculateChronicityRisk(factors: {
  diagnosisCode: string;
  symptomDuration: string;
  age: number | null;
  riskFactors: string[];
  previousTreatments: string[];
}): number {
  let risk = 15; // Base risk

  // Duration impact
  switch (factors.symptomDuration) {
    case 'acute':
      risk -= 5;
      break;
    case 'subacute':
      risk += 10;
      break;
    case 'chronic':
      risk += 30;
      break;
  }

  // Age impact
  if (factors.age && factors.age > 55) {
    risk += 10;
  }

  // Risk factors impact
  const chronicityRiskFactors = [
    'Psychological distress',
    'Fear avoidance behavior',
    'Workers compensation case',
    'Previous treatment failure',
    'Chronic symptom duration',
  ];

  for (const rf of factors.riskFactors) {
    if (chronicityRiskFactors.some(crf => rf.includes(crf))) {
      risk += 15;
    }
  }

  // Condition-specific risks
  if (factors.diagnosisCode.startsWith('M51')) {
    risk += 15; // Disc conditions higher chronicity risk
  }
  if (factors.diagnosisCode.startsWith('M47')) {
    risk += 10; // Spondylosis tends toward chronic
  }

  return Math.min(Math.max(risk, 5), 95);
}

/**
 * Determine treatment response category
 */
function determineTreatmentResponse(expectedImprovement: number): string {
  if (expectedImprovement >= 75) return 'EXCELLENT';
  if (expectedImprovement >= 60) return 'GOOD';
  if (expectedImprovement >= 40) return 'MODERATE';
  return 'POOR';
}

/**
 * Get description for treatment response
 */
function getResponseDescription(response: string): string {
  const descriptions: Record<string, string> = {
    EXCELLENT: 'Patient expected to respond very well to treatment with significant improvement',
    GOOD: 'Patient expected to respond well with notable improvement in symptoms and function',
    MODERATE: 'Patient expected to show moderate improvement; consistent care important',
    POOR: 'Response may be limited; consider multimodal approach and managing expectations',
  };
  return descriptions[response] || descriptions['MODERATE'];
}

/**
 * Generate prognostic factors summary
 */
function generatePrognosticFactors(factors: {
  favorable: string[];
  unfavorable: string[];
  neutral: string[];
}): any {
  return {
    favorable: factors.favorable,
    unfavorable: factors.unfavorable,
    neutral: factors.neutral,
    summary: factors.favorable.length > factors.unfavorable.length
      ? 'More favorable than unfavorable prognostic factors identified'
      : factors.unfavorable.length > factors.favorable.length
        ? 'Some unfavorable prognostic factors present that may affect recovery'
        : 'Balanced prognostic picture',
  };
}

/**
 * Generate patient-friendly explanation of outcome prediction
 */
function generatePatientExplanation(data: {
  condition: string;
  expectedOutcome: string;
  timeline: string;
  treatmentResponse: string;
  factors: any;
}): string {
  const responseExplanations: Record<string, string> = {
    EXCELLENT: 'Based on your condition and health profile, we expect you to respond very well to treatment.',
    GOOD: 'Based on your condition and health profile, we expect you to respond well to treatment.',
    MODERATE: 'Based on your condition and health profile, we expect gradual improvement with consistent treatment.',
    POOR: 'Your condition has some factors that may require a more comprehensive treatment approach.',
  };

  let explanation = `For your ${data.condition}, ${responseExplanations[data.treatmentResponse] || responseExplanations['MODERATE']} `;
  explanation += `We typically see meaningful improvement within ${data.timeline}. `;

  if (data.factors.favorable && data.factors.favorable.length > 0) {
    explanation += `In your favor: ${data.factors.favorable.slice(0, 2).join('; ')}. `;
  }

  if (data.factors.unfavorable && data.factors.unfavorable.length > 0) {
    explanation += `We'll pay special attention to: ${data.factors.unfavorable.slice(0, 2).join('; ')}. `;
  }

  explanation += 'Your active participation in treatment and following home care recommendations will optimize your results.';

  return explanation;
}

/**
 * Generate expectation setting points
 */
function generateExpectationSetting(data: {
  expectedImprovement: number;
  timeline: string;
  treatmentResponse: string;
  riskOfChronicity: number;
}): any {
  const points: string[] = [];

  // Timeline expectations
  points.push(`Expected treatment timeline: ${data.timeline}`);

  // Improvement expectations
  if (data.expectedImprovement >= 70) {
    points.push('Significant improvement in pain and function expected');
  } else if (data.expectedImprovement >= 50) {
    points.push('Moderate improvement expected with consistent care');
  } else {
    points.push('Gradual improvement expected; patience and consistency important');
  }

  // Phase expectations
  points.push('Initial phase focuses on pain relief and mobility');
  points.push('Subsequent phases focus on strengthening and prevention');

  // Chronicity warning if needed
  if (data.riskOfChronicity > 40) {
    points.push('Early and consistent treatment important to prevent chronic pain');
  }

  // Active participation
  points.push('Home exercises and lifestyle modifications enhance outcomes');

  return {
    keyPoints: points,
    improvementTarget: `${data.expectedImprovement.toFixed(0)}% improvement expected`,
    timeline: data.timeline,
    responseLevel: data.treatmentResponse,
    chronicityRisk: data.riskOfChronicity > 30 ? 'Moderate' : 'Low',
  };
}

/**
 * Generate AI-enhanced outcome prediction using Claude API
 */
async function generateAIOutcomePrediction(context: {
  diagnosis: { code: string; description: string };
  patientProfile: { age?: number; gender?: string; comorbidities: string[]; riskFactors: string[] };
  treatmentApproach: string;
  techniquesSuggested: string[];
  symptomDuration: string;
  chiefComplaint: string;
  subjective?: string;
  objective?: string;
  similarCasesData: any;
  baselinePrediction: any;
}): Promise<{
  predictedOutcome: string;
  timeline: string;
  additionalFactors: string[];
} | null> {
  // If no API key, return null to use rule-based prediction
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a clinical decision support system specializing in outcome prediction for chiropractic care.
Provide evidence-based outcome predictions considering patient-specific factors.
Be realistic and balanced - avoid overly optimistic or pessimistic predictions.

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks.`;

    const userPrompt = `Predict treatment outcome for this patient:

Diagnosis: ${context.diagnosis.code} - ${context.diagnosis.description}
Symptom Duration: ${context.symptomDuration}
Treatment Approach: ${context.treatmentApproach}
Techniques: ${context.techniquesSuggested.join(', ') || 'Standard chiropractic care'}

${context.patientProfile.age ? `Patient Age: ${context.patientProfile.age}` : ''}
${context.patientProfile.gender ? `Gender: ${context.patientProfile.gender}` : ''}
${context.patientProfile.comorbidities.length ? `Comorbidities: ${context.patientProfile.comorbidities.join(', ')}` : ''}
${context.patientProfile.riskFactors.length ? `Risk Factors: ${context.patientProfile.riskFactors.join(', ')}` : ''}

Chief Complaint: ${context.chiefComplaint || 'Not specified'}
${context.subjective ? `Patient Reports: ${context.subjective}` : ''}
${context.objective ? `Exam Findings: ${context.objective}` : ''}

Baseline Prediction:
- Expected Improvement: ${context.baselinePrediction.expectedImprovement}%
- Timeline: ${context.baselinePrediction.timeline}

${context.similarCasesData.count > 0 ? `Similar Cases: ${context.similarCasesData.count} cases with avg ${context.similarCasesData.averageImprovement?.toFixed(0) || 'N/A'}% improvement` : ''}

Respond with JSON:
{
  "predictedOutcome": "Refined prediction description incorporating all factors",
  "timeline": "Adjusted timeline if warranted",
  "additionalFactors": ["Any additional prognostic factors identified"]
}`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 800,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return null;
    }

    const parsed = JSON.parse(content.text);
    return {
      predictedOutcome: parsed.predictedOutcome || '',
      timeline: parsed.timeline || '',
      additionalFactors: Array.isArray(parsed.additionalFactors) ? parsed.additionalFactors : [],
    };
  } catch (error) {
    console.error('AI outcome prediction error:', error);
    return null;
  }
}

// ============================================
// US-372: Diagnosis Suggestion Router
// ============================================

export const aiClinicalRouter = router({
  /**
   * Get diagnosis suggestions based on encounter data
   * Analyzes subjective complaints, examination findings, and patient history
   */
  suggestDiagnosis: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        // Optional override inputs if not pulling from encounter
        chiefComplaint: z.string().optional(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        includeAI: z.boolean().default(true), // Whether to use AI suggestions
        maxSuggestions: z.number().min(1).max(20).default(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, maxSuggestions, includeAI } = input;

      // Fetch encounter with related data
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          soapNote: true,
          patient: {
            include: {
              demographics: true,
            },
          },
          diagnoses: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          chiropracticExam: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Gather clinical information
      const chiefComplaint = input.chiefComplaint || encounter.chiefComplaint || '';
      const subjective = input.subjective || encounter.soapNote?.subjective || '';
      const objective = input.objective || encounter.soapNote?.objective || '';

      // Combine all text for analysis
      const combinedText = `${chiefComplaint} ${subjective} ${objective}`;

      // Detect red flags
      const redFlags = detectRedFlags(combinedText);
      const hasRedFlags = redFlags.length > 0;
      const hasCriticalFlags = redFlags.some(flag => flag.severity === 'CRITICAL');

      // Extract keywords for matching
      const keywords = extractClinicalKeywords(combinedText);

      // Get existing codes used for this patient
      const existingCodes = encounter.diagnoses.map(d => d.icd10Code);

      // Rule-based suggestions
      const ruleBasedSuggestions = CHIRO_ICD10_CODES
        .map(code => ({
          code: code.code,
          description: code.description,
          confidence: scoreDiagnosisMatch(code, keywords, chiefComplaint),
          reasoning: `Matched based on: ${keywords.filter(k =>
            code.description.toLowerCase().includes(k) || code.region === k
          ).join(', ') || 'general clinical presentation'}`,
          supportingFindings: keywords,
          source: 'rule-based' as const,
        }))
        .filter(s => s.confidence > 20)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      // AI-based suggestions (if enabled)
      let aiSuggestions: Array<{
        code: string;
        description: string;
        confidence: number;
        reasoning: string;
        supportingFindings: string[];
        source: 'ai';
      }> = [];

      if (includeAI) {
        const aiResults = await generateAIDiagnosisSuggestions({
          chiefComplaint,
          subjective,
          objective,
          existingCodes,
        });

        aiSuggestions = aiResults.map(r => ({
          ...r,
          source: 'ai' as const,
        }));
      }

      // Merge and deduplicate suggestions
      const allSuggestions = [...aiSuggestions, ...ruleBasedSuggestions];
      const uniqueSuggestions = allSuggestions.reduce((acc, curr) => {
        const existing = acc.find(s => s.code === curr.code);
        if (!existing) {
          acc.push(curr);
        } else if (curr.source === 'ai' && existing.source !== 'ai') {
          // Prefer AI suggestions for reasoning
          const idx = acc.indexOf(existing);
          acc[idx] = {
            ...curr,
            confidence: Math.max(curr.confidence, existing.confidence),
          };
        }
        return acc;
      }, [] as typeof allSuggestions);

      // Sort by confidence and limit
      const finalSuggestions = uniqueSuggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      // Store suggestions in database
      const storedSuggestions = await ctx.prisma.$transaction(
        finalSuggestions.map(suggestion =>
          ctx.prisma.diagnosisSuggestion.create({
            data: {
              encounterId,
              organizationId: ctx.user.organizationId,
              suggestedCode: suggestion.code,
              suggestedDescription: suggestion.description,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
              supportingFindings: suggestion.supportingFindings,
              hasRedFlags,
              redFlagDetails: hasRedFlags
                ? redFlags.map(f => `${f.type}: ${f.message}`).join('\n')
                : null,
              evidenceLevel: suggestion.source === 'ai' ? 'MODERATE' : 'LOW',
              guidelines: [],
            },
          })
        )
      );

      // Create alerts for red flags
      if (hasRedFlags) {
        await ctx.prisma.$transaction(
          redFlags.map(flag =>
            ctx.prisma.clinicalAlert.create({
              data: {
                patientId: encounter.patientId,
                encounterId,
                organizationId: ctx.user.organizationId,
                alertType: 'RED_FLAG',
                severity: flag.severity,
                message: flag.message,
                description: `Detected keywords: ${flag.matchedKeywords.join(', ')}`,
                recommendation: flag.recommendation,
                triggeredBy: 'AI Clinical Decision Support',
                relatedData: { flagType: flag.type, keywords: flag.matchedKeywords },
              },
            })
          )
        );
      }

      // Log the action
      await auditLog('AI_DIAGNOSIS_SUGGESTION', 'DiagnosisSuggestion', {
        entityId: encounterId,
        changes: {
          suggestionsCount: finalSuggestions.length,
          hasRedFlags,
          redFlagTypes: redFlags.map(f => f.type),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        suggestions: storedSuggestions.map(s => ({
          id: s.id,
          code: s.suggestedCode,
          description: s.suggestedDescription,
          confidence: Number(s.confidence),
          reasoning: s.reasoning,
          supportingFindings: s.supportingFindings as string[] | null,
          hasRedFlags: s.hasRedFlags,
        })),
        redFlags: redFlags.map(flag => ({
          type: flag.type,
          severity: flag.severity,
          message: flag.message,
          recommendation: flag.recommendation,
        })),
        hasCriticalFlags,
        analyzedText: {
          chiefComplaint: chiefComplaint || null,
          hasSubjective: !!subjective,
          hasObjective: !!objective,
        },
        keywords,
      };
    }),

  /**
   * Accept a diagnosis suggestion and add it to the encounter
   */
  acceptSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        isPrimary: z.boolean().default(false),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, isPrimary, notes } = input;

      // Get the suggestion
      const suggestion = await ctx.prisma.diagnosisSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      if (suggestion.isAccepted || suggestion.isRejected) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has already been processed',
        });
      }

      // Get current highest sequence
      const highestSeq = await ctx.prisma.diagnosis.findFirst({
        where: { encounterId: suggestion.encounterId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const sequence = (highestSeq?.sequence ?? 0) + 1;

      // If setting as primary, unset others
      if (isPrimary) {
        await ctx.prisma.diagnosis.updateMany({
          where: { encounterId: suggestion.encounterId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Create the diagnosis
      const diagnosis = await ctx.prisma.diagnosis.create({
        data: {
          encounterId: suggestion.encounterId,
          icd10Code: suggestion.suggestedCode,
          description: suggestion.suggestedDescription,
          isPrimary,
          status: 'ACTIVE',
          notes: notes || `AI-suggested: ${suggestion.reasoning}`,
          sequence,
        },
      });

      // Mark suggestion as accepted
      await ctx.prisma.diagnosisSuggestion.update({
        where: { id: suggestionId },
        data: {
          isAccepted: true,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      // Log for learning
      await auditLog('AI_SUGGESTION_ACCEPTED', 'DiagnosisSuggestion', {
        entityId: suggestionId,
        changes: {
          diagnosisId: diagnosis.id,
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        diagnosis,
        suggestion: {
          id: suggestion.id,
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
        },
      };
    }),

  /**
   * Reject a diagnosis suggestion with optional reason
   */
  rejectSuggestion: providerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { suggestionId, reason } = input;

      // Get the suggestion
      const suggestion = await ctx.prisma.diagnosisSuggestion.findFirst({
        where: {
          id: suggestionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      if (suggestion.isAccepted || suggestion.isRejected) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Suggestion has already been processed',
        });
      }

      // Mark as rejected
      const updated = await ctx.prisma.diagnosisSuggestion.update({
        where: { id: suggestionId },
        data: {
          isRejected: true,
          rejectionReason: reason,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      // Log for learning
      await auditLog('AI_SUGGESTION_REJECTED', 'DiagnosisSuggestion', {
        entityId: suggestionId,
        changes: {
          code: suggestion.suggestedCode,
          confidence: Number(suggestion.confidence),
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        code: updated.suggestedCode,
        rejected: true,
      };
    }),

  /**
   * Get pending suggestions for an encounter
   */
  getPendingSuggestions: protectedProcedure
    .input(
      z.object({
        encounterId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId } = input;

      // Verify encounter access
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      const suggestions = await ctx.prisma.diagnosisSuggestion.findMany({
        where: {
          encounterId,
          isAccepted: false,
          isRejected: false,
        },
        orderBy: { confidence: 'desc' },
      });

      return suggestions.map(s => ({
        id: s.id,
        code: s.suggestedCode,
        description: s.suggestedDescription,
        confidence: Number(s.confidence),
        reasoning: s.reasoning,
        supportingFindings: s.supportingFindings as string[] | null,
        hasRedFlags: s.hasRedFlags,
        redFlagDetails: s.redFlagDetails,
        evidenceLevel: s.evidenceLevel,
        createdAt: s.createdAt,
      }));
    }),

  /**
   * Get active clinical alerts for a patient
   */
  getPatientAlerts: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        includeAcknowledged: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, includeAcknowledged } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Prisma.ClinicalAlertWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (encounterId) {
        where.encounterId = encounterId;
      }

      if (!includeAcknowledged) {
        where.status = 'ACTIVE';
      }

      const alerts = await ctx.prisma.clinicalAlert.findMany({
        where,
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return alerts.map(alert => ({
        id: alert.id,
        type: alert.alertType,
        severity: alert.severity,
        status: alert.status,
        message: alert.message,
        description: alert.description,
        recommendation: alert.recommendation,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.acknowledgedAt,
        encounterId: alert.encounterId,
      }));
    }),

  /**
   * Acknowledge a clinical alert
   */
  acknowledgeAlert: providerProcedure
    .input(
      z.object({
        alertId: z.string(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { alertId, note } = input;

      const alert = await ctx.prisma.clinicalAlert.findFirst({
        where: {
          id: alertId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      const updated = await ctx.prisma.clinicalAlert.update({
        where: { id: alertId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.user.id,
          resolutionNote: note,
        },
      });

      await auditLog('CLINICAL_ALERT_ACKNOWLEDGED', 'ClinicalAlert', {
        entityId: alertId,
        changes: {
          alertType: alert.alertType,
          severity: alert.severity,
          note,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        status: updated.status,
        acknowledgedAt: updated.acknowledgedAt,
      };
    }),

  /**
   * Get suggestion acceptance rate for learning/analytics
   */
  getSuggestionStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, providerId } = input;

      const where: Prisma.DiagnosisSuggestionWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      if (providerId) {
        where.encounter = { providerId };
      }

      const [total, accepted, rejected] = await Promise.all([
        ctx.prisma.diagnosisSuggestion.count({ where }),
        ctx.prisma.diagnosisSuggestion.count({
          where: { ...where, isAccepted: true },
        }),
        ctx.prisma.diagnosisSuggestion.count({
          where: { ...where, isRejected: true },
        }),
      ]);

      // Get top accepted codes
      const topAccepted = await ctx.prisma.diagnosisSuggestion.groupBy({
        by: ['suggestedCode'],
        where: { ...where, isAccepted: true },
        _count: { suggestedCode: true },
        orderBy: { _count: { suggestedCode: 'desc' } },
        take: 10,
      });

      // Get top rejected codes
      const topRejected = await ctx.prisma.diagnosisSuggestion.groupBy({
        by: ['suggestedCode'],
        where: { ...where, isRejected: true },
        _count: { suggestedCode: true },
        orderBy: { _count: { suggestedCode: 'desc' } },
        take: 10,
      });

      return {
        total,
        accepted,
        rejected,
        pending: total - accepted - rejected,
        acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        topAcceptedCodes: topAccepted.map(t => ({
          code: t.suggestedCode,
          count: t._count.suggestedCode,
        })),
        topRejectedCodes: topRejected.map(t => ({
          code: t.suggestedCode,
          count: t._count.suggestedCode,
        })),
      };
    }),

  // ============================================
  // US-373: Treatment Recommendations
  // ============================================

  /**
   * Get treatment recommendations based on diagnosis
   * Provides evidence-based treatment options with technique suggestions
   */
  recommendTreatment: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        diagnosisCode: z.string(),
        diagnosisDescription: z.string().optional(),
        // Optional context
        chiefComplaint: z.string().optional(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        // Patient preferences
        patientPreferences: z.array(z.enum(['lowForce', 'noManual', 'activeInvolvement', 'quickVisits'])).optional(),
        includeAI: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        diagnosisCode,
        diagnosisDescription,
        chiefComplaint,
        subjective,
        objective,
        patientPreferences,
        includeAI,
      } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          treatmentRecommendations: {
            where: { isAccepted: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get encounter if provided
      let encounter = null;
      if (encounterId) {
        encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            soapNote: true,
            chiropracticExam: true,
          },
        });
      }

      // Gather clinical context
      const clinicalChiefComplaint = chiefComplaint || encounter?.chiefComplaint || '';
      const clinicalSubjective = subjective || encounter?.soapNote?.subjective || '';
      const clinicalObjective = objective || encounter?.soapNote?.objective || '';
      const combinedText = `${clinicalChiefComplaint} ${clinicalSubjective} ${clinicalObjective}`;

      // Determine acuity
      const acuity = determineAcuity(clinicalChiefComplaint, clinicalSubjective, '');
      const frequencyGuideline = FREQUENCY_GUIDELINES[acuity];

      // Find matching protocol
      const protocol = findMatchingProtocol(diagnosisCode);

      // Get patient age from demographics
      const patientAge = patient.demographics?.dateOfBirth
        ? Math.floor((Date.now() - new Date(patient.demographics.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : undefined;

      // Calculate technique scores
      const techniqueScores = CHIRO_TECHNIQUES.map(technique => ({
        ...technique,
        score: scoreTechniqueSuitability(technique, {
          age: patientAge,
          preferences: patientPreferences,
        }),
      })).sort((a, b) => b.score - a.score);

      // Get existing treatments for context
      const existingTreatments = patient.treatmentRecommendations
        .map(tr => tr.techniquesSuggested)
        .flat()
        .filter(Boolean);

      // Build rule-based recommendation
      let recommendation = '';
      let suggestedTechniques: string[] = [];
      let adjunctTherapies: string[] = [];
      let exercises: string[] = [];
      let expectedOutcome = '';
      let expectedTimeline = frequencyGuideline.totalVisits;
      let prognosis = '';
      let alternatives: Array<{ approach: string; reason: string }> = [];
      let evidenceLevel: 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW' | 'EXPERT' = 'MODERATE';
      let evidenceSummary = '';
      let citations: string[] = [];

      if (protocol) {
        // Use matched protocol
        recommendation = `Based on ${protocol.condition}, recommend ${protocol.primaryTechniques.slice(0, 3).join(', ')} with ${protocol.adjunctTherapies.slice(0, 2).join(', ')}. ${acuity.charAt(0).toUpperCase() + acuity.slice(1)} presentation suggests ${frequencyGuideline.initial} initially.`;
        suggestedTechniques = protocol.primaryTechniques;
        adjunctTherapies = protocol.adjunctTherapies;
        exercises = protocol.exercises;
        expectedOutcome = protocol.expectedOutcome;
        expectedTimeline = protocol.typicalDuration;
        prognosis = protocol.prognosis;
        alternatives = protocol.alternatives.map(alt => ({
          approach: alt,
          reason: 'Evidence-based alternative approach',
        }));
        evidenceLevel = protocol.evidence;
        evidenceSummary = `Treatment protocol based on clinical guidelines for ${protocol.condition}`;
        citations = [
          'CCGPP Guidelines for Chiropractic Quality Assurance',
          'JMPT Evidence-Based Practice Guidelines',
        ];
      } else {
        // Generic recommendation based on keyword analysis
        const keywords = extractClinicalKeywords(combinedText);
        const topTechniques = techniqueScores.slice(0, 3);

        recommendation = `For ${diagnosisDescription || diagnosisCode}, recommend ${topTechniques.map(t => t.name).join(', ')}. ${acuity.charAt(0).toUpperCase() + acuity.slice(1)} presentation suggests ${frequencyGuideline.initial} initially.`;
        suggestedTechniques = topTechniques.map(t => t.name);
        adjunctTherapies = techniqueScores
          .filter(t => t.category === 'therapy' || t.category === 'soft_tissue')
          .slice(0, 2)
          .map(t => t.name);
        exercises = techniqueScores
          .filter(t => t.category === 'exercise')
          .slice(0, 2)
          .map(t => t.name);
        expectedOutcome = `Symptom improvement expected within 2-4 weeks with consistent care`;
        prognosis = `Good with appropriate conservative care`;
        evidenceLevel = 'MODERATE';
        evidenceSummary = 'Generic recommendation based on clinical presentation';
      }

      // Try AI enhancement if enabled
      let aiRecommendation = null;
      if (includeAI) {
        aiRecommendation = await generateAITreatmentRecommendations({
          diagnosis: { code: diagnosisCode, description: diagnosisDescription || '' },
          patientProfile: {
            age: patientAge,
            gender: patient.demographics?.gender || undefined,
            preferences: patientPreferences,
          },
          chiefComplaint: clinicalChiefComplaint,
          subjective: clinicalSubjective,
          objective: clinicalObjective,
          existingTreatments,
          acuity,
        });

        if (aiRecommendation) {
          // Merge AI insights with rule-based
          recommendation = aiRecommendation.recommendation || recommendation;
          if (aiRecommendation.techniques.length > 0) {
            suggestedTechniques = [...new Set([...aiRecommendation.techniques, ...suggestedTechniques])].slice(0, 5);
          }
          expectedOutcome = aiRecommendation.expectedOutcome || expectedOutcome;
          expectedTimeline = aiRecommendation.duration || expectedTimeline;
          if (aiRecommendation.alternatives.length > 0) {
            alternatives = aiRecommendation.alternatives;
          }
          evidenceSummary = aiRecommendation.evidence || evidenceSummary;
          if (aiRecommendation.citations.length > 0) {
            citations = [...new Set([...aiRecommendation.citations, ...citations])];
          }
        }
      }

      // Check for red flags
      const redFlags = detectRedFlags(combinedText);
      const contraindications = protocol?.contraindications || [];

      // Create the recommendation record
      const treatmentRec = await ctx.prisma.treatmentRecommendation.create({
        data: {
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
          conditionCode: diagnosisCode,
          conditionDescription: diagnosisDescription || diagnosisCode,
          recommendation,
          treatmentType: 'chiropractic',
          techniquesSuggested: suggestedTechniques,
          frequencyRecommended: frequencyGuideline.initial,
          durationRecommended: expectedTimeline,
          expectedOutcome,
          expectedTimeline,
          prognosis,
          alternativeOptions: alternatives,
          patientPreferences: patientPreferences || [],
          evidenceLevel,
          evidenceSummary,
          guidelineCitations: citations,
          evidenceReferences: {
            protocols: protocol ? [protocol.condition] : [],
            aiEnhanced: !!aiRecommendation,
          },
        },
      });

      // Create alerts for contraindications/red flags
      if (redFlags.length > 0 || contraindications.length > 0) {
        const alertMessages = [
          ...redFlags.map(rf => ({
            type: 'RED_FLAG' as const,
            severity: rf.severity,
            message: rf.message,
            recommendation: rf.recommendation,
          })),
          ...contraindications.map(ci => ({
            type: 'CONTRAINDICATION' as const,
            severity: 'HIGH' as const,
            message: `Contraindication: ${ci}`,
            recommendation: 'Review before proceeding with treatment',
          })),
        ];

        await ctx.prisma.$transaction(
          alertMessages.map(alert =>
            ctx.prisma.clinicalAlert.create({
              data: {
                patientId,
                encounterId,
                organizationId: ctx.user.organizationId,
                alertType: alert.type,
                severity: alert.severity,
                message: alert.message,
                recommendation: alert.recommendation,
                triggeredBy: 'AI Treatment Recommendation',
              },
            })
          )
        );
      }

      // Audit log
      await auditLog('AI_TREATMENT_RECOMMENDATION', 'TreatmentRecommendation', {
        entityId: treatmentRec.id,
        changes: {
          diagnosisCode,
          acuity,
          techniqueCount: suggestedTechniques.length,
          hasProtocol: !!protocol,
          aiEnhanced: !!aiRecommendation,
          redFlagCount: redFlags.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: treatmentRec.id,
        recommendation: treatmentRec.recommendation,
        condition: {
          code: diagnosisCode,
          description: diagnosisDescription || diagnosisCode,
        },
        acuity,
        techniques: {
          primary: suggestedTechniques,
          adjunct: adjunctTherapies,
          exercises,
        },
        frequency: {
          recommended: frequencyGuideline.initial,
          initial: frequencyGuideline.initial,
          transition: frequencyGuideline.transition,
          maintenance: frequencyGuideline.maintenance,
        },
        outcomes: {
          expected: expectedOutcome,
          timeline: expectedTimeline,
          prognosis,
        },
        alternatives,
        evidence: {
          level: evidenceLevel,
          summary: evidenceSummary,
          citations,
        },
        safety: {
          redFlags: redFlags.map(rf => ({
            type: rf.type,
            severity: rf.severity,
            message: rf.message,
          })),
          contraindications,
        },
        patientFactors: {
          age: patientAge,
          preferences: patientPreferences,
        },
        sourceInfo: {
          hasMatchedProtocol: !!protocol,
          aiEnhanced: !!aiRecommendation,
          protocolName: protocol?.condition,
        },
      };
    }),

  /**
   * Accept a treatment recommendation
   */
  acceptTreatmentRecommendation: providerProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        modifications: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { recommendationId, modifications } = input;

      const recommendation = await ctx.prisma.treatmentRecommendation.findFirst({
        where: {
          id: recommendationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!recommendation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment recommendation not found',
        });
      }

      if (recommendation.isAccepted) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Recommendation already accepted',
        });
      }

      const updated = await ctx.prisma.treatmentRecommendation.update({
        where: { id: recommendationId },
        data: {
          isAccepted: true,
          isModified: !!modifications,
          modificationNotes: modifications,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      await auditLog('AI_TREATMENT_RECOMMENDATION', 'TreatmentRecommendation', {
        entityId: recommendationId,
        changes: {
          action: 'accepted',
          modified: !!modifications,
          modificationNotes: modifications,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        accepted: true,
        modified: !!modifications,
        acceptedAt: updated.selectedAt,
      };
    }),

  /**
   * Reject a treatment recommendation with reason
   */
  rejectTreatmentRecommendation: providerProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { recommendationId, reason } = input;

      const recommendation = await ctx.prisma.treatmentRecommendation.findFirst({
        where: {
          id: recommendationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!recommendation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment recommendation not found',
        });
      }

      // Mark as modified but not accepted (indicates rejection)
      const updated = await ctx.prisma.treatmentRecommendation.update({
        where: { id: recommendationId },
        data: {
          isAccepted: false,
          isModified: true,
          modificationNotes: `REJECTED: ${reason}`,
          selectedAt: new Date(),
          selectedBy: ctx.user.id,
        },
      });

      await auditLog('AI_TREATMENT_RECOMMENDATION', 'TreatmentRecommendation', {
        entityId: recommendationId,
        changes: {
          action: 'rejected',
          reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        rejected: true,
        reason,
      };
    }),

  /**
   * Get pending treatment recommendations for a patient
   */
  getPendingTreatmentRecommendations: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Prisma.TreatmentRecommendationWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
        isAccepted: false,
        modificationNotes: {
          not: {
            startsWith: 'REJECTED:',
          },
        },
      };

      if (encounterId) {
        where.encounterId = encounterId;
      }

      const recommendations = await ctx.prisma.treatmentRecommendation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return recommendations.map(rec => ({
        id: rec.id,
        condition: {
          code: rec.conditionCode,
          description: rec.conditionDescription,
        },
        recommendation: rec.recommendation,
        techniques: rec.techniquesSuggested,
        frequency: rec.frequencyRecommended,
        duration: rec.durationRecommended,
        expectedOutcome: rec.expectedOutcome,
        prognosis: rec.prognosis,
        evidenceLevel: rec.evidenceLevel,
        createdAt: rec.createdAt,
        encounterId: rec.encounterId,
      }));
    }),

  /**
   * Get treatment recommendation statistics for learning
   */
  getTreatmentRecommendationStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, providerId } = input;

      const where: Prisma.TreatmentRecommendationWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      if (providerId) {
        where.encounter = { providerId };
      }

      const [total, accepted, modified, rejected] = await Promise.all([
        ctx.prisma.treatmentRecommendation.count({ where }),
        ctx.prisma.treatmentRecommendation.count({
          where: { ...where, isAccepted: true },
        }),
        ctx.prisma.treatmentRecommendation.count({
          where: { ...where, isAccepted: true, isModified: true },
        }),
        ctx.prisma.treatmentRecommendation.count({
          where: {
            ...where,
            isAccepted: false,
            modificationNotes: { startsWith: 'REJECTED:' },
          },
        }),
      ]);

      // Get most recommended techniques
      const topTechniques = await ctx.prisma.treatmentRecommendation.findMany({
        where: { ...where, isAccepted: true },
        select: { techniquesSuggested: true },
      });

      const techniqueCounts: Record<string, number> = {};
      topTechniques.forEach(rec => {
        rec.techniquesSuggested.forEach(technique => {
          techniqueCounts[technique] = (techniqueCounts[technique] || 0) + 1;
        });
      });

      const topTechniquesList = Object.entries(techniqueCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([technique, count]) => ({ technique, count }));

      // Get top conditions
      const topConditions = await ctx.prisma.treatmentRecommendation.groupBy({
        by: ['conditionCode'],
        where: { ...where, isAccepted: true },
        _count: { conditionCode: true },
        orderBy: { _count: { conditionCode: 'desc' } },
        take: 10,
      });

      return {
        total,
        accepted,
        modified,
        rejected,
        pending: total - accepted - rejected,
        acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        modificationRate: accepted > 0 ? Math.round((modified / accepted) * 100) : 0,
        topTechniques: topTechniquesList,
        topConditions: topConditions.map(c => ({
          code: c.conditionCode || 'Unknown',
          count: c._count.conditionCode,
        })),
      };
    }),

  // ============================================
  // US-374: Contraindication Alerts
  // ============================================

  /**
   * Check for contraindications before a treatment/procedure
   * Analyzes patient conditions, medications, age, recent surgeries/trauma, and red flags
   */
  checkContraindications: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        // Procedure being considered
        procedure: z.string(),
        procedureCode: z.string().optional(), // CPT code
        // Optional overrides if not pulling from patient record
        conditions: z.array(z.string()).optional(),
        medications: z.array(z.string()).optional(),
        allergies: z.array(z.string()).optional(),
        clinicalNotes: z.string().optional(),
        recentSurgeries: z.array(z.object({
          procedure: z.string(),
          date: z.coerce.date(),
        })).optional(),
        recentTrauma: z.array(z.object({
          description: z.string(),
          date: z.coerce.date(),
        })).optional(),
        includeAI: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        procedure,
        procedureCode,
        conditions: inputConditions,
        medications: inputMedications,
        allergies: inputAllergies,
        clinicalNotes: inputClinicalNotes,
        recentSurgeries,
        recentTrauma,
        includeAI,
      } = input;

      // Fetch patient with demographics and existing contraindications
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contraindications: {
            where: { isActive: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get encounter for additional context if provided
      let encounter = null;
      let encounterNotes = '';
      if (encounterId) {
        encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            soapNote: true,
          },
        });
        if (encounter) {
          encounterNotes = [
            encounter.chiefComplaint,
            encounter.soapNote?.subjective,
            encounter.soapNote?.objective,
          ].filter(Boolean).join('\n');
        }
      }

      // Gather patient data from record and inputs
      const patientAge = patient.demographics?.dateOfBirth
        ? Math.floor((Date.now() - new Date(patient.demographics.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : undefined;

      // Use input conditions and medications (medical history would come from intake forms if available)
      const patientConditions: string[] = inputConditions || [];
      const patientMedications: string[] = inputMedications || [];

      // Combine clinical notes
      const clinicalNotes = [inputClinicalNotes, encounterNotes].filter(Boolean).join('\n');

      // Run rule-based contraindication check
      const ruleBasedResults = checkContraindicationRules(
        procedure,
        procedureCode || null,
        {
          conditions: patientConditions,
          medications: patientMedications,
          age: patientAge,
          recentSurgeries,
          recentTrauma,
          clinicalNotes,
        }
      );

      // Check existing patient contraindications
      const existingContraindications = patient.contraindications
        .filter((ci: { procedure: string; contraindicationType: string; reason: string; source: string | null; isOverridden: boolean; overrideReason: string | null; isPermanent: boolean; expiresAt: Date | null; id: string }) => {
          // Check if this contraindication applies to the procedure
          const normalizedProcedure = procedure.toLowerCase();
          return ci.procedure.toLowerCase().includes(normalizedProcedure) ||
                 normalizedProcedure.includes(ci.procedure.toLowerCase()) ||
                 ci.procedure === 'All' ||
                 ci.procedure.toLowerCase().includes('spinal manipulation');
        })
        .map((ci: { id: string; procedure: string; contraindicationType: string; reason: string; source: string | null; isOverridden: boolean; overrideReason: string | null; isPermanent: boolean; expiresAt: Date | null }) => ({
          id: ci.id,
          procedure: ci.procedure,
          type: ci.contraindicationType,
          reason: ci.reason,
          source: ci.source,
          isOverridden: ci.isOverridden,
          overrideReason: ci.overrideReason,
          isPermanent: ci.isPermanent,
          expiresAt: ci.expiresAt,
        }));

      // Run AI analysis if enabled
      let aiResults = null;
      if (includeAI) {
        aiResults = await generateAIContraindicationAnalysis({
          procedure,
          patientProfile: {
            age: patientAge,
            conditions: patientConditions,
            medications: patientMedications,
            allergies: inputAllergies,
          },
          clinicalNotes,
          existingContraindications: [
            ...ruleBasedResults.map(r => r.rule.name),
            ...existingContraindications.map((ec: { reason: string }) => ec.reason),
          ],
        });
      }

      // Determine overall safety status
      const hasAbsoluteContraindication = ruleBasedResults.some(r => r.rule.type === 'ABSOLUTE') ||
        existingContraindications.some(ec => ec.type === 'ABSOLUTE' && !ec.isOverridden);
      const hasCriticalAlert = ruleBasedResults.some(r => r.severity === 'CRITICAL');
      const hasHighAlert = ruleBasedResults.some(r => r.severity === 'HIGH');

      let safetyStatus: 'CLEAR' | 'PRECAUTION' | 'RELATIVE' | 'ABSOLUTE';
      if (hasAbsoluteContraindication) {
        safetyStatus = 'ABSOLUTE';
      } else if (hasCriticalAlert || ruleBasedResults.some(r => r.rule.type === 'RELATIVE' && r.severity === 'HIGH')) {
        safetyStatus = 'RELATIVE';
      } else if (ruleBasedResults.length > 0 || existingContraindications.length > 0) {
        safetyStatus = 'PRECAUTION';
      } else {
        safetyStatus = 'CLEAR';
      }

      // Create alerts for detected contraindications
      const alertsToCreate = ruleBasedResults
        .filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH')
        .map(r => ({
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
          alertType: 'CONTRAINDICATION' as const,
          severity: r.severity,
          message: `${r.rule.name}: ${r.rule.reason}`,
          description: `Matched: ${r.matchedKeywords.join(', ')}. Source: ${r.matchSource}`,
          recommendation: r.rule.recommendation,
          triggeredBy: 'AI Contraindication Check',
          relatedData: {
            ruleId: r.rule.id,
            procedure,
            procedureCode,
            contraindicationType: r.rule.type,
          },
        }));

      if (alertsToCreate.length > 0) {
        await ctx.prisma.$transaction(
          alertsToCreate.map(alert => ctx.prisma.clinicalAlert.create({ data: alert }))
        );
      }

      // Store new contraindications in patient record
      const contraindicationsToStore = ruleBasedResults
        .filter(r => r.rule.type === 'ABSOLUTE' || (r.rule.type === 'RELATIVE' && r.severity !== 'LOW'))
        .filter(r => !existingContraindications.some((ec: { procedure: string; reason: string }) =>
          ec.procedure.toLowerCase() === r.rule.affectedProcedures[0]?.toLowerCase() &&
          ec.reason.toLowerCase().includes(r.rule.name.toLowerCase())
        ));

      if (contraindicationsToStore.length > 0) {
        await ctx.prisma.$transaction(
          contraindicationsToStore.map(ci => ctx.prisma.contraindication.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              procedure: ci.rule.affectedProcedures[0] || procedure,
              procedureCode: procedureCode || undefined,
              contraindicationType: ci.rule.type,
              reason: ci.rule.reason,
              source: ci.matchSource,
              sourceDetails: {
                ruleId: ci.rule.id,
                matchedKeywords: ci.matchedKeywords,
              },
              identifiedBy: ctx.user.id,
              isPermanent: ci.rule.source === 'condition' && ci.rule.type === 'ABSOLUTE',
              reviewDate: ci.rule.reviewPeriod
                ? new Date(Date.now() + ci.rule.reviewPeriod * 24 * 60 * 60 * 1000)
                : undefined,
            },
          }))
        );
      }

      // Audit log
      await auditLog('AI_CONTRAINDICATION_CHECK', 'Contraindication', {
        entityId: patientId,
        changes: {
          procedure,
          procedureCode,
          safetyStatus,
          contraindicationsFound: ruleBasedResults.length,
          existingContraindicationsChecked: existingContraindications.length,
          aiEnhanced: !!aiResults,
          alertsCreated: alertsToCreate.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        safetyStatus,
        canProceed: safetyStatus !== 'ABSOLUTE',
        requiresOverride: safetyStatus === 'RELATIVE',
        procedure: {
          name: procedure,
          code: procedureCode || null,
        },
        contraindications: {
          detected: ruleBasedResults.map(r => ({
            id: r.rule.id,
            name: r.rule.name,
            type: r.rule.type,
            severity: r.severity,
            reason: r.rule.reason,
            recommendation: r.rule.recommendation,
            matchedKeywords: r.matchedKeywords,
            matchSource: r.matchSource,
            overridable: r.rule.overridable,
            documentationRequired: r.rule.documentationRequired,
          })),
          existing: existingContraindications,
          aiIdentified: aiResults?.additionalContraindications || [],
        },
        alerts: {
          critical: ruleBasedResults.filter(r => r.severity === 'CRITICAL').length,
          high: ruleBasedResults.filter(r => r.severity === 'HIGH').length,
          moderate: ruleBasedResults.filter(r => r.severity === 'MODERATE').length,
          low: ruleBasedResults.filter(r => r.severity === 'LOW').length,
        },
        safetyNotes: aiResults?.safetyNotes || [],
        overallRiskLevel: aiResults?.overallRiskLevel || (
          hasCriticalAlert ? 'VERY_HIGH' :
          hasHighAlert ? 'HIGH' :
          ruleBasedResults.length > 0 ? 'MODERATE' : 'LOW'
        ),
        patientFactors: {
          age: patientAge,
          conditionsChecked: patientConditions.length,
          medicationsChecked: patientMedications.length,
        },
      };
    }),

  /**
   * Override a contraindication with documentation
   * Allows provider to proceed despite relative contraindication with proper documentation
   */
  overrideContraindication: providerProcedure
    .input(
      z.object({
        contraindicationId: z.string(),
        reason: z.string().min(10, 'Override reason must be at least 10 characters'),
        riskAcknowledged: z.boolean(),
        patientConsent: z.boolean().default(false),
        alternativesConsidered: z.array(z.string()).optional(),
        precautionsTaken: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        contraindicationId,
        reason,
        riskAcknowledged,
        patientConsent,
        alternativesConsidered,
        precautionsTaken,
      } = input;

      if (!riskAcknowledged) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You must acknowledge the risk before overriding a contraindication',
        });
      }

      const contraindication = await ctx.prisma.contraindication.findFirst({
        where: {
          id: contraindicationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!contraindication) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contraindication not found or already inactive',
        });
      }

      // Check if this is an absolute contraindication (not overridable)
      const matchingRule = CONTRAINDICATION_RULES.find(r =>
        r.id === (contraindication.sourceDetails as { ruleId?: string })?.ruleId
      );

      if (matchingRule && !matchingRule.overridable) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This is an absolute contraindication and cannot be overridden. Patient safety requires alternative treatment.',
        });
      }

      if (contraindication.contraindicationType === 'ABSOLUTE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Absolute contraindications cannot be overridden. Consider alternative treatments.',
        });
      }

      // Update the contraindication with override
      const updated = await ctx.prisma.contraindication.update({
        where: { id: contraindicationId },
        data: {
          isOverridden: true,
          overrideReason: `${reason}${patientConsent ? '\n\nPatient informed consent obtained.' : ''}${
            alternativesConsidered?.length ? `\n\nAlternatives considered: ${alternativesConsidered.join(', ')}` : ''
          }${
            precautionsTaken?.length ? `\n\nPrecautions taken: ${precautionsTaken.join(', ')}` : ''
          }`,
          overriddenAt: new Date(),
          overriddenBy: ctx.user.id,
        },
      });

      // Resolve any active alerts related to this contraindication
      await ctx.prisma.clinicalAlert.updateMany({
        where: {
          patientId: contraindication.patientId,
          alertType: 'CONTRAINDICATION',
          status: 'ACTIVE',
          relatedData: {
            path: ['procedure'],
            equals: contraindication.procedure,
          },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionNote: `Overridden by provider: ${reason}`,
        },
      });

      // Audit log
      await auditLog('CONTRAINDICATION_OVERRIDE', 'Contraindication', {
        entityId: contraindicationId,
        changes: {
          procedure: contraindication.procedure,
          type: contraindication.contraindicationType,
          reason,
          patientConsent,
          alternativesConsidered,
          precautionsTaken,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        overridden: true,
        overriddenAt: updated.overriddenAt,
        overrideReason: updated.overrideReason,
        procedure: updated.procedure,
      };
    }),

  /**
   * Get active contraindications for a patient
   */
  getPatientContraindications: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        includeOverridden: z.boolean().default(false),
        includeExpired: z.boolean().default(false),
        procedureFilter: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, includeOverridden, includeExpired, procedureFilter } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Prisma.ContraindicationWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (!includeOverridden) {
        where.isOverridden = false;
      }

      if (!includeExpired) {
        where.OR = [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ];
        where.isActive = true;
      }

      if (procedureFilter) {
        where.procedure = { contains: procedureFilter, mode: 'insensitive' };
      }

      const contraindications = await ctx.prisma.contraindication.findMany({
        where,
        orderBy: [
          { contraindicationType: 'asc' }, // ABSOLUTE first
          { createdAt: 'desc' },
        ],
      });

      return contraindications.map(ci => ({
        id: ci.id,
        procedure: ci.procedure,
        procedureCode: ci.procedureCode,
        type: ci.contraindicationType,
        reason: ci.reason,
        source: ci.source,
        isPermanent: ci.isPermanent,
        expiresAt: ci.expiresAt,
        reviewDate: ci.reviewDate,
        isOverridden: ci.isOverridden,
        overrideReason: ci.overrideReason,
        overriddenAt: ci.overriddenAt,
        isActive: ci.isActive,
        createdAt: ci.createdAt,
      }));
    }),

  /**
   * Add a manual contraindication for a patient
   */
  addPatientContraindication: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        procedure: z.string(),
        procedureCode: z.string().optional(),
        type: z.enum(['ABSOLUTE', 'RELATIVE', 'PRECAUTION']),
        reason: z.string().min(5),
        source: z.string().optional(),
        isPermanent: z.boolean().default(false),
        expiresAt: z.coerce.date().optional(),
        reviewDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        procedure,
        procedureCode,
        type,
        reason,
        source,
        isPermanent,
        expiresAt,
        reviewDate,
      } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for duplicate
      const existing = await ctx.prisma.contraindication.findFirst({
        where: {
          patientId,
          procedure: { contains: procedure, mode: 'insensitive' },
          reason: { contains: reason.substring(0, 50), mode: 'insensitive' },
          isActive: true,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A similar contraindication already exists for this patient',
        });
      }

      const contraindication = await ctx.prisma.contraindication.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          procedure,
          procedureCode,
          contraindicationType: type,
          reason,
          source: source || 'Manual entry',
          identifiedBy: ctx.user.id,
          isPermanent,
          expiresAt,
          reviewDate,
        },
      });

      // Create alert if high severity
      if (type === 'ABSOLUTE' || type === 'RELATIVE') {
        await ctx.prisma.clinicalAlert.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            alertType: 'CONTRAINDICATION',
            severity: type === 'ABSOLUTE' ? 'CRITICAL' : 'HIGH',
            message: `Contraindication added: ${procedure} - ${reason}`,
            recommendation: 'Review patient chart and consider alternative treatments',
            triggeredBy: 'Manual contraindication entry',
            relatedData: {
              contraindicationId: contraindication.id,
              procedure,
            },
          },
        });
      }

      // Audit log
      await auditLog('CONTRAINDICATION_ADDED', 'Contraindication', {
        entityId: contraindication.id,
        changes: {
          procedure,
          type,
          reason,
          source,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: contraindication.id,
        procedure: contraindication.procedure,
        type: contraindication.contraindicationType,
        reason: contraindication.reason,
        createdAt: contraindication.createdAt,
      };
    }),

  /**
   * Deactivate a contraindication (e.g., condition resolved)
   */
  deactivateContraindication: providerProcedure
    .input(
      z.object({
        contraindicationId: z.string(),
        reason: z.string().min(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { contraindicationId, reason } = input;

      const contraindication = await ctx.prisma.contraindication.findFirst({
        where: {
          id: contraindicationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!contraindication) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contraindication not found or already inactive',
        });
      }

      const updated = await ctx.prisma.contraindication.update({
        where: { id: contraindicationId },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: reason,
        },
      });

      // Resolve any active alerts
      await ctx.prisma.clinicalAlert.updateMany({
        where: {
          patientId: contraindication.patientId,
          alertType: 'CONTRAINDICATION',
          status: 'ACTIVE',
          relatedData: {
            path: ['contraindicationId'],
            equals: contraindicationId,
          },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionNote: `Contraindication deactivated: ${reason}`,
        },
      });

      // Audit log
      await auditLog('CONTRAINDICATION_DEACTIVATED', 'Contraindication', {
        entityId: contraindicationId,
        changes: {
          procedure: contraindication.procedure,
          type: contraindication.contraindicationType,
          deactivationReason: reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        deactivated: true,
        deactivatedAt: updated.deactivatedAt,
        reason,
      };
    }),

  /**
   * Get contraindication statistics for analytics
   */
  getContraindicationStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo } = input;

      const where: Prisma.ContraindicationWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      const [total, absolute, relative, precaution, overridden, active] = await Promise.all([
        ctx.prisma.contraindication.count({ where }),
        ctx.prisma.contraindication.count({
          where: { ...where, contraindicationType: 'ABSOLUTE' },
        }),
        ctx.prisma.contraindication.count({
          where: { ...where, contraindicationType: 'RELATIVE' },
        }),
        ctx.prisma.contraindication.count({
          where: { ...where, contraindicationType: 'PRECAUTION' },
        }),
        ctx.prisma.contraindication.count({
          where: { ...where, isOverridden: true },
        }),
        ctx.prisma.contraindication.count({
          where: { ...where, isActive: true },
        }),
      ]);

      // Get top procedures with contraindications
      const topProcedures = await ctx.prisma.contraindication.groupBy({
        by: ['procedure'],
        where,
        _count: { procedure: true },
        orderBy: { _count: { procedure: 'desc' } },
        take: 10,
      });

      // Get top sources
      const topSources = await ctx.prisma.contraindication.groupBy({
        by: ['source'],
        where: { ...where, source: { not: null } },
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
        take: 10,
      });

      return {
        total,
        byType: {
          absolute,
          relative,
          precaution,
        },
        overridden,
        active,
        overrideRate: total > 0 ? Math.round((overridden / total) * 100) : 0,
        topProcedures: topProcedures.map(p => ({
          procedure: p.procedure,
          count: p._count.procedure,
        })),
        topSources: topSources.map(s => ({
          source: s.source || 'Unknown',
          count: s._count.source,
        })),
      };
    }),

  // ============================================
  // US-375: Clinical Guidelines Integration
  // ============================================

  /**
   * Get relevant clinical guidelines for a condition or diagnosis
   * Returns both built-in and organization-specific guidelines
   */
  getGuidelines: protectedProcedure
    .input(
      z.object({
        // Search criteria
        diagnosisCode: z.string().optional(),
        condition: z.string().optional(),
        bodyRegion: z.string().optional(),
        // Filters
        evidenceLevelMin: evidenceLevelSchema.optional(),
        sourceFilter: z.string().optional(),
        includeBuiltIn: z.boolean().default(true),
        includeCustom: z.boolean().default(true),
        // Pagination
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        diagnosisCode,
        condition,
        bodyRegion,
        evidenceLevelMin,
        sourceFilter,
        includeBuiltIn,
        includeCustom,
        limit,
        offset,
      } = input;

      const results: Array<{
        id: string;
        code: string | null;
        name: string;
        source: string;
        version: string | null;
        condition: string;
        conditionCodes: string[];
        applicableRegions: string[];
        summary: string;
        recommendations: unknown;
        evidenceLevel: string;
        evidenceSummary: string | null;
        keyPoints: string[];
        redFlags: string[];
        referralCriteria: string[];
        contraindications: string[];
        precautions: string[];
        publicationDate: Date | null;
        citation: string | null;
        externalUrl: string | null;
        isBuiltIn: boolean;
        matchScore: number;
      }> = [];

      // Evidence level ranking for filtering
      const evidenceLevels = ['HIGH', 'MODERATE', 'LOW', 'VERY_LOW', 'EXPERT'];
      const minLevelIndex = evidenceLevelMin ? evidenceLevels.indexOf(evidenceLevelMin) : -1;

      // Helper to calculate match score
      const calculateMatchScore = (guideline: ClinicalGuidelineData): number => {
        let score = 0;

        // Exact code match is highest priority
        if (diagnosisCode && guideline.conditionCodes.some(c => c.toLowerCase() === diagnosisCode.toLowerCase())) {
          score += 100;
        } else if (diagnosisCode && guideline.conditionCodes.some(c => c.toLowerCase().startsWith(diagnosisCode.substring(0, 3).toLowerCase()))) {
          // Partial code match (same category)
          score += 50;
        }

        // Condition name match
        if (condition) {
          const normalizedCondition = condition.toLowerCase();
          const normalizedGuidelineCondition = guideline.condition.toLowerCase();
          if (normalizedGuidelineCondition.includes(normalizedCondition) || normalizedCondition.includes(normalizedGuidelineCondition)) {
            score += 75;
          }
          // Check in summary too
          if (guideline.summary.toLowerCase().includes(normalizedCondition)) {
            score += 25;
          }
        }

        // Body region match
        if (bodyRegion) {
          const normalizedRegion = bodyRegion.toLowerCase();
          if (guideline.applicableRegions.some(r => r.toLowerCase().includes(normalizedRegion) || normalizedRegion.includes(r.toLowerCase()))) {
            score += 50;
          }
        }

        // Evidence level boost
        const levelIndex = evidenceLevels.indexOf(guideline.evidenceLevel);
        score += (5 - levelIndex) * 5; // Higher evidence = higher boost

        return score;
      };

      // Search built-in guidelines
      if (includeBuiltIn) {
        for (const guideline of CHIROPRACTIC_GUIDELINES) {
          // Apply source filter
          if (sourceFilter && !guideline.source.toLowerCase().includes(sourceFilter.toLowerCase())) {
            continue;
          }

          // Apply evidence level filter
          if (minLevelIndex >= 0) {
            const guidelineLevelIndex = evidenceLevels.indexOf(guideline.evidenceLevel);
            if (guidelineLevelIndex > minLevelIndex) continue;
          }

          const matchScore = calculateMatchScore(guideline);

          // Only include if there's some match (unless no search criteria provided)
          if (matchScore > 0 || (!diagnosisCode && !condition && !bodyRegion)) {
            results.push({
              id: `builtin-${guideline.code}`,
              code: guideline.code,
              name: guideline.name,
              source: guideline.source,
              version: guideline.version,
              condition: guideline.condition,
              conditionCodes: guideline.conditionCodes,
              applicableRegions: guideline.applicableRegions,
              summary: guideline.summary,
              recommendations: guideline.recommendations,
              evidenceLevel: guideline.evidenceLevel,
              evidenceSummary: guideline.evidenceSummary,
              keyPoints: guideline.keyPoints,
              redFlags: guideline.redFlags,
              referralCriteria: guideline.referralCriteria,
              contraindications: guideline.contraindications,
              precautions: guideline.precautions,
              publicationDate: guideline.publicationDate,
              citation: guideline.citation,
              externalUrl: guideline.externalUrl || null,
              isBuiltIn: true,
              matchScore,
            });
          }
        }
      }

      // Search custom (organization-specific) guidelines
      if (includeCustom) {
        const customWhere: Prisma.ClinicalGuidelineWhereInput = {
          organizationId: ctx.user.organizationId,
          isActive: true,
        };

        if (diagnosisCode) {
          customWhere.conditionCodes = { has: diagnosisCode };
        }

        if (condition) {
          customWhere.condition = { contains: condition, mode: 'insensitive' };
        }

        if (bodyRegion) {
          customWhere.applicableRegions = { has: bodyRegion };
        }

        if (sourceFilter) {
          customWhere.source = { contains: sourceFilter, mode: 'insensitive' };
        }

        if (minLevelIndex >= 0) {
          customWhere.evidenceLevel = {
            in: evidenceLevels.slice(0, minLevelIndex + 1) as ('HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW' | 'EXPERT')[],
          };
        }

        const customGuidelines = await ctx.prisma.clinicalGuideline.findMany({
          where: customWhere,
        });

        for (const cg of customGuidelines) {
          let matchScore = 0;

          if (diagnosisCode && cg.conditionCodes.includes(diagnosisCode)) {
            matchScore += 100;
          }
          if (condition && cg.condition.toLowerCase().includes(condition.toLowerCase())) {
            matchScore += 75;
          }
          if (bodyRegion && cg.applicableRegions.some(r => r.toLowerCase().includes(bodyRegion.toLowerCase()))) {
            matchScore += 50;
          }

          const levelIndex = evidenceLevels.indexOf(cg.evidenceLevel);
          matchScore += (5 - levelIndex) * 5;

          results.push({
            id: cg.id,
            code: cg.code,
            name: cg.name,
            source: cg.source,
            version: cg.version,
            condition: cg.condition,
            conditionCodes: cg.conditionCodes,
            applicableRegions: cg.applicableRegions,
            summary: cg.summary,
            recommendations: cg.recommendations,
            evidenceLevel: cg.evidenceLevel,
            evidenceSummary: cg.evidenceSummary,
            keyPoints: cg.keyPoints,
            redFlags: cg.redFlags,
            referralCriteria: cg.referralCriteria,
            contraindications: cg.contraindications,
            precautions: cg.precautions,
            publicationDate: cg.publicationDate,
            citation: cg.citation,
            externalUrl: cg.externalUrl,
            isBuiltIn: false,
            matchScore,
          });
        }
      }

      // Sort by match score (highest first), then by evidence level
      results.sort((a, b) => {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
        return evidenceLevels.indexOf(a.evidenceLevel) - evidenceLevels.indexOf(b.evidenceLevel);
      });

      // Apply pagination
      const total = results.length;
      const paginatedResults = results.slice(offset, offset + limit);

      // Log the lookup
      await auditLog('AI_GUIDELINE_LOOKUP', 'ClinicalGuideline', {
        changes: {
          diagnosisCode,
          condition,
          bodyRegion,
          resultsCount: paginatedResults.length,
          totalMatches: total,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        guidelines: paginatedResults,
        total,
        limit,
        offset,
        hasMore: offset + paginatedResults.length < total,
      };
    }),

  /**
   * Get a single guideline by ID (supports both built-in and custom)
   */
  getGuidelineById: protectedProcedure
    .input(z.object({ guidelineId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { guidelineId } = input;

      // Check if it's a built-in guideline
      if (guidelineId.startsWith('builtin-')) {
        const code = guidelineId.replace('builtin-', '');
        const guideline = CHIROPRACTIC_GUIDELINES.find(g => g.code === code);

        if (!guideline) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Guideline not found',
          });
        }

        return {
          id: guidelineId,
          code: guideline.code,
          name: guideline.name,
          source: guideline.source,
          version: guideline.version,
          condition: guideline.condition,
          conditionCodes: guideline.conditionCodes,
          applicableRegions: guideline.applicableRegions,
          summary: guideline.summary,
          recommendations: guideline.recommendations,
          evidenceLevel: guideline.evidenceLevel,
          evidenceSummary: guideline.evidenceSummary,
          keyPoints: guideline.keyPoints,
          redFlags: guideline.redFlags,
          referralCriteria: guideline.referralCriteria,
          contraindications: guideline.contraindications,
          precautions: guideline.precautions,
          publicationDate: guideline.publicationDate,
          citation: guideline.citation,
          externalUrl: guideline.externalUrl || null,
          isBuiltIn: true,
          isActive: true,
        };
      }

      // Custom guideline
      const customGuideline = await ctx.prisma.clinicalGuideline.findFirst({
        where: {
          id: guidelineId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!customGuideline) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Guideline not found',
        });
      }

      return {
        ...customGuideline,
        isBuiltIn: false,
      };
    }),

  /**
   * Add a custom clinical guideline for the organization
   */
  addGuideline: providerProcedure
    .input(
      z.object({
        name: z.string().min(5),
        code: z.string().optional(),
        version: z.string().optional(),
        source: z.string().min(2),
        condition: z.string().min(2),
        conditionCodes: z.array(z.string()).default([]),
        applicableRegions: z.array(z.string()).default([]),
        summary: z.string().min(10),
        recommendations: z.array(z.object({
          level: z.string(),
          text: z.string(),
          gradeOfRecommendation: z.enum(['A', 'B', 'C', 'D', 'I']).optional(),
          strengthOfEvidence: evidenceLevelSchema.optional(),
        })).default([]),
        evidenceLevel: evidenceLevelSchema,
        evidenceSummary: z.string().optional(),
        keyPoints: z.array(z.string()).default([]),
        redFlags: z.array(z.string()).default([]),
        referralCriteria: z.array(z.string()).default([]),
        contraindications: z.array(z.string()).default([]),
        precautions: z.array(z.string()).default([]),
        publicationDate: z.coerce.date().optional(),
        citation: z.string().optional(),
        externalUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate
      const existing = await ctx.prisma.clinicalGuideline.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          name: { equals: input.name, mode: 'insensitive' },
          isActive: true,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A guideline with this name already exists',
        });
      }

      const guideline = await ctx.prisma.clinicalGuideline.create({
        data: {
          organizationId: ctx.user.organizationId,
          name: input.name,
          code: input.code,
          version: input.version,
          source: input.source,
          condition: input.condition,
          conditionCodes: input.conditionCodes,
          applicableRegions: input.applicableRegions,
          summary: input.summary,
          recommendations: input.recommendations,
          evidenceLevel: input.evidenceLevel,
          evidenceSummary: input.evidenceSummary,
          keyPoints: input.keyPoints,
          redFlags: input.redFlags,
          referralCriteria: input.referralCriteria,
          contraindications: input.contraindications,
          precautions: input.precautions,
          publicationDate: input.publicationDate,
          citation: input.citation,
          externalUrl: input.externalUrl,
        },
      });

      await auditLog('CREATE', 'ClinicalGuideline', {
        entityId: guideline.id,
        changes: {
          name: input.name,
          condition: input.condition,
          evidenceLevel: input.evidenceLevel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: guideline.id,
        name: guideline.name,
        condition: guideline.condition,
        createdAt: guideline.createdAt,
      };
    }),

  /**
   * Update a custom clinical guideline
   */
  updateGuideline: providerProcedure
    .input(
      z.object({
        guidelineId: z.string(),
        name: z.string().min(5).optional(),
        version: z.string().optional(),
        source: z.string().min(2).optional(),
        condition: z.string().min(2).optional(),
        conditionCodes: z.array(z.string()).optional(),
        applicableRegions: z.array(z.string()).optional(),
        summary: z.string().min(10).optional(),
        recommendations: z.array(z.object({
          level: z.string(),
          text: z.string(),
          gradeOfRecommendation: z.enum(['A', 'B', 'C', 'D', 'I']).optional(),
          strengthOfEvidence: evidenceLevelSchema.optional(),
        })).optional(),
        evidenceLevel: evidenceLevelSchema.optional(),
        evidenceSummary: z.string().optional(),
        keyPoints: z.array(z.string()).optional(),
        redFlags: z.array(z.string()).optional(),
        referralCriteria: z.array(z.string()).optional(),
        contraindications: z.array(z.string()).optional(),
        precautions: z.array(z.string()).optional(),
        publicationDate: z.coerce.date().optional(),
        lastReviewedDate: z.coerce.date().optional(),
        citation: z.string().optional(),
        externalUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { guidelineId, ...updateData } = input;

      // Cannot update built-in guidelines
      if (guidelineId.startsWith('builtin-')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot update built-in guidelines. Create a custom guideline instead.',
        });
      }

      const existing = await ctx.prisma.clinicalGuideline.findFirst({
        where: {
          id: guidelineId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Guideline not found',
        });
      }

      const updated = await ctx.prisma.clinicalGuideline.update({
        where: { id: guidelineId },
        data: updateData,
      });

      await auditLog('UPDATE', 'ClinicalGuideline', {
        entityId: guidelineId,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        name: updated.name,
        condition: updated.condition,
        updatedAt: updated.updatedAt,
      };
    }),

  /**
   * Retire (soft delete) a custom guideline
   */
  retireGuideline: providerProcedure
    .input(
      z.object({
        guidelineId: z.string(),
        reason: z.string().min(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { guidelineId, reason } = input;

      if (guidelineId.startsWith('builtin-')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot retire built-in guidelines',
        });
      }

      const guideline = await ctx.prisma.clinicalGuideline.findFirst({
        where: {
          id: guidelineId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!guideline) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Guideline not found',
        });
      }

      await ctx.prisma.clinicalGuideline.update({
        where: { id: guidelineId },
        data: {
          isActive: false,
          retiredAt: new Date(),
          retiredReason: reason,
        },
      });

      await auditLog('DELETE', 'ClinicalGuideline', {
        entityId: guidelineId,
        changes: { reason, retiredAt: new Date() },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, guidelineId };
    }),

  /**
   * Get guideline-based care suggestions for an encounter
   * Analyzes the encounter and suggests applicable guidelines
   */
  getGuidelineBasedSuggestions: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        diagnosisCodes: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId, diagnosisCodes } = input;

      // Get the encounter with diagnoses
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          diagnoses: true,
          patient: {
            include: {
              demographics: true,
            },
          },
          soapNote: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Get diagnosis codes from encounter or input
      const codes = diagnosisCodes || encounter.diagnoses.map(d => d.icd10Code);

      if (codes.length === 0) {
        return {
          suggestions: [],
          message: 'No diagnoses found. Add diagnoses to get guideline-based suggestions.',
        };
      }

      // Find matching guidelines
      const suggestions: Array<{
        guidelineId: string;
        guidelineName: string;
        source: string;
        condition: string;
        matchedDiagnosis: string;
        evidenceLevel: string;
        keyRecommendations: Array<{
          level: string;
          text: string;
          grade: string;
        }>;
        keyPoints: string[];
        redFlagsToCheck: string[];
        suggestedActions: string[];
      }> = [];

      const seenGuidelineIds = new Set<string>();

      for (const code of codes) {
        // Check built-in guidelines
        for (const guideline of CHIROPRACTIC_GUIDELINES) {
          if (guideline.conditionCodes.some(c => c.toLowerCase() === code.toLowerCase() || code.toLowerCase().startsWith(c.substring(0, 3).toLowerCase()))) {
            const guidelineId = `builtin-${guideline.code}`;

            if (!seenGuidelineIds.has(guidelineId)) {
              seenGuidelineIds.add(guidelineId);

              suggestions.push({
                guidelineId,
                guidelineName: guideline.name,
                source: guideline.source,
                condition: guideline.condition,
                matchedDiagnosis: code,
                evidenceLevel: guideline.evidenceLevel,
                keyRecommendations: guideline.recommendations.slice(0, 3).map(r => ({
                  level: r.level,
                  text: r.text,
                  grade: r.gradeOfRecommendation,
                })),
                keyPoints: guideline.keyPoints.slice(0, 3),
                redFlagsToCheck: guideline.redFlags.slice(0, 5),
                suggestedActions: [
                  `Review ${guideline.name} for evidence-based treatment approach`,
                  ...guideline.keyPoints.slice(0, 2),
                ],
              });
            }
          }
        }

        // Check custom guidelines
        const customMatches = await ctx.prisma.clinicalGuideline.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            conditionCodes: { has: code },
          },
        });

        for (const cg of customMatches) {
          if (!seenGuidelineIds.has(cg.id)) {
            seenGuidelineIds.add(cg.id);

            const recs = cg.recommendations as Array<{ level: string; text: string; gradeOfRecommendation?: string }>;

            suggestions.push({
              guidelineId: cg.id,
              guidelineName: cg.name,
              source: cg.source,
              condition: cg.condition,
              matchedDiagnosis: code,
              evidenceLevel: cg.evidenceLevel,
              keyRecommendations: recs.slice(0, 3).map(r => ({
                level: r.level,
                text: r.text,
                grade: r.gradeOfRecommendation || 'N/A',
              })),
              keyPoints: cg.keyPoints.slice(0, 3),
              redFlagsToCheck: cg.redFlags.slice(0, 5),
              suggestedActions: [
                `Review ${cg.name} for treatment guidance`,
                ...cg.keyPoints.slice(0, 2),
              ],
            });
          }
        }
      }

      // Sort by evidence level
      const evidenceOrder = ['HIGH', 'MODERATE', 'LOW', 'VERY_LOW', 'EXPERT'];
      suggestions.sort((a, b) => evidenceOrder.indexOf(a.evidenceLevel) - evidenceOrder.indexOf(b.evidenceLevel));

      return {
        suggestions,
        diagnosesAnalyzed: codes,
        totalGuidelinesMatched: suggestions.length,
      };
    }),

  /**
   * Track guideline adherence for an encounter
   * Records whether the provider followed guideline recommendations
   */
  trackGuidelineAdherence: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        guidelineId: z.string(),
        recommendations: z.array(z.object({
          recommendationText: z.string(),
          followed: z.boolean(),
          note: z.string().optional(),
          reason: z.string().optional(), // Why not followed
        })),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, guidelineId, recommendations } = input;

      // Verify encounter access
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Store adherence tracking as a TreatmentRecommendation linked to the guideline
      const followedCount = recommendations.filter(r => r.followed).length;
      const totalCount = recommendations.length;
      const adherenceRate = totalCount > 0 ? Math.round((followedCount / totalCount) * 100) : 0;

      // Create a record of adherence
      const adherenceRecord = await ctx.prisma.treatmentRecommendation.create({
        data: {
          patientId: encounter.patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
          conditionCode: 'GUIDELINE_ADHERENCE',
          conditionDescription: `Adherence tracking for guideline: ${guidelineId}`,
          recommendation: `Guideline adherence: ${adherenceRate}% (${followedCount}/${totalCount} recommendations followed)`,
          treatmentType: 'guideline_adherence',
          evidenceLevel: 'EXPERT',
          evidenceSummary: `Tracked adherence to clinical guideline`,
          guidelineCitations: [guidelineId],
          evidenceReferences: {
            guidelineId,
            recommendations,
            adherenceRate,
            followedCount,
            totalCount,
          },
          isAccepted: true,
          selectedAt: new Date(),
        },
      });

      await auditLog('AI_GUIDELINE_LOOKUP', 'TreatmentRecommendation', {
        entityId: adherenceRecord.id,
        changes: {
          guidelineId,
          adherenceRate,
          followedCount,
          totalCount,
          action: 'ADHERENCE_TRACKED',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: adherenceRecord.id,
        guidelineId,
        adherenceRate,
        followedCount,
        totalCount,
        details: recommendations,
      };
    }),

  /**
   * Get guideline adherence statistics
   */
  getGuidelineAdherenceStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        guidelineId: z.string().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, guidelineId, providerId } = input;

      const where: Prisma.TreatmentRecommendationWhereInput = {
        organizationId: ctx.user.organizationId,
        treatmentType: 'guideline_adherence',
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      if (guidelineId) {
        where.guidelineCitations = { has: guidelineId };
      }

      if (providerId) {
        where.encounter = { providerId };
      }

      const adherenceRecords = await ctx.prisma.treatmentRecommendation.findMany({
        where,
        select: {
          id: true,
          evidenceReferences: true,
          createdAt: true,
        },
      });

      // Calculate aggregate statistics
      let totalFollowed = 0;
      let totalRecommendations = 0;
      const guidelineStats: Record<string, { followed: number; total: number; name: string }> = {};

      for (const record of adherenceRecords) {
        const refs = record.evidenceReferences as { guidelineId?: string; followedCount?: number; totalCount?: number } | null;
        if (refs && typeof refs === 'object') {
          const gId = refs.guidelineId || 'unknown';
          const followed = refs.followedCount || 0;
          const total = refs.totalCount || 0;

          totalFollowed += followed;
          totalRecommendations += total;

          if (!guidelineStats[gId]) {
            // Try to get guideline name
            let name = gId;
            if (gId.startsWith('builtin-')) {
              const code = gId.replace('builtin-', '');
              const guideline = CHIROPRACTIC_GUIDELINES.find(g => g.code === code);
              if (guideline) name = guideline.name;
            }
            guidelineStats[gId] = { followed: 0, total: 0, name };
          }
          guidelineStats[gId].followed += followed;
          guidelineStats[gId].total += total;
        }
      }

      const overallAdherenceRate = totalRecommendations > 0
        ? Math.round((totalFollowed / totalRecommendations) * 100)
        : 0;

      return {
        totalRecords: adherenceRecords.length,
        overallAdherenceRate,
        totalRecommendationsTracked: totalRecommendations,
        totalRecommendationsFollowed: totalFollowed,
        byGuideline: Object.entries(guidelineStats).map(([id, stats]) => ({
          guidelineId: id,
          guidelineName: stats.name,
          adherenceRate: stats.total > 0 ? Math.round((stats.followed / stats.total) * 100) : 0,
          followed: stats.followed,
          total: stats.total,
        })).sort((a, b) => b.total - a.total),
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null,
        },
      };
    }),

  /**
   * Check for guideline updates
   * Compares organization's custom guidelines against built-in guidelines for updates
   */
  checkGuidelineUpdates: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      const updates: Array<{
        guidelineCode: string;
        guidelineName: string;
        currentVersion: string;
        latestVersion: string;
        condition: string;
        source: string;
        publicationDate: Date;
        message: string;
      }> = [];

      // Get organization's last review dates for built-in guidelines
      const customGuidelines = await ctx.prisma.clinicalGuideline.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          version: true,
          lastReviewedDate: true,
          source: true,
        },
      });

      // Check for newer versions of built-in guidelines
      for (const builtIn of CHIROPRACTIC_GUIDELINES) {
        // Check if there's a matching custom guideline that might be outdated
        const matching = customGuidelines.find(
          cg => cg.code === builtIn.code ||
               cg.name.toLowerCase().includes(builtIn.condition.toLowerCase())
        );

        if (matching && matching.version && builtIn.version) {
          // Simple version comparison (assumes versions are comparable strings like "2016", "2017")
          if (matching.version < builtIn.version) {
            updates.push({
              guidelineCode: builtIn.code,
              guidelineName: builtIn.name,
              currentVersion: matching.version,
              latestVersion: builtIn.version,
              condition: builtIn.condition,
              source: builtIn.source,
              publicationDate: builtIn.publicationDate,
              message: `Your custom guideline "${matching.name}" may be based on an older version. The built-in guideline has version ${builtIn.version}.`,
            });
          }
        }

        // Check if the built-in guideline is newer than 2 years and org hasn't reviewed it
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        if (builtIn.publicationDate > twoYearsAgo) {
          // Recently published guideline - might be relevant to review
          const hasReviewed = customGuidelines.some(
            cg => cg.lastReviewedDate && cg.lastReviewedDate > builtIn.publicationDate
          );

          if (!hasReviewed) {
            // Only add if not already in updates
            if (!updates.some(u => u.guidelineCode === builtIn.code)) {
              updates.push({
                guidelineCode: builtIn.code,
                guidelineName: builtIn.name,
                currentVersion: 'N/A',
                latestVersion: builtIn.version,
                condition: builtIn.condition,
                source: builtIn.source,
                publicationDate: builtIn.publicationDate,
                message: `Recent guideline available: ${builtIn.name} (${builtIn.version}). Consider reviewing for your practice.`,
              });
            }
          }
        }
      }

      // Note: Guideline update alerts are organization-level notifications
      // Not creating patient-level clinical alerts for these
      // The frontend can display these updates based on the response

      return {
        updates,
        hasUpdates: updates.length > 0,
        lastChecked: new Date(),
        notificationMessage: updates.length > 0
          ? `${updates.length} clinical guideline update(s) available for review`
          : 'All guidelines are up to date',
      };
    }),

  /**
   * Get list of all available guidelines (summary view)
   */
  listAllGuidelines: protectedProcedure
    .input(
      z.object({
        includeBuiltIn: z.boolean().default(true),
        includeCustom: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const guidelines: Array<{
        id: string;
        code: string | null;
        name: string;
        condition: string;
        source: string;
        evidenceLevel: string;
        isBuiltIn: boolean;
        isActive: boolean;
      }> = [];

      if (input.includeBuiltIn) {
        for (const g of CHIROPRACTIC_GUIDELINES) {
          guidelines.push({
            id: `builtin-${g.code}`,
            code: g.code,
            name: g.name,
            condition: g.condition,
            source: g.source,
            evidenceLevel: g.evidenceLevel,
            isBuiltIn: true,
            isActive: true,
          });
        }
      }

      if (input.includeCustom) {
        const custom = await ctx.prisma.clinicalGuideline.findMany({
          where: {
            organizationId: ctx.user.organizationId,
          },
          select: {
            id: true,
            code: true,
            name: true,
            condition: true,
            source: true,
            evidenceLevel: true,
            isActive: true,
          },
        });

        for (const c of custom) {
          guidelines.push({
            ...c,
            isBuiltIn: false,
          });
        }
      }

      return {
        guidelines,
        total: guidelines.length,
        builtInCount: input.includeBuiltIn ? CHIROPRACTIC_GUIDELINES.length : 0,
        customCount: guidelines.filter(g => !g.isBuiltIn).length,
      };
    }),

  // ============================================
  // US-376: Outcome Prediction Endpoints
  // ============================================

  /**
   * Predict treatment outcome based on patient data and similar cases
   */
  predictOutcome: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        diagnosisCode: z.string(),
        diagnosisDescription: z.string().optional(),
        treatmentApproach: z.string(),
        techniquesSuggested: z.array(z.string()).optional(),
        includeAI: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        diagnosisCode,
        diagnosisDescription,
        treatmentApproach,
        techniquesSuggested = [],
        includeAI,
      } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get encounter data if provided
      let encounter = null;
      let chiefComplaint = '';
      let subjective = '';
      let objective = '';
      let currentDiagnoses: string[] = [];

      if (encounterId) {
        encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            diagnoses: true,
            soapNote: true,
          },
        });

        if (encounter?.soapNote) {
          const soap = encounter.soapNote as { chiefComplaint?: string; subjective?: string; objective?: string };
          chiefComplaint = soap.chiefComplaint || '';
          subjective = soap.subjective || '';
          objective = soap.objective || '';
        }

        currentDiagnoses = encounter?.diagnoses.map(d => d.icd10Code) || [];
      }

      // Calculate patient age
      const patientAge = patient.demographics?.dateOfBirth
        ? Math.floor((Date.now() - new Date(patient.demographics.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      // Determine symptom duration based on clinical notes
      const symptomDuration = determineSymptomDuration(chiefComplaint + ' ' + subjective);

      // Get patient comorbidities (from problem list or conditions)
      const patientConditions = await ctx.prisma.diagnosis.findMany({
        where: {
          encounter: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
          status: 'ACTIVE',
        },
        distinct: ['icd10Code'],
        select: {
          icd10Code: true,
          description: true,
        },
      });

      const comorbidities = patientConditions
        .filter(c => c.icd10Code !== diagnosisCode)
        .map(c => c.description);

      // Identify risk factors
      const riskFactors = identifyRiskFactors({
        age: patientAge,
        symptomDuration,
        comorbidities,
        chiefComplaint,
        subjective,
        objective,
      });

      // Find similar cases for outcome analysis
      const similarCasesAnalysis = await analyzeSimilarCases(ctx.prisma, {
        diagnosisCode,
        organizationId: ctx.user.organizationId,
        ageRange: patientAge ? { min: patientAge - 10, max: patientAge + 10 } : undefined,
        symptomDuration,
      });

      // Get outcome baseline from protocol data
      const protocol = TREATMENT_PROTOCOLS.find(p =>
        p.icdCodes.some(code => diagnosisCode.startsWith(code.replace(/X+A?$/, '')))
      );

      // Calculate predicted outcome
      const baselineOutcome = getBaselineOutcome(diagnosisCode, symptomDuration);
      const adjustedOutcome = adjustOutcomeForFactors(baselineOutcome, {
        age: patientAge,
        riskFactors,
        comorbidities,
        symptomDuration,
        similarCasesAverage: similarCasesAnalysis.averageImprovement,
      });

      // Calculate risk of chronicity
      const chronicityRisk = calculateChronicityRisk({
        diagnosisCode,
        symptomDuration,
        age: patientAge,
        riskFactors,
        previousTreatments: [], // Could be enhanced with actual history
      });

      // Determine treatment response likelihood
      const treatmentResponse = determineTreatmentResponse(adjustedOutcome.expectedImprovement);

      // Generate prognostic factors explanation
      const prognosticFactors = generatePrognosticFactors({
        favorable: adjustedOutcome.favorableFactors,
        unfavorable: adjustedOutcome.unfavorableFactors,
        neutral: adjustedOutcome.neutralFactors,
      });

      // Generate patient-friendly explanation
      const patientExplanation = generatePatientExplanation({
        condition: diagnosisDescription || diagnosisCode,
        expectedOutcome: adjustedOutcome.description,
        timeline: adjustedOutcome.timeline,
        treatmentResponse,
        factors: prognosticFactors,
      });

      // Generate expectation setting points
      const expectationSetting = generateExpectationSetting({
        expectedImprovement: adjustedOutcome.expectedImprovement,
        timeline: adjustedOutcome.timeline,
        treatmentResponse,
        riskOfChronicity: chronicityRisk,
      });

      // Try AI enhancement if enabled
      let aiPrediction = null;
      if (includeAI) {
        aiPrediction = await generateAIOutcomePrediction({
          diagnosis: { code: diagnosisCode, description: diagnosisDescription || '' },
          patientProfile: {
            age: patientAge ?? undefined,
            gender: patient.demographics?.gender || undefined,
            comorbidities,
            riskFactors,
          },
          treatmentApproach,
          techniquesSuggested,
          symptomDuration,
          chiefComplaint,
          subjective,
          objective,
          similarCasesData: similarCasesAnalysis,
          baselinePrediction: adjustedOutcome,
        });

        if (aiPrediction) {
          // Blend AI insights with rule-based prediction
          adjustedOutcome.description = aiPrediction.predictedOutcome || adjustedOutcome.description;
          if (aiPrediction.timeline) {
            adjustedOutcome.timeline = aiPrediction.timeline;
          }
          if (aiPrediction.additionalFactors) {
            prognosticFactors.aiInsights = aiPrediction.additionalFactors;
          }
        }
      }

      // Create outcome prediction record
      const prediction = await ctx.prisma.outcomePrediction.create({
        data: {
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
          conditionCode: diagnosisCode,
          conditionDescription: diagnosisDescription || diagnosisCode,
          treatmentApproach,
          techniquesSuggested,
          predictedOutcome: adjustedOutcome.description,
          confidenceScore: adjustedOutcome.confidence,
          expectedTimeline: adjustedOutcome.timeline,
          improvementPercent: adjustedOutcome.expectedImprovement,
          riskOfChronicity: chronicityRisk,
          treatmentResponse,
          prognosticFactors,
          similarCasesCount: similarCasesAnalysis.count,
          similarCasesAvgOutcome: similarCasesAnalysis.averageImprovement,
          similarCasesData: similarCasesAnalysis.anonymizedData,
          patientAge,
          symptomDuration,
          comorbidities,
          riskFactors,
          patientExplanation,
          expectationSetting,
        },
      });

      // Create alert if high risk of chronicity
      if (chronicityRisk > 50) {
        await ctx.prisma.clinicalAlert.create({
          data: {
            patientId,
            encounterId,
            organizationId: ctx.user.organizationId,
            alertType: 'OUTCOME_ALERT',
            severity: chronicityRisk > 70 ? 'HIGH' : 'MODERATE',
            message: `Patient has ${chronicityRisk.toFixed(0)}% risk of condition becoming chronic`,
            recommendation: 'Consider more aggressive early intervention and patient education on prevention',
            triggeredBy: 'AI Outcome Prediction',
          },
        });
      }

      // Audit log
      await auditLog('AI_OUTCOME_PREDICTION', 'OutcomePrediction', {
        entityId: prediction.id,
        changes: {
          diagnosisCode,
          treatmentApproach,
          confidenceScore: adjustedOutcome.confidence,
          expectedImprovement: adjustedOutcome.expectedImprovement,
          chronicityRisk,
          similarCasesCount: similarCasesAnalysis.count,
          aiEnhanced: !!aiPrediction,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: prediction.id,
        prediction: {
          outcome: adjustedOutcome.description,
          confidence: adjustedOutcome.confidence,
          improvementExpected: adjustedOutcome.expectedImprovement,
          timeline: adjustedOutcome.timeline,
        },
        riskAssessment: {
          chronicityRisk,
          treatmentResponse,
          responseDescription: getResponseDescription(treatmentResponse),
        },
        factors: {
          favorable: adjustedOutcome.favorableFactors,
          unfavorable: adjustedOutcome.unfavorableFactors,
          prognostic: prognosticFactors,
        },
        similarCases: {
          count: similarCasesAnalysis.count,
          averageImprovement: similarCasesAnalysis.averageImprovement,
          outcomeDistribution: similarCasesAnalysis.distribution,
        },
        patientCommunication: {
          explanation: patientExplanation,
          expectationPoints: expectationSetting,
        },
        sourceInfo: {
          hasProtocol: !!protocol,
          aiEnhanced: !!aiPrediction,
          dataPoints: similarCasesAnalysis.count,
        },
      };
    }),

  /**
   * Accept an outcome prediction
   */
  acceptOutcomePrediction: providerProcedure
    .input(
      z.object({
        predictionId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { predictionId, notes } = input;

      const prediction = await ctx.prisma.outcomePrediction.findFirst({
        where: {
          id: predictionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outcome prediction not found',
        });
      }

      const updated = await ctx.prisma.outcomePrediction.update({
        where: { id: predictionId },
        data: {
          isAccepted: true,
          isRejected: false,
          reviewedAt: new Date(),
          reviewedBy: ctx.user.id,
        },
      });

      await auditLog('AI_OUTCOME_PREDICTION', 'OutcomePrediction', {
        entityId: predictionId,
        changes: { action: 'accepted', notes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        accepted: true,
        reviewedAt: updated.reviewedAt,
      };
    }),

  /**
   * Reject an outcome prediction with reason
   */
  rejectOutcomePrediction: providerProcedure
    .input(
      z.object({
        predictionId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { predictionId, reason } = input;

      const prediction = await ctx.prisma.outcomePrediction.findFirst({
        where: {
          id: predictionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outcome prediction not found',
        });
      }

      const updated = await ctx.prisma.outcomePrediction.update({
        where: { id: predictionId },
        data: {
          isAccepted: false,
          isRejected: true,
          rejectionReason: reason,
          reviewedAt: new Date(),
          reviewedBy: ctx.user.id,
        },
      });

      await auditLog('AI_OUTCOME_PREDICTION', 'OutcomePrediction', {
        entityId: predictionId,
        changes: { action: 'rejected', reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        rejected: true,
        reason,
        reviewedAt: updated.reviewedAt,
      };
    }),

  /**
   * Record actual outcome for prediction accuracy tracking
   */
  recordActualOutcome: providerProcedure
    .input(
      z.object({
        predictionId: z.string(),
        actualOutcome: z.string(),
        actualImprovement: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { predictionId, actualOutcome, actualImprovement, notes } = input;

      const prediction = await ctx.prisma.outcomePrediction.findFirst({
        where: {
          id: predictionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outcome prediction not found',
        });
      }

      // Calculate if prediction was accurate
      let wasAccurate: boolean | null = null;
      if (actualImprovement !== undefined && prediction.improvementPercent) {
        const predictedImprovement = Number(prediction.improvementPercent);
        const difference = Math.abs(actualImprovement - predictedImprovement);
        // Consider accurate if within 15% of predicted
        wasAccurate = difference <= 15;
      }

      const updated = await ctx.prisma.outcomePrediction.update({
        where: { id: predictionId },
        data: {
          actualOutcome,
          actualImprovement,
          outcomeMeasuredAt: new Date(),
          wasAccurate,
          accuracyNotes: notes,
        },
      });

      await auditLog('AI_OUTCOME_PREDICTION', 'OutcomePrediction', {
        entityId: predictionId,
        changes: {
          action: 'outcome_recorded',
          actualOutcome,
          actualImprovement,
          wasAccurate,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        actualOutcome,
        actualImprovement,
        wasAccurate,
        predictedImprovement: prediction.improvementPercent ? Number(prediction.improvementPercent) : null,
        measuredAt: updated.outcomeMeasuredAt,
      };
    }),

  /**
   * Get outcome predictions for a patient
   */
  getPatientOutcomePredictions: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        includeResolved: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, includeResolved } = input;

      // Verify patient access
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Prisma.OutcomePredictionWhereInput = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (encounterId) {
        where.encounterId = encounterId;
      }

      if (!includeResolved) {
        where.actualOutcome = null;
      }

      const predictions = await ctx.prisma.outcomePrediction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return predictions.map(p => ({
        id: p.id,
        condition: {
          code: p.conditionCode,
          description: p.conditionDescription,
        },
        treatmentApproach: p.treatmentApproach,
        prediction: {
          outcome: p.predictedOutcome,
          confidence: p.confidenceScore,
          improvementExpected: p.improvementPercent,
          timeline: p.expectedTimeline,
        },
        riskAssessment: {
          chronicityRisk: p.riskOfChronicity,
          treatmentResponse: p.treatmentResponse,
        },
        status: {
          isAccepted: p.isAccepted,
          isRejected: p.isRejected,
          hasActualOutcome: !!p.actualOutcome,
          wasAccurate: p.wasAccurate,
        },
        actualOutcome: p.actualOutcome ? {
          outcome: p.actualOutcome,
          improvement: p.actualImprovement,
          measuredAt: p.outcomeMeasuredAt,
        } : null,
        encounterId: p.encounterId,
        createdAt: p.createdAt,
      }));
    }),

  /**
   * Get outcome prediction statistics for analytics
   */
  getOutcomePredictionStats: protectedProcedure
    .input(
      z.object({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        conditionCode: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, conditionCode } = input;

      const where: Prisma.OutcomePredictionWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      if (conditionCode) {
        where.conditionCode = { startsWith: conditionCode };
      }

      const predictions = await ctx.prisma.outcomePrediction.findMany({
        where,
        select: {
          id: true,
          confidenceScore: true,
          improvementPercent: true,
          riskOfChronicity: true,
          treatmentResponse: true,
          isAccepted: true,
          isRejected: true,
          wasAccurate: true,
          actualImprovement: true,
          conditionCode: true,
        },
      });

      const total = predictions.length;
      const accepted = predictions.filter(p => p.isAccepted).length;
      const rejected = predictions.filter(p => p.isRejected).length;
      const withOutcomes = predictions.filter(p => p.wasAccurate !== null);
      const accurate = withOutcomes.filter(p => p.wasAccurate === true).length;

      // Calculate average confidence
      const avgConfidence = total > 0
        ? predictions.reduce((sum, p) => sum + Number(p.confidenceScore), 0) / total
        : 0;

      // Calculate accuracy rate
      const accuracyRate = withOutcomes.length > 0
        ? (accurate / withOutcomes.length) * 100
        : null;

      // Response distribution
      const responseDistribution = {
        EXCELLENT: predictions.filter(p => p.treatmentResponse === 'EXCELLENT').length,
        GOOD: predictions.filter(p => p.treatmentResponse === 'GOOD').length,
        MODERATE: predictions.filter(p => p.treatmentResponse === 'MODERATE').length,
        POOR: predictions.filter(p => p.treatmentResponse === 'POOR').length,
      };

      // Top conditions
      const conditionCounts: Record<string, number> = {};
      for (const p of predictions) {
        const code = p.conditionCode.substring(0, 5); // Group by first 5 chars
        conditionCounts[code] = (conditionCounts[code] || 0) + 1;
      }
      const topConditions = Object.entries(conditionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }));

      return {
        total,
        accepted,
        rejected,
        pending: total - accepted - rejected,
        acceptanceRate: total > 0 ? (accepted / total) * 100 : 0,
        withOutcomes: withOutcomes.length,
        accurate,
        accuracyRate,
        averageConfidence: avgConfidence,
        responseDistribution,
        topConditions,
      };
    }),

  /**
   * Get patient communication summary for outcome expectations
   */
  getOutcomeCommunicationSummary: protectedProcedure
    .input(
      z.object({
        predictionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await ctx.prisma.outcomePrediction.findFirst({
        where: {
          id: input.predictionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Outcome prediction not found',
        });
      }

      const patientName = prediction.patient.demographics
        ? `${prediction.patient.demographics.firstName || ''} ${prediction.patient.demographics.lastName || ''}`.trim()
        : 'Patient';

      // Build communication document
      const communicationDoc = {
        patientName,
        condition: prediction.conditionDescription,
        date: new Date().toLocaleDateString(),

        summary: prediction.patientExplanation,

        expectedOutcome: {
          description: prediction.predictedOutcome,
          timeline: prediction.expectedTimeline,
          improvementTarget: prediction.improvementPercent
            ? `${Number(prediction.improvementPercent).toFixed(0)}% improvement expected`
            : 'Gradual improvement expected',
        },

        treatmentPlan: {
          approach: prediction.treatmentApproach,
          techniques: prediction.techniquesSuggested,
        },

        expectations: prediction.expectationSetting,

        factors: {
          riskOfChronicity: prediction.riskOfChronicity
            ? `${Number(prediction.riskOfChronicity).toFixed(0)}%`
            : 'Not assessed',
          responseLevel: prediction.treatmentResponse || 'Not assessed',
          prognostic: prediction.prognosticFactors,
        },

        recommendations: [
          'Follow the recommended treatment schedule',
          'Report any significant changes in symptoms',
          'Practice prescribed home exercises',
          prediction.riskOfChronicity && Number(prediction.riskOfChronicity) > 30
            ? 'Early and consistent treatment is important for your condition'
            : null,
        ].filter(Boolean),

        disclaimer: 'This is an AI-generated prediction based on clinical data and similar cases. Individual outcomes may vary. Please discuss any concerns with your healthcare provider.',
      };

      return communicationDoc;
    }),
});
