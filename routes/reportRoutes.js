const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

router.get("/reports/:id/pdf", reportController.downloadPdf);
router.get("/reports/export/csv", reportController.exportCsv);

module.exports = router;

