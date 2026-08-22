import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "change-this-to-a-long-random-string") {
  console.error("Set a real JWT_SECRET in .env before running the server.");
  process.exit(1);
}

const SALT_ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(friend) {
  return jwt.sign({ id: friend.id, name: friend.name, isAdmin: !!friend.is_admin }, JWT_SECRET, { expiresIn: "30d" });
}

// Attaches req.user = { id, name } if a valid token is present.
// Responds 401 if missing or invalid.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired — please sign in again." });
  }
}
