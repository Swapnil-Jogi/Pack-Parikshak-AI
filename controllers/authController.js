const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Render Login Page
exports.getLogin = (req, res) => {
  const alert = req.query.alert;
  const role = req.query.role === "officer" ? "officer" : "user";
  let returnTo = req.query.returnTo || (req.session && req.session.returnTo) || "";
  if (!returnTo && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      if (refererUrl.pathname && !refererUrl.pathname.startsWith("/auth")) {
        returnTo = refererUrl.pathname + refererUrl.search;
      }
    } catch (e) {}
  }
  if (req.session && returnTo) {
    req.session.returnTo = returnTo;
  }
  let message = null;
  if (alert === "unauthorized") {
    message = "Please sign in to access this portal.";
  } else if (alert === "logged_out") {
    message = "You have been signed out successfully.";
  } else if (alert === "verify_package") {
    message = "Please sign in to verify your packaged commodity.";
  }
  res.render("auth/login.ejs", {
    title: role === "officer" ? "Enforcement Officer Sign In | Pack-Parikshak AI" : "Consumer Sign In | Pack-Parikshak AI",
    errorMessage: req.session.errorMessage || null,
    infoMessage: message,
    activeRole: role,
    returnTo: returnTo
  });
  req.session.errorMessage = null;
};

// Handle Login POST
exports.postLogin = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      const msg = info ? info.message : "Invalid email or password.";
      req.flash("error", msg);
      return res.redirect("/auth/login" + (req.query.role ? `?role=${req.query.role}` : ""));
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);

      req.flash("success", `Welcome back, ${user.name}!`);

      // Redirect to returnTo destination or role dashboard
      let destination;
      if (user.role === "officer") {
        destination = (req.body.returnTo && req.body.returnTo.startsWith("/officer"))
          ? req.body.returnTo
          : (req.session.returnTo && req.session.returnTo.startsWith("/officer"))
          ? req.session.returnTo
          : "/officer/dashboard";
      } else {
        // Consumer: strictly send to consumer dashboard or clean returnTo (NEVER officer routes)
        destination = (req.body.returnTo && !req.body.returnTo.startsWith("/officer"))
          ? req.body.returnTo
          : (req.session.returnTo && !req.session.returnTo.startsWith("/officer"))
          ? req.session.returnTo
          : "/dashboard";
      }

      if (typeof destination !== "string" || !destination.startsWith("/") || destination.startsWith("//")) {
        destination = user.role === "officer" ? "/officer/dashboard" : "/dashboard";
      }
      delete req.session.returnTo;
      req.session.save(() => {
        return res.redirect(destination);
      });
    });
  })(req, res, next);
};

// Render Register Page
exports.getRegister = (req, res) => {
  const alert = req.query.alert;
  const role = (req.query.role === "officer" || (req.session && req.session.registerRole === "officer")) ? "officer" : "user";
  let returnTo = req.query.returnTo || (req.session && req.session.returnTo) || "";
  if (!returnTo && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      if (refererUrl.pathname && !refererUrl.pathname.startsWith("/auth")) {
        returnTo = refererUrl.pathname + refererUrl.search;
      }
    } catch (e) {}
  }
  if (req.session && returnTo) {
    req.session.returnTo = returnTo;
  }
  let infoMessage = null;
  if (alert === "verify_package") {
    infoMessage = "Please create a free account to verify your packaged commodity.";
  }
  res.render("auth/register.ejs", {
    title: role === "officer" ? "Register Enforcement Officer | Pack-Parikshak AI" : "Register Account | Pack-Parikshak AI",
    errorMessage: req.session.errorMessage || null,
    infoMessage: infoMessage,
    activeRole: role,
    returnTo: returnTo
  });
  req.session.errorMessage = null;
};

// Handle Register POST
exports.postRegister = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, badgeId, department, state, organization, phone, returnTo: formReturnTo } = req.body;

    if (!name || !email || !password) {
      req.session.errorMessage = "Please fill in all required fields.";
      return res.redirect("/auth/register" + (role ? `?role=${encodeURIComponent(role)}` : ""));
    }

    if (password !== confirmPassword) {
      req.session.errorMessage = "Passwords do not match.";
      return res.redirect("/auth/register" + (role ? `?role=${encodeURIComponent(role)}` : ""));
    }

    if (password.length < 6) {
      req.session.errorMessage = "Password must be at least 6 characters long.";
      return res.redirect("/auth/register" + (role ? `?role=${encodeURIComponent(role)}` : ""));
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      req.session.errorMessage = "An account with this email address already exists.";
      return res.redirect("/auth/register" + (role ? `?role=${encodeURIComponent(role)}` : ""));
    }

    // STRICT ROLE ENFORCEMENT:
    // Only assign 'officer' if the role submitted is explicitly 'officer'.
    // Consumers selecting 'user' are strictly assigned 'user' with NO officer permissions.
    let userRole = "user";
    let assignedBadgeId = null;
    let assignedDept = (department && department.trim()) ? department.trim() : "Consumer / Business Packer";
    let assignedOrg = organization || "General Consumer / Business";

    if (role === "officer") {
      userRole = "officer";
      assignedBadgeId = (badgeId && badgeId.trim()) ? badgeId.trim() : `DL-LM-${Math.floor(1000 + Math.random() * 9000)}`;
      assignedDept = (department && department.trim()) ? department.trim() : "Legal Metrology Enforcement Wing, Directorate of Legal Metrology";
      assignedOrg = organization || "Directorate of Legal Metrology";
    }

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: userRole,
      badgeId: assignedBadgeId,
      department: assignedDept,
      state: state || "Delhi",
      organization: assignedOrg,
      phone: phone || ""
    });

    await user.save();
    console.log(`[Auth] Registered new account: ${user.email} (Role: ${user.role}, Badge: ${user.badgeId || 'N/A'})`);

    req.logIn(user, (err) => {
      if (err) {
        console.error("[Auth] Auto-login error after registration:", err);
        return res.redirect("/auth/login");
      }

      req.flash("success", user.role === "officer"
        ? `Official Enforcement Officer account created! Welcome Inspector ${user.name}.`
        : `Account created successfully! Welcome ${user.name}.`);

      // If registered as an officer, send directly to Officer Command Hub.
      // If consumer, strictly send to Consumer Dashboard or inspections upload, NEVER officer portal!
      let destination;
      if (user.role === "officer") {
        destination = (formReturnTo && formReturnTo.startsWith("/officer")) ? formReturnTo : "/officer/dashboard";
      } else {
        destination = (formReturnTo && !formReturnTo.startsWith("/officer"))
          ? formReturnTo
          : ((req.session && req.session.returnTo && !req.session.returnTo.startsWith("/officer"))
            ? req.session.returnTo
            : "/dashboard");
      }

      if (typeof destination !== "string" || !destination.startsWith("/") || destination.startsWith("//")) {
        destination = user.role === "officer" ? "/officer/dashboard" : "/dashboard";
      }

      delete req.session.returnTo;
      delete req.session.registerRole;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[Auth] Session save error after registration:", saveErr);
        }
        return res.redirect(destination);
      });
    });
  } catch (error) {
    console.error("[Auth] Registration error:", error);
    req.session.errorMessage = error.message || "Registration failed";
    res.redirect("/auth/register");
  }
};

// 1-Click Demo Login for quick testing
exports.demoLogin = async (req, res, next) => {
  try {
    const role = req.params.role;
    let targetEmail = role === "officer" ? "officer@delhi.lm.gov.in" : "consumer@example.com";
    let user = await User.findOne({ email: targetEmail });

    if (!user) {
      // Create on the fly if not seeded yet
      user = new User({
        name: role === "officer" ? "Inspector Ramesh Sharma" : "Aakash Verma",
        email: targetEmail,
        password: "Password123!",
        role: role === "officer" ? "officer" : "user",
        badgeId: role === "officer" ? "DL-LM-0842" : null,
        department: role === "officer" ? "Legal Metrology Department, Delhi" : "Consumer",
        state: "Delhi"
      });
      await user.save();
    }

    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || (user.role === "officer" ? "/officer/dashboard" : "/dashboard");
      delete req.session.returnTo;
      req.session.save(() => {
        return res.redirect(returnTo);
      });
    });
  } catch (error) {
    console.error("[Auth] Demo login error:", error);
    res.redirect("/auth/login");
  }
};

// Logout
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/auth/login?alert=logged_out");
  });
};

// API: Generate JWT Token
exports.apiLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const payload = { id: user._id, role: user.role, email: user.email, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "pack_parikshak_jwt_secret_token_secure_2026", { expiresIn: "7d" });

    return res.json({
      success: true,
      token: `Bearer ${token}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        badgeId: user.badgeId
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

