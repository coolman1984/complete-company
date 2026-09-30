// The simulation clock: one moment that every application of the run reads (plan 50 WP-P3, "controlled time").
// Mizan and GMES run inside the engine's process and read this object; HR-System runs beside it and is told the plant's date.
// Times are set in the PLANT's time zone (Africa/Cairo), because a production day starts at 07:00 local.

export const ZONE = 'Africa/Cairo';

/** The UTC instant (ms) of a wall-clock time `hhmm` on `day` (YYYY-MM-DD) in the plant's zone. */
export function localInstant(day, hhmm, zone = ZONE) {
  const probe = new Date(`${day}T12:00:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(probe).map((x) => [x.type, x.value]));
  const offset = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - probe.getTime();
  const [h, m] = hhmm.split(':').map(Number);
  return Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60000 - offset;
}

/** The plant's calendar day of a UTC instant. */
export function localDay(ms, zone = ZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * A clock that only moves when told. `newId` is what GMES asks a clock for (ids of its records); it is given by the caller so that this
 * file needs nothing from the applications.
 */
export function makeClock(startDay, startTime = '00:30', newId = () => crypto.randomUUID()) {
  let t = localInstant(startDay, startTime);
  return {
    now: () => new Date(t),
    newId,
    /** Move to `hhmm` on `day` (plant time). Time never runs backwards: a step into the past is a bug in the engine. */
    at(day, hhmm) {
      const next = localInstant(day, hhmm);
      if (next < t) throw new Error(`the clock cannot go back: it is ${new Date(t).toISOString()}, asked for ${day} ${hhmm}`);
      t = next;
      return this.now();
    },
    day: () => localDay(t),
  };
}
