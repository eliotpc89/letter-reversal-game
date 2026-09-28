import { VOWEL_AUDIO } from "./src/assets/vowels";
import { SHORT_O_WORDS, SHORT_U_WORDS } from "./src/App";
import "./src/theme.css";

const words = [
  ...SHORT_O_WORDS.map((word) => ({ word, vowel: "o" as const })),
  ...SHORT_U_WORDS.map((word) => ({ word, vowel: "u" as const })),
].sort((a, b) => a.vowel.localeCompare(b.vowel) || a.word.localeCompare(b.word));

const root = document.querySelector<HTMLDivElement>("#sound-check");
if (!root) throw new Error("Sound check root is missing");

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
        ${words.map(({ word, vowel }) => `<button class="sound-check-word vowel-${vowel}" data-word="${word}" data-vowel="${vowel}" type="button"><span>${word}</span><small>${vowel === "o" ? "ŏ" : "ŭ"}</small><b>▶</b></button>`).join("")}
      </div>
    </section>
  </div>
`;

let activeAudio: HTMLAudioElement | null = null;
root.querySelectorAll<HTMLButtonElement>(".sound-check-word").forEach((button) => {
  button.addEventListener("click", () => {
    const word = button.dataset.word ?? "";
    const audio = VOWEL_AUDIO[word as keyof typeof VOWEL_AUDIO];
    if (!audio) return;
    activeAudio?.pause();
    activeAudio = new Audio(audio);
    button.classList.add("playing");
    activeAudio.addEventListener("ended", () => button.classList.remove("playing"), { once: true });
    void activeAudio.play().catch(() => button.classList.remove("playing"));
  });
});
