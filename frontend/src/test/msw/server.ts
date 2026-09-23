import { setupServer } from "msw/node";
import { authHandlers } from "./handlers/auth.js";
import { catalogHandlers } from "./handlers/catalog.js";
import { homeHandlers } from "./handlers/home.js";
import { inventoryHandlers } from "./handlers/inventory.js";
import { customersOrdersHandlers } from "./handlers/customersOrders.js";
import { distributionHandlers } from "./handlers/distribution.js";
import { posHandlers } from "./handlers/pos.js";
import { procurementHandlers } from "./handlers/procurement.js";

/// One msw server for every component test. Tests override handlers with
/// `server.use(...)` for the error, empty, and denied states.
export const server = setupServer(
  ...authHandlers(),
  ...catalogHandlers(),
  ...homeHandlers(),
  ...inventoryHandlers(),
  ...procurementHandlers(),
  ...posHandlers(),
  ...customersOrdersHandlers(),
  ...distributionHandlers(),
);
