import IORedis from "ioredis";
import { config } from "../config";

let _redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  if (!config.FEATURE_STORY_MODE || !config.REDIS_URL) {
    return null;
  }
  
  if (!_redisConnection) {
    _redisConnection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  
  return _redisConnection;
}

export const redisConnection = (config.FEATURE_STORY_MODE && config.REDIS_URL)
  ? new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null })
  : null;
