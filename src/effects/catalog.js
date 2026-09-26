// Tempo Fly effects catalog, grouped into themed folders for the popup.
//
// Two kinds of effect:
//   - kind: "clip"  — a short voice clip (trending TikTok phrases). The audio
//                     file lives in assets/effects/<id>.mp3 and must be cleared
//                     with the creator before it ships; see assets/effects/README.md.
//                     Clips whose file is missing are hidden automatically.
//   - kind: "synth" — generated live with Web Audio (see synth.js). No licensing
//                     needed, always available.

export const EFFECT_FOLDERS = [
  {
    id: "oops",
    name: "Oops & Apologies",
    emoji: "🙈",
    effects: [
      { id: "sorryyy", label: "Sorryyy…", kind: "clip", credit: "@justbusyent" },
      { id: "oh-no", label: "Oh no, oh no, oh no no no", kind: "clip", credit: "TikTok trend" },
      { id: "emotional-damage", label: "Emotional damage!", kind: "clip", credit: "Steven He" },
    ],
  },
  {
    id: "hype",
    name: "Crowd Hype",
    emoji: "🔥",
    effects: [
      { id: "waheyy", label: "Waheyy!", kind: "clip", credit: "@gymskin" },
      { id: "sheesh", label: "Sheeeesh", kind: "clip", credit: "TikTok trend" },
      { id: "let-him-cook", label: "Let him cook", kind: "clip", credit: "TikTok trend" },
    ],
  },
  {
    id: "reactions",
    name: "Reactions",
    emoji: "😳",
    effects: [
      { id: "bruh", label: "Bruh", kind: "clip", credit: "TikTok trend" },
      { id: "chat-is-this-real", label: "Chat, is this real?", kind: "clip", credit: "TikTok trend" },
      { id: "eww-brother", label: "Eww brother, eww", kind: "clip", credit: "TikTok trend" },
    ],
  },
  {
    id: "vibes",
    name: "Vibes",
    emoji: "✨",
    effects: [
      { id: "very-demure", label: "Very demure, very mindful", kind: "clip", credit: "Jools Lebron" },
      { id: "its-corn", label: "It's corn!", kind: "clip", credit: "Tariq / Recess Therapy" },
    ],
  },
  {
    id: "dj",
    name: "DJ Tools",
    emoji: "🎛️",
    effects: [
      { id: "airhorn", label: "Air horn", kind: "synth" },
      { id: "siren", label: "Dub siren", kind: "synth" },
      { id: "riser", label: "White-noise riser", kind: "synth" },
      { id: "rewind", label: "Rewind", kind: "synth" },
      { id: "laser", label: "Laser zap", kind: "synth" },
      { id: "sub-drop", label: "Sub drop", kind: "synth" },
    ],
  },
];

export function clipUrl(effect) {
  return chrome.runtime.getURL(`assets/effects/${effect.id}.mp3`);
}

// Returns the folders with unavailable clips removed (and empty folders dropped),
// so the popup never shows a button that can't play.
export async function availableFolders() {
  const folders = await Promise.all(
    EFFECT_FOLDERS.map(async (folder) => {
      const effects = await Promise.all(
        folder.effects.map(async (effect) => {
          if (effect.kind !== "clip") return effect;
          try {
            const res = await fetch(clipUrl(effect), { method: "HEAD" });
            return res.ok ? effect : null;
          } catch {
            return null;
          }
        })
      );
      return { ...folder, effects: effects.filter(Boolean) };
    })
  );
  return folders.filter((folder) => folder.effects.length > 0);
}
