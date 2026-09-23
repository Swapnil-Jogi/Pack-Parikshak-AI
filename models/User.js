const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6
    },
    role: {
      type: String,
      enum: ["user", "officer"],
      default: "user"
    },
    badgeId: {
      type: String,
      trim: true,
      default: null
    },
    department: {
      type: String,
      trim: true,
      default: "Department of Consumer Affairs / Legal Metrology"
    },
    state: {
      type: String,
      trim: true,
      default: "Delhi"
    },
    organization: {
      type: String,
      trim: true,
      default: "General Consumer / Business"
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);

