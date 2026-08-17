import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

// Only listen on TCP port if not running in Vercel serverless environment
if (!process.env.VERCEL) {
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 TFC WhatsApp Service API running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`🔗 Health Check: http://localhost:${env.PORT}/api/v1/health`);
  });

  // Graceful Shutdown for standalone process
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down API server...`);
    server.close(async () => {
      logger.info('HTTP server closed.');
      await prisma.$disconnect();
      logger.info('Database connections closed.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcefully terminating process after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
