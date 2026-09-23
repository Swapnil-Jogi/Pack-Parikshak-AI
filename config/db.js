const mongoose = require("mongoose");

let isConnecting = false;
let lastDbError = null;

const connectDB = async () => {
  if (isConnecting || mongoose.connection.readyState === 1) {
    return;
  }

  isConnecting = true;
  const connUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pack_parikshak";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && (!process.env.MONGODB_URI || connUri.includes("127.0.0.1") || connUri.includes("localhost"))) {
    console.warn("==================================================================");
    console.warn("[MongoDB Config Warning] MONGODB_URI is missing or pointing to localhost in production!");
    console.warn("In Render Dashboard -> Environment, set MONGODB_URI to your MongoDB Atlas connection string:");
    console.warn("mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/pack_parikshak?retryWrites=true&w=majority");
    console.warn("==================================================================");
    lastDbError = "MONGODB_URI not configured in production; defaulted to localhost";
  }

  try {
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    isConnecting = false;
    lastDbError = null;
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    isConnecting = false;
    lastDbError = error.message;

    // Retry connection after 5 seconds
    setTimeout(() => {
      console.log("[MongoDB] Attempting to reconnect to database...");
      connectDB();
    }, 5000);
  }
};

mongoose.connection.on("connected", () => {
  console.log(`[MongoDB Event] Connected to host: ${mongoose.connection.host}`);
  lastDbError = null;
});

mongoose.connection.on("error", (err) => {
  console.error(`[MongoDB Event] Error: ${err.message}`);
  lastDbError = err.message;
});

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB Event] Disconnected from database.");
});

connectDB.getLastError = () => lastDbError;

module.exports = connectDB;
