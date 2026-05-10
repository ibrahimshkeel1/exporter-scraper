import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/api-auth";
import { createAdminSupabase } from "../../../../../lib/supabase-admin";
import { safeEmailConnection, saveSmtpConnection } from "../../../../../lib/email-connections";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const connection = await saveSmtpConnection(createAdminSupabase(), user.id, {
      email: clean(body.email),
      display_name: clean(body.display_name),
      from_name: clean(body.from_name),
      reply_to: clean(body.reply_to),
      smtp_host: clean(body.smtp_host),
      smtp_port: Number(body.smtp_port || 587),
      smtp_secure: Boolean(body.smtp_secure),
      smtp_username: clean(body.smtp_username),
      smtp_password: clean(body.smtp_password),
      imap_host: clean(body.imap_host),
      imap_port: Number(body.imap_port || 993),
      imap_secure: body.imap_secure == null ? true : Boolean(body.imap_secure),
      imap_username: clean(body.imap_username),
      imap_password: clean(body.imap_password),
      imap_mailbox: clean(body.imap_mailbox) || "INBOX"
    });

    return NextResponse.json({ connection: safeEmailConnection(connection) }, { status: 201 });
  } catch (saveError) {
    return NextResponse.json(
      { error: saveError instanceof Error ? saveError.message : "Could not save SMTP connection." },
      { status: 400 }
    );
  }
}
