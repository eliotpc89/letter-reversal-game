// Sound-check page: QA grid for the short-vowel audio clips. Loads the
// runtime content pack (public/content) exactly like the games do, so the
// clips heard here are the clips the games play.
import "./src/theme.css";

type PhonicsCorePack = {
  id: string;
  version: number;
  shortO: string[];
  shortU: string[];
};

type CheckWord = { word: string; vowel: "o" | "u" };

async function loadWords(): Promise<CheckWord[]> {
  const response = await fetch("./content/packs/phonics-core.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`pack fetch failed (${response.status})`);
  const pack = (await response.json()) as PhonicsCorePack;
  return [
    ...pack.shortO.map((word) => ({ word, vowel: "o" as const })),
    ...pack.shortU.map((word) => ({ word, vowel: "u" as const })),
  ].sort((a, b) => a.vowel.localeCompare(b.vowel) || a.word.localeCompare(b.word));
}

function render(words: CheckWord[], root: HTMLDivElement) {
  root.innerHTML = `
  <div class="sound-check-shell">
    <header class="sound-check-header">
      <div>
        <p class="sound-check-kicker">MILES' PHONICS ARCADE</p>
        <h1>Sound check</h1>
        <p>Tap a word to hear the exact clip used in Sound Blaster.</p>
      </div>
      <a class="sound-check-back" href="./index.html">Back to game</a>
    </header>
    <section class="sound-check-card" aria-labelledby="sound-check-title">
      <div class="sound-check-summary"><strong id="sound-check-title">${words.length} short-vowel clips</strong><span>O and U words · ${words.filter(({ vowel }) => vowel === "o").length} ŏ · ${words.filter(({ vowel }) => vowel === "u").length} ŭ</span></div>
      <div class="sound-check-grid">
        ${words.map(({ word, vowel }) => `<button class="sound-check-word vowel-${vowel}" data-word="${word}" type="button"><span>${word}</span><small>${vowel === "o" ? "ŏ" : "ŭ"}</small><b>▶</b></button>`).join("")}
      </div>
    </section>
  </div>
`;

  let activeAudio: HTMLAudioElement | null = null;
  root.querySelectorAll<HTMLButtonElement>(".sound-check-word").forEach((button) => {
    button.addEventListener("click", () => {
      const word = button.dataset.word ?? "";
      if (!word) return;
      activeAudio?.pause();
      activeAudio = new Audio(`./content/audio/${word}.mp3`);
      button.classList.add("playing");
      activeAudio.addEventListener("ended", () => button.classList.remove("playing"), { once: true });
      void activeAudio.play().catch(() => button.classList.remove("playing"));
    });
  });
}

const root = document.querySelector<HTMLDivElement>("#sound-check");
if (!root) throw new Error("Sound check root is missing");

loadWords()
  .then((words) => render(words, root))
  .catch(() => {
    root.innerHTML = `<div class="sound-check-shell"><p class="stats-loading">Couldn’t load the word pack. Open the game first so content is cached, then try again.</p></div>`;
  });
