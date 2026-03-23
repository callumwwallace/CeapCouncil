"""Blog API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.sanitize import sanitize_user_content
from app.core.limiter import limiter
from app.api.deps import get_current_active_user, get_current_user_optional, get_current_admin_user
from app.models.blog import BlogPost, BlogComment
from app.models.user import User
from app.schemas.blog import BlogCommentCreate, BlogPostCreate, BlogPostUpdate

router = APIRouter()


@router.get("")
@limiter.limit("60/minute")
async def list_blog_posts(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
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

    # Fetch comment counts for all posts
    post_ids = [p.id for p in posts]
    comment_counts = {}
    if post_ids:
        count_result = await db.execute(
            select(BlogComment.blog_post_id, func.count(BlogComment.id))
            .where(BlogComment.blog_post_id.in_(post_ids))
            .group_by(BlogComment.blog_post_id)
        )
        comment_counts = dict(count_result.all())

    return [
        {
            "id": p.id,
            "title": p.title,
            "slug": p.slug,
            "excerpt": p.excerpt,
            "author": {"id": p.author.id, "username": p.author.username},
            "published_at": p.published_at.isoformat() if p.published_at else None,
            "created_at": p.created_at.isoformat(),
            "comment_count": comment_counts.get(p.id, 0),
        }
        for p in posts
    ]


@router.get("/{slug}")
@limiter.limit("60/minute")
async def get_blog_post(
    request: Request,
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

    comment_count = await db.scalar(
        select(func.count(BlogComment.id)).where(BlogComment.blog_post_id == post.id)
    ) or 0

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
        "comment_count": comment_count,
    }


@router.post("", status_code=201)
@limiter.limit("20/minute")
async def create_blog_post(
    request: Request,
    data: BlogPostCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new blog post. Admin only."""
    existing = await db.scalar(select(BlogPost).where(BlogPost.slug == data.slug))
    if existing:
        raise HTTPException(400, "A post with this slug already exists")

    from datetime import datetime
    post = BlogPost(
        title=data.title,
        slug=data.slug,
        excerpt=data.excerpt,
        content=data.content,
        author_id=current_user.id,
        published_at=datetime.utcnow() if data.published else None,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "slug": post.slug,
        "excerpt": post.excerpt,
        "content": post.content,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
    }


@router.patch("/{slug}")
@limiter.limit("20/minute")
async def update_blog_post(
    request: Request,
    slug: str,
    data: BlogPostUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing blog post. Admin only."""
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(404, "Post not found")

    if data.title is not None:
        post.title = data.title
    if data.excerpt is not None:
        post.excerpt = data.excerpt
    if data.content is not None:
        post.content = data.content
    if data.slug is not None and data.slug != slug:
        existing = await db.scalar(select(BlogPost).where(BlogPost.slug == data.slug))
        if existing:
            raise HTTPException(400, "A post with this slug already exists")
        post.slug = data.slug
    if data.published is not None:
        from datetime import datetime
        post.published_at = datetime.utcnow() if data.published else None

    await db.flush()
    await db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "slug": post.slug,
        "excerpt": post.excerpt,
        "content": post.content,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
    }


@router.delete("/{slug}", status_code=204)
@limiter.limit("10/minute")
async def delete_blog_post(
    request: Request,
    slug: str,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a blog post. Admin only."""
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(404, "Post not found")
    await db.delete(post)
    await db.flush()


@router.get("/{slug}/comments")
@limiter.limit("60/minute")
async def list_blog_comments(
    request: Request,
    slug: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List comments on a blog post."""
    post = await db.scalar(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.published_at.isnot(None))
    )
    if not post:
        raise HTTPException(404, "Post not found")

    result = await db.execute(
        select(BlogComment, User.username, User.avatar_url)
        .join(User, BlogComment.author_id == User.id)
        .where(BlogComment.blog_post_id == post.id)
        .order_by(BlogComment.created_at)
        .offset(skip)
        .limit(limit)
    )
    return [
        {
            "id": c.id,
            "blog_post_id": c.blog_post_id,
            "author_id": c.author_id,
            "author_username": uname,
            "author_avatar_url": avatar,
            "content": c.content,
            "parent_id": c.parent_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c, uname, avatar in result.all()
    ]


@router.post("/{slug}/comments", status_code=201)
@limiter.limit("30/minute")
async def create_blog_comment(
    request: Request,
    slug: str,
    data: BlogCommentCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a blog post."""
    post = await db.scalar(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.published_at.isnot(None))
    )
    if not post:
        raise HTTPException(404, "Post not found")

    content = sanitize_user_content(data.content)
    parent_id = data.parent_id
    if parent_id is not None:
        parent = await db.scalar(
            select(BlogComment).where(
                BlogComment.id == parent_id,
                BlogComment.blog_post_id == post.id,
            )
        )
        if not parent:
            raise HTTPException(404, "Parent comment not found")

    comment = BlogComment(
        blog_post_id=post.id,
        author_id=current_user.id,
        content=content,
        parent_id=parent_id,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "blog_post_id": comment.blog_post_id,
        "author_id": comment.author_id,
        "author_username": current_user.username,
        "author_avatar_url": current_user.avatar_url,
        "content": comment.content,
        "parent_id": comment.parent_id,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
    }


@router.delete("/comments/{comment_id}", status_code=204)
@limiter.limit("30/minute")
async def delete_blog_comment(
    request: Request,
    comment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete own blog comment."""
    comment = await db.scalar(select(BlogComment).where(BlogComment.id == comment_id))
    if not comment:
        raise HTTPException(404, "Comment not found")
    if comment.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(403, "Not authorized")
    await db.delete(comment)
    await db.flush()
