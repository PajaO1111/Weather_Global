import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, routeHref, routeRequiresClimateSnapshot } from '../src/routing.js';

test('switching language preserves deep-linked indicator view', () => {
  const current = readRoute('#indicator/co2?lang=cs');
  assert.equal(routeHref(current.view, 'en'), '#indicator/co2?lang=en');
  assert.deepEqual(readRoute('#indicator/co2?lang=en'), { view: 'indicator/co2', language: 'en' });
});
test('empty route and unsupported language have explicit supported defaults', () => {
  assert.deepEqual(readRoute(''), { view: 'overview', language: 'cs' });
  assert.deepEqual(readRoute('#projections?lang=de'), { view: 'projections', language: 'cs' });
});

test('independent product routes do not require the shared climate snapshot', () => {
  for (const route of ['sea-ice', 'ice-sheets', 'snow-cover', 'precipitation', 'drought', 'atmospheric-gases', 'carbon-budget', 'continental-history', 'continents', 'europe-history']) {
    assert.equal(routeRequiresClimateSnapshot(route), false, route);
  }
  for (const route of ['overview', 'history', 'compare', 'projections', 'oceans', 'ocean-future', 'ocean/sst', 'indicator/co2', 'sources', 'about']) {
    assert.equal(routeRequiresClimateSnapshot(route), true, route);
  }
});
