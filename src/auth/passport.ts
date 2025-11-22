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
            id: result.user.user_id,
            username: result.user.username,
            roleName: result.user.roles?.role_name ?? "caretaker",
            needsPasswordReset: result.needsPasswordReset,
            hasMfa: result.hasMfa
          };
          passportUserMap.set(result.user.user_id, passportUser);
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
      const user = await (prisma as any).users.findUnique({
        where: { user_id: id },
        include: { roles: true, mfatokens: { where: { is_active: true } } }
      });

      if (!user) {
        return done(null, false);
      }

      const passportUser: PassportUser = {
        id: user.user_id,
        username: user.username,
        roleName: user.roles?.role_name ?? "caretaker",
        needsPasswordReset: false,
        hasMfa: user.mfatokens.length > 0
      };
      passportUserMap.set(user.user_id, passportUser);
      return done(null, passportUser);
    } catch (error) {
      done(error as Error);
    }
  });
};

