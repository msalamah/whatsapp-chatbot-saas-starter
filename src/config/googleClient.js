import fs from "fs";
import { google } from "googleapis";

export async function getGoogleClient(oauthClientPath, tokenFilePath) {
  if (!fs.existsSync(oauthClientPath)) throw new Error(`OAuth client file not found: ${oauthClientPath}`);
  const creds = JSON.parse(fs.readFileSync(oauthClientPath, "utf-8"));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web || {};
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  if (!fs.existsSync(tokenFilePath)) throw new Error(`Token file not found: ${tokenFilePath}. Generate OAuth token and save it.`);
  const token = JSON.parse(fs.readFileSync(tokenFilePath, "utf-8"));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}
