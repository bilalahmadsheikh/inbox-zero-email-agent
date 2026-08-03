// Stands in for `next/server` in scripts. Everything is passed straight
// through to the real module except `after()`, which normally throws outside a
// request scope; here it runs the callback immediately so write paths that
// queue background work complete instead of failing after the fact.
const realPath = global.__resolveWithoutScriptRuntime("next/server", module);
const real = require(realPath);

const pendingWork = [];

function after(work) {
  const promise = Promise.resolve()
    .then(() => (typeof work === "function" ? work() : work))
    .catch((error) => {
      console.error("after() callback failed:", error);
    });

  pendingWork.push(promise);
  return promise;
}

// Scripts exit as soon as main() resolves, which can be before the work above
// settles. Exposed so a script can await it before disconnecting.
after.pending = () => Promise.all(pendingWork);

module.exports = new Proxy(real, {
  get(target, property, receiver) {
    if (property === "after") return after;
    return Reflect.get(target, property, receiver);
  },
});
