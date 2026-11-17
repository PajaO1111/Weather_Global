import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationSections, sectionForView } from '../src/navigation.js';
import { readRoute, routeHref } from '../src/routing.js';

for (const language of ['cs', 'en']) {
  test(`${language}: six sections preserve all public and local routes`, () => {
    for (const local of [false, true]) {
      const sections = navigationSections(language, local);
      assert.equal(sections.length, 6);
      const routes = new Set(sections.flatMap(section =>
        [section.route, ...section.links.map(link => link.route)]));
      const expected = ['overview', 'history', 'oceans', 'projections', 'compare',
        'sources', 'about', 'ocean-future', 'sea-ice', 'ice-sheets', 'snow-cover',
        'precipitation', 'drought', 'atmospheric-gases', 'carbon-budget', 'continents', 'continental-history'];
      if (local) expected.push(
        'europe', 'europe-pilot', 'europe-cmip6', 'europe-history',
      );
      assert.deepEqual([...routes].sort(), expected.sort());
      for (const route of routes) {
        assert.ok(sectionForView(sections, route));
        assert.deepEqual(readRoute(routeHref(route, language)), { view: route, language });
      }
      assert.equal(sectionForView(sections, 'indicator/co2').route, 'history');
      assert.equal(sectionForView(sections, 'ocean/sst').route, 'oceans');
      assert.equal(sectionForView(sections, 'continental-history').route, 'continental-history');
      assert.equal(sectionForView(sections, 'continents').route, 'continental-history');
      assert.equal(sectionForView(sections, 'unknown'), undefined);
      if (!local) {
        assert.equal(sectionForView(sections, 'carbon-budget').route, 'history');
        assert.equal(sectionForView(sections, 'europe'), undefined);
      }
    }
  });
}

test('section labels are translated without changing route identities', () => {
  const cs = navigationSections('cs', true);
  const en = navigationSections('en', true);
  cs.forEach((section, index) => {
    assert.notEqual(section.label, en[index].label);
    assert.equal(section.route, en[index].route);
    assert.deepEqual(section.links.map(link => link.route),
      en[index].links.map(link => link.route));
  });
});
