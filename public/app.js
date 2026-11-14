const $=s=>document.querySelector(s);
const savedKey="anime-luther-list";
let saved=JSON.parse(localStorage.getItem(savedKey)||"{}");
let toastTimer;
function titleOf(a){return a.title?.english||a.title?.romaji||"Untitled anime"}
function posterOf(a){return a.coverImage?.extraLarge||a.coverImage?.large||""}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(s){const t=$("#toast");t.textContent=s;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),1900)}
function updateCount(){$("#saved-count").textContent=Object.keys(saved).length}
function persist(){localStorage.setItem(savedKey,JSON.stringify(saved));updateCount();renderSaved()}
function card(a){
 const el=document.createElement("article");el.className="anime-card";
 const isSaved=!!saved[a.id];
 el.innerHTML=`<div class="poster"><img loading="lazy" src="${esc(posterOf(a))}" alt="${esc(titleOf(a))}"><span class="score">${a.averageScore?`★ ${Math.round(a.averageScore/10)/10}`:"ANIME"}</span><button class="save ${isSaved?"saved":""}" title="Save to My List">${isSaved?"✓":"＋"}</button></div><div class="card-title">${esc(titleOf(a))}</div><div class="card-meta">${esc(a.format||"Anime")} · ${a.seasonYear||"—"} · ${a.episodes||"?"} eps</div>`;
 el.addEventListener("click",()=>openDetail(a.id));
 el.querySelector(".save").addEventListener("click",e=>{e.stopPropagation();if(saved[a.id]){delete saved[a.id];toast("Removed from your list")}else{saved[a.id]=a;toast("Added to your list")}persist();el.querySelector(".save").classList.toggle("saved",!!saved[a.id]);el.querySelector(".save").textContent=saved[a.id]?"✓":"＋"});
 return el;
}
function renderList(target,items){target.innerHTML="";if(!items.length){target.innerHTML='<p class="empty">No anime found here yet.</p>';return}items.forEach(a=>target.append(card(a)))}
async function loadSection(endpoint,target){try{const r=await fetch(endpoint);if(!r.ok)throw 0;const d=await r.json();renderList($(target),d.Page?.media||[])}catch{$(target).innerHTML='<p class="empty">Could not load the anime list. Refresh to try again.</p>'}}
function renderSaved(){const list=Object.values(saved);const box=$("#watchlist");box.innerHTML="";if(!list.length){box.innerHTML='<p class="empty">Your list is empty. Save an anime to keep it here.</p>'}else list.forEach(a=>box.append(card(a)))}
async function openDetail(id){
 $("#modal").classList.add("open");$("#modal").setAttribute("aria-hidden","false");$("#detail-content").innerHTML='<div class="loading">Loading anime details...</div>';
 try{
  const r=await fetch(`/api/anime?id=${id}`);if(!r.ok)throw 0;const a=await r.json();
  const desc=(a.description||"No synopsis available.").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ");
  $("#detail-content").innerHTML=`<div class="detail-top"><img src="${esc(posterOf(a))}" alt=""><div><div class="eyebrow">ANIME DETAILS</div><h2>${esc(titleOf(a))}</h2><div class="detail-meta">★ ${a.averageScore?`${a.averageScore/10}/10`:"Not rated"}<br>${esc(a.format||"Anime")} · ${a.seasonYear||"Year unknown"}<br>${a.episodes||"?"} episodes · ${esc(a.status||"")}</div><div class="tags">${(a.genres||[]).slice(0,5).map(g=>`<span>${esc(g)}</span>`).join("")}</div></div></div><p class="detail-desc">${esc(desc)}</p><div class="modal-actions"><button id="detail-save">${saved[id]?"Remove from My List":"＋ Add to My List"}</button><button class="secondary" id="anilist-link">View on AniList ↗</button></div>`;
  $("#detail-save").onclick=()=>{if(saved[id])delete saved[id];else saved[id]=a;persist();$("#detail-save").textContent=saved[id]?"Remove from My List":"＋ Add to My List";toast(saved[id]?"Added to your list":"Removed from your list")};
  $("#anilist-link").onclick=()=>window.open(`https://anilist.co/anime/${id}/`,"_blank","noopener");
 }catch{$("#detail-content").innerHTML='<p class="empty">Could not load details. Please try again.</p>'}
}
function closeModal(){$("#modal").classList.remove("open");$("#modal").setAttribute("aria-hidden","true")}
$("#modal .close").onclick=closeModal;$("#modal .modal-backdrop").onclick=closeModal;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();if(e.key==="/"&&document.activeElement.tagName!=="INPUT"){e.preventDefault();$("#search").focus()}});
$("#clear-list").onclick=()=>{saved={};persist();toast("Watchlist cleared")};
$("#search").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.value.trim())location.href=`https://anilist.co/search/anime?search=${encodeURIComponent(e.target.value.trim())}`});
$("#search").addEventListener("input",async e=>{const q=e.target.value.trim();if(q.length>=3){try{const r=await fetch(`/api/search?q=${encodeURIComponent(q)}`);const d=await r.json();if(d.Page?.media?.length){$("#trending").innerHTML="";renderList($("#trending"),d.Page.media)}}catch{}}else if(!q)loadSection("/api/trending","#trending")});
updateCount();renderSaved();loadSection("/api/trending","#trending");loadSection("/api/popular","#popular");
