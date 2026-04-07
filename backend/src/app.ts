import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/index.js';
import { logger } from './utils/index.js';
import { errorHandler, notFound } from './middleware/index.js';
import apiRoutes from './routes/index.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());
app.use(pinoHttp({ logger }));

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
