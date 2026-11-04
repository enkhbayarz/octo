import type { RequestIdVariables } from 'hono/request-id';

import type { Logger } from '../lib/logger.js';

export type CurrentUser = {
  id: string;
  clerkUserId: string;
  role: 'learner' | 'admin';
  timezone: string;
};

/** Context available to every request. */
export type AppEnv = {
  Variables: RequestIdVariables & { log: Logger };
};

/** Context on routes behind `requireUser`: the signed-in learner is always there. */
export type AuthedEnv = {
  Variables: AppEnv['Variables'] & { user: CurrentUser };
};
