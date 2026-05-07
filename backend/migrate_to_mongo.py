#!/usr/bin/env python3
"""
One-shot migration: SQLite (weather_data.db + auth.db) -> MongoDB.

Safe to re-run: duplicate-key errors are silently skipped, so already-inserted
rows are harmlessly ignored and the script picks up where it left off.

Usage:
    python migrate_to_mongo.py
    python migrate_to_mongo.py --weather-db ../data/weather_data.db --auth-db auth.db
"""
import asyncio
import argparse
import os
import sqlite3
import time

from motor.motor_asyncio import AsyncIOMotorClient

WEATHER_TABLES = [
    "monthly_stats",
    "yearly_stats",
    "climate_normals",
    "weather_data",
    "tehsil_monthly_stats",
    "tehsil_yearly_stats",
    "tehsil_normals",
]

_ID_COL: dict[str, str | None] = {
    "users":                 "id",
    "refresh_tokens":        None,
    "monthly_stats":         None,
    "yearly_stats":          None,
    "climate_normals":       None,
    "weather_data":          None,
    "tehsil_monthly_stats":  None,
    "tehsil_yearly_stats":   None,
    "tehsil_normals":        None,
}

BATCH_SIZE = 300   # small batch = low memory pressure on 4 GB machines


async def _insert_batch(coll, batch: list[dict], retries: int = 3) -> None:
    for attempt in range(retries):
        try:
            await coll.insert_many(batch, ordered=False)
            return
        except Exception as e:
            msg = str(e)
            # BulkWriteError with only duplicate-key failures is expected on re-runs
            if "E11000" in msg or "duplicate" in msg.lower():
                return
            if attempt < retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                print(f"    [warn] batch skipped after {retries} attempts: {msg[:120]}")


async def migrate_table(db, table: str, conn: sqlite3.Connection) -> int:
    coll = db[table]
    id_col = _ID_COL.get(table)
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table}")
    cols = [d[0] for d in cur.description]

    total = 0
    batch: list[dict] = []
    t0 = time.time()

    for row in cur:
        doc = dict(zip(cols, row))
        if id_col and id_col in doc:
            doc["_id"] = doc.pop(id_col)
        batch.append(doc)

        if len(batch) >= BATCH_SIZE:
            await _insert_batch(coll, batch)
            total += len(batch)
            batch = []
            if total % 10000 == 0:
                elapsed = time.time() - t0
                rate = int(total / elapsed) if elapsed else 0
                print(f"    {table}: {total:,} rows  ({rate:,}/s)")

    if batch:
        await _insert_batch(coll, batch)
        total += len(batch)

    elapsed = time.time() - t0
    rate = int(total / elapsed) if elapsed else 0
    print(f"  OK {table}: {total:,} documents  ({rate:,}/s, {elapsed:.0f}s)")
    return total


async def create_indexes(db) -> None:
    print("\nBuilding indexes (this may take a few minutes) ...")
    await db["users"].create_index("email",    unique=True, background=True)
    await db["users"].create_index("username", unique=True, background=True)
    await db["refresh_tokens"].create_index("user_id", background=True)
    await db["refresh_tokens"].create_index("token",   unique=True, background=True)

    await db["weather_data"].create_index(
        [("latitude", 1), ("longitude", 1), ("date", 1)], background=True)
    await db["weather_data"].create_index("district", background=True)
    await db["weather_data"].create_index("tehsil",   background=True)

    await db["monthly_stats"].create_index(
        [("latitude", 1), ("longitude", 1)], background=True)
    await db["monthly_stats"].create_index("district", background=True)
    await db["yearly_stats"].create_index(
        [("latitude", 1), ("longitude", 1), ("year", 1)], background=True)
    await db["yearly_stats"].create_index("district", background=True)
    await db["climate_normals"].create_index(
        [("latitude", 1), ("longitude", 1), ("month", 1)], background=True)

    await db["tehsil_monthly_stats"].create_index(
        [("latitude", 1), ("longitude", 1)], background=True)
    await db["tehsil_monthly_stats"].create_index("tehsil", background=True)
    await db["tehsil_yearly_stats"].create_index(
        [("latitude", 1), ("longitude", 1), ("year", 1)], background=True)
    await db["tehsil_yearly_stats"].create_index("tehsil", background=True)
    await db["tehsil_normals"].create_index(
        [("latitude", 1), ("longitude", 1)], background=True)
    await db["tehsil_normals"].create_index("tehsil", background=True)

    print("OK Indexes created")


async def main(weather_db: str, auth_db: str, mongo_uri: str,
               skip_indexes: bool = False, indexes_only: bool = False) -> None:
    client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db = client["pakclim"]
    print(f"Connected to MongoDB at {mongo_uri}  |  database: pakclim")
    print(f"Batch size: {BATCH_SIZE} rows\n")

    if indexes_only:
        await create_indexes(db)
        client.close()
        print("\nIndexes built. Done.")
        return

    if os.path.exists(weather_db):
        print(f"Migrating weather data from: {weather_db}")
        conn = sqlite3.connect(weather_db)
        existing = {r[0] for r in
                    conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        for table in WEATHER_TABLES:
            if table in existing:
                await migrate_table(db, table, conn)
            else:
                print(f"  - {table} not in SQLite, skipping")
        conn.close()
    else:
        print(f"[!] Weather DB not found: {weather_db}")

    if os.path.exists(auth_db):
        print(f"\nMigrating auth data from: {auth_db}")
        conn = sqlite3.connect(auth_db)
        existing = {r[0] for r in
                    conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        for table in ("users", "refresh_tokens"):
            if table in existing:
                await migrate_table(db, table, conn)
            else:
                print(f"  - {table} not in SQLite, skipping")
        conn.close()
    else:
        print(f"\n[!] Auth DB not found: {auth_db}  (no users migrated)")

    if not skip_indexes:
        await create_indexes(db)
    else:
        print("\nSkipped index creation (run with --indexes-only when ready).")
    client.close()
    print("\nMigration complete. You can now start the app.")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Migrate SQLite -> MongoDB for PakClim")
    parser.add_argument("--weather-db",    default=os.path.join(here, "..", "data", "weather_data.db"))
    parser.add_argument("--auth-db",       default=os.path.join(here, "auth.db"))
    parser.add_argument("--mongo-uri",     default="mongodb://localhost:27017")
    parser.add_argument("--skip-indexes",  action="store_true", help="Skip index creation (do it later)")
    parser.add_argument("--indexes-only",  action="store_true", help="Only build indexes, skip data import")
    args = parser.parse_args()
    asyncio.run(main(args.weather_db, args.auth_db, args.mongo_uri,
                     skip_indexes=args.skip_indexes, indexes_only=args.indexes_only))
