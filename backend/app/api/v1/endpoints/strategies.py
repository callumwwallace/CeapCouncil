import ast
import re

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.strategy import Strategy, StrategyVersion
import difflib
from app.schemas.strategy import StrategyCreate, StrategyUpdate, StrategyResponse, StrategyVersionResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# Strategy validation
# ---------------------------------------------------------------------------

_FORBIDDEN_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "pathlib", "socket",
    "http", "urllib", "requests", "ctypes", "pickle", "shelve",
    "multiprocessing", "threading", "signal", "io",
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
    code: str


@router.post("/validate", response_model=ValidationResult)
async def validate_strategy(body: ValidateRequest):
    """Validate strategy code without executing it.

    Checks:
    1. Python syntax (ast.parse)
    2. Required class ``MyStrategy(bt.Strategy)`` pattern
    3. Forbidden imports
    4. Suspicious patterns (eval, exec, open, etc.)
    """
    code = body.code
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []

    # 1. Syntax check
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return ValidationResult(
            valid=False,
            errors=[ValidationError(line=e.lineno, message=f"SyntaxError: {e.msg}")],
        )

    # 2. Check for MyStrategy class inheriting from bt.Strategy
    has_my_strategy = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "MyStrategy":
            # Check it has at least one base class referencing bt.Strategy or Strategy
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
            has_my_strategy = True  # found the class at least

    if not has_my_strategy:
        errors.append(ValidationError(
            line=None,
            message="Strategy code must define a class named 'MyStrategy' that extends bt.Strategy",
        ))

    # 3. Check for forbidden imports
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

    # 4. Suspicious builtins
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

    # 5. Check __init__ and next methods exist
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


@router.post("/", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
async def create_strategy(
    strategy_in: StrategyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    strategy = Strategy(
        **strategy_in.model_dump(),
        author_id=current_user.id,
    )
    db.add(strategy)
    await db.flush()
    await db.refresh(strategy)
    
    return strategy


@router.get("/", response_model=list[StrategyResponse])
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
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Strategy)
        .where(Strategy.author_id == current_user.id)
        .order_by(desc(Strategy.created_at))
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(
    strategy_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_active_user),
):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    
    # Check access
    if not strategy.is_public and (not current_user or strategy.author_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Increment view count
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
    
    # Save a version snapshot before updating (if code or params changed)
    update_data = strategy_update.model_dump(exclude_unset=True)
    if "code" in update_data or "parameters" in update_data:
        version = StrategyVersion(
            strategy_id=strategy.id,
            version=strategy.version,
            code=strategy.code,
            parameters=strategy.parameters,
        )
        db.add(version)
        strategy.version = (strategy.version or 1) + 1
    
    for field, value in update_data.items():
        setattr(strategy, field, value)
    
    await db.flush()
    await db.refresh(strategy)
    
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


@router.get("/{strategy_id}/versions", response_model=list[StrategyVersionResponse])
async def list_strategy_versions(
    strategy_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List all version snapshots for a strategy."""
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    if strategy.author_id != current_user.id and not strategy.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    result = await db.execute(
        select(StrategyVersion)
        .where(StrategyVersion.strategy_id == strategy_id)
        .order_by(StrategyVersion.version.desc())
    )
    return result.scalars().all()


@router.post("/{strategy_id}/versions/{version}/restore", response_model=StrategyResponse)
async def restore_strategy_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a strategy to a previous version."""
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Version {version} not found")
    
    # Save current state as a version before restoring
    snapshot = StrategyVersion(
        strategy_id=strategy.id,
        version=strategy.version,
        code=strategy.code,
        parameters=strategy.parameters,
    )
    db.add(snapshot)
    
    # Restore
    strategy.code = ver.code
    strategy.parameters = ver.parameters
    strategy.version = (strategy.version or 1) + 1
    
    await db.flush()
    await db.refresh(strategy)
    return strategy


@router.post("/{strategy_id}/fork", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
async def fork_strategy(
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
    
    # Create fork
    forked = Strategy(
        title=f"{original.title} (Fork)",
        description=original.description,
        code=original.code,
        parameters=original.parameters,
        is_public=False,
        author_id=current_user.id,
        forked_from_id=original.id,
    )
    db.add(forked)
    
    # Increment fork count
    original.fork_count += 1
    
    await db.flush()
    await db.refresh(forked)
    
    return forked


# ---------------------------------------------------------------------------
# Strategy Version Control
# ---------------------------------------------------------------------------

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

    # Check if code changed from last version
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


@router.post("/{strategy_id}/versions/{version}/restore")
async def restore_version(
    strategy_id: int,
    version: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore strategy code from a specific version."""
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

    strategy.code = sv.code
    strategy.parameters = sv.parameters
    await db.commit()
    return {"message": f"Restored to version {version}", "code": sv.code}


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
