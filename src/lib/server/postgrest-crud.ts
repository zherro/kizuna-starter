/**
 * The generic PostgREST CRUD layer lives in the core
 * (`@kizuna/core/server/postgrest-crud`). It binds this project's own resource
 * registry through the `@/lib/server/resources` alias the core file imports, so
 * a re-export here is all that's needed — keep app code importing from
 * `@/lib/server/postgrest-crud` so the core path stays an implementation detail.
 */
export * from '@kizuna/core/server/postgrest-crud';
