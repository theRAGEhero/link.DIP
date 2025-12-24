const path = require("path");
const { createLogger, format, transports } = require("winston");

const logPath = path.join(__dirname, "..", "..", "data", "logs", "app.log");

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [new transports.File({ filename: logPath })],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(new transports.Console());
}

module.exports = logger;
