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
    return f"replace(replace(replace(lower({column}), '_', ' '), '-', ' '), ',', ' ')"


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
        record.games = count_player_games(db, variants)
        record.is_catalog = True

    if seen_names:
        db.query(models.Player).filter(~models.Player.name.in_(seen_names)).update(
            {models.Player.is_catalog: False},
            synchronize_session=False,
        )

    db.commit()
