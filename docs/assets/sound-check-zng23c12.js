async function n(){let i=await fetch("./content/packs/phonics-core.json",{cache:"no-store"});if(!i.ok)throw Error(`pack fetch failed (${i.status})`);let r=await i.json();return[...r.shortO.map((t)=>({word:t,vowel:"o"})),...r.shortU.map((t)=>({word:t,vowel:"u"}))].sort((t,e)=>t.vowel.localeCompare(e.vowel)||t.word.localeCompare(e.word))}function s(i,r){r.innerHTML=`
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
      <div class="sound-check-summary"><strong id="sound-check-title">${i.length} short-vowel clips</strong><span>O and U words · ${i.filter(({vowel:e})=>e==="o").length} ŏ · ${i.filter(({vowel:e})=>e==="u").length} ŭ</span></div>
      <div class="sound-check-grid">
        ${i.map(({word:e,vowel:o})=>`<button class="sound-check-word vowel-${o}" data-word="${e}" type="button"><span>${e}</span><small>${o==="o"?"ŏ":"ŭ"}</small><b>▶</b></button>`).join("")}
      </div>
    </section>
  </div>
`;let t=null;r.querySelectorAll(".sound-check-word").forEach((e)=>{e.addEventListener("click",()=>{let o=e.dataset.word??"";if(!o)return;t?.pause(),t=new Audio(`./content/audio/${o}.mp3`),e.classList.add("playing"),t.addEventListener("ended",()=>e.classList.remove("playing"),{once:!0}),t.play().catch(()=>e.classList.remove("playing"))})})}var a=document.querySelector("#sound-check");if(!a)throw Error("Sound check root is missing");n().then((i)=>s(i,a)).catch(()=>{a.innerHTML='<div class="sound-check-shell"><p class="stats-loading">Couldn’t load the word pack. Open the game first so content is cached, then try again.</p></div>'});
