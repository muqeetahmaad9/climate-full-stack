from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    jwt_secret: str = "change_this"
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7

    rate_limit_live_api: int = 30
    rate_limit_nasa_api: int = 10
    rate_limit_db_query: int = 60
    rate_limit_auth: int = 5

    mongo_uri: str = "mongodb://localhost:27017"
    environment: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
