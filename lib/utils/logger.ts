type LogLevel = 'info' | 'warn' | 'error';

interface LogMessage {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatMessage(level: LogLevel, message: string, data?: Record<string, unknown>): LogMessage {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  info(message: string, data?: Record<string, unknown>) {
    const logMessage = this.formatMessage('info', message, data);
    if (this.isDevelopment) {
      console.log(`[INFO] ${logMessage.message}`, data || '');
    }
    return logMessage;
  }

  warn(message: string, data?: Record<string, unknown>) {
    const logMessage = this.formatMessage('warn', message, data);
    if (this.isDevelopment) {
      console.warn(`[WARN] ${logMessage.message}`, data || '');
    }
    return logMessage;
  }

  error(message: string, data?: Record<string, unknown>) {
    const logMessage = this.formatMessage('error', message, data);
    if (this.isDevelopment) {
      console.error(`[ERROR] ${logMessage.message}`, data || '');
    }
    return logMessage;
  }
}

export const logger = new Logger(); 