const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log("[Storage] Cloudinary configured successfully.");
} else {
  console.log("[Storage] Cloudinary not configured; using local disk storage (/public/uploads).");
}

// Local storage disk configuration
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `pkg-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|bmp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files (jpeg, jpg, png, webp, bmp) are permitted."));
  }
});

/**
 * Uploads a local file to Cloudinary if configured; otherwise returns local relative URL.
 */
async function uploadToCloudinaryOrLocal(filePath, filename) {
  if (isCloudinaryConfigured) {
    try {
      const uploadRes = await cloudinary.uploader.upload(filePath, {
        folder: "pack_parikshak",
        use_filename: true
      });
      return {
        url: uploadRes.secure_url,
        public_id: uploadRes.public_id,
        isCloud: true
      };
    } catch (err) {
      console.warn("[Storage] Cloudinary upload failed, falling back to local URL:", err.message);
    }
  }

  // Local fallback
  return {
    url: `/uploads/${filename}`,
    public_id: filename,
    isCloud: false
  };
}

module.exports = {
  upload,
  uploadToCloudinaryOrLocal,
  isCloudinaryConfigured,
  cloudinary
};

