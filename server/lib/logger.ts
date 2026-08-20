/**
 * Structured logging.
 *
 * Replaces ad-hoc `console.log` scattered through the server. Two things were
 * wrong with that: there was no way to turn any of it down in production, and
 * several call sites interpolated whole records — including article bodies and
 * integration settings — into the output.
 *
 * A log line here is a scope, a message, and optional structured fields. Fields
 * pass through a redactor so a credential cannot be logged by accident.
 */

import { env } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Verbose output is useful locally and noise in production. */
const MIN_LEVEL: LogLevel = env.isProduction ? 'info' : 'debug';

/** Field names whose values must never reach the log. */
const SENSITIVE_KEY = /^(password|token|secret|api_?key|access_?token|authorization|cookie|session)/i;

/** Values longer than this are truncated; article bodies are the usual culprit. */
const MAX_VALUE_LENGTH = 300;

export type LogFields = Record<string, unknown>;

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value == null) return value;

  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}… (${value.length} chars)`
      : value;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value !== 'object') return value;

  // Bound recursion so a cyclic or deeply nested record cannot stall logging.
  if (depth >= 3) return '[object]';

  if (Array.isArray(value)) {
    return value.length > 20
      ? `[${value.length} items]`
      : value.map((item, index) => redactValue(String(index), item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(k, v, depth + 1);
  }
  return out;
}

function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = redactValue(key, value, 0);
  }
  return out;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  if (!shouldLog(level)) return;

  const safeFields = fields && Object.keys(fields).length ? redactFields(fields) : undefined;

  if (env.isProduction) {
    // One JSON object per line, so a log aggregator can parse it.
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...(safeFields ? { fields: safeFields } : {}),
    });
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
    return;
  }

  // Human-readable in development.
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const prefix = `${time} ${level.toUpperCase().padEnd(5)} [${scope}]`;
  const suffix = safeFields ? ` ${JSON.stringify(safeFields)}` : '';
  (level === 'error' || level === 'warn' ? console.error : console.log)(
    `${prefix} ${message}${suffix}`,
  );
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Derives a nested scope, e.g. `airtable:sync`. */
  child(childScope: string): Logger;
}

/**
 * Creates a logger bound to a scope.
 *
 *   const log = createLogger('airtable');
 *   log.info('Synced articles', { created: 3, updated: 11 });
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, fields) => emit('debug', scope, message, fields),
    info: (message, fields) => emit('info', scope, message, fields),
    warn: (message, fields) => emit('warn', scope, message, fields),
    error: (message, fields) => emit('error', scope, message, fields),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

/** Fallback scope for code that has not been given one yet. */
export const logger = createLogger('app');
