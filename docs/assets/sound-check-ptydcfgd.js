async function n(){let r=await fetch("./content/packs/phonics-core.json",{cache:"no-store"});if(!r.ok)throw Error(`pack fetch failed (${r.status})`);let i=await r.json();return[...i.shortO.map((t)=>({word:t,vowel:"o"})),...i.shortU.map((t)=>({word:t,vowel:"u"}))].sort((t,e)=>t.vowel.localeCompare(e.vowel)||t.word.localeCompare(e.word))}function s(r,i){i.innerHTML=`
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
      <div class="sound-check-summary"><strong id="sound-check-title">${r.length} short-vowel clips</strong><span>O and U words · ${r.filter(({vowel:e})=>e==="o").length} ŏ · ${r.filter(({vowel:e})=>e==="u").length} ŭ</span></div>
      <div class="sound-check-grid">
        ${r.map(({word:e,vowel:a})=>`<button class="sound-check-word vowel-${a}" data-word="${e}" type="button"><span>${e}</span><small>${a==="o"?"ŏ":"ŭ"}</small><b>▶</b></button>`).join("")}
      </div>
    </section>
  </div>
`;let t=null;i.querySelectorAll(".sound-check-word").forEach((e)=>{e.addEventListener("click",()=>{let a=e.dataset.word??"";if(!a)return;t?.pause(),t=new Audio(`./content/audio/${a}.mp3`),e.classList.add("playing"),t.addEventListener("ended",()=>e.classList.remove("playing"),{once:!0}),t.play().catch(()=>e.classList.remove("playing"))})})}var o=document.querySelector("#sound-check");if(!o)throw Error("Sound check root is missing");n().then((r)=>s(r,o)).catch(()=>{o.innerHTML='<div class="sound-check-shell"><p class="stats-loading">Couldn’t load the word pack. Open the game first so content is cached, then try again.</p></div>'});
