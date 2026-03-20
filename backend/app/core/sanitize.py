import bleach

ALLOWED_TAGS = {"p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li", "code", "pre", "blockquote"}
ALLOWED_ATTRS = {"a": ["href"]}
ALLOWED_PROTOCOLS = {"http", "https"}


def sanitize_user_content(content: str) -> str:
    return bleach.clean(
        content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
