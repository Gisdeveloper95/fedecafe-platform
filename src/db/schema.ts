// =========================================================================
// Schema raíz — agrupa CORE + DOMINIO
// =========================================================================
//
// IMPORTANTE: este archivo NO declara tablas. Solo re-exporta los dos
// archivos hijos para que `import { schema } from "@/db/client"` siga
// funcionando con `schema.users`, `schema.medidores`, etc.
//
// - `schema-core.ts`: reutilizable entre proyectos (auth, capturas, assets).
// - `schema-water.ts`: específico Fedecafe (medidores, estructuras, rutas).
//
// El día que arranque un proyecto nuevo (médicos, geología), se copia
// `schema-core.ts` tal cual y se reemplaza `schema-water.ts` por el
// equivalente del nuevo dominio.

export * from "./schema-core";
export * from "./schema-water";
