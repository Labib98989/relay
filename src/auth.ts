import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Discord],
  callbacks: {
    // Database sessions don't expose the user's DB id by default; every
    // dashboard query needs it, so copy it onto the session object.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
