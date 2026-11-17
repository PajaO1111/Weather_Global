import test from 'node:test';
import assert from 'node:assert/strict';
import { alignToMonths, calendarMonths, sharedPeriod } from '../src/comparison.js';

test('calendar timeline includes every month, including year boundaries and leap years', () => {
  assert.deepEqual(calendarMonths('2020-12', '2021-03'), [
    '2020-12', '2021-01', '2021-02', '2021-03'
  ]);
});

test('calendar timeline rejects malformed and reversed periods', () => {
  assert.throws(() => calendarMonths('2020-13', '2021-01'), RangeError);
  assert.throws(() => calendarMonths('2021-02', '2021-01'), RangeError);
});

test('shared period uses first and last valid observations, not missing boundary rows', () => {
  assert.deepEqual(sharedPeriod([
    [
      { date: '2000-01', value: null },
      { date: '2000-02', value: 10 },
      { date: '2000-04', value: 11 },
      { date: '2000-05', value: null }
    ],
    [
      { date: '2000-02', value: null },
      { date: '2000-03', value: 1 },
      { date: '2000-04', value: null }
    ]
  ]), { first: '2000-03', last: '2000-03' });
});

test('shared period is absent when a series has no valid values or ranges do not overlap', () => {
  assert.equal(sharedPeriod([[{ date: '2000-01', value: null }]]), null);
  assert.equal(sharedPeriod([
    [{ date: '2000-01', value: 1 }],
    [{ date: '2001-01', value: 2 }]
  ]), null);
});

test('series values align by month and preserve nulls for missing months', () => {
  const months = calendarMonths('2001-01', '2001-03');
  assert.deepEqual(alignToMonths([
    { date: '2001-01', value: 1.2 },
    { date: '2001-03', value: null }
  ], months), [
    { date: '2001-01', value: 1.2 },
    { date: '2001-02', value: null },
    { date: '2001-03', value: null }
  ]);
});
