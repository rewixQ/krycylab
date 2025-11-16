import express from "express";
import path from "path";
import helmet from "helmet";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import passport from "passport";
import nunjucks from "nunjucks";
import dayjs from "dayjs";
import cookieParser from "cookie-parser";

import { env, isDev } from "./config/env";
import { requestLogger } from "./lib/logger";
import { attachLocals } from "./middleware/locals";
import { errorHandler } from "./middleware/errorHandler";
import { configurePassport } from "./auth/passport";
import { router as homeRouter } from "./routes/home";
import { router as authRouter } from "./routes/auth";
import { router as catRouter } from "./routes/cats";
import { router as adminRouter } from "./routes/admin";
import { router as accountRouter } from "./routes/account";
import { sessionActivityTracker } from "./middleware/sessionActivity";
import { mfaEnforcer } from "./middleware/mfaEnforcer";
import { enforceHttps } from "./middleware/enforceHttps";

const app = express();
const FileStore = FileStoreFactory(session);

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

const sessionMiddleware = session({
  store: new FileStore({
    path: path.join(process.cwd(), ".sessions"),
    ttl: 60 * 60 * 24 * 7
  }),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: !isDev,
    maxAge: 1000 * 60 * 60 * 2
  }
});

const viewsPath = path.join(process.cwd(), "views");
const nunjucksEnv = nunjucks.configure(viewsPath, {
  autoescape: true,
  express: app,
  watch: isDev,
  noCache: isDev
});
nunjucksEnv.addFilter("date", (value: Date | string, format = "YYYY-MM-DD") =>
  value ? dayjs(value).format(format) : ""
);
app.set("view engine", "njk");
app.set("views", viewsPath);

app.use(helmet());
app.use(cookieParser());

// Static files must come before HTTPS enforcement
app.use(
  express.static(path.join(process.cwd(), "public"), {
    maxAge: isDev ? 0 : "7d",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  })
);

app.use(enforceHttps);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(requestLogger);
app.use(sessionMiddleware);

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());
app.use(sessionActivityTracker);

app.use(attachLocals);
app.use(mfaEnforcer);

app.use("/", homeRouter);
app.use("/", authRouter);
app.use("/cats", catRouter);
app.use("/admin", adminRouter);
app.use("/account", accountRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).render("404", { title: "Not Found" });
});

app.use(errorHandler);

const port = env.port;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Server listening on http://localhost:${port}`);
  });
}

export { app };

