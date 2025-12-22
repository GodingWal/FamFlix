interface Metric {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
}

class MetricsService {
  private metrics: Map<string, number[]> = new Map();

  recordMetric(metric: Metric) {
    const key = `${metric.name}:${JSON.stringify(metric.tags || {})}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push(metric.value);
    
    // Keep only last 1000 values
    const values = this.metrics.get(key)!;
    if (values.length > 1000) {
      values.shift();
    }
  }

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
        path: error.path || 'unknown'
      }
    });
  }

  getMetricsSummary() {
    const summary: Record<string, any> = {};

    for (const [key, values] of Array.from(this.metrics.entries())) {
      if (values.length === 0) continue;

      const sum = values.reduce((a: number, b: number) => a + b, 0);
      const sorted = [...values].sort((a, b) => a - b);
      
      summary[key] = {
        count: values.length,
        average: sum / values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    }

    return {
      metrics: summary,
      timestamp: new Date().toISOString()
    };
  }
}

export const metricsService = new MetricsService();

