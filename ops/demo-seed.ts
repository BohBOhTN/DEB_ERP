/// Entry point named by the V2 docs (OD-V2-013): the seed itself lives with
/// the backend services it calls. Run from the repository root:
///   npm run demo:seed -- [--reset] [--size small]
import "../backend/src/scripts/demoSeed.js";
