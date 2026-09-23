import { http } from "msw";
import type { HomeSummary } from "../../../features/home/home.api.js";
import { makeHomeSummary } from "../../factories/homeSummary.js";
import { apiV1, ok } from "../envelope.js";

export function homeHandlers(summary: HomeSummary = makeHomeSummary()) {
  return [http.get(`${apiV1}/home/summary`, () => ok({ summary }))];
}
