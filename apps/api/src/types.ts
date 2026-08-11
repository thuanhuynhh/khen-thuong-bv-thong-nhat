import type { SessionUser } from "@thongnhat/shared";

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ALLOWED_ORIGINS: string;
  SESSION_TTL_DAYS: string;
  BOOTSTRAP_TOKEN: string;
  AUTH_PEPPER: string;
};

export type Variables = { user: SessionUser };
