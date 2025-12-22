import { logger } from '../utils/logger';

interface Metric {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: Date;
}

interface RequestMetrics {
  path: string;
  method: string;
  statusCode: number;
  responseTime: number;
  requestSize?: number;
  responseSize?: number;
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
}

class MetricsService {
  private metrics: Map<string, number[]> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();

  // Record a custom metric
  recordMetric(metric: Metric) {
    const key = `${metric.name}:${JSON.stringify(metric.tags || {})}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push(metric.value);
    
    // Keep only last 1000 values to prevent memory issues
    const values = this.metrics.get(key)!;
    if (values.length > 1000) {
      values.shift();
    }

    logger.debug('Metric recorded', {
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags
    });
  }

  // Record API request metrics
  recordRequest(metrics: RequestMetrics) {
    // Record response time
    this.recordMetric({
      name: 'http_request_duration_ms',
      value: metrics.responseTime,
      unit: 'milliseconds',
      tags: {
        method: metrics.method,
        path: this.normalizePath(metrics.path),
        status: metrics.statusCode.toString()
      }
    });

    // Record request count
    const requestKey = `${metrics.method}:${this.normalizePath(metrics.path)}`;
    this.requestCounts.set(requestKey, (this.requestCounts.get(requestKey) || 0) + 1);

    // Record error count for 4xx and 5xx responses
    if (metrics.statusCode >= 400) {
      const errorKey = `${metrics.statusCode}:${this.normalizePath(metrics.path)}`;
      this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    }

    // Record request/response sizes if available
    if (metrics.requestSize) {
      this.recordMetric({
        name: 'http_request_size_bytes',
        value: metrics.requestSize,
        unit: 'bytes',
        tags: {
          method: metrics.method,
          path: this.normalizePath(metrics.path)
        }
      });
    }

    if (metrics.responseSize) {
      this.recordMetric({
        name: 'http_response_size_bytes',
        value: metrics.responseSize,
        unit: 'bytes',
        tags: {
          method: metrics.method,
          path: this.normalizePath(metrics.path)
        }
      });
    }
  }

  // Record error metrics
  recordError(error: {
    type: string;
    message: string;
    path?: string;
    userId?: string;
  }) {
    this.recordMetric({
      name: 'application_errors_total',
      value: 1,
      unit: 'count',
      tags: {
        error_type: error.type,
        path: error.path ? this.normalizePath(error.path) : 'unknown'
      }
    });

    const errorKey = `${error.type}:${error.path || 'unknown'}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
  }

  // Record database query metrics
  recordDatabaseQuery(query: {
    operation: string;
    table: string;
    duration: number;
    success: boolean;
  }) {
    this.recordMetric({
      name: 'database_query_duration_ms',
      value: query.duration,
      unit: 'milliseconds',
      tags: {
        operation: query.operation,
        table: query.table,
        success: query.success.toString()
      }
    });

    if (!query.success) {
      this.recordMetric({
        name: 'database_errors_total',
        value: 1,
        unit: 'count',
        tags: {
          operation: query.operation,
          table: query.table
        }
      });
    }
  }

  // Record audio processing metrics
  recordAudioProcessing(processing: {
    operation: string;
    duration: number;
    inputSize: number;
    outputSize?: number;
    success: boolean;
    errorType?: string;
  }) {
    this.recordMetric({
      name: 'audio_processing_duration_ms',
      value: processing.duration,
      unit: 'milliseconds',
      tags: {
        operation: processing.operation,
        success: processing.success.toString()
      }
    });

    this.recordMetric({
      name: 'audio_input_size_bytes',
      value: processing.inputSize,
      unit: 'bytes',
      tags: {
        operation: processing.operation
      }
    });

    if (processing.outputSize) {
      this.recordMetric({
        name: 'audio_output_size_bytes',
        value: processing.outputSize,
        unit: 'bytes',
        tags: {
          operation: processing.operation
        }
      });
    }

    if (!processing.success) {
      this.recordMetric({
        name: 'audio_processing_errors_total',
        value: 1,
        unit: 'count',
        tags: {
          operation: processing.operation,
          error_type: processing.errorType || 'unknown'
        }
      });
    }
  }

  // Get metrics summary
  getMetricsSummary() {
    const summary: Record<string, any> = {};

    // Calculate averages, mins, maxs for stored metrics
    for (const [key, values] of this.metrics.entries()) {
      if (values.length === 0) continue;

      const sum = values.reduce((a, b) => a + b, 0);
      const sorted = [...values].sort((a, b) => a - b);
      
      summary[key] = {
        count: values.length,
        average: sum / values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }

    return {
      metrics: summary,
      requestCounts: Object.fromEntries(this.requestCounts),
      errorCounts: Object.fromEntries(this.errorCounts),
      timestamp: new Date().toISOString()
    };
  }

  // Get real-time metrics for monitoring dashboard
  getRealTimeMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // This is a simplified version - in production you'd want to use a proper time-series database
    return {
      activeConnections: this.getActiveConnections(),
      requestsPerMinute: this.getRequestsInTimeWindow(oneMinuteAgo, now),
      errorsPerMinute: this.getErrorsInTimeWindow(oneMinuteAgo, now),
      averageResponseTime: this.getAverageResponseTime(oneMinuteAgo, now),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  // Helper methods
  private normalizePath(path: string): string {
    // Replace UUIDs and other dynamic segments with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[^/]+\.(jpg|jpeg|png|gif|pdf|mp3|wav|mp4)/gi, '/:file');
  }

  private getActiveConnections(): number {
    // This would typically come from your HTTP server or load balancer
    return 0; // Placeholder
  }

  private getRequestsInTimeWindow(start: number, end: number): number {
    // In a real implementation, you'd filter metrics by timestamp
    return Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0);
  }

  private getErrorsInTimeWindow(start: number, end: number): number {
    return Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
  }

  private getAverageResponseTime(start: number, end: number): number {
    const responseTimeMetrics = this.metrics.get('http_request_duration_ms:{}');
    if (!responseTimeMetrics || responseTimeMetrics.length === 0) return 0;
    
    const sum = responseTimeMetrics.reduce((a, b) => a + b, 0);
    return sum / responseTimeMetrics.length;
  }

  // Clear old metrics to prevent memory leaks
  clearOldMetrics() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // In a real implementation, you'd filter by timestamp
    // For now, just clear if we have too many entries
    for (const [key, values] of this.metrics.entries()) {
      if (values.length > 10000) {
        this.metrics.set(key, values.slice(-1000)); // Keep last 1000
      }
    }
  }
}

export const metricsService = new MetricsService();

// Clear old metrics every hour
setInterval(() => {
  metricsService.clearOldMetrics();
}, 60 * 60 * 1000);
