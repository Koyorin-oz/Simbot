const { recordEditedMessage, rememberMessage } = require("../../services/snipeEditCacheService");
const { logMessageEdited } = require("../../services/modLogService");

module.exports = {
  name: "messageUpdate",
  async execute(_client, oldMessage, newMessage) {
    if (newMessage.author?.bot) return;
    rememberMessage(newMessage);
    let oldM = oldMessage;
    if (oldMessage.partial) {
      oldM = await oldMessage.fetch().catch(() => oldMessage);
    }
    const recorded = recordEditedMessage(oldM, newMessage);
    if (recorded) {
      await logMessageEdited(oldM, newMessage).catch((e) =>
        console.warn("[MODLOG] messageUpdate", e?.message || e)
      );
    }
  }
};
