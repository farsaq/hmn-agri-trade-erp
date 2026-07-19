import { SENSITIVE_FIELDS } from '../constants/app.js';

export function redactSensitive(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : redactSensitive(item, seen),
    ]),
  );
}
