const { recordDeletedMessage, forgetCachedMessage } = require("../../services/snipeEditCacheService");
const { enqueueMessageDeleteModlog } = require("../../services/modLogService");

module.exports = {
  name: "messageDelete",
  async execute(client, message) {
    recordDeletedMessage(message);
    await enqueueMessageDeleteModlog(client, message).catch((e) =>
      console.warn("[MODLOG] messageDelete", e?.message || e)
    );
    forgetCachedMessage(message.id);
  }
};
