// Recurring event formats. Dates are rolling example dates used for the public calendar
// and for Event structured data; members see the live schedule after signing in.
import genEvents from './generated/events.json';

const LOCAL_EVENTS = [];

export const EVENTS = Array.isArray(genEvents) && genEvents.length > 0 ? genEvents : LOCAL_EVENTS;

/**
 * Events that have not finished yet, soonest first.
 *
 * The calendar page calls itself "upcoming events", so anything whose end time has passed
 * must not appear there — showing a workshop that ended last Tuesday reads as an abandoned
 * site, both to visitors and to anything indexing the page. A site that rebuilds on a
 * schedule drops finished events automatically instead of relying on someone to notice.
 *
 * `now` is injectable so tests can pin the clock. An event whose date cannot be parsed is
 * dropped rather than advertised.
 *
 * Note the edge case that matters for a recurring calendar: an event is still listed while
 * it is running, and disappears once its end time passes. Nothing is hidden mid-event.
 */
export function upcomingEvents(now = Date.now()) {
  return EVENTS.filter((event) => {
    const end = new Date(event.endDate).getTime();
    return Number.isFinite(end) && end >= now;
  }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

/**
 * How an event's dates read to a human.
 *
 * A weekend festival has a start and an end on different days, so rendering only
 * startDate told visitors a two-day event was a one-day one. Both helpers live here
 * rather than in each page so the detail page, the calendar and the homepage cannot
 * drift apart again.
 */
const enDate = (iso, opts) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    ...opts,
    timeZone: 'UTC',
  });

export function formatDateRange(event) {
  const start = (event.startDate || '').slice(0, 10);
  const end = (event.endDate || event.startDate || '').slice(0, 10);
  if (!start) return '';
  if (!end || end === start) {
    return enDate(start, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (start.slice(0, 7) === end.slice(0, 7)) {
    // 14–15 November 2026
    return `${enDate(start, { day: 'numeric' })}–${enDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (start.slice(0, 4) === end.slice(0, 4)) {
    // 30 November – 1 December 2026
    return `${enDate(start, { day: 'numeric', month: 'long' })} – ${enDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  // 30 December 2026 – 2 January 2027
  return `${enDate(start, { day: 'numeric', month: 'long', year: 'numeric' })} – ${enDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/**
 * Time of day.
 *
 * `withDays` adds weekday and date to each end, which the detail page needs: its Date row
 * is a plain range ("14–15 November"), so without the day qualifier "10:00–23:59" reads as
 * if the event finished on the first evening. Listings already print the date range, so
 * there the qualifier would only repeat itself.
 */
export function formatTimeRange(event, { withDays = false } = {}) {
  const start = event.startDate || '';
  const end = event.endDate || start;
  const hm = (iso) => (iso.length >= 16 ? iso.slice(11, 16) : '');
  const multiDay = start.slice(0, 10) !== end.slice(0, 10);
  if (!multiDay) return `${hm(start)}–${hm(end)}`;
  if (!withDays) return `${hm(start)}–${hm(end)}`;
  const day = (iso) => enDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day(start)}, ${hm(start)} – ${day(end)}, ${hm(end)}`;
}
