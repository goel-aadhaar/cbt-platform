import { Prisma } from '../../generated/prisma/client';

import { conflictingFields } from './institutes.service';

/**
 * Which columns a unique-constraint error is about.
 *
 * This existed as an inline `err.meta?.target?.includes('code')` and was
 * silently always false: running through a driver adapter, Prisma reports the
 * columns at `meta.driverAdapterError.cause.constraint.fields` and sets no
 * `target` at all. The retry loop in `create()` therefore never retried, and
 * the first duplicate 4-digit code surfaced to the caller as a 500.
 *
 * Pinned here because the failure mode is invisible: everything still compiles,
 * the code still reads correctly, and it only shows up as a rare 500 during
 * signup that looks like a fluke.
 */

function p2002(meta: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: meta as Record<string, unknown>,
  });
}

describe('conflictingFields', () => {
  it('reads the driver-adapter shape this service actually runs on', () => {
    const err = p2002({
      modelName: 'Institute',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['code'] },
        },
      },
    });
    expect(conflictingFields(err)).toContain('code');
  });

  it('still reads the plain `target` array', () => {
    expect(conflictingFields(p2002({ target: ['code'] }))).toContain('code');
  });

  it('accepts a `target` reported as a bare string', () => {
    expect(conflictingFields(p2002({ target: 'institutes_code_key' }))).toEqual(
      ['institutes_code_key'],
    );
  });

  it('falls back to the constraint name when no fields are given', () => {
    const err = p2002({
      driverAdapterError: {
        cause: { constraint: { index: 'institutes_code_key' } },
      },
    });
    // Substring is enough to tell the code index from the slug one, which is
    // all the caller needs to decide whether retrying can help.
    expect(conflictingFields(err).some((f) => f.includes('code'))).toBe(true);
  });

  it('does not claim a slug collision is a code collision', () => {
    const err = p2002({
      driverAdapterError: {
        cause: { constraint: { fields: ['slug'] } },
      },
    });
    // Retrying with a new random code would never clear a slug conflict — it
    // would just fail the same way twenty times and report the wrong problem.
    expect(conflictingFields(err)).not.toContain('code');
  });

  it('returns nothing rather than throwing on an unrecognised shape', () => {
    expect(conflictingFields(p2002(undefined))).toEqual([]);
    expect(conflictingFields(p2002({}))).toEqual([]);
    expect(conflictingFields(p2002({ driverAdapterError: {} }))).toEqual([]);
  });
});
