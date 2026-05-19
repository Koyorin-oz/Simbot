const fs = require("node:fs");
const path = require("node:path");

function loadEvents(client) {
  const baseDir = path.join(__dirname, "..", "events", "client");
  unloadEvents(client);
  clearEventsCache(baseDir);

  const bindings = [];
  for (const file of fs.readdirSync(baseDir)) {
    if (!file.endsWith(".js")) continue;
    const event = require(path.join(baseDir, file));
    if (!event?.name || !event?.execute) continue;
    const listener = (...args) => event.execute(client, ...args);
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
    bindings.push({ name: event.name, listener, once: Boolean(event.once) });
  }
  client._eventBindings = bindings;
  client._eventsLoaded = bindings.length;
  return bindings.length;
}

function unloadEvents(client) {
  const bindings = client._eventBindings || [];
  for (const binding of bindings) {
    client.off(binding.name, binding.listener);
  }
  client._eventBindings = [];
  if (bindings.length) console.log(`[EVENTS] ${bindings.length} evenements decharges.`);
  return bindings.length;
}

function clearEventsCache(baseDir) {
  const normalizedBase = baseDir + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(normalizedBase)) delete require.cache[key];
  }
}

function reloadEvents(client) {
  return loadEvents(client);
}

module.exports = { loadEvents, unloadEvents, reloadEvents };
