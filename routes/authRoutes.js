const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { forwardAuthenticated } = require("../middleware/auth");
const { validateRegister, validateLogin } = require("../middleware/validator");

router.get("/login", forwardAuthenticated, authController.getLogin);
router.post("/login", validateLogin, authController.postLogin);

router.get("/register", forwardAuthenticated, authController.getRegister);
router.post("/register", validateRegister, authController.postRegister);

router.get("/demo/:role", authController.demoLogin);
router.get("/logout", authController.logout);

module.exports = router;

