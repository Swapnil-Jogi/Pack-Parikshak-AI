const mongoose = require("mongoose");

let isConnecting = false;
let lastDbError = null;

function sanitizeMongoUri(rawUri) {
  if (!rawUri) return "";
  let uri = String(rawUri).trim();

  // Strip 'MONGODB_URI=' prefix if user pasted the key name too
  if (/^MONGODB_URI\s*=\s*/i.test(uri)) {
    uri = uri.replace(/^MONGODB_URI\s*=\s*/i, "").trim();
  }

  // Strip surrounding quotes if entered in Render UI
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }

  // Strip trailing semicolon or whitespace
  uri = uri.replace(/;+$/, "").trim();

  // If scheme is mongodb:// or mongodb+srv://, cleanly sanitize credentials
  const schemeMatch = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/);
  if (!schemeMatch) return uri;

  const scheme = schemeMatch[1];
  const rest = schemeMatch[2];

  const atIndex = rest.lastIndexOf("@");
  if (atIndex === -1) return uri; // no credentials specified

  const credentials = rest.slice(0, atIndex);
  const hostAndRest = rest.slice(atIndex + 1);

  const colonIndex = credentials.indexOf(":");
  if (colonIndex === -1) {
    let rawUser = credentials;
    try { rawUser = decodeURIComponent(rawUser); } catch(e) {}
    if (rawUser.startsWith("<") && rawUser.endsWith(">")) {
      rawUser = rawUser.slice(1, -1);
    }
    return scheme + encodeURIComponent(rawUser) + "@" + hostAndRest;
  }

  let rawUser = credentials.slice(0, colonIndex);
  let rawPass = credentials.slice(colonIndex + 1);

  try { rawUser = decodeURIComponent(rawUser); } catch(e) {}
  try { rawPass = decodeURIComponent(rawPass); } catch(e) {}

  // Strip literal < > brackets if user left them around password (e.g. <mypassword>)
  if (rawUser.startsWith("<") && rawUser.endsWith(">")) {
    rawUser = rawUser.slice(1, -1);
  }
  if (rawPass.startsWith("<") && rawPass.endsWith(">")) {
    rawPass = rawPass.slice(1, -1);
  }

  return scheme + encodeURIComponent(rawUser) + ":" + encodeURIComponent(rawPass) + "@" + hostAndRest;
}

function validateMongoUri(uri) {
  if (!uri) {
    return { valid: false, error: "MONGODB_URI is empty or undefined." };
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return {
      valid: false,
      error: `Invalid connection scheme in MONGODB_URI: Expected 'mongodb://' or 'mongodb+srv://', but got '${uri.slice(0, 15)}...'. In Render Environment, enter only the connection URI without quotes or 'MONGODB_URI=' prefix.`
    };
  }
  if (uri.includes("<db_password>") || uri.includes("<password>")) {
    return {
      valid: false,
      error: "MONGODB_URI still contains '<db_password>' placeholder! In MongoDB Atlas, create a Database User with password, and replace '<db_password>' with your real password."
    };
  }
  return { valid: true };
}

const connectDB = async () => {
  if (isConnecting || mongoose.connection.readyState === 1) {
    return;
  }

  isConnecting = true;
  const rawUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pack_parikshak";
  const connUri = sanitizeMongoUri(rawUri);
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && (!process.env.MONGODB_URI || connUri.includes("127.0.0.1") || connUri.includes("localhost"))) {
    console.warn("==================================================================");
    console.warn("[MongoDB Config Warning] MONGODB_URI is missing or pointing to localhost in production!");
    console.warn("In Render Dashboard -> Environment, set MONGODB_URI to your MongoDB Atlas connection string:");
    console.warn("mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/pack_parikshak?retryWrites=true&w=majority");
    console.warn("==================================================================");
    lastDbError = "MONGODB_URI not configured in production; defaulted to localhost";
  }

  const validation = validateMongoUri(connUri);
  if (!validation.valid) {
    console.error("==================================================================");
    console.error("[MongoDB Config Error]", validation.error);
    console.error("==================================================================");
    lastDbError = validation.error;
    isConnecting = false;
    return;
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

    // Retry connection after 8 seconds
    setTimeout(() => {
      console.log("[MongoDB] Attempting to reconnect to database...");
      connectDB();
    }, 8000);
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
connectDB.sanitizeMongoUri = sanitizeMongoUri;
connectDB.validateMongoUri = validateMongoUri;

module.exports = connectDB;
