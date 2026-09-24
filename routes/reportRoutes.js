const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { ensureOfficer } = require("../middleware/auth");

router.get("/reports/:id/pdf", reportController.downloadPdf);
router.get("/reports/export/csv", ensureOfficer, reportController.exportCsv);

module.exports = router;

