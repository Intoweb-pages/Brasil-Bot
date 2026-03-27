import {
  APIInteraction,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";

export interface Env {
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
}

function hexToUint8Array(hex: string) {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map((val) => parseInt(val, 16)));
}

async function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string) {
  if (!publicKeyHex) return false;
  try {
    const enc = new TextEncoder();
    const importedKey = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKeyHex),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );
    const sig = hexToUint8Array(signatureHex);
    const data = enc.encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", importedKey, sig, data);
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

async function sendFollowup(applicationId: string, interactionToken: string, payload: any) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Failed to send followup", await response.text());
  }
}

function getOptions(interaction: any) {
  const options = interaction.data.options || [];
  let count = 1;
  let text = "";
  let attachmentId = "";

  for (const opt of options) {
    if (opt.name === "count") count = opt.value;
    if (opt.name === "text") text = opt.value;
    if (opt.name === "attachment") attachmentId = opt.value;
  }

  let content = text;
  if (attachmentId && interaction.data.resolved?.attachments?.[attachmentId]) {
    const attachmentObj = interaction.data.resolved.attachments[attachmentId];
    content = content ? `${content}\n${attachmentObj.url}` : attachmentObj.url;
  }

  return { count, content: content || "リピートする内容がありません" };
}

async function handleRemainingRepeats(interaction: any, count: number, content: string, env: Env) {
  // すでに1回目は即時返信(InteractionResponseType.ChannelMessageWithSource)で送っているため、残りの回数を送る
  for (let i = 0; i < count - 1; i++) {
    await new Promise(r => setTimeout(r, 500)); // 送信間隔を少し空ける
    await sendFollowup(interaction.application_id, interaction.token, {
      content: content,
    });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing signature headers", { status: 401 });
    }

    const body = await request.text();
    const isValid = await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, body);

    if (!isValid) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction: APIInteraction = JSON.parse(body);

    if (interaction.type === InteractionType.Ping) {
      return new Response(JSON.stringify({ type: InteractionResponseType.Pong }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
      if (interaction.data.name === "brasil") {
        const { count, content } = getOptions(interaction);

        // タイムアウトを防ぐため、1回目は即座に正常なレスポンスとして返す
        // 残りの回数はバックグラウンド(ctx.waitUntil)でWebhook(Followup)として送信する
        if (count > 1) {
          ctx.waitUntil(handleRemainingRepeats(interaction, count, content, env));
        }

        return new Response(JSON.stringify({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: content,
          },
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Unknown Interaction", { status: 400 });
  },
};
