import { AsyncLocalStorage } from "node:async_hooks";

// AI transports (MCP connector, GPT Actions, in-app chat) authenticate outside
// the cookie session — a bearer token or an already-resolved session — so the
// Server Actions' `auth()` lookup would come up empty. Instead of threading a
// userId parameter through every action signature, the dispatcher runs each
// tool call inside this AsyncLocalStorage scope and the actions' own `userId()`
// helper reads it first. The store is only ever populated AFTER the transport
// has verified the caller, and it's per-async-context, so requests can't leak
// into each other.

const actorStore = new AsyncLocalStorage<{ userId: string }>();

export function currentActorUserId(): string | undefined {
  return actorStore.getStore()?.userId;
}

export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return actorStore.run({ userId }, fn);
}
