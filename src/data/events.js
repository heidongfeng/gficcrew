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
