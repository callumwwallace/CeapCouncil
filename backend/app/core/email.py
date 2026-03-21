import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html_body: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured; skipping email to %s: %s", to, subject)
        return

    try:
        import aiosmtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_TLS,
        )
        logger.info("Email sent to %s: %s", to, subject)
    except Exception as e:
        logger.exception("Failed to send email to %s: %s", to, e)


def _email_wrapper(title: str, body_html: str) -> str:
    """Shared HTML shell for all transactional emails."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#059669;border-radius:10px;width:40px;height:40px;text-align:center;vertical-align:middle;">
                    <span style="font-size:20px;color:#ffffff;font-weight:bold;line-height:40px;">&#9650;</span>
                  </td>
                  <td style="padding-left:10px;font-size:20px;font-weight:700;color:#111827;">Ceap Council</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 40px 32px;">
              {body_html}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;font-size:12px;color:#9ca3af;line-height:1.6;">
              Ceap Council &mdash; <a href="{settings.FRONTEND_URL}" style="color:#059669;text-decoration:none;">ceapcouncil.com</a><br />
              If you didn&rsquo;t expect this email, you can safely ignore it.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_verification_email(to: str, token: str) -> str:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Verify your email</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
        Thanks for signing up! Click the button below to confirm your email address and activate your account.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="background-color:#059669;border-radius:8px;">
            <a href="{link}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Verify email address
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        This link expires in 24 hours. If the button doesn&rsquo;t work, copy and paste this URL into your browser:<br />
        <a href="{link}" style="color:#059669;word-break:break-all;">{link}</a>
      </p>
    """
    return _email_wrapper("Verify your Ceap Council email", body)


def send_reset_email_body(to: str, token: str) -> str:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = f"""
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
        We received a request to reset your Ceap Council password. Click the button below to choose a new one.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="background-color:#059669;border-radius:8px;">
            <a href="{link}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Reset password
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash;
        your password will not be changed.<br /><br />
        If the button doesn&rsquo;t work, copy and paste this URL into your browser:<br />
        <a href="{link}" style="color:#059669;word-break:break-all;">{link}</a>
      </p>
    """
    return _email_wrapper("Reset your Ceap Council password", body)
