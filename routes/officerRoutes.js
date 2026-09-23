const express = require("express");
const router = express.Router();
const officerController = require("../controllers/officerController");
const { ensureOfficer } = require("../middleware/auth");
const { validateNotice } = require("../middleware/validator");

router.get("/officer/dashboard", ensureOfficer, officerController.getDashboard);
router.post("/officer/notice", ensureOfficer, validateNotice, officerController.postIssueNotice);
router.post("/officer/status", ensureOfficer, officerController.postUpdateReviewStatus);

module.exports = router;

