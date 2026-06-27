// Thin wrapper over Discord's REST API — the bot posts via a single HTTP call,
// no gateway/websocket. Needs DISCORD_BOT_TOKEN (a Bot token, NOT the OAuth
// client secret), and the bot must be in the server with permission to post in
// the target channel.

const DISCORD_API = "https://discord.com/api/v10";

export type SendResult = { ok: boolean; error?: string };

export async function sendChannelMessage(
  channelId: string,
  content: string,
): Promise<SendResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not set" };

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Discord ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
