import { router } from '../trpc';
import { authRouter } from './auth';
import { userRouter } from './user';
import { organizationRouter } from './organization';
import { dashboardRouter } from './dashboard';
import { patientRouter } from './patient';
import { schedulingRouter } from './scheduling';
import { formTemplateRouter } from './formTemplate';
import { formSubmissionRouter } from './formSubmission';
import { kioskRouter } from './kiosk';
import { formDeliveryRouter } from './formDelivery';
import { encounterRouter } from './encounter';
import { soapNoteRouter } from './soapNote';
import { noteTemplateRouter } from './noteTemplate';
import { diagnosisRouter } from './diagnosis';
import { procedureRouter } from './procedure';
import { treatmentPlanRouter } from './treatmentPlan';
import { assessmentRouter } from './assessment';
import { bodyDiagramRouter } from './bodyDiagram';
// Billing & Claims (Epic 07)
import { payerRouter } from './payer';
import { insurancePolicyRouter } from './insurancePolicy';
import { feeScheduleRouter } from './feeSchedule';
import { chargeRouter } from './charge';
import { paymentRouter } from './payment';
import { ledgerRouter } from './ledger';
import { claimRouter } from './claim';
import { superbillRouter } from './superbill';
import { cms1500Router } from './cms1500';
// AI Documentation (Epic 06)
import { aiDocumentationRouter } from './aiDocumentation';
// Patient Communication Hub (Epic 11)
import { communicationRouter } from './communication';
// Payment Processing (Epic 10)
import { paymentProcessingRouter } from './payment-processing';
// Reporting & Analytics (Epic 15)
import { reportingRouter } from './reporting';
// AI Scheduling (Epic 13)
import { aiSchedulingRouter } from './ai-scheduling';
// Clearinghouse Integration (Epic 08)
import { clearinghouseRouter } from './clearinghouse';
// AI Communication Agent (Epic 12)
import { aiCommunicationRouter } from './ai-communication';
// Patient Portal (Epic 14)
import { portalRouter } from './portal';
// Inventory & POS (Epic 17)
import { inventoryRouter } from './inventory';
// AI Insights Agent (Epic 16)
import { aiInsightsRouter } from './aiInsights';
// AI Billing Agent (Epic 09)
import { aiBillingRouter } from './aiBilling';
// AI Documentation Agent (Epic 32)
import { aiDocRouter } from './aiDoc';
// Marketing & Referrals (Epic 18)
import { marketingRouter } from './marketing';
// Chiropractic Clinical Intelligence (Epic 19)
import { techniqueRouter } from './technique';
import { subluxationRouter } from './subluxation';
import { adjustmentRouter } from './adjustment';
import { vertebralListingRouter } from './vertebralListing';
import { chiropracticExamRouter } from './chiropracticExam';
import { spinalAnalysisRouter } from './spinalAnalysis';
import { chiropracticDashboardRouter } from './chiropracticDashboard';
// AI Posture & Movement Analysis (Epic 20)
import { postureRouter } from './posture';
import { romRouter } from './rom';
import { fmsRouter } from './fms';
// Telehealth & Virtual Care (Epic 21)
import { telehealthRouter } from './telehealth';
// Imaging & X-Ray Integration (Epic 22)
import { imagingRouter } from './imaging';
// Patient Education & Home Care (Epic 23)
import { exerciseRouter } from './exercise';
import { prescriptionRouter } from './prescription';
import { homeCareRouter } from './homeCare';
import { educationRouter } from './education';
import { progressRouter } from './progress';
import { portalEducationRouter } from './portalEducation';
// Wearable & Device Integration (Epic 24)
import { devicesRouter } from './devices';
// Multi-Location Enterprise (Epic 25)
import { locationRouter } from './location';
import { locationStaffRouter } from './locationStaff';
import { patientLocationRouter } from './patientLocation';
import { crossLocationSchedulingRouter } from './crossLocationScheduling';
import { enterpriseReportingRouter } from './enterpriseReporting';
import { interLocationInventoryRouter } from './interLocationInventory';
// Advanced Security & Compliance (Epic 26)
import { securityRouter } from './security';
import { baaRouter } from './baa';
import { accessControlRouter } from './accessControl';
// Mobile Applications (Epic 27)
import { mobileRouter } from './mobile';
import { notificationsRouter } from './notifications';
import { mobileScheduleRouter } from './mobileSchedule';
import { mobileChartingRouter } from './mobileCharting';
import { mobilePatientAppointmentsRouter } from './mobilePatientAppointments';
import { mobilePatientHealthRouter } from './mobilePatientHealth';
import { offlineRouter } from './offline';
// AI Receptionist Agent (Epic 30)
import { aiReceptionistRouter } from './ai-receptionist';
// AI Care Coordinator Agent (Epic 33)
import { aiCareRouter } from './aiCare';
// AI Revenue Optimizer Agent (Epic 35)
import { aiRevenueRouter } from './aiRevenue';
// AI Quality Assurance Agent (Epic 36)
import { aiQARouter } from './aiQA';
// AI Practice Growth Agent (Epic 37)
import { aiGrowthRouter } from './aiGrowth';
// AI Staff Training Agent (Epic 38)
import { aiTrainingRouter } from './aiTraining';
// AI Clinical Decision Support Agent (Epic 39)
import { aiClinicalRouter } from './aiClinical';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  organization: organizationRouter,
  dashboard: dashboardRouter,
  patient: patientRouter,
  scheduling: schedulingRouter,
  formTemplate: formTemplateRouter,
  formSubmission: formSubmissionRouter,
  kiosk: kioskRouter,
  formDelivery: formDeliveryRouter,
  encounter: encounterRouter,
  soapNote: soapNoteRouter,
  noteTemplate: noteTemplateRouter,
  diagnosis: diagnosisRouter,
  procedure: procedureRouter,
  treatmentPlan: treatmentPlanRouter,
  assessment: assessmentRouter,
  bodyDiagram: bodyDiagramRouter,
  // Billing & Claims (Epic 07)
  payer: payerRouter,
  insurancePolicy: insurancePolicyRouter,
  feeSchedule: feeScheduleRouter,
  charge: chargeRouter,
  payment: paymentRouter,
  ledger: ledgerRouter,
  claim: claimRouter,
  superbill: superbillRouter,
  cms1500: cms1500Router,
  // AI Documentation (Epic 06)
  aiDocumentation: aiDocumentationRouter,
  // Patient Communication Hub (Epic 11)
  communication: communicationRouter,
  // Payment Processing (Epic 10)
  paymentProcessing: paymentProcessingRouter,
  // Reporting & Analytics (Epic 15)
  reporting: reportingRouter,
  // AI Scheduling (Epic 13)
  aiScheduling: aiSchedulingRouter,
  // Clearinghouse Integration (Epic 08)
  clearinghouse: clearinghouseRouter,
  // AI Communication Agent (Epic 12)
  aiCommunication: aiCommunicationRouter,
  // Patient Portal (Epic 14)
  portal: portalRouter,
  // Inventory & POS (Epic 17)
  inventory: inventoryRouter,
  // AI Insights Agent (Epic 16)
  aiInsights: aiInsightsRouter,
  // AI Billing Agent (Epic 09)
  aiBilling: aiBillingRouter,
  // Marketing & Referrals (Epic 18)
  marketing: marketingRouter,
  // Chiropractic Clinical Intelligence (Epic 19)
  technique: techniqueRouter,
  subluxation: subluxationRouter,
  adjustment: adjustmentRouter,
  vertebralListing: vertebralListingRouter,
  chiropracticExam: chiropracticExamRouter,
  spinalAnalysis: spinalAnalysisRouter,
  chiropracticDashboard: chiropracticDashboardRouter,
  // AI Posture & Movement Analysis (Epic 20)
  posture: postureRouter,
  rom: romRouter,
  fms: fmsRouter,
  // Telehealth & Virtual Care (Epic 21)
  telehealth: telehealthRouter,
  // Imaging & X-Ray Integration (Epic 22)
  imaging: imagingRouter,
  // Patient Education & Home Care (Epic 23)
  exercise: exerciseRouter,
  prescription: prescriptionRouter,
  homeCare: homeCareRouter,
  education: educationRouter,
  progress: progressRouter,
  portalEducation: portalEducationRouter,
  // Wearable & Device Integration (Epic 24)
  devices: devicesRouter,
  // Multi-Location Enterprise (Epic 25)
  location: locationRouter,
  locationStaff: locationStaffRouter,
  patientLocation: patientLocationRouter,
  crossLocationScheduling: crossLocationSchedulingRouter,
  enterpriseReporting: enterpriseReportingRouter,
  interLocationInventory: interLocationInventoryRouter,
  // Advanced Security & Compliance (Epic 26)
  security: securityRouter,
  baa: baaRouter,
  accessControl: accessControlRouter,
  // Mobile Applications (Epic 27)
  mobile: mobileRouter,
  notifications: notificationsRouter,
  mobileSchedule: mobileScheduleRouter,
  mobileCharting: mobileChartingRouter,
  mobilePatientAppointments: mobilePatientAppointmentsRouter,
  mobilePatientHealth: mobilePatientHealthRouter,
  // Offline Mode (US-270)
  offline: offlineRouter,
  // AI Receptionist Agent (Epic 30)
  aiReceptionist: aiReceptionistRouter,
  // AI Documentation Agent (Epic 32)
  aiDoc: aiDocRouter,
  // AI Care Coordinator Agent (Epic 33)
  aiCare: aiCareRouter,
  // AI Revenue Optimizer Agent (Epic 35)
  aiRevenue: aiRevenueRouter,
  // AI Quality Assurance Agent (Epic 36)
  aiQA: aiQARouter,
  // AI Practice Growth Agent (Epic 37)
  aiGrowth: aiGrowthRouter,
  // AI Staff Training Agent (Epic 38)
  aiTraining: aiTrainingRouter,
  // AI Clinical Decision Support Agent (Epic 39)
  aiClinical: aiClinicalRouter,
});


export type AppRouter = typeof appRouter;
