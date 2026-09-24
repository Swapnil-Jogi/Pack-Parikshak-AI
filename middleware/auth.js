/**
 * Authentication and Role-Based Access Control (RBAC) Middlewares
 */

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  // Store original URL to redirect back after sign up / login
  const targetUrl = req.originalUrl || "/inspections/new";
  if (req.session) {
    req.session.returnTo = targetUrl;
  }

  // If clicking verify package or accessing inspection verification without login, redirect to sign up
  if (req.originalUrl.startsWith("/inspections")) {
    return res.redirect(`/auth/register?alert=verify_package&returnTo=${encodeURIComponent(targetUrl)}`);
  }

  res.redirect(`/auth/login?alert=unauthorized`);
}

function ensureRole(roles) {
  return function (req, res, next) {
    if (!req.isAuthenticated()) {
      if (req.session) {
        req.session.returnTo = req.originalUrl;
      }
      const roleParam = roles.includes("officer") ? "?role=officer&alert=unauthorized" : "?alert=unauthorized";
      return res.redirect(`/auth/login${roleParam}`);
    }

    const userRole = req.user.role || "user";
    if (roles.includes(userRole)) {
      return next();
    }

    res.status(403).render("errors/403.ejs", {
      title: "403 Access Forbidden",
      message: "You do not possess the required regulatory credentials to access this department portal."
    });
  };
}

const ensureOfficer = ensureRole(["officer"]);

function forwardAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }

  // If a logged-in user specifically requested switching to the other role (e.g., from consumer to officer)
  const targetRole = req.query.role;
  if (targetRole && targetRole !== req.user.role) {
    return req.logout((err) => {
      return next();
    });
  }

  if (req.user.role === "officer") {
    return res.redirect("/officer/dashboard");
  }
  return res.redirect("/dashboard");
}

module.exports = {
  ensureAuthenticated,
  ensureRole,
  ensureOfficer,
  forwardAuthenticated
};

