import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) throw new Error("TURSO_DATABASE_URL no esta definida");
if (!authToken) throw new Error("TURSO_AUTH_TOKEN no esta definida");

const libsqlClient = createClient({ url, authToken });

export const db = drizzle(libsqlClient, { schema, casing: "snake_case" });
export { schema };
