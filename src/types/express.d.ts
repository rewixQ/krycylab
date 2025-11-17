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
      needsPasswordReset: boolean;
      hasMfa: boolean;
    }

    interface UploadedFile {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
    }

    interface Request {
      file?: UploadedFile;
    }
  }
}

export {};

