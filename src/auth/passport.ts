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
  needsPasswordReset: boolean;
  hasMfa: boolean;
};

export const configurePassport = (passport: PassportStatic) => {
  const passportUserMap = new Map<number, PassportUser>();

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

          const passportUser: PassportUser = {
            id: result.user.id,
            username: result.user.username,
            roleName: result.user.role?.roleName ?? "caretaker",
            needsPasswordReset: result.needsPasswordReset,
            hasMfa: result.hasMfa
          };
          passportUserMap.set(result.user.id, passportUser);
          return done(null, passportUser);
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
    const cached = passportUserMap.get(id);
    if (cached) {
      return done(null, cached);
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: { role: true, mfaTokens: { where: { isActive: true } } }
      });

      if (!user) {
        return done(null, false);
      }

      const passportUser: PassportUser = {
        id: user.id,
        username: user.username,
        roleName: user.role?.roleName ?? "caretaker",
        needsPasswordReset: false,
        hasMfa: user.mfaTokens.length > 0
      };
      passportUserMap.set(user.id, passportUser);
      return done(null, passportUser);
    } catch (error) {
      done(error as Error);
    }
  });
};

