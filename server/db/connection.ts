import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as schema from '../../shared/schema';

// Connection pool configuration
const connectionConfig = {
  host: config.DATABASE_URL,
  max: 20, // Maximum number of connections in the pool
  idle_timeout: 20000, // Close idle connections after 20 seconds
  connect_timeout: 10000, // Timeout for new connections
  prepare: false, // Disable prepared statements for better performance in some cases
  onnotice: (notice: any) => {
    logger.debug('PostgreSQL notice:', notice);
  },
  debug: config.NODE_ENV === 'development' ? 
    (connection: any, query: string, parameters: any[]) => {
      logger.debug('SQL Query:', { query, parameters });
    } : undefined,
};

// Create connection pool
const sql = postgres(config.DATABASE_URL, connectionConfig);

// Create Drizzle instance
export const db = drizzle(sql, { schema });

// Health check function
export const checkDatabaseHealth = async (): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  try {
    // Simple query to check database connectivity
    await sql`SELECT 1 as health_check`;
    
    const responseTime = Date.now() - startTime;
    
    if (responseTime > 1000) {
      return {
        status: 'degraded',
        responseTime,
        error: 'Database response time is high'
      };
    }
    
    return {
      status: 'healthy',
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Database health check failed:', error);
    
    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
};

// Connection event handlers
sql.listen('connect', () => {
  logger.info('Database connection established');
});

sql.listen('error', (error: any) => {
  logger.error('Database connection error:', error);
});

sql.listen('disconnect', () => {
  logger.warn('Database connection lost');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Closing database connections...');
  await sql.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Closing database connections...');
  await sql.end();
  process.exit(0);
});

export default db;
