import io
import re
import time
from datetime import datetime

import chess.pgn
from sqlalchemy import tuple_
from sqlalchemy.exc import OperationalError

import models
from services.historical_players import normalize_player_name


def clean_tag(value, default=None):
    if value in (None, "", "?"):
        return default
    return str(value).strip()


def int_tag(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_game_date(value):
    clean_value = clean_tag(value)
    if not clean_value:
        return None
    if re.match(r"^\d{4}([.-]\d{2}([.-]\d{2})?)?$", clean_value):
        return clean_value.replace("-", ".")

    for date_format in ("%a %b %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(clean_value, date_format).strftime("%Y.%m.%d")
        except ValueError:
            pass

    return None


def normalize_pgn_text(text):
    return re.sub(
        r"((?:\[[^\n]*\]\r?\n)+)\r?\n{2,}(?=\s*(?:\d+\.|1-0|0-1|1/2-1/2|\*))",
        r"\1\n",
        text,
    )


def get_game_identity(game):
    link = clean_tag(game.headers.get("Link"))
    if link:
        return link

    site = clean_tag(game.headers.get("Site"))
    return site if site and site.startswith("http") else None


def get_existing_game_identities(db, identities, pgn_object_key=None):
    clean_identities = list({identity for identity in identities if identity})
    if not clean_identities:
        return set()
    query = db.query(models.ImportedGame.source).filter(models.ImportedGame.source.in_(clean_identities))
    if pgn_object_key is not None:
        query = query.filter(models.ImportedGame.pgn_object_key == pgn_object_key)
    rows = query.all()
    return {row.source for row in rows if row.source}


def get_game_signature(game):
    return (
        game.white,
        game.black,
        game.game_date,
        game.result,
        game.moves,
    )


def extract_game_id(value):
    if not value:
        return None
    match = re.search(r"(\d{6,})", str(value))
    return match.group(1) if match else None


def find_existing_imported_game(db, imported_game):
    return db.query(models.ImportedGame).filter(
        models.ImportedGame.white == imported_game.white,
        models.ImportedGame.black == imported_game.black,
        models.ImportedGame.game_date == imported_game.game_date,
        models.ImportedGame.result == imported_game.result,
        models.ImportedGame.moves == imported_game.moves,
    ).first()


def save_linked_player_batch(db, batch, player_slug, pgn_object_key, source="chesscom-master"):
    imported_links = 0
    duplicates = 0
    seen_signatures = set()

    for imported_game in batch:
        signature = get_game_signature(imported_game)
        if signature in seen_signatures:
            duplicates += 1
            continue
        seen_signatures.add(signature)

        game = find_existing_imported_game(db, imported_game)
        if not game:
            db.add(imported_game)
            db.flush()
            game = imported_game

        existing_link = db.query(models.ImportedGamePlayerSource).filter(
            models.ImportedGamePlayerSource.game_id == game.id,
            models.ImportedGamePlayerSource.player_slug == player_slug,
            models.ImportedGamePlayerSource.source == source,
        ).first()
        if existing_link:
            duplicates += 1
            continue

        db.add(models.ImportedGamePlayerSource(
            game_id=game.id,
            player_slug=player_slug,
            source=source,
            source_object_key=pgn_object_key,
            source_game_id=extract_game_id(imported_game.source),
        ))
        imported_links += 1

    db.commit()
    return imported_links, duplicates


def save_chesscom_master_batch(db, batch, player_slug, pgn_object_key):
    return save_linked_player_batch(
        db,
        batch,
        player_slug,
        pgn_object_key,
        source="chesscom-master",
    )


def remove_existing_game_duplicates(db, batch):
    clean_batch = []
    seen_signatures = set()
    duplicates = 0

    for game in batch:
        signature = get_game_signature(game)
        if signature in seen_signatures:
            duplicates += 1
            continue
        seen_signatures.add(signature)
        clean_batch.append(game)

    if not clean_batch:
        return clean_batch, duplicates

    rows = (
        db.query(
            models.ImportedGame.white,
            models.ImportedGame.black,
            models.ImportedGame.game_date,
            models.ImportedGame.result,
            models.ImportedGame.moves,
        )
        .filter(tuple_(
            models.ImportedGame.white,
            models.ImportedGame.black,
            models.ImportedGame.game_date,
            models.ImportedGame.result,
            models.ImportedGame.moves,
        ).in_([get_game_signature(game) for game in clean_batch]))
        .all()
    )
    existing_signatures = {tuple(row) for row in rows}
    if not existing_signatures:
        return clean_batch, duplicates

    unique_batch = []
    for game in clean_batch:
        if get_game_signature(game) in existing_signatures:
            duplicates += 1
        else:
            unique_batch.append(game)
    return unique_batch, duplicates


def build_imported_game(game, pgn_object_key=None):
    headers = game.headers
    exporter = chess.pgn.StringExporter(headers=False, variations=False, comments=False)
    moves = game.accept(exporter).strip()
    ply_count = int_tag(headers.get("PlyCount"))
    if ply_count is None:
        ply_count = sum(1 for _ in game.mainline_moves())

    eco = clean_tag(headers.get("ECO"))
    opening = (
        clean_tag(headers.get("Opening")) or
        clean_tag(headers.get("Variation")) or
        eco or
        "Unknown"
    )
    source = (
        clean_tag(headers.get("Link")) or
        clean_tag(headers.get("Source")) or
        get_game_identity(game)
    )

    return models.ImportedGame(
        event=clean_tag(headers.get("Event")),
        site=clean_tag(headers.get("Site")),
        game_date=normalize_game_date(headers.get("Date")),
        round=clean_tag(headers.get("Round")),
        white=normalize_player_name(clean_tag(headers.get("White"), "Unknown")),
        black=normalize_player_name(clean_tag(headers.get("Black"), "Unknown")),
        result=clean_tag(headers.get("Result")),
        white_elo=int_tag(headers.get("WhiteElo")),
        black_elo=int_tag(headers.get("BlackElo")),
        eco=eco,
        opening=opening,
        ply_count=ply_count,
        source=source,
        pgn_object_key=pgn_object_key,
        moves=moves,
        pgn=None,
    )


def is_allowed_imported_game(game, allowed_player_names=None):
    if game.white == "Unknown" or game.black == "Unknown":
        return False
    if not allowed_player_names:
        return True
    return game.white in allowed_player_names and game.black in allowed_player_names


def save_batch(db, batch, retries=3):
    for attempt in range(1, retries + 1):
        try:
            db.bulk_save_objects(batch)
            db.commit()
            return len(batch)
        except OperationalError:
            db.rollback()
            if attempt == retries:
                raise
            try:
                db.get_bind().dispose()
            except Exception:
                pass
            time.sleep(attempt * 2)
    return 0


def remove_existing_site_duplicates(db, batch, pgn_object_key=None):
    identities = [game.source for game in batch if game.source]
    existing_identities = get_existing_game_identities(db, identities, pgn_object_key=pgn_object_key)
    if not existing_identities:
        return batch, 0

    clean_batch = []
    duplicates = 0
    for game in batch:
        if game.source and game.source in existing_identities:
            duplicates += 1
        else:
            clean_batch.append(game)
    return clean_batch, duplicates


def import_pgn_stream(
    file_obj,
    db,
    pgn_object_key=None,
    batch_size=100,
    dedupe_by_site=False,
    dedupe_by_signature=True,
    allowed_player_names=None,
    chesscom_player_slug=None,
    linked_player_slug=None,
    linked_source="chesscom-master",
):
    imported = 0
    skipped = 0
    duplicates = 0
    batch = []
    seen_sites = set()
    active_linked_player_slug = linked_player_slug or chesscom_player_slug

    text = file_obj.read().decode("utf-8", errors="replace")
    text_file = io.StringIO(normalize_pgn_text(text))

    while True:
        game = chess.pgn.read_game(text_file)
        if game is None:
            break

        try:
            if dedupe_by_site:
                identity = get_game_identity(game)
                if identity and identity in seen_sites:
                    duplicates += 1
                    continue
                if identity:
                    seen_sites.add(identity)
            imported_game = build_imported_game(game, pgn_object_key=pgn_object_key)
            if not imported_game.ply_count:
                skipped += 1
                continue
            if not is_allowed_imported_game(imported_game, allowed_player_names):
                skipped += 1
                continue
            batch.append(imported_game)
        except Exception:
            skipped += 1
            continue

        if len(batch) >= batch_size:
            if active_linked_player_slug:
                imported_count, duplicate_count = save_linked_player_batch(
                    db,
                    batch,
                    active_linked_player_slug,
                    pgn_object_key,
                    source=linked_source,
                )
                imported += imported_count
                duplicates += duplicate_count
                batch.clear()
                continue
            if dedupe_by_site:
                batch, duplicate_count = remove_existing_site_duplicates(db, batch, pgn_object_key=pgn_object_key)
                duplicates += duplicate_count
            if dedupe_by_signature:
                batch, duplicate_count = remove_existing_game_duplicates(db, batch)
                duplicates += duplicate_count
            imported += save_batch(db, batch)
            batch.clear()

            if imported and imported % 10000 == 0:
                print(f"Indexed {imported} games from current file...", flush=True)

    if batch:
        if active_linked_player_slug:
            imported_count, duplicate_count = save_linked_player_batch(
                db,
                batch,
                active_linked_player_slug,
                pgn_object_key,
                source=linked_source,
            )
            imported += imported_count
            duplicates += duplicate_count
            batch.clear()
            return {"imported": imported, "skipped": skipped, "duplicates": duplicates}
        if dedupe_by_site:
            batch, duplicate_count = remove_existing_site_duplicates(db, batch, pgn_object_key=pgn_object_key)
            duplicates += duplicate_count
        if dedupe_by_signature:
            batch, duplicate_count = remove_existing_game_duplicates(db, batch)
            duplicates += duplicate_count
        imported += save_batch(db, batch)

    return {"imported": imported, "skipped": skipped, "duplicates": duplicates}


def import_pgn_path(
    path,
    db,
    pgn_object_key=None,
    batch_size=100,
    dedupe_by_site=False,
    dedupe_by_signature=True,
    allowed_player_names=None,
    chesscom_player_slug=None,
    linked_player_slug=None,
    linked_source="chesscom-master",
):
    with open(path, "rb") as file_obj:
        return import_pgn_stream(
            file_obj,
            db,
            pgn_object_key=pgn_object_key,
            batch_size=batch_size,
            dedupe_by_site=dedupe_by_site,
            dedupe_by_signature=dedupe_by_signature,
            allowed_player_names=allowed_player_names,
            chesscom_player_slug=chesscom_player_slug,
            linked_player_slug=linked_player_slug,
            linked_source=linked_source,
        )
