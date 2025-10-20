export const logger = {
  log(level, message, context = null, data = null) {
    const logEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      ...(context && { context }),
      ...(data && { data }),
    };
    console.log(JSON.stringify(logEntry));
  },
  info(message, context = null, data = null) {
    this.log("INFO", message, context, data);
  },
  warn(message, context = null, data = null) {
    this.log("WARN", message, context, data);
  },
  error(message, context = null, data = null) {
    this.log("ERROR", message, context, data);
  },
  debug(message, context = null, data = null) {
    if (process.env.NODE_ENV !== "production") {
      this.log("DEBUG", message, context, data);
    }
  }
};
