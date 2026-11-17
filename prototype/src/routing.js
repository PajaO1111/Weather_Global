export function readRoute(hash) {
  const [view, query] = hash.replace(/^#/, '').split('?');
  return {
    view: view || 'overview',
    language: new URLSearchParams(query).get('lang') === 'en' ? 'en' : 'cs'
  };
}

export function routeHref(view, language) {
  return `#${view}?lang=${language}`;
}

const climateSnapshotRoutes = new Set([
  'about',
  'compare',
  'history',
  'ocean-future',
  'oceans',
  'overview',
  'projections',
  'sources'
]);

export function routeRequiresClimateSnapshot(view) {
  return climateSnapshotRoutes.has(view)
    || view.startsWith('indicator/')
    || view.startsWith('ocean/');
}
