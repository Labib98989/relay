import { DefaultSession } from "next-auth";

// Module augmentation: extends the library's own Session type so that
// `session.user.id` (added in the session callback in src/auth.ts) is
// visible to TypeScript everywhere.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
