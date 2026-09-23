import { Outlet } from "react-router-dom";
import { onUnauthorized } from "../lib/api/client.js";
import { useClearSessionOnUnauthorized } from "../lib/auth/session.js";

/// Subscribes the query cache to the API client's 401 hook once for the
/// whole application; the protected layout then redirects to `/connexion`.
export function RootLayout() {
  useClearSessionOnUnauthorized(onUnauthorized);

  return <Outlet />;
}
