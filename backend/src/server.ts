import app from './app.js';
import { env } from './config/index.js';
import { connectDB } from './db/index.js';
import { startApprovalEscalationJob } from './modules/approval-requests/approval-escalation.job.js';
import { logger } from './utils/index.js';

async function start() {
  await connectDB();
  startApprovalEscalationJob();

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
