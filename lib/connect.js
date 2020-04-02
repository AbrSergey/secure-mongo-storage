const mongoose = require("mongoose");
const mongo = new mongoose.Mongoose();
let _connected = false;
let _logger;

mongo.connection.on("connected", function () {
  if (_logger) _logger.info("Connected to MongoDb!"); 
  // console.log("\x1b[32m%s\x1b[0m","\n[personal-data-storage]: Connected to MongoDb!");
  _connected = true;
});

mongo.connection.on("error", function (err) {
  if (_logger) _logger.error(`Connection ${err}`); 
  // console.log(`\x1b[31m \n[personal-data-storage]: Connection ${err}`);
});

mongo.connection.on("disconnected", function () {
  if (_logger) _logger.info("Mongo disconnected"); 
  // console.log("\x1b[31m \n[personal-data-storage]: Mongo disconnected");
  _connected = false;
});

module.exports.connect = async (url, options, logger) => {
  _logger = logger;
  return mongo.connect(url, options);
};

module.exports.disconnect = () => {
  mongo.connection.close();
};

module.exports.getConnect = () => {
  return _connected;
};

module.exports.mongoose = mongo;