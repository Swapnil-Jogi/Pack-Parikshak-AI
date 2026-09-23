const express = require("express");
const router = express.Router();
const pageController = require("../controllers/pageController");

router.get("/", pageController.getHome);
router.get("/lmpc-guide", pageController.getLmpcGuide);
router.get("/architecture", pageController.getArchitecture);
router.get("/lang", pageController.changeLanguage);
router.get("/lang/:lang", pageController.changeLanguage);

module.exports = router;

