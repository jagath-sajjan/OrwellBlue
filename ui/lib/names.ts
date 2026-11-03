const ADJECTIVES = [
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
];

const NOUNS = [
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
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomAgentName(): string {
  const adjective = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${adjective}-${noun}-${suffix}`;
}
