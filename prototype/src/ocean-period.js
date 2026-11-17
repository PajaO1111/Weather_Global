/* ====================================================
   OCEAN PERIODS
   Year shortcuts use the selected native-cadence series, never other missions.
   ==================================================== */

/** Returns the inclusive calendar-year coverage, or null for an empty series. */
export function oceanBounds(points) {
  const years = points.map((point) => point.year ?? Number(point.date?.slice(0, 4)));
  if (!years.length || years.some((year) => !Number.isInteger(year))) return null;
  return { first: Math.min(...years), last: Math.max(...years) };
}

/** Includes exactly N calendar years when available; longer shortcuts clamp. */
export function oceanShortcut(bounds, years) {
  if (!bounds || (years !== "all" && ![10, 50].includes(Number(years)))) return null;
  return {
    first: years === "all" ? bounds.first : Math.max(bounds.first, bounds.last - Number(years) + 1),
    last: bounds.last,
  };
}

/** Rejects blank, fractional, reversed and out-of-coverage year fields. */
export function validOceanPeriod(bounds, first, last) {
  return Boolean(bounds)
    && /^\d{4}$/.test(String(first)) && /^\d{4}$/.test(String(last))
    && Number(first) >= bounds.first && Number(last) <= bounds.last
    && Number(first) <= Number(last);
}
