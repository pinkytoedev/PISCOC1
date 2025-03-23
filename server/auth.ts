import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
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
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    // Log the login activity
    if (req.user) {
      storage.createActivityLog({
        userId: req.user.id,
        action: "login",
        resourceType: "user",
        resourceId: req.user.id.toString(),
        details: { username: req.user.username }
      });
    }
    
    res.status(200).json(req.user);
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
}
