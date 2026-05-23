import json
import re

from sqlalchemy import text

import models
from services.historical_players import HISTORICAL_PLAYERS, normalize_for_match


def slugify_player_name(name):
    slug = normalize_for_match(name)
    return re.sub(r"[^a-z0-9]+", "-", slug).strip("-")


def load_tracked_usernames():
    try:
        from services.historical_players import load_tracked_chesscom_aliases
        tracked_aliases = load_tracked_chesscom_aliases()
    except Exception:
        return {}

    usernames = {}
    for name, aliases in tracked_aliases.items():
        for alias in aliases:
            clean_alias = str(alias or "").strip()
            if clean_alias and " " not in clean_alias:
                usernames[name] = clean_alias.lower()
                break
    return usernames


def sql_player_name(column):
    return (
        "trim(regexp_replace("
        f"regexp_replace(replace(replace(replace(replace(lower({column}), '_', ' '), '-', ' '), ',', ' '), '.', ' '), "
        r"'\([^)]*\)', ' ', 'g'), "
        r"'\s+', ' ', 'g'))"
    )


def bind_values(prefix, values):
    return {f"{prefix}_{index}": value for index, value in enumerate(values)}


def placeholders(prefix, values):
    return ", ".join(f":{prefix}_{index}" for index in range(len(values)))


def catalog_variants_for_player(player):
    variants = {normalize_for_match(player["name"]), player["name"].strip().lower()}
    for alias in player.get("aliases", []):
        variants.add(normalize_for_match(alias))
        variants.add(str(alias).strip().lower().replace("_", " ").replace("-", " "))
    return sorted(value for value in variants if value)


def count_player_games(db, variants):
    if not variants:
        return 0
    player_sql = placeholders("player", variants)
    params = bind_values("player", variants)
    white = sql_player_name("white")
    black = sql_player_name("black")
    return int(db.execute(text(f"""
        SELECT COUNT(*)
        FROM imported_games
        WHERE {white} IN ({player_sql}) OR {black} IN ({player_sql})
    """), params).scalar() or 0)


def count_chesscom_master_games(db, player_slug, variants):
    linked_count = int(db.execute(text("""
        SELECT COUNT(*)
        FROM imported_game_player_sources
        WHERE player_slug = :player_slug
          AND source = 'chesscom-master'
    """), {"player_slug": player_slug}).scalar() or 0)
    if linked_count:
        return linked_count

    object_key = f"pgn-imports/chesscom-master/{player_slug}/master-games.pgn"
    updates_prefix = f"pgn-imports/chesscom-master/{player_slug}/updates/%"
    file_rows = [
        row[0]
        for row in db.execute(text("""
            SELECT object_key
            FROM imported_pgn_files
            WHERE object_key = :object_key OR object_key LIKE :updates_prefix
        """), {"object_key": object_key, "updates_prefix": updates_prefix}).all()
    ]
    object_keys = file_rows
    if object_key not in object_keys:
        object_keys.insert(0, object_key)
    if not object_keys:
        return 0

    object_key_params = {
        f"object_key_{index}": value
        for index, value in enumerate(object_keys)
    }
    object_key_sql = ", ".join(f":object_key_{index}" for index in range(len(object_keys)))
    return int(db.execute(text("""
        SELECT COUNT(*)
        FROM (
            SELECT DISTINCT ON (white, black, game_date, result, md5(COALESCE(moves, ''))) id
            FROM imported_games
            WHERE pgn_object_key IN (""" + object_key_sql + """)
              AND white <> 'Unknown'
              AND black <> 'Unknown'
            ORDER BY
              white, black, game_date, result, md5(COALESCE(moves, '')),
              CASE WHEN pgn_object_key = :object_key THEN 0 ELSE 1 END,
              id
        ) unique_games
    """), {"object_key": object_key, **object_key_params}).scalar() or 0)


def sync_player_catalog(db):
    tracked_usernames = load_tracked_usernames()
    seen_names = set()
    existing_by_name = {
        player.name: player
        for player in db.query(models.Player).all()
    }

    for player in HISTORICAL_PLAYERS:
        name = player["name"]
        seen_names.add(name)
        variants = catalog_variants_for_player(player)
        record = existing_by_name.get(name)
        if not record:
            record = models.Player(name=name)
            db.add(record)
            existing_by_name[name] = record

        record.slug = slugify_player_name(name)
        record.chesscom_username = tracked_usernames.get(name)
        record.chesscom_master_slug = slugify_player_name(name)
        record.aliases = json.dumps(variants, ensure_ascii=False)
        record.games = count_chesscom_master_games(db, record.chesscom_master_slug, variants)
        record.is_catalog = True

    if seen_names:
        db.query(models.Player).filter(~models.Player.name.in_(seen_names)).update(
            {models.Player.is_catalog: False},
            synchronize_session=False,
        )

    db.commit()
