class Logger {
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const baseLog = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (meta) {
      return `${baseLog} ${JSON.stringify(meta, null, 2)}`;
    }
    
    return baseLog;
  }

  error(message: string, meta?: any): void {
    console.error(this.formatMessage('error', message, meta));
  }

  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage('warn', message, meta));
  }

  info(message: string, meta?: any): void {
    console.info(this.formatMessage('info', message, meta));
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  logRequest(method: string, path: string, statusCode: number, duration: number, meta?: any): void {
    const message = `${method} ${path} ${statusCode} ${duration}ms`;
    
    if (statusCode >= 500) {
      this.error(message, meta);
    } else if (statusCode >= 400) {
      this.warn(message, meta);
    } else {
      this.info(message, meta);
    }
  }
}

export const logger = new Logger();

