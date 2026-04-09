import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/index.js';
import { connectDB } from './db/index.js';
import { startApprovalEscalationJob } from './modules/approval-requests/approval-escalation.job.js';
import { logger } from './utils/index.js';

async function start() {
  await connectDB();
  startApprovalEscalationJob();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error(err, 'Error closing MongoDB connection');
      }
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
