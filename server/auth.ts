import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { env } from "./lib/env";
import { HttpError, asyncHandler, parseId } from "./lib/httpError";
import { toPublicUser, toPublicUsers } from "./lib/publicUser";
import { isAdmin, isAuthenticated } from "./middleware/auth";
import { loginRateLimit } from "./middleware/rateLimit";

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Compares a supplied password against a stored `hash.salt` value.
 *
 * Returns false for malformed stored values instead of throwing. The previous
 * version fed `undefined` to scrypt and let `timingSafeEqual` reject mismatched
 * buffer lengths, turning a bad row into a 500 that distinguished it from an
 * ordinary wrong password.
 */
async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;

  const storedBuf = Buffer.from(hashed, "hex");
  if (storedBuf.length !== KEY_LENGTH) return false;

  const suppliedBuf = (await scryptAsync(supplied, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(storedBuf, suppliedBuf);
}

/**
 * Explicit input contracts. These replace `{ ...req.body }` being spread into
 * the storage layer, which let a caller write any column on the users table.
 */
const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(256),
  isAdmin: z.boolean().optional().default(false),
});

const updateUserSchema = z
  .object({
    username: z.string().trim().min(3).max(64).optional(),
    password: z.string().min(8).max(256).optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No updatable fields provided",
  });

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: env.isProduction,
      maxAge: 24 * 60 * 60 * 1000,
      // SameSite=None permits the CMS to be used cross-origin; CSRF tokens
      // (see middleware/csrf.ts) are what make that safe.
      sameSite: env.isProduction ? "none" : "lax",
      httpOnly: true,
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        // Compare unconditionally against a dummy hash when the user is absent
        // so response time does not reveal whether a username exists.
        if (!user) {
          await comparePasswords(password, `${"0".repeat(KEY_LENGTH * 2)}.salt`);
          return done(null, false);
        }
        if (!(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        await storage.updateUserLastLogin(user.id);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      done(null, await storage.getUser(id));
    } catch (error) {
      done(error);
    }
  });

  app.post(
    "/api/register",
    isAdmin,
    asyncHandler(async (req, res) => {
      const data = createUserSchema.parse(req.body);

      if (await storage.getUserByUsername(data.username)) {
        throw HttpError.conflict("Username already exists");
      }

      const newUser = await storage.createUser({
        username: data.username,
        password: await hashPassword(data.password),
        isAdmin: data.isAdmin,
      });

      await storage.createActivityLog({
        userId: req.user!.id,
        action: "create_user",
        resourceType: "user",
        resourceId: newUser.id.toString(),
        details: { username: newUser.username, createdBy: req.user!.username },
      });

      res.status(201).json(toPublicUser(newUser));
    }),
  );

  app.post("/api/login", loginRateLimit, (req, res, next) => {
    passport.authenticate("local", (err: unknown, user: SelectUser | false) => {
      if (err) return next(err);
      if (!user) return next(HttpError.unauthorized("Invalid username or password"));

      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);

        // Logging must not be able to fail the sign-in.
        storage
          .createActivityLog({
            userId: user.id,
            action: "login",
            resourceType: "user",
            resourceId: user.id.toString(),
            details: { username: user.username },
          })
          .catch((error) => console.error("[auth] Failed to log login:", error));

        res.status(200).json(toPublicUser(user));
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const user = req.user;

    req.logout((err) => {
      if (err) return next(err);

      if (user) {
        storage
          .createActivityLog({
            userId: user.id,
            action: "logout",
            resourceType: "user",
            resourceId: user.id.toString(),
            details: { username: user.username },
          })
          .catch((error) => console.error("[auth] Failed to log logout:", error));
      }

      res.sendStatus(200);
    });
  });

  app.get("/api/user", isAuthenticated, (req, res) => {
    res.json(toPublicUser(req.user!));
  });

  app.get(
    "/api/users",
    isAdmin,
    asyncHandler(async (_req, res) => {
      res.json(toPublicUsers(await storage.getAllUsers()));
    }),
  );

  app.put(
    "/api/users/:id",
    isAdmin,
    asyncHandler(async (req, res) => {
      const userId = parseId(req.params.id);
      const data = updateUserSchema.parse(req.body);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) throw HttpError.notFound("User not found");

      // Removing your own admin rights locks you out of this very endpoint.
      if (userId === req.user!.id && data.isAdmin === false) {
        throw HttpError.badRequest("You cannot revoke your own admin privileges");
      }

      if (data.username && data.username !== existingUser.username) {
        const clash = await storage.getUserByUsername(data.username);
        if (clash) throw HttpError.conflict("Username already exists");
      }

      const updatedUser = await storage.updateUser(userId, {
        ...(data.username ? { username: data.username } : {}),
        ...(data.password ? { password: await hashPassword(data.password) } : {}),
        ...(data.isAdmin === undefined ? {} : { isAdmin: data.isAdmin }),
      });

      if (!updatedUser) throw HttpError.notFound("User not found");

      await storage.createActivityLog({
        userId: req.user!.id,
        action: "update_user",
        resourceType: "user",
        resourceId: userId.toString(),
        // Record which fields changed, never the values.
        details: { updatedBy: req.user!.username, fields: Object.keys(data) },
      });

      res.json(toPublicUser(updatedUser));
    }),
  );

  app.delete(
    "/api/users/:id",
    isAdmin,
    asyncHandler(async (req, res) => {
      const userId = parseId(req.params.id);

      if (userId === req.user!.id) {
        throw HttpError.badRequest("You cannot delete your own account");
      }

      const existingUser = await storage.getUser(userId);
      if (!existingUser) throw HttpError.notFound("User not found");

      if (!(await storage.deleteUser(userId))) {
        throw HttpError.internal("Failed to delete user");
      }

      await storage.createActivityLog({
        userId: req.user!.id,
        action: "delete_user",
        resourceType: "user",
        resourceId: userId.toString(),
        details: { username: existingUser.username, deletedBy: req.user!.username },
      });

      res.status(200).json({ message: "User deleted successfully" });
    }),
  );
}
