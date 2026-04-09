const { recordDeletedMessage, forgetCachedMessage } = require("../../services/snipeEditCacheService");
const { logMessageDeleted } = require("../../services/modLogService");

module.exports = {
  name: "messageDelete",
  async execute(_client, message) {
    recordDeletedMessage(message);
    await logMessageDeleted(message).catch((e) => console.warn("[MODLOG] messageDelete", e?.message || e));
    forgetCachedMessage(message.id);
  }
};
