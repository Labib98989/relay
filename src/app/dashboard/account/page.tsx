import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppHeader from "@/components/AppHeader";
import Brand from "@/components/Brand";
import ApiTokenPanel from "@/components/ApiTokenPanel";
import { createApiToken, revokeApiToken } from "./actions";

// User-level settings (tokens are per-user, covering all of the user's spaces)
// — deliberately OUTSIDE dashboard/[spaceId]/, which is space-scoped. Same
// shallow auth() check as the hub page; ownership scoping happens per query.
export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect("/");

  const rows = await prisma.apiToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        left={<Brand />}
        right={
          <Link
            href="/dashboard"
            className="rounded-lg px-2 py-1 font-mono text-xs text-ink-faint transition-colors hover:text-brand"
          >
            ← all spaces
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">AI access</h1>
        <p className="mt-1 text-ink-soft">
          Personal access tokens let an AI assistant (like Claude) read and manage your
          schedule spaces on your behalf. A token grants the same access as your login —
          treat it like a password.
        </p>

        <div className="mt-6">
          <ApiTokenPanel
            initialTokens={rows.map((t) => ({
              id: t.id,
              name: t.name,
              prefix: t.prefix,
              createdAt: t.createdAt.toISOString(),
              lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            }))}
            actions={{ create: createApiToken, revoke: revokeApiToken }}
          />
        </div>

        {/* connector setup crib sheet */}
        <div className="panel mt-8 p-5">
          <h2 className="font-display text-lg font-bold text-ink">Connect Claude</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
            <li>Generate a token above and copy it.</li>
            <li>
              In Claude (web or desktop): <b>Settings → Connectors → Add custom connector</b>.
            </li>
            <li>
              Use{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                https://&lt;your-relay-host&gt;/api/mcp
              </code>{" "}
              as the URL and paste the token when asked to authenticate.
            </li>
            <li>Ask Claude things like “cancel tomorrow&apos;s physics class” — it does the rest.</li>
          </ol>
          <p className="mt-3 font-mono text-[11px] text-ink-faint">
            ChatGPT (via a Custom GPT with Actions) uses the same token against
            /api/gpt — see the project README for the one-time GPT setup.
          </p>
          {/* @relay-test-button — temporary manual pipeline pokes; grep this tag to remove. */}
          <a
            href="/api/openapi"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            test: view OpenAPI spec ↗
          </a>
        </div>
      </main>
    </div>
  );
}
