import "express-session";

declare module "express-session" {
  interface SessionData {
    mfaUserId?: number;
    mfaVerified?: boolean;
    pendingPasswordReset?: boolean;
    flash?: Record<string, string[]>;
    trustedDeviceToken?: string;
    requiresMfa?: boolean;
    mustSetupMfa?: boolean;
    mfaTempSecret?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      roleName: string;
    }
  }
}

export {};

