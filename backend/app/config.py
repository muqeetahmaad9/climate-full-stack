from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_uri: str = "mongodb://mongo:27017/pakclim"
    jwt_secret: str = "change_this"
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7

    rate_limit_live_api: int = 30
    rate_limit_nasa_api: int = 10
    rate_limit_db_query: int = 60
    rate_limit_auth: int = 5

    sqlite_db_path: str = "/data/weather_data.db"
    environment: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
