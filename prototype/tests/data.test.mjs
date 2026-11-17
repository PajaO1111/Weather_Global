import test from 'node:test';
import assert from 'node:assert/strict';
import { readSnapshot, numeric, validateSeries, parseRoni, parseWorld, parseCo2, annualMeans } from '../scripts/data.mjs';

const data = readSnapshot(new URL('../../data_samples/2026-10-29/', import.meta.url));

test('historical snapshots retain exact periods and values', () => {
  assert.equal(data.series.co2.length, 571);
  assert.deepEqual(data.series.co2.at(-1), { date: '2026-07', value: 426.10 });
  assert.equal(data.series.temperature.filter(point => point.value !== null).length, 1761);
  assert.equal(data.series.temperature.filter(point => point.value === null).length, 3);
  assert.equal(data.series.temperature.find(point => point.date === '2026-09').value, 1.38);
});
test('RONI seasons retain cross-year boundaries', () => {
  const [djf] = parseRoni('SEAS YR ANOM\nDJF 1950 -1.19');
  assert.equal(djf.start, '1949-12');
  assert.equal(djf.end, '1950-02');
  assert.equal(data.series.roni.at(-1).end, '2026-09');
  assert.equal(data.series.roni.length, 920);
});
test('model demo contains four complete annual series, no ensemble band', () => {
  assert.equal(data.projections.length, 4);
  for (const series of data.projections) {
    assert.equal(series.points.length, 86);
    assert.equal(series.points[0].date, '2015');
    assert.equal(series.points.at(-1).date, '2100');
    assert.ok(series.points.every(point => Number.isFinite(point.value)));
    assert.equal(series.lower, undefined);
  }
});
test('incomplete annual values are not manufactured', () => {
  assert.equal(annualMeans(data.series.temperature).at(-1).value, null);
});
test('invalid inputs explicitly fail', () => {
  for (const cell of ['', '***', '<html>', 'NaN', 'Infinity']) assert.throws(() => numeric(cell));
  assert.throws(() => validateSeries([]));
  assert.throws(() => validateSeries([{ date: '2000-01', value: 1 }, { date: '2000-01', value: 2 }]));
  assert.throws(() => validateSeries([{ date: '2000-01', value: 1 }, { date: '2000-03', value: 2 }]));
  assert.throws(() => parseWorld('date,NEU\n2100-01,1'));
  assert.throws(() => parseCo2('year,month,value'));
  assert.throws(() => parseRoni('SEAS YR ANOM\nBAD 1950 1'));
});
