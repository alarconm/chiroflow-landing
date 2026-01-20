import { router } from '../trpc';
import { authRouter } from './auth';
import { userRouter } from './user';
import { organizationRouter } from './organization';
import { patientRouter } from './patient';
import { schedulingRouter } from './scheduling';
import { formTemplateRouter } from './formTemplate';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  organization: organizationRouter,
  patient: patientRouter,
  scheduling: schedulingRouter,
  formTemplate: formTemplateRouter,
});

export type AppRouter = typeof appRouter;
