// Scenario validation and calendar operations shared by the engine and UI.
export function validDate(value, label = 'Data') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} inválida.`);
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} inválida.`);
  return value;
}
export function days(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > 36500) throw new Error(`${label}: informe dias inteiros entre ${minimum} e 36500.`);
  return number;
}
export function locationKey(property) {
  const lat = Number(property?.latitude), lon = Number(property?.longitude);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 && property?.latitude != null && property?.longitude != null
    ? `${lat.toFixed(4)},${lon.toFixed(4)}` : null;
}
export function matchesLocation(dataset, property) {
  const location = dataset?.metadata?.location;
  return Boolean(locationKey(location) && locationKey(location) === locationKey(property));
}
export function historicalYears(dataset) {
  return [...new Set(Object.keys(dataset?.daily || {}).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).map(x => Number(x.slice(0, 4))))].sort((a,b) => a-b);
}
export function periodLabel(dataset) {
  const years = historicalYears(dataset);
  return years.length ? `${years[0]}–${years.at(-1)}` : 'sem série climática';
}
export function annualDate(base, monthDay, yearOffset = 1) {
  validDate(base);
  const year = Number(base.slice(0, 4)) + yearOffset;
  const result = `${year}-${monthDay}`;
  // Feb 29 seasonal anchors become Feb 28 in non-leap years.
  if (monthDay === '02-29' && new Date(`${year}-03-01T12:00:00Z`).getUTCDate() === 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return `${year}-02-${leap ? '29' : '28'}`;
  }
  return validDate(result);
}
export function coverageMetrics(stages, start, end) {
  const day = x => Math.round(new Date(`${x}T12:00:00Z`).getTime() / 86400000);
  const first = day(start), last = day(end);
  const intervals = stages.map(s => [Math.max(first, day(s.sowDate)), Math.min(last, day(s.harvestDate))]).filter(([a,b])=>b>=a).sort((a,b)=>a[0]-b[0]);
  let liveCropDays = 0, until = first - 1;
  for (const [a,b] of intervals) { liveCropDays += Math.max(0, b - Math.max(a, until + 1) + 1); until = Math.max(until,b); }
  const horizonDays = last-first+1;
  return {startDate:start,endDate:end,horizonDays,liveCropDays,strawBonusDays:0,protectedDays:liveCropDays,bareSoilDays:horizonDays-liveCropDays,bareSoilPerYear:Math.round((horizonDays-liveCropDays)*365/horizonDays),method:'Dias com cultura viva; persistência da palhada não estimada.'};
}
