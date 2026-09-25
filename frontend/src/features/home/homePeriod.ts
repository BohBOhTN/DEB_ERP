import { toBusinessDate } from "../../i18n/format.js";

/// The period control of `Accueil`. The summary endpoint takes one business
/// day, so the client-side control offers today and yesterday; a seven-day
/// window needs a range parameter on the API and is deferred (see brief).
export type HomePeriod = "today" | "yesterday";

export function periodDate(
  period: HomePeriod,
  now = new Date(),
): string | undefined {
  if (period === "today") {
    return undefined;
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return toBusinessDate(yesterday);
}
