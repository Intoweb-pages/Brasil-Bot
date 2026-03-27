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
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)));
}

async function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string) {
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

async function handleRepeat(interaction: any, env: Env) {
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
    // DiscordにURLを送信することで画像がプレビュー（インライン表示）されます
    content = content ? `${content}\n${attachmentObj.url}` : attachmentObj.url;
  }

  if (count > 20) count = 20; // 制限 (最大20回送る)
  if (count < 1) count = 1;

  for (let i = 0; i < count; i++) {
    await sendFollowup(interaction.application_id, interaction.token, {
      content: content || "リピートする内容がありません",
    });
    await new Promise(r => setTimeout(r, 200)); // Sleep to prevent hitting rate limits
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

    // Discordからの最初の検証リクエスト (Ping) にはPongを返す必要があります
    if (interaction.type === InteractionType.Ping) {
      return Response.json({ type: InteractionResponseType.Pong });
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
      if (interaction.data.name === "brasil") {
        // waitUntilを利用してバックグラウンドで複数回メッセージを送信する処理を実行します。
        ctx.waitUntil(handleRepeat(interaction, env));

        // 即座に応答しないとDiscord側でタイムアウトしてエラーになるため、「考え中...」のステータスを即座に返します。
        return Response.json({
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
      }
    }

    return new Response("Unknown Interaction", { status: 400 });
  },
};
