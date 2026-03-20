_MIN_SCORE = 3


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    if not password:
        return False, "Password is required"

    try:
        import zxcvbn
    except ImportError:
        if len(password) < 8:
            return False, "Password must be at least 8 characters"
        return True, None

    result = zxcvbn.zxcvbn(password)
    if result["score"] < _MIN_SCORE:
        msg = "Password is too weak"
        if result.get("feedback", {}).get("suggestions"):
            suggestions = result["feedback"]["suggestions"]
            if suggestions:
                msg = msg + ": " + suggestions[0]
        elif result.get("feedback", {}).get("warning"):
            msg = msg + ": " + result["feedback"]["warning"]
        return False, msg
    return True, None
