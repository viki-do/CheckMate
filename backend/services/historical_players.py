import re
import unicodedata
from pathlib import Path
import json


CURATED_NAMES_FILE = Path(__file__).resolve().parents[1] / "data" / "curated_player_names.json"
TRACKED_CHESSCOM_PLAYERS_FILE = Path(__file__).resolve().parents[1] / "data" / "tracked_chesscom_players.json"

MANUAL_ALIASES = {
    "Magnus Carlsen": ["magnuscarlsen", "carlsen m"],
    "Hikaru Nakamura": ["hikaru", "nakamura h"],
    "Fabiano Caruana": ["fabianocaruana", "caruana f"],
    "Alireza Firouzja": ["firouzja2003", "firouzja a"],
    "Wesley So": ["gmwso", "so w"],
    "Jan-Krzysztof Duda": ["polish_fighter3000", "polish fighter3000", "duda j"],
    "Ian Nepomniachtchi": ["lachesisq", "nepomniachtchi i"],
    "Nihal Sarin": ["junglebook1", "sarin n"],
    "Viswanathan Anand": ["vishy anand", "anand v"],
    "Maxime Vachier-Lagrave": ["mvl", "vachier lagrave maxime"],
    "Gukesh Dommaraju": ["gukesh d", "gukesh"],
    "Praggnanandhaa Rameshbabu": ["praggnanandhaa", "praggnanandhaa r"],
    "Leinier Dominguez Perez": ["leinier dominguez", "dominguez leinier"],
    "Le Quang Liem": ["liem le", "liem le quang"],
    "Yagiz Kaan Erdogmus": ["yagiz erdogmus", "erdogmus y"],
    "Vidit Gujrathi": ["vidit", "vidit santosh gujrathi"],
    "Aravindh Chithambaram": ["aravindh", "aravindh chithambaram v r"],
    "Harikrishna Pentala": ["harikrishna"],
    "Javokhir Sindarov": ["javokhir_sindarov05", "sindarovjr", "sindarovgm05", "sindarovgm2005"],
}


def load_curated_player_names():
    with CURATED_NAMES_FILE.open("r", encoding="utf-8") as file_obj:
        return json.load(file_obj)


def load_tracked_chesscom_aliases():
    if not TRACKED_CHESSCOM_PLAYERS_FILE.exists():
        return {}

    with TRACKED_CHESSCOM_PLAYERS_FILE.open("r", encoding="utf-8") as file_obj:
        players = json.load(file_obj)

    aliases = {}
    for player in players:
        name = str(player.get("name") or "").strip()
        username = str(player.get("username") or "").strip()
        if not name or not username:
            continue
        aliases.setdefault(name, set()).add(username)
        aliases[name].add(username.replace("_", " "))
        aliases[name].add(username.replace("-", " "))
    return aliases


def build_player_entries():
    entries = []
    tracked_aliases = load_tracked_chesscom_aliases()
    for name in load_curated_player_names():
        parts = name.split()
        aliases = {
            name,
            " ".join(reversed(parts)) if len(parts) == 2 else "",
        }
        if len(parts) >= 2:
            aliases.add(f"{parts[-1]} {' '.join(parts[:-1])}")
            aliases.add(f"{parts[-1]} {parts[0][0]}")
        aliases.update(MANUAL_ALIASES.get(name, []))
        aliases.update(tracked_aliases.get(name, []))
        entries.append({
            "name": name,
            "aliases": sorted(alias for alias in aliases if alias),
        })
    return entries


HISTORICAL_PLAYERS = build_player_entries()

LEGACY_HISTORICAL_PLAYERS = [
    {
        "name": "Garry Kasparov",
        "aliases": ["garry kasparov", "gary kasparov", "kasparov garry", "kasparov g"],
    },
    {
        "name": "Magnus Carlsen",
        "aliases": ["magnus carlsen", "magnuscarlsen", "carlsen magnus", "carlsen m"],
    },
    {
        "name": "Bobby Fischer",
        "aliases": [
            "bobby fischer",
            "robert james fischer",
            "robert j fischer",
            "robert fischer",
            "fischer",
            "fischer bobby",
            "fischer robert",
            "fischer robert james",
            "fischer robert j",
            "fischer r",
        ],
    },
    {
        "name": "Jose Raul Capablanca",
        "aliases": ["jose raul capablanca", "capablanca jose raul", "capablanca j r", "capablanca jr"],
    },
    {
        "name": "Paul Morphy",
        "aliases": ["paul morphy", "morphy paul", "morphy p"],
    },
    {
        "name": "Anatoly Karpov",
        "aliases": ["anatoly karpov", "karpov anatoly", "karpov a", "karpov ana"],
    },
    {
        "name": "Mikhail Botvinnik",
        "aliases": ["mikhail botvinnik", "botvinnik mikhail", "botvinnik m", "botvinnik mikhail2"],
    },
    {
        "name": "Vladimir Kramnik",
        "aliases": [
            "vladimir kramnik",
            "vladimirkramnik",
            "kramnik vladimir",
            "kramnikvladimir",
            "kramnik v",
        ],
    },
    {
        "name": "Emanuel Lasker",
        "aliases": ["emanuel lasker", "emmanuel lasker", "lasker emanuel", "lasker e"],
    },
    {
        "name": "Mikhail Tal",
        "aliases": ["mikhail tal", "mihail tal", "tal mikhail", "tal m"],
    },
    {
        "name": "Alexander Alekhine",
        "aliases": ["alexander alekhine", "alexandre alekhine", "alekhine alexander", "alekhine a"],
    },
    {
        "name": "Hikaru Nakamura",
        "aliases": ["hikaru nakamura", "hikaru", "nakamura hikaru", "nakamura h"],
    },
    {
        "name": "Fabiano Caruana",
        "aliases": ["fabiano caruana", "fabianocaruana", "caruana fabiano", "caruana f"],
    },
    {
        "name": "Nodirbek Abdusattorov",
        "aliases": ["nodirbek abdusattorov", "abdusattorov nodirbek", "abdusattorov n"],
    },
    {
        "name": "Javokhir Sindarov",
        "aliases": ["javokhir sindarov", "sindarov javokhir", "sindarov j"],
    },
    {
        "name": "Anish Giri",
        "aliases": ["anish giri", "giri anish", "giri a"],
    },
    {
        "name": "Vincent Keymer",
        "aliases": ["vincent keymer", "keymer vincent", "keymer v"],
    },
    {
        "name": "Alireza Firouzja",
        "aliases": ["alireza firouzja", "firouzja2003", "firouzja alireza", "firouzja a"],
    },
    {
        "name": "Wesley So",
        "aliases": ["wesley so", "gmwso", "so wesley", "so w"],
    },
    {
        "name": "Wei Yi",
        "aliases": ["wei yi", "yi wei"],
    },
    {
        "name": "Arjun Erigaisi",
        "aliases": ["arjun erigaisi", "erigaisi arjun", "erigaisi a"],
    },
    {
        "name": "Jan-Krzysztof Duda",
        "aliases": ["jan krzysztof duda", "jan-krzysztof duda", "polish fighter3000", "polish_fighter3000", "duda jan krzysztof", "duda j"],
    },
    {
        "name": "Viswanathan Anand",
        "aliases": ["viswanathan anand", "vishy anand", "anand viswanathan", "anand v"],
    },
    {
        "name": "Ding Liren",
        "aliases": ["ding liren", "liren ding", "ding l"],
    },
    {
        "name": "Jorden van Foreest",
        "aliases": ["jorden van foreest", "van foreest jorden", "jorden v foreest", "foreest jorden"],
    },
    {
        "name": "Praggnanandhaa Rameshbabu",
        "aliases": ["praggnanandhaa rameshbabu", "rameshbabu praggnanandhaa", "praggnanandhaa", "praggnanandhaa r"],
    },
    {
        "name": "Gukesh Dommaraju",
        "aliases": ["gukesh dommaraju", "gukesh d", "gukesh", "dommaraju gukesh"],
    },
    {
        "name": "Leinier Dominguez Perez",
        "aliases": ["leinier dominguez perez", "leinier dominguez", "dominguez perez leinier", "dominguez leinier"],
    },
    {
        "name": "Le Quang Liem",
        "aliases": ["le quang liem", "quang liem le", "liem le quang", "liem le"],
    },
    {
        "name": "Richard Rapport",
        "aliases": ["richard rapport", "rapport richard", "rapport r"],
    },
    {
        "name": "Ian Nepomniachtchi",
        "aliases": ["ian nepomniachtchi", "lachesisq", "nepomniachtchi ian", "nepomniachtchi i"],
    },
    {
        "name": "Hans Niemann",
        "aliases": ["hans niemann", "niemann hans", "niemann h"],
    },
    {
        "name": "Levon Aronian",
        "aliases": ["levon aronian", "aronian levon", "aronian l"],
    },
    {
        "name": "Nihal Sarin",
        "aliases": ["nihal sarin", "junglebook1", "sarin nihal", "sarin n"],
    },
    {
        "name": "Awonder Liang",
        "aliases": ["awonder liang", "liang awonder", "liang a"],
    },
    {
        "name": "Shakhriyar Mamedyarov",
        "aliases": ["shakhriyar mamedyarov", "mamedyarov shakhriyar", "mamedyarov s"],
    },
    {
        "name": "Maxime Vachier-Lagrave",
        "aliases": ["maxime vachier lagrave", "maxime vachier-lagrave", "mvl", "vachier lagrave maxime"],
    },
    {
        "name": "Amin Tabatabaei",
        "aliases": ["amin tabatabaei", "tabatabaei amin", "tabatabaei a"],
    },
    {
        "name": "Yu Yangyi",
        "aliases": ["yu yangyi", "yangyi yu"],
    },
    {
        "name": "Parham Maghsoodloo",
        "aliases": ["parham maghsoodloo", "maghsoodloo parham", "maghsoodloo p"],
    },
    {
        "name": "Dmitry Andreikin",
        "aliases": ["dmitry andreikin", "dmitrii andreikin", "andreikin dmitry", "andreikin d"],
    },
    {
        "name": "Yagiz Kaan Erdogmus",
        "aliases": ["yagiz kaan erdogmus", "yagiz erdogmus", "erdogmus yagiz kaan", "erdogmus y"],
    },
    {
        "name": "Vidit Gujrathi",
        "aliases": ["vidit gujrathi", "vidit santosh gujrathi", "gujrathi vidit", "vidit"],
    },
    {
        "name": "Vladimir Fedoseev",
        "aliases": ["vladimir fedoseev", "fedoseev vladimir", "fedoseev v"],
    },
    {
        "name": "Sam Sevian",
        "aliases": ["sam sevian", "samuel sevian", "sevian sam", "sevian s"],
    },
    {
        "name": "Veselin Topalov",
        "aliases": ["veselin topalov", "topalov veselin", "topalov v"],
    },
    {
        "name": "Matthias Bluebaum",
        "aliases": ["matthias bluebaum", "bluebaum matthias", "bluebaum m"],
    },
    {
        "name": "Aravindh Chithambaram",
        "aliases": ["aravindh chithambaram", "aravindh chithambaram v r", "chithambaram aravindh", "aravindh"],
    },
    {
        "name": "Nodirbek Yakubboev",
        "aliases": ["nodirbek yakubboev", "yakubboev nodirbek", "yakubboev n"],
    },
    {
        "name": "Teimour Radjabov",
        "aliases": ["teimour radjabov", "teimur radjabov", "radjabov teimour", "radjabov t"],
    },
    {
        "name": "Andrey Esipenko",
        "aliases": ["andrey esipenko", "andrei esipenko", "esipenko andrey", "esipenko a"],
    },
    {
        "name": "Wang Hao",
        "aliases": ["wang hao", "hao wang"],
    },
    {
        "name": "Peter Svidler",
        "aliases": ["peter svidler", "svidler peter", "svidler p"],
    },
    {
        "name": "Harikrishna Pentala",
        "aliases": ["harikrishna pentala", "pentala harikrishna", "harikrishna"],
    },
    {
        "name": "Peter Leko",
        "aliases": ["peter leko", "leko peter", "leko p"],
    },
    {
        "name": "Pavel Eljanov",
        "aliases": ["pavel eljanov", "eljanov pavel", "eljanov p"],
    },
    {
        "name": "Igor Kovalenko",
        "aliases": ["igor kovalenko", "kovalenko igor", "kovalenko i"],
    },
    {
        "name": "Nikita Vitiugov",
        "aliases": ["nikita vitiugov", "vitiugov nikita", "vitiugov n"],
    },
    {
        "name": "Aydin Suleymanli",
        "aliases": ["aydin suleymanli", "suleymanli aydin", "suleymanli a"],
    },
    {
        "name": "David Howell",
        "aliases": ["david howell", "howell david", "howell d"],
    },
    {
        "name": "Rustam Kasimdzhanov",
        "aliases": ["rustam kasimdzhanov", "kasimdzhanov rustam", "kasimdzhanov r"],
    },
]


def normalize_for_match(value):
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"\([^)]*\)", " ", text)
    text = text.replace(",", " ")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text)
    return " ".join(text.lower().split())


def normalize_player_name(name):
    normalized = normalize_for_match(name)
    if not normalized:
        return name

    for player in HISTORICAL_PLAYERS:
        for alias in player["aliases"]:
            if normalize_for_match(alias) == normalized:
                return player["name"]

    for player in HISTORICAL_PLAYERS:
        canonical_parts = normalize_for_match(player["name"]).split()
        if canonical_parts and all(part in normalized.split() for part in canonical_parts):
            return player["name"]

    return name
