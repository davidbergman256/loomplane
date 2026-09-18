export class WeftError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_INPUT') {
    super(message); this.name = 'WeftError';
  }
}
export function invariant(condition: unknown, message: string, status = 400, code = 'INVALID_INPUT'): asserts condition {
  if (!condition) throw new WeftError(message, status, code);
}
export function requiredText(value: unknown, field: string, max = 500): string {
  invariant(typeof value === 'string' && value.trim().length > 0, `${field} is required`);
  invariant(value.length <= max, `${field} exceeds ${max} characters`);
  return value.trim();
}
