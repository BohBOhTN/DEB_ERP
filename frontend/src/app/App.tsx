import { RouterProvider } from "react-router-dom";
import { AppProviders } from "./providers.js";
import { createAppRouter } from "./router.js";

const router = createAppRouter();

/// Root of the V2 application: providers around the router (06 section 2).
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
