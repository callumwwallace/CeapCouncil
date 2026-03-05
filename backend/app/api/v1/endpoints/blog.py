"""Blog API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.blog import BlogPost
from app.models.user import User

router = APIRouter()


@router.get("/")
async def list_blog_posts(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List published blog posts, newest first."""
    query = (
        select(BlogPost)
        .options(selectinload(BlogPost.author))
        .where(BlogPost.published_at.isnot(None))
        .order_by(desc(BlogPost.published_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    posts = result.scalars().all()
    return [
        {
            "id": p.id,
            "title": p.title,
            "slug": p.slug,
            "excerpt": p.excerpt,
            "author": {"id": p.author.id, "username": p.author.username},
            "published_at": p.published_at.isoformat() if p.published_at else None,
            "created_at": p.created_at.isoformat(),
        }
        for p in posts
    ]


@router.get("/{slug}")
async def get_blog_post(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single blog post by slug."""
    result = await db.execute(
        select(BlogPost)
        .options(selectinload(BlogPost.author))
        .where(BlogPost.slug == slug, BlogPost.published_at.isnot(None))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return {
        "id": post.id,
        "title": post.title,
        "slug": post.slug,
        "excerpt": post.excerpt,
        "content": post.content,
        "author": {"id": post.author.id, "username": post.author.username},
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
    }
