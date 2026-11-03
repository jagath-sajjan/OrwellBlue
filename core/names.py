"""Random agent codename generation."""

from __future__ import annotations

import secrets

_ADJECTIVES: tuple[str, ...] = (
    "swift",
    "silent",
    "cosmic",
    "neon",
    "crimson",
    "shadow",
    "quantum",
    "feral",
    "lunar",
    "voltaic",
    "astral",
    "grim",
    "prism",
    "ember",
    "null",
    "onyx",
)

_NOUNS: tuple[str, ...] = (
    "fox",
    "raven",
    "viper",
    "falcon",
    "wolf",
    "badger",
    "comet",
    "drone",
    "otter",
    "lynx",
    "cobra",
    "wren",
    "harpy",
    "golem",
    "nomad",
    "ranger",
)


def random_agent_name() -> str:
    """Return a unique, human-friendly agent codename."""
    adjective = secrets.choice(_ADJECTIVES)
    noun = secrets.choice(_NOUNS)
    suffix = secrets.token_hex(2)
    return f"{adjective}-{noun}-{suffix}"
