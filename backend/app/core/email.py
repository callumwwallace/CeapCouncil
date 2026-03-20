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
        raise


def send_verification_email(to: str, token: str) -> str:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    return f"""
    <!DOCTYPE html>
    <html>
    <body>
        <p>Thanks for signing up for QuantGuild.</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="{link}">Verify email</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create an account, you can ignore this email.</p>
    </body>
    </html>
    """


def send_reset_email_body(to: str, token: str) -> str:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    return f"""
    <!DOCTYPE html>
    <html>
    <body>
        <p>You requested a password reset for your QuantGuild account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="{link}">Reset password</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, you can ignore this email.</p>
    </body>
    </html>
    """
