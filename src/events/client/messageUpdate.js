const { recordEditedMessage } = require("../../services/snipeEditCacheService");

module.exports = {
  name: "messageUpdate",
  async execute(_client, oldMessage, newMessage) {
    if (newMessage.author?.bot) return;
    let oldM = oldMessage;
    if (oldMessage.partial) {
      oldM = await oldMessage.fetch().catch(() => oldMessage);
    }
    recordEditedMessage(oldM, newMessage);
  }
};
