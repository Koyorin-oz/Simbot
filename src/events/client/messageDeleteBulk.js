const { recordDeletedMessage } = require("../../services/snipeEditCacheService");

module.exports = {
  name: "messageDeleteBulk",
  execute(_client, messages) {
    const arr = [...messages.values()].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
    for (const m of arr) recordDeletedMessage(m);
  }
};
