import { router } from '../trpc';
import { authRouter } from './auth';
import { userRouter } from './user';
import { organizationRouter } from './organization';
import { patientRouter } from './patient';
import { schedulingRouter } from './scheduling';
import { formTemplateRouter } from './formTemplate';
import { formSubmissionRouter } from './formSubmission';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  organization: organizationRouter,
  patient: patientRouter,
  scheduling: schedulingRouter,
  formTemplate: formTemplateRouter,
  formSubmission: formSubmissionRouter,
});

export type AppRouter = typeof appRouter;
