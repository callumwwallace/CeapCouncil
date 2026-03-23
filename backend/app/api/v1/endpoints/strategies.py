import ast
import re

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.strategy import Strategy, StrategyVersion
from app.models.strategy_group import StrategyGroup
from app.api.v1.endpoints.strategy_groups import get_or_create_default_group
import difflib
from app.schemas.strategy import StrategyCreate, StrategyUpdate, StrategyResponse
from app.core.limiter import limiter

router = APIRouter()

# Strategy validation (runs before backtest)

_FORBIDDEN_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "pathlib", "socket",
    "http", "urllib", "requests", "ctypes", "pickle", "shelve",
    "multiprocessing", "threading", "signal", "io",
}

_BLOCKED_DUNDER_ATTRS = {
    "__subclasses__", "__bases__", "__mro__", "__base__",
    "__class__", "__dict__", "__globals__", "__code__",
    "__func__", "__self__", "__module__", "__import__",
    "__builtins__", "__qualname__", "__wrapped__",
    "__loader__", "__spec__", "__path__", "__file__",
    "__reduce__", "__reduce_ex__", "__getstate__",
}


class ValidationError(BaseModel):
    line: int | None = None
    message: str
    severity: str = "error"  # "error" | "warning"


class ValidationResult(BaseModel):
    valid: bool
    errors: list[ValidationError] = Field(default_factory=list)
    warnings: list[ValidationError] = Field(default_factory=list)


class ValidateRequest(BaseModel):
    code: str = Field(..., max_length=50000)


@router.post("/validate", response_model=ValidationResult)
@limiter.limit("30/minute")
async def validate_strategy(request: Request, body: ValidateRequest):
    """Check strategy code is safe to run: valid syntax, MyStrategy class, no naughty imports."""
    code = body.code
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []

    # Syntax
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return ValidationResult(
            valid=False,
            errors=[ValidationError(line=e.lineno, message=f"SyntaxError: {e.msg}")],
        )

    # MyStrategy must extend bt.Strategy
    has_my_strategy = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "MyStrategy":
            # Base class should reference Strategy
            for base in node.bases:
                base_str = ast.dump(base)
                if "Strategy" in base_str:
                    has_my_strategy = True
                    break
            if not has_my_strategy:
                errors.append(ValidationError(
                    line=node.lineno,
                    message="MyStrategy must extend bt.Strategy",
                ))
            has_my_strategy = True

    if not has_my_strategy:
        errors.append(ValidationError(
            line=None,
            message="Strategy code must define a class named 'MyStrategy' that extends bt.Strategy",
        ))

    # Block unsafe imports
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.split(".")[0]
                if mod in _FORBIDDEN_IMPORTS:
                    errors.append(ValidationError(
                        line=node.lineno,
                        message=f"Import of '{alias.name}' is not allowed",
                    ))
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                mod = node.module.split(".")[0]
                if mod in _FORBIDDEN_IMPORTS:
                    errors.append(ValidationError(
                        line=node.lineno,
                        message=f"Import from '{node.module}' is not allowed",
                    ))

    # Block eval, exec, open, etc.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            name = None
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                name = func.attr
            if name in ("exec", "eval", "compile", "__import__", "open"):
                warnings.append(ValidationError(
                    line=getattr(node, "lineno", None),
                    message=f"Use of '{name}()' is blocked at runtime",
                    severity="warning",
                ))

    # Block __class__, __globals__, etc.
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDER_ATTRS:
                errors.append(ValidationError(
                    line=getattr(node, "lineno", None),
                    message=f"Access to '{node.attr}' is not allowed",
                ))
        if isinstance(node, ast.Subscript):
            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                if node.slice.value in _BLOCKED_DUNDER_ATTRS:
                    errors.append(ValidationError(
                        line=getattr(node, "lineno", None),
                        message=f"Access to '{node.slice.value}' is not allowed",
                    ))

    # Need __init__ and next
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "MyStrategy":
            methods = {m.name for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))}
            if "next" not in methods:
                warnings.append(ValidationError(
                    line=node.lineno,
                    message="MyStrategy should define a 'next()' method for trading logic",
                    severity="warning",
                ))

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


@router.post("", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_strategy(
    request: Request,
    strategy_in: StrategyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    data = strategy_in.model_dump()
    group_id = data.get("group_id")
    if group_id is not None:
        grp = await db.get(StrategyGroup, group_id)
        if not grp or grp.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group not found or not yours")
    else:
        default_group = await get_or_create_default_group(db, current_user.id)
        data["group_id"] = default_group.id
    strategy = Strategy(
        **data,
        author_id=current_user.id,
    )
    db.add(strategy)
    await db.flush()
    await db.refresh(strategy)
    if strategy.group_id:
        await db.refresh(strategy, attribute_names=["group"])
    return strategy


@router.get("", response_model=list[StrategyResponse])
async def list_strategies(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern="^(created_at|vote_count|view_count)$"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Strategy)
        .where(Strategy.is_public == True)
        .order_by(desc(getattr(Strategy, sort_by)))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/my", response_model=list[StrategyResponse])
async def list_my_strategies(
    current_user: User = Depends(get_current_active_user),
    group_id: int | None = Query(None, description="Filter by group"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Strategy)
        .where(Strategy.author_id == current_user.id)
        .options(selectinload(Strategy.group))
        .order_by(desc(Strategy.created_at))
    )
    if group_id is not None:
        query = query.where(Strategy.group_id == group_id)
    result = await db.execute(query)
    return result.scalars().unique().all()


@router.get("/embed/{share_token}", response_model=StrategyResponse)
@limiter.limit("60/minute")
async def get_strategy_by_token(
    request: Request,
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Token-based lookup for forum embed cards. The share_token is a UUID
    that cannot be guessed. Only returns data for public strategies."""
    result = await db.execute(
        select(Strategy).where(Strategy.share_token == share_token).options(selectinload(Strategy.group))
    )
    strategy = result.scalar_one_or_none()

    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

    if not strategy.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Strategy is private")

    strategy.view_count += 1
    await db.flush()

    return strategy


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(
    strategy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_active_user),
):
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id).options(selectinload(Strategy.group))
    )
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    # Can they see it?
    if not strategy.is_public and (not current_user or strategy.author_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Bump view count
    strategy.view_count += 1
    await db.flush()
    
    return strategy


@router.patch("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: int,
    strategy_update: StrategyUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Update working copy (no new version - use POST /versions for that)
    update_data = strategy_update.model_dump(exclude_unset=True)
    if "title" in update_data:
        strategy.title = update_data["title"]
    if "description" in update_data:
        strategy.description = update_data["description"]
    if "code" in update_data:
        strategy.code = update_data["code"]
    if "parameters" in update_data:
        strategy.parameters = update_data["parameters"]
    if "is_public" in update_data:
        strategy.is_public = update_data["is_public"]
    if "group_id" in update_data:
        gid = update_data["group_id"]
        if gid is not None:
            grp = await db.get(StrategyGroup, gid)
            if not grp or grp.user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group not found or not yours")
        strategy.group_id = gid

    await db.flush()
    # Reload with group so we get group_name in the response
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id).options(selectinload(Strategy.group))
    )
    strategy = result.scalar_one_or_none()
    return strategy


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    await db.delete(strategy)


@router.post("/{strategy_id}/versions/{version}/restore", response_model=StrategyResponse)
async def restore_strategy_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Reset: restore working copy to this version. No new commit created."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == version)
    )
    ver = result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    
    strategy.code = ver.code
    strategy.parameters = ver.parameters
    
    await db.flush()
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id).options(selectinload(Strategy.group))
    )
    strategy = result.scalar_one_or_none()
    return strategy


@router.post("/{strategy_id}/versions/{version}/revert", response_model=StrategyResponse)
async def revert_strategy_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Revert (Git-style): restore to this version AND create a new commit. History preserved."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == version)
    )
    ver = result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    
    strategy.code = ver.code
    strategy.parameters = ver.parameters
    
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id)
        .order_by(StrategyVersion.version.desc())
        .limit(1)
    )
    last_version = result.scalar_one_or_none()
    new_version_num = (last_version.version + 1) if last_version else 1
    sv = StrategyVersion(
        strategy_id=strategy_id,
        version=new_version_num,
        code=ver.code,
        parameters=ver.parameters or {},
        commit_message=f"Revert to v{version}",
    )
    db.add(sv)
    strategy.version = new_version_num
    await db.commit()
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id).options(selectinload(Strategy.group))
    )
    strategy = result.scalar_one_or_none()
    return strategy


@router.post("/{strategy_id}/fork", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def fork_strategy(
    request: Request,
    strategy_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    original = result.scalar_one_or_none()
    
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    if not original.is_public and original.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot fork private strategy")
    
    default_group = await get_or_create_default_group(db, current_user.id)
    forked = Strategy(
        title=f"{original.title} (Fork)",
        description=original.description,
        code=original.code,
        parameters=original.parameters,
        is_public=False,
        author_id=current_user.id,
        forked_from_id=original.id,
        group_id=default_group.id,
    )
    db.add(forked)
    
    # Bump fork count
    original.fork_count += 1
    
    await db.flush()
    await db.refresh(forked)
    
    return forked


# Version control

class CreateVersionRequest(BaseModel):
    message: str | None = None


@router.get("/{strategy_id}/versions")
async def list_versions(
    strategy_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List versions of a strategy with pagination."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not strategy.is_public and strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id)
        .order_by(StrategyVersion.version.desc())
        .offset(skip)
        .limit(limit)
    )
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "version": v.version,
            "commit_message": getattr(v, "commit_message", None),
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "code_preview": v.code[:100] + "..." if len(v.code) > 100 else v.code,
        }
        for v in versions
    ]


@router.get("/{strategy_id}/versions/{version}")
async def get_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific version's code."""
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == version)
    )
    sv = result.scalar_one_or_none()
    if not sv:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"version": sv.version, "code": sv.code, "parameters": sv.parameters, "created_at": sv.created_at.isoformat() if sv.created_at else None}


@router.post("/{strategy_id}/versions")
async def create_version(
    strategy_id: int,
    body: CreateVersionRequest | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new version snapshot of the current strategy code."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    commit_message = (body.message or "").strip()[:500] if body else None
    if not commit_message:
        raise HTTPException(status_code=400, detail="Commit message is required")

    # Only create new version if code actually changed
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id)
        .order_by(StrategyVersion.version.desc())
        .limit(1)
    )
    last_version = result.scalar_one_or_none()
    if last_version and last_version.code == strategy.code:
        return {"message": "No changes to version", "version": last_version.version}

    new_version_num = (last_version.version + 1) if last_version else 1
    sv = StrategyVersion(
        strategy_id=strategy_id,
        version=new_version_num,
        code=strategy.code,
        parameters=strategy.parameters or {},
        commit_message=commit_message or None,
    )
    db.add(sv)
    strategy.version = new_version_num
    await db.commit()
    return {"version": new_version_num, "message": "Version created"}


@router.delete("/{strategy_id}/versions/{version}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a version snapshot. Current strategy code is unchanged."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == version)
    )
    sv = result.scalar_one_or_none()
    if not sv:
        raise HTTPException(status_code=404, detail="Version not found")

    await db.delete(sv)
    await db.commit()


@router.get("/{strategy_id}/versions/{v1}/diff/{v2}")
async def diff_versions(
    strategy_id: int,
    v1: int,
    v2: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get unified diff between two versions."""
    result1 = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == v1)
    )
    sv1 = result1.scalar_one_or_none()
    result2 = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == v2)
    )
    sv2 = result2.scalar_one_or_none()

    if not sv1 or not sv2:
        raise HTTPException(status_code=404, detail="Version not found")

    diff = list(difflib.unified_diff(
        sv1.code.splitlines(keepends=True),
        sv2.code.splitlines(keepends=True),
        fromfile=f"v{v1}",
        tofile=f"v{v2}",
    ))
    return {"v1": v1, "v2": v2, "diff": "".join(diff)}


@router.get("/{strategy_id}/versions/{version}/diff-working")
async def diff_version_working(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get unified diff between a version and current strategy code."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id, StrategyVersion.version == version)
    )
    sv = result.scalar_one_or_none()
    if not sv:
        raise HTTPException(status_code=404, detail="Version not found")
    diff = list(difflib.unified_diff(
        sv.code.splitlines(keepends=True),
        strategy.code.splitlines(keepends=True),
        fromfile=f"v{version}",
        tofile="working",
    ))
    return {"v1": version, "v2": "working", "diff": "".join(diff)}
