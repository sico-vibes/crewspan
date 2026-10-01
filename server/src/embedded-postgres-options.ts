export const EMBEDDED_POSTGRES_USER = "paperclip";
export const EMBEDDED_POSTGRES_PASSWORD = "paperclip";
export const EMBEDDED_POSTGRES_INITDB_FLAGS = [
  "--encoding=UTF8",
  "--locale=C",
  "--lc-messages=C",
] as const;
