-- Add system monitoring and health check tables

-- System metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name varchar(100) NOT NULL,
  metric_value decimal(15,6) NOT NULL,
  metric_unit varchar(20),
  tags jsonb,
  recorded_at timestamp DEFAULT NOW()
);

-- Indexes for system metrics
CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON system_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name_recorded ON system_metrics(metric_name, recorded_at DESC);

-- API request logs table for monitoring
CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method varchar(10) NOT NULL,
  path varchar(500) NOT NULL,
  status_code integer NOT NULL,
  response_time_ms integer NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_address inet,
  user_agent text,
  request_size integer,
  response_size integer,
  error_message text,
  created_at timestamp DEFAULT NOW()
);

-- Indexes for API request logs
CREATE INDEX IF NOT EXISTS idx_api_logs_path ON api_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_logs_user ON api_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_response_time ON api_request_logs(response_time_ms DESC);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type varchar(100) NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_path varchar(500),
  request_method varchar(10),
  ip_address inet,
  user_agent text,
  additional_data jsonb,
  created_at timestamp DEFAULT NOW()
);

-- Indexes for error logs
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_path ON error_logs(request_path);

-- Health check status table
CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name varchar(100) NOT NULL,
  status varchar(20) NOT NULL, -- 'healthy', 'degraded', 'unhealthy'
  response_time_ms integer,
  error_message text,
  additional_info jsonb,
  checked_at timestamp DEFAULT NOW()
);

-- Indexes for health checks
CREATE INDEX IF NOT EXISTS idx_health_service ON health_checks(service_name);
CREATE INDEX IF NOT EXISTS idx_health_status ON health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checked ON health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_service_checked ON health_checks(service_name, checked_at DESC);

-- Cleanup functions for monitoring data
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  -- Keep metrics for 30 days
  DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
  
  -- Keep API logs for 7 days
  DELETE FROM api_request_logs WHERE created_at < NOW() - INTERVAL '7 days';
  
  -- Keep error logs for 30 days
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Keep health checks for 7 days
  DELETE FROM health_checks WHERE checked_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
