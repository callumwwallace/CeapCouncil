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
