import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePostponeTime } from '../src/modules/postpone/postpone-time.parser.js';

test('parses absolute Asia/Jakarta time into ISO-8601 +07:00', () => {
  const result = parsePostponeTime(
    '17-08-2026 13:30',
    new Date('2026-08-17T04:00:00.000Z'),
  );

  assert.equal(result.iso, '2026-08-17T13:30:00+07:00');
  assert.equal(result.display, '17-08-2026 13:30 WIB');
});

test('rejects invalid calendar date', () => {
  assert.throws(() =>
    parsePostponeTime('31-02-2026 13:30', new Date('2026-01-01T00:00:00.000Z')),
  );
});

test('rejects a time that is not in the future', () => {
  assert.throws(() =>
    parsePostponeTime('17-08-2026 11:30', new Date('2026-08-17T04:57:00.000Z')),
  );
});
