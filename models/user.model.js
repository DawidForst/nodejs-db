const { Schema, model } = require("mongoose");
const gravatar = require("gravatar");

const userSchema = new Schema(
  {
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
    },
    subscription: {
      type: String,
      enum: ["starter", "pro", "business"],
      default: "starter",
    },
   
    avatarURL: {
      type: String,
      default: function () {
        return gravatar.url(this.email, { s: "200", r: "pg", d: "mp" });
      },
    },
  },
  { versionKey: false }
);

const User = model("User", userSchema);

module.exports = User;