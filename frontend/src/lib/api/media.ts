import { resolveApiBaseUrl } from "./client.js";

/// The address of a stored photo (issue #64). The API answers with a path
/// under `/media`; on one origin the path is the address, and when the API
/// lives on another origin (a development frontend against a remote API)
/// the API's origin is put in front.
export function mediaUrl(
  path: string | null | undefined,
  apiBaseUrl: string = resolveApiBaseUrl(),
): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//.test(path) || !/^https?:\/\//.test(apiBaseUrl)) {
    return path;
  }
  return `${new URL(apiBaseUrl).origin}${path}`;
}
