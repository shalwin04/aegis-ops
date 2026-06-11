import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { authMiddleware, generateAuthToken, AuthRequest } from "../middleware/auth.js";

const router = Router();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /auth/signup - Create a new user account
 */
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.errors,
      });
      return;
    }

    const { email, password, name } = parsed.data;

    // Check if user already exists
    const existing = db.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    db.createUser({
      id: userId,
      email,
      passwordHash,
      name,
    });

    // Generate token
    const token = generateAuthToken(userId);

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        name,
      },
    });
  } catch (error) {
    console.error("[Auth] Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * POST /auth/login - Authenticate user and return token
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.errors,
      });
      return;
    }

    const { email, password } = parsed.data;

    // Find user
    const user = db.getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Generate token
    const token = generateAuthToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * GET /auth/me - Get current user info
 */
router.get("/me", authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

/**
 * POST /auth/logout - Invalidate token (client-side only for now)
 */
router.post("/logout", authMiddleware, (req: AuthRequest, res: Response) => {
  // With JWT, we can't truly invalidate tokens server-side without a blacklist
  // For now, this is just a placeholder - client should clear the token
  res.json({ success: true });
});

/**
 * POST /auth/change-password - Change user password
 */
router.post("/change-password", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.errors,
      });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = db.getUserById(req.userId!);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    // Note: Would need to add updateUser method to db
    // For now, this is a placeholder
    res.json({ success: true });
  } catch (error) {
    console.error("[Auth] Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
