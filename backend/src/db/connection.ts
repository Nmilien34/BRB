import mongoose from 'mongoose';
import { env } from '../config/index.js';
import { logger } from '../utils/index.js';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.fatal(error, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}
