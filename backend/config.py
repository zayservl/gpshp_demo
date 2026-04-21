"""
Конфигурация приложения
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Настройки приложения"""
    
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:2b"
    
    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # Frontend
    frontend_url: str = "http://localhost:5173"
    
    # Timeouts
    llm_timeout: int = 120  # секунды
    agent_timeout: int = 60
    
    # Logging
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
