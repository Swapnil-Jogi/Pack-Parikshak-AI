const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pack_parikshak";
    const conn = await mongoose.connect(connUri);
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    // Don't kill process immediately; allow retry or fallback operation
  }
};

module.exports = connectDB;

