require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { spawn } = require("child_process");
const axios = require("axios");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const { i18nMiddleware } = require("./config/i18n");

// Initialize Express App
const app = express();
const port = parseInt(process.env.PORT, 10) || 8080;
const pythonOcrPort = parseInt(process.env.PYTHON_OCR_PORT, 10) || 5000;
const isProd = process.env.NODE_ENV === "production";
const rawMongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pack_parikshak";
const cleanMongoUri = connectDB.sanitizeMongoUri(rawMongoUri);

// Trust first proxy when in production (e.g. Render, Nginx, AWS, Cloudflare)
if (isProd) {
  app.set("trust proxy", 1);
}

// Connect Database
connectDB();

// Passport Configuration
require("./config/passport")(passport);

// -------------------------------------------------------------
// Production Security & Performance Middlewares
// -------------------------------------------------------------

// 1. HTTP Compression (Gzip / Deflate)
app.use(compression());

// 2. Helmet Security Headers with Custom CSP for CDN dependencies
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://cdn.tailwindcss.com",
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.cloudinary.com",
          "https://*.unsplash.com"
        ],
        connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// 3. CORS & Body Parsers
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.json({ limit: "25mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProd ? "1d" : 0 // Cache static assets in production
  })
);

// 4. Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts from this IP. Please try again after 15 minutes."
  },
  handler: (req, res, next, options) => {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(429).json(options.message);
    }
    if (req.flash) {
      req.flash("error", options.message.error);
    }
    res.status(429).redirect(req.header("Referer") || "/auth/login");
  }
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 scan evaluations per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Inspection rate limit reached. Please wait a few moments before submitting additional package scans."
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 600 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false
});

// Attach rate limiters to sensitive endpoints
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);
app.use("/inspections/upload", scanLimiter);
app.use("/api/scan", scanLimiter);
app.use("/api", apiLimiter);

// 5. Session Configuration with Persistent MongoDB Store & In-Memory Fallback
const uriValidation = connectDB.validateMongoUri(cleanMongoUri);
let sessionStore = undefined;

if (uriValidation.valid) {
  try {
    sessionStore = MongoStore.create({
      mongoUrl: cleanMongoUri,
      collectionName: "sessions",
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      autoRemove: "native"
    });
    sessionStore.on("error", (err) => {
      console.warn("[Session-Store] Persistent store connection warning:", err.message);
    });
  } catch (storeErr) {
    console.error("[Session-Store] Failed to initialize MongoStore, falling back to MemoryStore:", storeErr.message);
    sessionStore = undefined;
  }
} else {
  console.warn("[Session-Store] Skipping MongoStore initialization due to connection URI issue. Falling back to MemoryStore.");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "pack_parikshak_secret_key_gov_ai_2026",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      sameSite: "lax",
      secure: isProd
    }
  })
);

// 6. Passport Session
app.use(passport.initialize());
app.use(passport.session());

// 7. Flash Messaging Middleware
app.use(flash());

// 8. Multilingual Middleware (Supports 10 Indian Languages)
app.use(i18nMiddleware);

// 9. Global Template Variables & Flash Messages
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.success_msg = req.flash("success");
  res.locals.error_msg = req.flash("error");
  res.locals.warning_msg = req.flash("warning");
  res.locals.info_msg = req.flash("info");
  next();
});

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// -------------------------------------------------------------
// Production System Health Probes (/health and /api/health)
// -------------------------------------------------------------
async function getSystemHealth() {
  const dbStateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  const dbStatus = dbStateMap[mongoose.connection.readyState] || "unknown";
  const ocrHealthy = await checkOcrServiceHealth();

  const mem = process.memoryUsage();
  const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  const mongoConfigured = Boolean(process.env.MONGODB_URI && !process.env.MONGODB_URI.includes("127.0.0.1") && !process.env.MONGODB_URI.includes("localhost"));
  const lastDbError = connectDB.getLastError ? connectDB.getLastError() : null;
  let dbHint = "Database operational";
  if (dbStatus !== "connected") {
    if (lastDbError) {
      dbHint = `Connection issue: ${lastDbError}. Check Render Environment MONGODB_URI and MongoDB Atlas Network Access.`;
    } else if (!mongoConfigured && isProd) {
      dbHint = "MONGODB_URI is not set in Render. In Render Dashboard -> Environment, add MONGODB_URI with your MongoDB Atlas connection string.";
    } else {
      dbHint = "Database disconnected. Check MongoDB Atlas Network Access (whitelist 0.0.0.0/0) and credentials.";
    }
  }

  return {
    status: dbStatus === "connected" && ocrHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    services: {
      web: "online",
      database: {
        status: dbStatus,
        host: mongoose.connection.host || "unknown",
        name: mongoose.connection.name || "pack_parikshak",
        error: lastDbError || undefined,
        hint: dbHint
      },
      ocrMicroservice: {
        status: ocrHealthy ? "healthy" : "offline",
        port: pythonOcrPort
      }
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: formatMb(mem.rss),
        heapUsed: formatMb(mem.heapUsed),
        heapTotal: formatMb(mem.heapTotal)
      }
    }
  };
}

app.get("/health", async (req, res) => {
  try {
    const healthData = await getSystemHealth();
    const statusCode = healthData.status === "healthy" ? 200 : 503;
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(statusCode).json(healthData);
    }
    return res.status(statusCode).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>System Health | Pack-Parikshak AI</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="margin-top: 0; display: flex; align-items: center; justify-content: space-between;">
            <span>Pack-Parikshak AI</span>
            <span style="font-size: 0.85rem; padding: 4px 10px; border-radius: 9999px; background: ${healthData.status === 'healthy' ? '#14532d' : '#78350f'}; color: ${healthData.status === 'healthy' ? '#4ade80' : '#fde047'};">${healthData.status.toUpperCase()}</span>
          </h2>
          <hr style="border: 0; border-top: 1px solid #334155; margin: 1rem 0;">
          <p><strong>Database:</strong> <span style="color: #38bdf8;">${healthData.services.database.status}</span> (${healthData.services.database.host}/${healthData.services.database.name})</p>
          <p><strong>OCR Engine:</strong> <span style="color: ${healthData.services.ocrMicroservice.status === 'healthy' ? '#4ade80' : '#f87171'};">${healthData.services.ocrMicroservice.status}</span> (port ${healthData.services.ocrMicroservice.port})</p>
          <p><strong>Uptime:</strong> ${healthData.uptimeSeconds} seconds</p>
          <p><strong>Environment:</strong> ${healthData.environment}</p>
          <p><strong>Memory (RSS):</strong> ${healthData.system.memory.rss} (Heap: ${healthData.system.memory.heapUsed})</p>
          <p style="margin-top: 1.5rem;"><a href="/api/health" style="color: #38bdf8; text-decoration: none;">&rarr; View JSON Telemetry</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const healthData = await getSystemHealth();
    const statusCode = healthData.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthData);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Routes
const indexRoutes = require("./routes/indexRoutes");
const authRoutes = require("./routes/authRoutes");
const inspectionRoutes = require("./routes/inspectionRoutes");
const officerRoutes = require("./routes/officerRoutes");
const reportRoutes = require("./routes/reportRoutes");
const apiRoutes = require("./routes/apiRoutes");

app.use("/", indexRoutes);
app.use("/auth", authRoutes);
app.use("/", inspectionRoutes);
app.use("/", officerRoutes);
app.use("/", reportRoutes);
app.use("/api", apiRoutes);

// Error Handling (404 & 500)
app.use((req, res) => {
  res.status(404).render("errors/404.ejs", {
    title: "404 Not Found | Pack-Parikshak AI",
    message: "The requested legal portal page or document was not found."
  });
});

app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).render("errors/500.ejs", {
    title: "500 Server Error | Pack-Parikshak AI",
    message: isProd
      ? "An internal server error occurred while processing your request. Please try again or contact system support."
      : (err.message || "An unexpected error occurred.")
  });
});

// -------------------------------------------------------------
// Unified Terminal Management: Auto-spawn Python PaddleOCR microservice
// -------------------------------------------------------------
let pythonProcess = null;

async function checkOcrServiceHealth() {
  try {
    const res = await axios.get(`http://127.0.0.1:${pythonOcrPort}/health`, { timeout: 1500 });
    return res.data && res.data.status === "healthy";
  } catch (e) {
    return false;
  }
}

async function startPythonOcrService() {
  const isRunning = await checkOcrServiceHealth();
  if (isRunning) {
    console.log(`[Python-OCR] Detected existing microservice active on port ${pythonOcrPort}.`);
    return;
  }

  console.log(`[Python-OCR] Spawning Python PaddleOCR microservice on port ${pythonOcrPort}...`);
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const scriptPath = path.join(__dirname, "python_ocr", "app.py");

  pythonProcess = spawn(pythonCmd, [scriptPath], {
    env: { ...process.env, PORT: pythonOcrPort, PYTHON_OCR_PORT: pythonOcrPort }
  });

  pythonProcess.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((l) => console.log(`[Python-OCR] ${l}`));
  });

  pythonProcess.stderr.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((l) => console.error(`[Python-OCR Error] ${l}`));
  });

  pythonProcess.on("close", (code) => {
    console.log(`[Python-OCR] Process exited with code ${code}`);
    pythonProcess = null;
  });
}

// Start unified server
const server = app.listen(port, async () => {
  console.log("==================================================================");
  console.log("             PACK-PARIKSHAK AI - LEGAL METROLOGY PORTAL          ");
  console.log("        Under Legal Metrology (Packaged Commodities) Rules, 2011  ");
  console.log("==================================================================");
  console.log(` Web Application:  http://localhost:${port}`);
  console.log(` Consumer Portal:  http://localhost:${port}/dashboard`);
  console.log(` Officer Hub:      http://localhost:${port}/officer/dashboard`);
  console.log(` Health Probes:    http://localhost:${port}/health & /api/health`);
  console.log(` LMPC Guide:       http://localhost:${port}/lmpc-guide`);
  console.log(` Environment:      ${isProd ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(` Supported Langs:  10 Indian Languages (EN, HI, MR, BN, TA, TE, GU, KN, ML, PA)`);
  console.log("==================================================================");

  // Auto-start Python microservice in the same terminal
  await startPythonOcrService();
});

// Clean shutdown handler
async function handleShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

  server.close(() => {
    console.log("[Server] Closed HTTP listener and drained connections.");
  });

  if (pythonProcess) {
    console.log("[Python-OCR] Terminating background Python microservice...");
    try {
      pythonProcess.kill("SIGTERM");
    } catch (e) {}
  }

  try {
    await mongoose.connection.close(false);
    console.log("[MongoDB] Disconnected Mongoose connection.");
  } catch (e) {}

  console.log("[Server] Graceful shutdown completed.");
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection]", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", error);
});

module.exports = app;