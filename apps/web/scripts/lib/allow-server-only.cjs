// `server-only` throws on import outside a React Server Component, which stops
// standalone scripts from reusing app modules that (transitively) import it.
// Scripts run on the server by definition, so resolve it to a no-op.
//
// Usage: npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/your-script.ts
const path = require("node:path");
const Module = require("node:module");

const noopPath = path.join(__dirname, "noop.cjs");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, ...args) {
  if (request === "server-only") return noopPath;
  return originalResolveFilename.call(this, request, ...args);
};
