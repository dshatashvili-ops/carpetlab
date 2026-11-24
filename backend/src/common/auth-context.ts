import { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  emailVerified: boolean;
  isServiceAdmin: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}
