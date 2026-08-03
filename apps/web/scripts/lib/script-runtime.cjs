// Lets standalone scripts reuse app modules that assume they are running
// inside Next. Two things get in the way:
//
//   - `server-only` throws on import outside a React Server Component.
//   - `after()` throws outside a request scope, so any write path that queues
//     background work (rule history, for example) fails *after* doing its work,
//     which makes a successful run report as a failure.
//
// Scripts are server-side by definition and have no request to defer past, so
// `server-only` becomes a no-op and `after()` runs its callback immediately.
//
// Usage: npx tsx --require ./scripts/lib/script-runtime.cjs scripts/your-script.ts
const path = require("node:path");
const Module = require("node:module");

const noopPath = path.join(__dirname, "noop.cjs");
const nextServerShimPath = path.join(__dirname, "next-server-shim.cjs");
const originalResolveFilename = Module._resolveFilename;

// The shim needs the real module it is wrapping, and cannot ask for it by name
// without resolving back to itself.
global.__resolveWithoutScriptRuntime = (request, parent) =>
  originalResolveFilename.call(Module, request, parent);

Module._resolveFilename = function resolveFilename(request, ...args) {
  if (request === "server-only") return noopPath;
  if (request === "next/server") return nextServerShimPath;
  return originalResolveFilename.call(this, request, ...args);
};
