import {
  RESTPostAPIApplicationCommandsJSONBody,
  ApplicationCommandOptionType,
} from 'discord-api-types/v10';
import * as fs from 'fs';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!TOKEN || !APPLICATION_ID) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set in your environment variables.");
  process.exit(1);
}

const commands: RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    name: "brasil",
    description: "入力した文字、リンク、画像を複数回送信します",
    options: [
      {
        name: "text",
        description: "送信するテキストまたはリンク",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "count",
        description: "送信する回数 (最大20回)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
        max_value: 20
      },
      {
        name: "attachment",
        description: "送信する画像等のファイル",
        type: ApplicationCommandOptionType.Attachment,
        required: false,
      }
    ]
  }
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
  console.log(`Registering commands to application ID: ${APPLICATION_ID}`);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bot ${TOKEN}`
    },
    body: JSON.stringify(commands)
  });

  if (response.ok) {
    console.log("Successfully registered /repeat command!");
  } else {
    console.error("Failed to register commands:");
    console.error(await response.text());
  }
}

registerCommands();
