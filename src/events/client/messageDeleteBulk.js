const { recordDeletedMessage } = require("../../services/snipeEditCacheService");
const { logBulkMessagesDeleted } = require("../../services/modLogService");

module.exports = {
  name: "messageDeleteBulk",
  async execute(_client, messages) {
    const arr = [...messages.values()].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
    for (const m of arr) recordDeletedMessage(m);
    const ch = arr[0]?.channel;
    if (ch?.guild) {
      await logBulkMessagesDeleted(ch, arr).catch((e) =>
        console.warn("[MODLOG] messageDeleteBulk", e?.message || e)
      );
    }
  }
};
