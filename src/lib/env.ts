import { z } from "zod";

const EnvSchema = z.object({
  TURSO_DATABASE_URL: z.string().url(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  MOBILE_JWT_SECRET: z.string().min(32),
  MOBILE_ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(60),
  MOBILE_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(15),
  MOBILE_REFRESH_TOKEN_TTL_DAYS_DEMO: z.coerce
    .number()
    .int()
    .positive()
    .default(7),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z
    .string()
    .default("Fedecafe Plataforma <geocode.apps@gmail.com>"),
  PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(60),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  CAPTURES_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(3600),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno invalidas:");
  console.error(z.treeifyError(parsed.error));
  throw new Error("Variables de entorno invalidas");
}

export const env = parsed.data;
