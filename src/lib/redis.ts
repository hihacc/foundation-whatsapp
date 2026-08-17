import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
    return delay;
  },
});

redisConnection.on('connect', () => {
  logger.info('✅ Connected to Redis successfully');
});

redisConnection.on('error', (err) => {
  logger.error({ err: err.message }, '❌ Redis connection error');
});
