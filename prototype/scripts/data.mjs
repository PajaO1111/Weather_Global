import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function numeric(value) {
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error(`Invalid numeric cell: ${value}`);
  }
  return Number(value);
}

function lines(text) {
  return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(line => !line.startsWith('#'));
}

export function parseCo2(text) {
  const rows = lines(text);
  if (rows.shift() !== 'year,month,decimal,average,average_unc,trend,trend_unc') {
    throw new Error('CO2 schema changed');
  }
  return rows.map(line => {
    const cells = line.split(',');
    if (cells.length !== 7) throw new Error('CO2 column count changed');
    return { date: `${cells[0]}-${cells[1].padStart(2, '0')}`, value: numeric(cells[3]) };
  });
}

export function parseTemperature(text) {
  const rows = lines(text);
  if (rows.shift() !== 'Land-Ocean: Global Means' ||
      rows.shift() !== 'Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON') {
    throw new Error('GISTEMP schema changed');
  }
  return rows.flatMap(line => {
    const cells = line.split(',');
    if (cells.length !== 19) throw new Error('GISTEMP column count changed');
    return cells.slice(1, 13).map((cell, index) => ({
      date: `${cells[0]}-${String(index + 1).padStart(2, '0')}`,
      value: cell === '***' ? null : numeric(cell)
    }));
  });
}

export function parseRoni(text) {
  const rows = lines(text);
  if (rows.shift().trim().split(/\s+/).join(',') !== 'SEAS,YR,ANOM') throw new Error('RONI schema changed');
  const seasons = 'DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ'.split(' ');
  return rows.map(line => {
    const [season, year, value, extra] = line.trim().split(/\s+/);
    const month = seasons.indexOf(season);
    if (month < 0 || extra !== undefined) throw new Error('Invalid RONI season');
    const center = `${year}-${String(month + 1).padStart(2, '0')}`;
    const start = new Date(Date.UTC(Number(year), month - 1, 1)).toISOString().slice(0, 7);
    const end = new Date(Date.UTC(Number(year), month + 1, 1)).toISOString().slice(0, 7);
    return { date: center, value: numeric(value), season, start, end };
  });
}

export function parseWorld(text) {
  const rows = lines(text);
  const cells = line => line.split(',').map(cell => cell.replace(/^"|"$/g, ''));
  const header = cells(rows.shift());
  const world = header.indexOf('world');
  if (header[0] !== 'date' || world < 0) throw new Error('Missing world column');
  return rows.map(line => {
    const row = cells(line);
    if (row.length !== header.length) throw new Error('Projection column count changed');
    return { date: row[0], value: numeric(row[world]) };
  });
}

export function validateSeries(series) {
  if (!series.length) throw new Error('Empty series');
  let previous;
  for (const point of series) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(point.date)) throw new Error('Invalid month');
    if (previous) {
      const [year, month] = previous.split('-').map(Number);
      const expected = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
      if (point.date !== expected) throw new Error('Duplicate or missing month');
    }
    if (point.value !== null && !Number.isFinite(point.value)) throw new Error('Invalid value');
    previous = point.date;
  }
  return series;
}

export function annualMeans(series) {
  const groups = new Map();
  for (const point of validateSeries(series)) {
    const year = point.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(point.value);
  }
  return [...groups].map(([year, values]) => ({
    date: year,
    value: values.length === 12 && values.every(value => value !== null)
      ? values.reduce((sum, value) => sum + value, 0) / 12
      : null
  }));
}

export function readSnapshot(directory) {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8').replace(/^\uFEFF/, ''));
  function read(name) {
    const entry = manifest.files.find(file => file.file === name);
    if (!entry) throw new Error(`Missing manifest entry: ${name}`);
    const buffer = readFileSync(new URL(name, directory));
    if (buffer.length !== entry.bytes ||
        createHash('sha256').update(buffer).digest('hex') !== entry.sha256) {
      throw new Error(`Sample integrity check failed: ${name}`);
    }
    return buffer.toString('utf8');
  }
  const series = {
    co2: validateSeries(parseCo2(read('noaa_co2_mm_gl.csv'))),
    temperature: validateSeries(parseTemperature(read('nasa_gistemp_v4_global.csv'))),
    roni: validateSeries(parseRoni(read('noaa_roni_ersstv6.txt')))
  };
  const projections = [];
  for (const model of ['ACCESS-CM2', 'ACCESS-ESM1-5']) {
    const historical = validateSeries(parseWorld(read(`CMIP6_${model}_historical_r1i1p1f1.csv`)));
    const baseline = historical.filter(point => point.date >= '1850-01' && point.date <= '1900-12');
    if (baseline.length !== 612) throw new Error('Incomplete model baseline');
    const mean = baseline.reduce((sum, point) => sum + point.value, 0) / baseline.length;
    for (const scenario of ['ssp126', 'ssp585']) {
      const future = validateSeries(parseWorld(read(`CMIP6_${model}_${scenario}_r1i1p1f1.csv`)));
      const annual = annualMeans(future);
      if (annual.length !== 86 || annual.some(point => point.value === null)) throw new Error('Incomplete scenario');
      projections.push({
        model, scenario,
        points: annual.map(point => ({ date: point.date, value: point.value - mean }))
      });
    }
  }
  return {
    snapshot: manifest.assessment_date,
    commit: manifest.ipcc_atlas_commit,
    series,
    projections
  };
}
