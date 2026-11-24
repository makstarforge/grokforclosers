// Date helpers. All "by day" reporting is bucketed in Eastern Time.
export const TZ = 'America/New_York';

// en-CA formats as YYYY-MM-DD.
export function dayKey(ms, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function tzOffsetMs(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Epoch seconds for 00:00:00 of the given YYYY-MM-DD in the given zone.
export function startOfDayEpochSec(ymd, tz = TZ) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(guess, tz);
  const second = guess - tzOffsetMs(first, tz); // refine across DST changes
  return Math.floor(second / 1000);
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The last `count` days ending at `todayYmd`, oldest first.
export function rangeDays(todayYmd, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(todayYmd, -i));
  return out;
}
