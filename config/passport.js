const LocalStrategy = require("passport-local").Strategy;
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const User = require("../models/User");

module.exports = function (passport) {
  // Local Strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await User.findOne({ email: email.toLowerCase().trim() });
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          const isMatch = await user.matchPassword(password);
          if (!isMatch) {
            return done(null, false, { message: "Invalid email or password" });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // JWT Strategy
  const jwtOpts = {
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      (req) => (req && req.cookies ? req.cookies.jwt_token : null)
    ]),
    secretOrKey: process.env.JWT_SECRET || "pack_parikshak_jwt_secret_token_secure_2026"
  };

  passport.use(
    new JwtStrategy(jwtOpts, async (jwtPayload, done) => {
      try {
        const user = await User.findById(jwtPayload.id).select("-password");
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      } catch (err) {
        return done(err, false);
      }
    })
  );

  // Session serialization
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).select("-password");
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};

