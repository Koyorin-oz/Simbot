const { recordDeletedMessage } = require("../../services/snipeEditCacheService");

module.exports = {
  name: "messageDelete",
  execute(_client, message) {
    recordDeletedMessage(message);
  }
};
