const express = require("express");
const router = express.Router();
const inspectionController = require("../controllers/inspectionController");
const { upload } = require("../config/cloudinary");
const { ensureAuthenticated } = require("../middleware/auth");
const { validateCorrections } = require("../middleware/validator");

router.get("/inspections/new", ensureAuthenticated, inspectionController.getNewScan);
router.post("/inspections/upload", ensureAuthenticated, upload.single("image"), inspectionController.postUploadScan);
router.get("/inspections/:id/sandbox", inspectionController.getSandbox);
router.post("/inspections/:id/corrections", validateCorrections, inspectionController.postUpdateCorrections);

// User / Consumer Dashboard & Complaints
router.get("/dashboard", ensureAuthenticated, inspectionController.getUserDashboard);
router.post("/inspections/:id/complaint", ensureAuthenticated, inspectionController.postRaiseComplaint);

module.exports = router;

