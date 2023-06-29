const express = require("express");
const router = express.Router();
const Joi = require("joi");
const bcrypt = require("bcryptjs");
const User = require("../../models/user.model");
const authenticateToken = require("../../token.middleware.js");
const jwt = require("jsonwebtoken");
const gravatar = require("gravatar");
const multer = require("multer");
const jimp = require("jimp");
const path = require("path");

const userValidationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});
const updateSubscriptionSchema = Joi.object({
  subscription: Joi.string().valid("starter", "pro", "business").required(),
});
const tmpDir = path.join(process.cwd(), "tmp");
const avatarDir = path.join(process.cwd(), "public", "avatars");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const upload = multer({ storage });

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

    const newUser = await User.create({
      email: req.body.email,
      password: hashedPassword,
      avatarURL,
    });

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

      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      user.avatarURL = `/avatars/${req.file.filename}`;
      await user.save();

      res.status(200).json({ avatarURL: user.avatarURL });

      await img.writeAsync(path.join(avatarDir, req.file.filename));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);


module.exports = router;