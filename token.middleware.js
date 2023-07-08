const jwt = require("jsonwebtoken");
const User = require("./models/user.model");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Not authorized" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default-secret");
    const user = await User.findById(decoded.userId);

    if (!user || user.token !== token) {
      res.status(401).json({ message: "Not authorized" });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Not authorized" });
  }
};

module.exports = authenticateToken;