import { PassportStatic } from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "../lib/prisma";
import {
  verifyCredentials,
  RequestMeta
} from "../services/authService";

type PassportUser = {
  id: number;
  username: string;
  roleName: string;
};

export const configurePassport = (passport: PassportStatic) => {
  passport.use(
    new LocalStrategy(
      {
        usernameField: "username",
        passwordField: "password",
        passReqToCallback: true
      },
      async (req, username, password, done) => {
        try {
          const meta: RequestMeta = {
            ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
            userAgent: req.get("user-agent") ?? undefined
          };

          const result = await verifyCredentials(username, password, meta);

          if (!result.success) {
            return done(null, false, { message: result.message });
          }

          req.session.pendingPasswordReset = result.needsPasswordReset;
          req.session.mfaVerified = !result.hasMfa;
          req.session.mfaUserId = result.hasMfa ? result.user.id : undefined;
          req.session.requiresMfa = result.hasMfa;
          req.session.mustSetupMfa = !result.hasMfa;

          return done(null, {
            id: result.user.id,
            username: result.user.username,
            roleName: result.user.role?.roleName ?? "caretaker"
          });
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: PassportUser, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: { role: true }
      });

      if (!user) {
        return done(null, false);
      }

      return done(null, {
        id: user.id,
        username: user.username,
        roleName: user.role?.roleName ?? "caretaker"
      });
    } catch (error) {
      done(error as Error);
    }
  });
};

