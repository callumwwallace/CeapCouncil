import pytest
from jose import jwt

from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
)
from app.core.config import settings


class TestPasswordHashing:
    """Tests for password hashing functions."""
    
    def test_password_hash_is_different(self):
        """Test that hashed password is different from plain password."""
        password = "TestPass123"
        hashed = get_password_hash(password)
        
        assert hashed != password
        assert len(hashed) > len(password)
    
    def test_password_hash_is_unique(self):
        """Test that same password produces different hashes (due to salt)."""
        password = "TestPass123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        assert hash1 != hash2
    
    def test_verify_password_correct(self):
        """Test password verification with correct password."""
        password = "TestPass123"
        hashed = get_password_hash(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """Test password verification with incorrect password."""
        password = "TestPass123"
        hashed = get_password_hash(password)
        
        assert verify_password("WrongPass123", hashed) is False


class TestJWTTokens:
    """Tests for JWT token functions."""
    
    def test_access_token_creation(self):
        """Test access token is created correctly."""
        user_id = 123
        token = create_access_token(user_id)
        
        assert token is not None
        assert isinstance(token, str)
        
        # Decode and verify
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == str(user_id)
        assert payload["type"] == "access"
        assert "exp" in payload
    
    def test_refresh_token_creation(self):
        """Test refresh token is created correctly."""
        user_id = 123
        token = create_refresh_token(user_id)
        
        assert token is not None
        assert isinstance(token, str)
        
        # Decode and verify
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == str(user_id)
        assert payload["type"] == "refresh"
        assert "exp" in payload
    
    def test_access_and_refresh_tokens_different(self):
        """Test that access and refresh tokens are different."""
        user_id = 123
        access_token = create_access_token(user_id)
        refresh_token = create_refresh_token(user_id)
        
        assert access_token != refresh_token


class TestPasswordStrength:
    """Tests for password strength validation (zxcvbn)."""

    def test_weak_password_rejected(self):
        """Test that weak passwords are rejected."""
        from app.core.password import validate_password_strength
        valid, _ = validate_password_strength("password")
        assert valid is False
        valid, _ = validate_password_strength("12345678")
        assert valid is False

    def test_strong_password_accepted(self):
        """Test that strong passwords are accepted."""
        from app.core.password import validate_password_strength
        valid, _ = validate_password_strength("Correct-Horse-Battery-Staple42")
        assert valid is True

    def test_common_pattern_rejected(self):
        """Test that common patterns are rejected."""
        from app.core.password import validate_password_strength
        valid, _ = validate_password_strength("Summer2024!")
        assert valid is False

    def test_empty_password_rejected(self):
        """Test that empty password is rejected."""
        from app.core.password import validate_password_strength
        valid, _ = validate_password_strength("")
        assert valid is False


class TestTOTPService:
    """Tests for TOTP 2FA helpers."""

    def test_encrypt_decrypt_roundtrip(self, monkeypatch):
        monkeypatch.setenv("TOTP_ENCRYPTION_KEY", "")
        from app.core.config import get_settings
        get_settings.cache_clear()
        from app.services.totp import encrypt_totp_secret, decrypt_totp_secret, generate_totp_secret
        secret = generate_totp_secret()
        encrypted = encrypt_totp_secret(secret)
        decrypted = decrypt_totp_secret(encrypted)
        assert decrypted == secret

    def test_verify_totp_valid_code(self):
        """Test valid TOTP code verification."""
        import pyotp
        from app.services.totp import verify_totp
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        code = totp.now()
        assert verify_totp(secret, code) is True

    def test_verify_totp_invalid_code(self):
        """Test invalid TOTP code verification."""
        from app.services.totp import verify_totp, generate_totp_secret
        secret = generate_totp_secret()
        assert verify_totp(secret, "000000") is False

    def test_generate_recovery_codes(self):
        """Test recovery code generation."""
        from app.services.totp import generate_recovery_codes
        codes = generate_recovery_codes(10)
        assert len(codes) == 10
        for code in codes:
            assert "-" in code
            parts = code.split("-")
            assert len(parts) == 2
            assert len(parts[0]) == 4 and len(parts[1]) == 4

    def test_recovery_code_hash_verify(self):
        """Test recovery code hashing and verification."""
        from app.services.totp import hash_recovery_code, verify_recovery_code
        code = "ABCD-1234"
        hashed = hash_recovery_code(code)
        assert hashed != code
        assert verify_recovery_code(code, hashed) is True
        assert verify_recovery_code("WRONG-9999", hashed) is False
