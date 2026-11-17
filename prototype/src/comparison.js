function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid month: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${value}`);
  return year * 12 + month - 1;
}

function monthLabel(index) {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function calendarMonths(first, last) {
  const start = monthIndex(first);
  const end = monthIndex(last);
  if (start > end) throw new RangeError('The start month must not follow the end month.');
  return Array.from({ length: end - start + 1 }, (_, offset) => monthLabel(start + offset));
}

export function sharedPeriod(series) {
  const bounds = series.map(points => {
    const available = points.filter(point => point.value !== null);
    return available.length
      ? { first: available[0].date, last: available.at(-1).date }
      : null;
  });
  if (bounds.some(bound => bound === null)) return null;

  const first = bounds.map(bound => bound.first).sort().at(-1);
  const last = bounds.map(bound => bound.last).sort()[0];
  return first <= last ? { first, last } : null;
}

export function alignToMonths(points, months) {
  const values = new Map(points.map(point => [point.date, point.value]));
  return months.map(date => ({ date, value: values.get(date) ?? null }));
}
