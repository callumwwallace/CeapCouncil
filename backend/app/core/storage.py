"""MinIO / S3-compatible object storage client."""
import io
import uuid
from functools import lru_cache
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


def _make_client():
    """Create a synchronous boto3 S3 client pointed at MinIO."""
    protocol = "https" if settings.S3_USE_SSL else "http"
    endpoint_url = f"{protocol}://{settings.S3_ENDPOINT}"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",  # MinIO ignores this but boto3 requires a value
    )


@lru_cache(maxsize=1)
def get_storage_client():
    """Return a cached boto3 S3 client."""
    return _make_client()


def upload_file(
    file_bytes: bytes,
    object_key: str,
    content_type: str,
    bucket: Optional[str] = None,
) -> str:
    """
    Upload bytes to MinIO and return the public-facing URL.

    The returned URL is built from ``settings.MEDIA_BASE_URL`` so that
    it resolves correctly in the browser even though MinIO itself is only
    reachable inside the Docker network.

    Public URL format: ``{MEDIA_BASE_URL}/{object_key}``
    e.g.  https://ceapcouncil.com/media/avatars/7/abc123.jpg
    """
    bucket = bucket or settings.S3_BUCKET_NAME
    client = get_storage_client()
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=io.BytesIO(file_bytes),
        ContentType=content_type,
    )
    base = settings.MEDIA_BASE_URL.rstrip("/")
    return f"{base}/{object_key}"


def delete_file(object_key: str, bucket: Optional[str] = None) -> None:
    """Delete an object from MinIO (silently ignores missing objects)."""
    bucket = bucket or settings.S3_BUCKET_NAME
    client = get_storage_client()
    try:
        client.delete_object(Bucket=bucket, Key=object_key)
    except ClientError:
        pass  # Object may not exist — that's fine


def build_avatar_key(user_id: int, ext: str) -> str:
    """Generate a unique, non-guessable object key for an avatar."""
    return f"avatars/{user_id}/{uuid.uuid4().hex}.{ext}"


def extract_key_from_url(url: str) -> Optional[str]:
    """
    Extract the MinIO object key from a stored public URL.

    Handles both URL shapes:
    - ``{MEDIA_BASE_URL}/{key}``   (nginx-proxied, production)
    - ``http(s)://<endpoint>/<bucket>/<key>``  (legacy / dev direct)

    Returns None if extraction fails.
    """
    if not url:
        return None

    # Shape 1: starts with MEDIA_BASE_URL
    base = settings.MEDIA_BASE_URL.rstrip("/") + "/"
    if url.startswith(base):
        return url[len(base):]

    # Shape 2: legacy direct MinIO URL containing the bucket name
    prefix = f"/{settings.S3_BUCKET_NAME}/"
    idx = url.find(prefix)
    if idx != -1:
        return url[idx + len(prefix):]

    return None
