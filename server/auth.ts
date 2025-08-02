import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, InsertUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || "discord_airtable_integration_secret";

  // Use memory store for serverless environments, PostgreSQL store for local dev
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: isServerless ? undefined : storage.sessionStore, // Use default memory store in serverless
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Required for cross-site cookies in production
      httpOnly: true
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          // Update last login time
          await storage.updateUserLastLogin(user.id);
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Secure register route - Only authenticated admin users can create new accounts
  app.post("/api/register", async (req, res, next) => {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required to create new users" });
    }

    // Only allow admin users to create new accounts
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin privileges required to create new users" });
    }

    try {
      // Check if the username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create the new user
      const newUser = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      // Log the registration activity
      await storage.createActivityLog({
        userId: req.user.id, // Log the admin who created this user
        action: "create_user",
        resourceType: "user",
        resourceId: newUser.id.toString(),
        details: { username: newUser.username, createdBy: req.user.username }
      });

      res.status(201).json(newUser);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ message: "Internal server error during authentication" });
      }

      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Session login error:", err);
          return res.status(500).json({ message: "Failed to establish session" });
        }

        // Log the login activity
        storage.createActivityLog({
          userId: user.id,
          action: "login",
          resourceType: "user",
          resourceId: user.id.toString(),
          details: { username: user.username }
        }).catch(console.error); // Don't block login on logging failure

        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    // Log the logout activity
    if (req.user) {
      storage.createActivityLog({
        userId: req.user.id,
        action: "logout",
        resourceType: "user",
        resourceId: req.user.id.toString(),
        details: { username: req.user.username }
      });
    }

    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });

  // Get all users - Only for admins
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin privileges required to view all users" });
    }

    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update a user - Only for admins
  app.put("/api/users/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin privileges required to update users" });
    }

    const userId = parseInt(req.params.id);

    try {
      // Check if the user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Handle password changes separately - hash the password
      let updateData: Partial<InsertUser> = { ...req.body };

      if (updateData.password) {
        updateData.password = await hashPassword(updateData.password);
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      // Log the update activity
      await storage.createActivityLog({
        userId: req.user.id,
        action: "update_user",
        resourceType: "user",
        resourceId: userId.toString(),
        details: { updatedBy: req.user.username }
      });

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  });

  // Delete a user - Only for admins
  app.delete("/api/users/:id", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin privileges required to delete users" });
    }

    const userId = parseInt(req.params.id);

    // Prevent admins from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    try {
      // Check if the user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const deleted = await storage.deleteUser(userId);

      if (deleted) {
        // Log the delete activity
        await storage.createActivityLog({
          userId: req.user.id,
          action: "delete_user",
          resourceType: "user",
          resourceId: userId.toString(),
          details: { username: existingUser.username, deletedBy: req.user.username }
        });

        res.status(200).json({ message: "User deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete user" });
      }
    } catch (error) {
      next(error);
    }
  });
}
