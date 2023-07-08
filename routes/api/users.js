const express = require("express");
const router = express.Router();

const Joi = require("joi");

const bcrypt = require("bcryptjs");
const User = require("../../models/user.model");
const authenticateToken = require("../../token.middleware.js");
const jwt = require("jsonwebtoken");

const gravatar = require("gravatar");
const jimp = require("jimp");
const path = require("path");
const Joi = require("joi");
const {
  userValidationSchema,
  updateSubscriptionSchema,
} = require("./user.validation");
const {
  generateVerificationToken,
  sendVerificationEmail,
} = require("./email.service");
const { upload } = require("./avatar.service");

const avatarDir = path.join(process.cwd(), "public", "avatars");


const userValidationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});
const updateSubscriptionSchema = Joi.object({
  subscription: Joi.string().valid("starter", "pro", "business").required(),
});


router.post("/signup", async (req, res) => {
  try {
    const { error } = userValidationSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      res.status(409).json({ message: "Email in use" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);


    const avatarURL = gravatar.url(req.body.email, {
      s: "200",
      r: "pg",
      d: "mp",
    });

    const verificationToken = generateVerificationToken();

    const newUser = await User.create({
      email: req.body.email,
      password: hashedPassword,
      avatarURL,
      verificationToken,
      emailVerified: false,
    });

    await sendVerificationEmail(req.body.email, verificationToken);

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    newUser.token = token;
    await newUser.save();

    res.status(201).json({
      token: newUser.token,
      user: {
        email: newUser.email,
        subscription: newUser.subscription,
        avatarURL: newUser.avatarURL,

      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { error } = userValidationSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      res.status(401).json({ message: "Email or password is wrong" });
      return;
    }

    const passwordMatch = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!passwordMatch) {
      res.status(401).json({ message: "Email or password is wrong" });
      return;
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    user.token = token;

    await user.save();
    if (!user.emailVerified) {
      res.status(401).json({ message: "Email not verified" });
      return;
    }

    res.status(200).json({
      token: user.token,
      user: {
        email: user.email,
        subscription: user.subscription,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/logout", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(401).json({ message: "Not authorized" });
      return;
    }

    user.token = null;
    await user.save();

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/current", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(401).json({ message: "Not authorized" });
      return;
    }

    res.status(200).json({
      email: user.email,
      subscription: user.subscription,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.patch("/", authenticateToken, async (req, res) => {
  try {
    const { error } = updateSubscriptionSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { subscription: req.body.subscription },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ message: "Not found" });
    } else {
      res.status(200).json({ subscription: user.subscription });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch(
  "/avatars",
  authenticateToken,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "File not provided" });
      }

      const img = await jimp.read(req.file.path);
      await img
        .autocrop()
        .cover(
          250,
          250,
          jimp.HORIZONTAL_ALIGN_CENTER | jimp.VERTICAL_ALIGN_MIDDLE
        )
        .writeAsync(req.file.path);

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { avatarURL: `/avatars/${req.file.filename}` },
        { new: true }
      );

      if (!user) {
        res.status(404).json({ message: "Not found" });
      } else {
        res.status(200).json({ avatarURL: user.avatarURL });
      }

      await img.writeAsync(path.join(avatarDir, req.file.filename));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.get("/verify/:verificationToken", async (req, res) => {
  try {
    const user = await User.findOne({
      verificationToken: req.params.verificationToken,
    });

    if (!user) {
      return res.status(404).json({ message: "Verification token not found" });
    }

    user.verify = true;
    user.verificationToken = null;
    await user.save();

    res.status(200).json({ message: "Email verification successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { error } = Joi.object({
      email: Joi.string().email().required(),
    }).validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (user.verify) {
      res.status(400).json({ message: "Verification has already been passed" });
      return;
    }

    const verificationToken = generateVerificationToken();
    user.verificationToken = verificationToken;
    await user.save();

    await sendVerificationEmail(user.email, verificationToken);

    res.status(200).json({ message: "Verification email sent" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;