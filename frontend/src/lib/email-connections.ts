import crypto from "crypto";
import nodemailer from "nodemailer";
import { SupabaseClient } from "@supabase/supabase-js";

export type EmailProvider = "google" | "smtp";

export type EmailConnectionRow = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email: string;
  display_name: string | null;
  from_name: string | null;
  reply_to: string | null;
  status: "active" | "error" | "revoked";
  scopes: string[] | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_password_encrypted: string | null;
  imap_mailbox: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SafeEmailConnection = {
  id: string;
  provider: EmailProvider;
  email: string;
  display_name: string | null;
  from_name: string | null;
  reply_to: string | null;
  status: string;
  scopes: string[];
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_mailbox: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type OAuthStatePayload = {
  user_id: string;
  provider: EmailProvider;
  return_to: string;
  exp: number;
  nonce: string;
};

type MailPayload = {
  messageId: string;
  campaignId: string;
  leadId: string;
  step: string;
  fromEmail: string;
  senderName: string;
  toEmail: string;
  replyTo?: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  originalToEmail: string;
};

const defaultGoogleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly"
];

function clean(value: unknown) {
  return String(value || "").trim();
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function secretKey() {
  const secret =
    process.env.EMAIL_ENCRYPTION_KEY ||
    process.env.EMAIL_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!secret) {
    throw new Error("EMAIL_ENCRYPTION_KEY is not configured.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function hmacSecret() {
  return process.env.EMAIL_OAUTH_STATE_SECRET || process.env.EMAIL_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function encryptSecret(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [base64Url(iv), base64Url(tag), base64Url(encrypted)].join(".");
}

export function decryptSecret(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return "";

  const [ivText, tagText, encryptedText] = text.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Stored email secret is not readable.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), fromBase64Url(ivText));
  decipher.setAuthTag(fromBase64Url(tagText));
  return Buffer.concat([decipher.update(fromBase64Url(encryptedText)), decipher.final()]).toString("utf8");
}

export function safeEmailConnection(row: EmailConnectionRow): SafeEmailConnection {
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    display_name: row.display_name,
    from_name: row.from_name,
    reply_to: row.reply_to,
    status: row.status,
    scopes: row.scopes || [],
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
    smtp_username: row.smtp_username,
    imap_host: row.imap_host,
    imap_port: row.imap_port,
    imap_secure: row.imap_secure,
    imap_username: row.imap_username,
    imap_mailbox: row.imap_mailbox,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function emailOAuthRedirectUri(provider: EmailProvider, requestUrl?: string) {
  const explicit =
    provider === "google"
      ? process.env.GOOGLE_REDIRECT_URI
      : "";

  if (explicit) return explicit;

  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (requestUrl ? new URL(requestUrl).origin : "")).replace(/\/+$/, "");
  return `${base}/api/email/${provider}/callback`;
}

export function googleOAuthScopes() {
  return clean(process.env.GOOGLE_OAUTH_SCOPES)
    ? clean(process.env.GOOGLE_OAUTH_SCOPES).split(/\s+/).filter(Boolean)
    : defaultGoogleScopes;
}

export function signOAuthState(payload: Omit<OAuthStatePayload, "exp" | "nonce"> & { return_to?: string }) {
  const secret = hmacSecret();
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET or EMAIL_ENCRYPTION_KEY is not configured.");

  const statePayload: OAuthStatePayload = {
    user_id: payload.user_id,
    provider: payload.provider,
    return_to: safeReturnTo(payload.return_to || "/outreach"),
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex")
  };
  const body = base64Url(JSON.stringify(statePayload));
  const signature = base64Url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${signature}`;
}

export function verifyOAuthState(state: string, provider: EmailProvider) {
  const secret = hmacSecret();
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET or EMAIL_ENCRYPTION_KEY is not configured.");

  const [body, signature] = clean(state).split(".");
  if (!body || !signature) throw new Error("Invalid OAuth state.");

  const expected = base64Url(crypto.createHmac("sha256", secret).update(body).digest());
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("Invalid OAuth state signature.");
  }

  const payload = JSON.parse(fromBase64Url(body).toString("utf8")) as OAuthStatePayload;
  if (payload.provider !== provider) throw new Error("OAuth state provider mismatch.");
  if (!payload.user_id) throw new Error("OAuth state is missing the user.");
  if (payload.exp < Date.now()) throw new Error("OAuth state expired. Try connecting again.");
  return { ...payload, return_to: safeReturnTo(payload.return_to) };
}

export function safeReturnTo(value: string) {
  const text = clean(value);
  if (!text.startsWith("/") || text.startsWith("//")) return "/outreach";
  return text.slice(0, 200);
}

export function googleAuthUrl(state: string, redirectUri: string) {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleOAuthScopes().join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google token exchange failed.");
  }

  return payload as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  };
}

function decodeJwtPayload(token: string | undefined) {
  const parts = clean(token).split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(fromBase64Url(parts[1]).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getGoogleProfile(accessToken: string, idToken?: string) {
  const fallback = decodeJwtPayload(idToken);
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const payload = response.ok ? await response.json().catch(() => ({})) : {};
  const email = clean(payload.email || fallback.email);
  if (!email) throw new Error("Google did not return an email address.");

  return {
    email,
    displayName: clean(payload.name || fallback.name) || null
  };
}

export async function upsertGoogleConnection(
  supabase: SupabaseClient,
  userId: string,
  tokenPayload: Awaited<ReturnType<typeof exchangeGoogleCode>>,
  profile: Awaited<ReturnType<typeof getGoogleProfile>>
) {
  const scopes = clean(tokenPayload.scope) ? clean(tokenPayload.scope).split(/\s+/).filter(Boolean) : googleOAuthScopes();
  const expiresAt = new Date(Date.now() + Number(tokenPayload.expires_in || 3600) * 1000).toISOString();

  const row = {
    user_id: userId,
    provider: "google" as EmailProvider,
    email: profile.email,
    display_name: profile.displayName,
    from_name: profile.displayName,
    status: "active",
    scopes,
    access_token_encrypted: encryptSecret(tokenPayload.access_token),
    refresh_token_encrypted: tokenPayload.refresh_token ? encryptSecret(tokenPayload.refresh_token) : undefined,
    token_expires_at: expiresAt,
    last_error: null
  };

  const { data: existing } = await supabase
    .from("email_connections")
    .select("id,refresh_token_encrypted")
    .eq("user_id", userId)
    .eq("provider", "google")
    .ilike("email", profile.email)
    .maybeSingle();

  const payload = {
    ...row,
    refresh_token_encrypted: row.refresh_token_encrypted || existing?.refresh_token_encrypted || null
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("email_connections")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Could not update Google email connection.");
    return data as EmailConnectionRow;
  }

  const { data, error } = await supabase.from("email_connections").insert(payload).select().single();
  if (error || !data) throw new Error(error?.message || "Could not save Google email connection.");
  return data as EmailConnectionRow;
}

export async function refreshGoogleAccessToken(supabase: SupabaseClient, connection: EmailConnectionRow) {
  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 90_000) {
    return decryptSecret(connection.access_token_encrypted);
  }

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  if (!refreshToken) throw new Error("Google refresh token is missing. Reconnect this email account.");

  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await supabase.from("email_connections").update({ status: "error", last_error: payload.error_description || payload.error || "Google refresh failed." }).eq("id", connection.id);
    throw new Error(payload.error_description || payload.error || "Google refresh failed.");
  }

  const accessToken = clean(payload.access_token);
  const expiresAtIso = new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("email_connections")
    .update({
      access_token_encrypted: encryptSecret(accessToken),
      token_expires_at: expiresAtIso,
      status: "active",
      last_error: null
    })
    .eq("id", connection.id);

  return accessToken;
}

export async function listUserEmailConnections(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    const message = clean(error.message);
    if (error.code === "42P01" || message.includes("email_connections")) return [];
    throw new Error(error.message);
  }
  return ((data || []) as EmailConnectionRow[]).map(safeEmailConnection);
}

export async function findUserEmailConnection(supabase: SupabaseClient, userId: string, connectionId?: string | null) {
  let query = supabase.from("email_connections").select("*").eq("user_id", userId).eq("status", "active");
  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = connectionId
    ? await query.single()
    : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error || !data) return null;
  return data as EmailConnectionRow;
}

export async function findConnectionForMessage(
  supabase: SupabaseClient,
  args: { messageId?: string; campaignId?: string; userId?: string; emailConnectionId?: string | null }
) {
  let userId = clean(args.userId);
  let connectionId = clean(args.emailConnectionId);
  let campaignId = clean(args.campaignId);

  if (args.messageId) {
    const { data } = await supabase
      .from("outreach_messages")
      .select("id,user_id,campaign_id,outreach_campaigns(id,user_id,email_connection_id)")
      .eq("id", args.messageId)
      .maybeSingle();

    const row = data as
      | {
          user_id?: string;
          campaign_id?: string;
          outreach_campaigns?: { email_connection_id?: string | null } | null;
        }
      | null;

    userId = userId || clean(row?.user_id);
    campaignId = campaignId || clean(row?.campaign_id);
    connectionId = connectionId || clean(row?.outreach_campaigns?.email_connection_id);
  }

  if (!connectionId && campaignId) {
    const { data } = await supabase
      .from("outreach_campaigns")
      .select("user_id,email_connection_id")
      .eq("id", campaignId)
      .maybeSingle();
    const row = data as { user_id?: string; email_connection_id?: string | null } | null;
    userId = userId || clean(row?.user_id);
    connectionId = clean(row?.email_connection_id);
  }

  if (!userId) return null;
  return findUserEmailConnection(supabase, userId, connectionId || null);
}

function cleanHeader(value: unknown) {
  return clean(value).replace(/[\r\n]+/g, " ");
}

function encodeHeader(value: string) {
  const text = cleanHeader(value);
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function encodeAddress(name: string, email: string) {
  const address = cleanHeader(email);
  const label = cleanHeader(name);
  return label ? `${encodeHeader(label)} <${address}>` : address;
}

function foldBase64(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}

function buildMime(payload: MailPayload, outboundMessageId: string) {
  const headers = [
    `From: ${encodeAddress(payload.senderName, payload.fromEmail)}`,
    `To: ${encodeAddress("", payload.toEmail)}`,
    `Subject: ${encodeHeader(payload.subject)}`,
    `Message-ID: ${outboundMessageId}`,
    `X-ExportFlow-Campaign-Id: ${cleanHeader(payload.campaignId)}`,
    `X-ExportFlow-Lead-Id: ${cleanHeader(payload.leadId)}`,
    `X-ExportFlow-Step: ${cleanHeader(payload.step)}`,
    "MIME-Version: 1.0"
  ];

  if (payload.replyTo) headers.splice(2, 0, `Reply-To: ${encodeAddress("", payload.replyTo)}`);

  const text = clean(payload.bodyText);
  const html = clean(payload.bodyHtml);

  if (text && html) {
    const boundary = `exportflow_${crypto.randomUUID().replace(/-/g, "")}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      foldBase64(text),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      foldBase64(html),
      `--${boundary}--`,
      ""
    ].join("\r\n");
  }

  return [
    ...headers,
    `Content-Type: ${html ? "text/html" : "text/plain"}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(html || text),
    ""
  ].join("\r\n");
}

export function buildOutboundMessageId(messageId: string, fromEmail: string) {
  const domain = clean(fromEmail.split("@")[1]) || "exportflow.local";
  return `<outreach-${messageId}.${Date.now()}@${domain}>`;
}

export async function sendWithGoogleConnection(supabase: SupabaseClient, connection: EmailConnectionRow, payload: MailPayload) {
  const accessToken = await refreshGoogleAccessToken(supabase, connection);
  const outboundMessageId = buildOutboundMessageId(payload.messageId, payload.fromEmail);
  const raw = base64Url(buildMime(payload, outboundMessageId));

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    await supabase.from("email_connections").update({ status: "error", last_error: result.error?.message || "Gmail send failed." }).eq("id", connection.id);
    throw new Error(result.error?.message || "Gmail send failed.");
  }

  return {
    outboundMessageId,
    providerMessageId: clean(result.id),
    threadId: clean(result.threadId),
    response: clean(result.id || result.threadId)
  };
}

export async function sendWithSmtpConnection(connection: EmailConnectionRow, payload: MailPayload) {
  const host = clean(connection.smtp_host);
  const port = Number(connection.smtp_port || 587);
  const username = clean(connection.smtp_username);
  const password = decryptSecret(connection.smtp_password_encrypted);
  if (!host || !port) throw new Error("SMTP host/port is missing for this email connection.");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Boolean(connection.smtp_secure),
    auth: username ? { user: username, pass: password } : undefined
  });

  const outboundMessageId = buildOutboundMessageId(payload.messageId, payload.fromEmail);
  const info = await transporter.sendMail({
    from: {
      name: payload.senderName,
      address: payload.fromEmail
    },
    to: payload.toEmail,
    replyTo: payload.replyTo || undefined,
    subject: payload.subject,
    text: payload.bodyText || undefined,
    html: payload.bodyHtml || undefined,
    messageId: outboundMessageId,
    headers: {
      "X-ExportFlow-Campaign-Id": payload.campaignId,
      "X-ExportFlow-Lead-Id": payload.leadId,
      "X-ExportFlow-Step": payload.step
    }
  });

  return {
    outboundMessageId,
    providerMessageId: clean(info.messageId || outboundMessageId),
    threadId: clean(info.messageId || outboundMessageId),
    response: clean(info.response)
  };
}

export async function saveSmtpConnection(
  supabase: SupabaseClient,
  userId: string,
  input: {
    email: string;
    display_name?: string;
    from_name?: string;
    reply_to?: string;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_username: string;
    smtp_password: string;
    imap_host?: string;
    imap_port?: number;
    imap_secure?: boolean;
    imap_username?: string;
    imap_password?: string;
    imap_mailbox?: string;
  }
) {
  const email = clean(input.email).toLowerCase();
  if (!email) throw new Error("Sender email is required.");
  if (!clean(input.smtp_host) || !Number(input.smtp_port)) throw new Error("SMTP host and port are required.");
  if (!clean(input.smtp_password)) throw new Error("SMTP password or app password is required.");

  const payload = {
    user_id: userId,
    provider: "smtp" as EmailProvider,
    email,
    display_name: clean(input.display_name) || null,
    from_name: clean(input.from_name) || clean(input.display_name) || null,
    reply_to: clean(input.reply_to) || null,
    status: "active",
    scopes: [] as string[],
    smtp_host: clean(input.smtp_host),
    smtp_port: Number(input.smtp_port),
    smtp_secure: Boolean(input.smtp_secure),
    smtp_username: clean(input.smtp_username) || email,
    smtp_password_encrypted: encryptSecret(input.smtp_password),
    imap_host: clean(input.imap_host) || null,
    imap_port: input.imap_port ? Number(input.imap_port) : null,
    imap_secure: input.imap_secure ?? true,
    imap_username: clean(input.imap_username) || clean(input.smtp_username) || email,
    imap_password_encrypted: clean(input.imap_password) ? encryptSecret(input.imap_password) : encryptSecret(input.smtp_password),
    imap_mailbox: clean(input.imap_mailbox) || "INBOX",
    last_error: null
  };

  const { data: existing } = await supabase
    .from("email_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "smtp")
    .ilike("email", email)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase.from("email_connections").update(payload).eq("id", existing.id).select().single();
    if (error || !data) throw new Error(error?.message || "Could not update SMTP connection.");
    return data as EmailConnectionRow;
  }

  const { data, error } = await supabase.from("email_connections").insert(payload).select().single();
  if (error || !data) throw new Error(error?.message || "Could not save SMTP connection.");
  return data as EmailConnectionRow;
}
