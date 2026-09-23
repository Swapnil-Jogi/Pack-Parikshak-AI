const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const inspectionController = require("../controllers/inspectionController");
const Inspection = require("../models/Inspection");
const { upload } = require("../config/cloudinary");
const passport = require("passport");

// Token login
router.post("/auth/login", authController.apiLogin);

// API Scan
router.post("/scan", upload.single("image"), async (req, res) => {
  return inspectionController.postUploadScan(req, res);
});

// Get Inspection Details
router.get("/inspections/:id", async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, inspection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Corrections
router.put("/inspections/:id/corrections", inspectionController.postUpdateCorrections);

module.exports = router;

