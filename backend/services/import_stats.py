from sqlalchemy import text


def ensure_import_stat_tables(engine):
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS imported_player_stats (name TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_lower_name ON imported_player_stats (lower(name))"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_games ON imported_player_stats (games DESC)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS imported_opening_stats (opening TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_opening_stats_games ON imported_opening_stats (games DESC)"))


def refresh_import_stats(db):
    db.execute(text("DELETE FROM imported_player_stats"))
    db.execute(text("""
        INSERT INTO imported_player_stats (name, games)
        SELECT name, COUNT(*) AS games
        FROM (
            SELECT white AS name
            FROM imported_games
            WHERE white IS NOT NULL AND white <> ''
            UNION ALL
            SELECT black AS name
            FROM imported_games
            WHERE black IS NOT NULL AND black <> ''
        ) players
        GROUP BY name
    """))

    db.execute(text("DELETE FROM imported_opening_stats"))
    db.execute(text("""
        INSERT INTO imported_opening_stats (opening, games)
        SELECT COALESCE(NULLIF(opening, ''), 'Unknown') AS opening, COUNT(*) AS games
        FROM imported_games
        GROUP BY COALESCE(NULLIF(opening, ''), 'Unknown')
    """))
    db.commit()

    from services.player_catalog import sync_player_catalog
    sync_player_catalog(db)
