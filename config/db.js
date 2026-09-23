const mongoose = require("mongoose");

let isConnecting = false;

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
  }

  try {
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    isConnecting = false;
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    isConnecting = false;

    // Retry connection after 5 seconds in production
    setTimeout(() => {
      console.log("[MongoDB] Attempting to reconnect to database...");
      connectDB();
    }, 5000);
  }
};

mongoose.connection.on("connected", () => {
  console.log(`[MongoDB Event] Connected to host: ${mongoose.connection.host}`);
});

mongoose.connection.on("error", (err) => {
  console.error(`[MongoDB Event] Error: ${err.message}`);
});

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB Event] Disconnected from database.");
});

module.exports = connectDB;
