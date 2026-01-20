import { router } from '../trpc';
import { authRouter } from './auth';
import { userRouter } from './user';
import { organizationRouter } from './organization';
import { patientRouter } from './patient';
import { schedulingRouter } from './scheduling';
import { formTemplateRouter } from './formTemplate';
import { formSubmissionRouter } from './formSubmission';
import { kioskRouter } from './kiosk';
import { formDeliveryRouter } from './formDelivery';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  organization: organizationRouter,
  patient: patientRouter,
  scheduling: schedulingRouter,
  formTemplate: formTemplateRouter,
  formSubmission: formSubmissionRouter,
  kiosk: kioskRouter,
  formDelivery: formDeliveryRouter,
});

export type AppRouter = typeof appRouter;
