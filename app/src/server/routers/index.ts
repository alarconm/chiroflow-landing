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
// Marketing & Referrals (Epic 18)
import { marketingRouter } from './marketing';
// Chiropractic Clinical Intelligence (Epic 19)
import { techniqueRouter } from './technique';
import { subluxationRouter } from './subluxation';
import { adjustmentRouter } from './adjustment';

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
});


export type AppRouter = typeof appRouter;
