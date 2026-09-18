import { createHash } from 'node:crypto';
import { invariant, LoomplaneError } from './errors.js';

function canonicalJson(value: unknown, code: string): string {
  const ancestors = new Set<object>();
  const visit = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      invariant(
        Number.isFinite(item),
        'Idempotency values must contain finite JSON numbers',
        400,
        code,
      );
      return JSON.stringify(item);
    }
    invariant(
      typeof item === 'object' && item !== null,
      'Idempotency values must be JSON',
      400,
      code,
    );
    invariant(!ancestors.has(item), 'Idempotency values must not contain cycles', 400, code);
    invariant(
      Array.isArray(item) ||
        Object.getPrototypeOf(item) === Object.prototype ||
        Object.getPrototypeOf(item) === null,
      'Idempotency values must use plain JSON objects and arrays',
      400,
      code,
    );
    invariant(
      Object.getOwnPropertySymbols(item).length === 0,
      'Idempotency values must not contain symbol keys',
      400,
      code,
    );
    ancestors.add(item);
    const serialized = Array.isArray(item)
      ? `[${Array.from({ length: item.length }, (_, index) => visit(item[index])).join(',')}]`
      : `{${Object.keys(item)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${visit((item as Record<string, unknown>)[key])}`)
          .join(',')}}`;
    ancestors.delete(item);
    return serialized;
  };
  try {
    return visit(value);
  } catch (error) {
    if (error instanceof LoomplaneError) throw error;
    throw new LoomplaneError('Could not serialize idempotency JSON value', 400, code);
  }
}

/** SHA-256 over strict JSON: sorted object keys; preserved array order. */
export function idempotencyFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value, 'INVALID_IDEMPOTENCY_INPUT'))
    .digest('hex');
}

export function serializeIdempotencyResult(value: unknown): string {
  const serialized = canonicalJson(value, 'INVALID_IDEMPOTENCY_RESULT');
  invariant(
    Buffer.byteLength(serialized, 'utf8') <= 1024 * 1024,
    'Idempotency result exceeds 1 MiB',
    413,
    'IDEMPOTENCY_RESULT_TOO_LARGE',
  );
  return serialized;
}
