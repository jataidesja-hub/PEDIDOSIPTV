const grid=document.getElementById("grid"),msg=document.getElementById("msg"),crumbs=document.getElementById("crumbs");
const player=document.getElementById("player"),frame=document.getElementById("frame"),vjsWrap=document.getElementById("vjs-wrap");
const loginScreen=document.getElementById("login-screen"),appEl=document.getElementById("app"),uinfo=document.getElementById("uinfo");
const toggleWatchedBtn=document.getElementById("toggle-watched"),catBar=document.getElementById("cat-bar"),searchInput=document.getElementById("search");
const prevBtn=document.getElementById("prev-ep"),nextBtn=document.getElementById("next-ep");

let stack=[],bust="",cur=null,currentUser=null,vplayer=null;
let lastData={folders:[],videos:[]},activeCat="ALL",searchTerm="";

function uPrefix(){return currentUser?currentUser.usuario:"guest"}
function wKey(){return "iptv_watched_"+uPrefix()}
function pKey(){return "iptv_prog_"+uPrefix()}
function getWatched(){try{return JSON.parse(localStorage.getItem(wKey())||"{}")}catch{return {}}}
function isWatched(id){return !!getWatched()[id]}
function setWatched(id,val){
  const w=getWatched();
  if(val)w[id]=1;else delete w[id];
  localStorage.setItem(wKey(),JSON.stringify(w));
}
function getProgMap(){try{return JSON.parse(localStorage.getItem(pKey())||"{}")}catch{return {}}}
function getProg(id){return getProgMap()[id]||null}
function saveProg(id,time,dur){
  if(!id||!dur||dur<10)return;
  const m=getProgMap();
  if(time/dur>0.95)delete m[id];
  else if(time>5)m[id]={t:Math.floor(time),d:Math.floor(dur)};
  localStorage.setItem(pKey(),JSON.stringify(m));
}

// Extrai categoria do prefixo: "[Novelas] Rebelde" ou "Novelas - Rebelde"
function parseCategory(rawTitle){
  const m1=/^\[([^\]]+)\]\s*(.+)$/.exec(rawTitle);
  if(m1)return {cat:m1[1].trim(),cleanTitle:m1[2].trim()};
  const m2=/^([^-\u2013\u2014]{2,22})\s+[-\u2013\u2014]\s+(.+)$/.exec(rawTitle);
  if(m2&&!/^(cap[i\u00ed]tulo|ep|epis[o\u00f3]dio|parte|temp|temporada)\b/i.test(m2[1].trim())){
    return {cat:m2[1].trim(),cleanTitle:m2[2].trim()};
  }
  return {cat:"",cleanTitle:rawTitle};
}

function initVjs(){
  if(vplayer)return vplayer;
  vplayer=window.videojs("vid",{
    controls:true,
    autoplay:true,
    preload:"auto",
    playbackRates:[0.5,0.75,1,1.25,1.5,2],
    fluid:false,
    responsive:true
  });
  let lastSave=0;
  vplayer.on("timeupdate",()=>{
    if(!cur)return;
    const now=Date.now();
    if(now-lastSave>4000){
      lastSave=now;
      saveProg(cur.id,vplayer.currentTime(),vplayer.duration());
    }
  });
  vplayer.on("loadedmetadata",()=>{
    if(!cur)return;
    const p=getProg(cur.id);
    if(p&&p.t>5&&(!vplayer.duration()||p.t<vplayer.duration()-10)){
      vplayer.currentTime(p.t);
    }
  });
  vplayer.on("ended",()=>{
    if(!cur)return;
    setWatched(cur.id,true);
    saveProg(cur.id,0,0);
    updatePlayerWatchedBtn();
    syncCardState(cur.id);
    const nxt=getAdjacentVideo(1);
    if(nxt)play(nxt);
  });
  vplayer.on("error",()=>{
    if(cur)switchToAlt();
  });
  return vplayer;
}

const card=(item,icon,fn,isVideo)=>{
  const d=document.createElement("div");
  const watched=isVideo&&isWatched(item.id);
  d.className="card"+(watched?" watched":"");
  d.dataset.id=item.id;
  const imgDiv=document.createElement("div");
  imgDiv.className="img";
  if(item.cover)imgDiv.style.backgroundImage=`url('${item.cover}')`;
  else imgDiv.textContent=icon;

  if(isVideo){
    const p=getProg(item.id);
    if(p&&p.d>0){
      const pct=Math.min(100,Math.round((p.t/p.d)*100));
      const bar=document.createElement("div");
      bar.className="prog";
      bar.innerHTML=`<i style="width:${pct}%"></i>`;
      imgDiv.appendChild(bar);
    }
    const b=document.createElement("button");
    b.className="wbtn";
    b.textContent=watched?"\u2713 Visto":"Marcar visto";
    b.onclick=e=>{
      e.stopPropagation();
      const next=!isWatched(item.id);
      setWatched(item.id,next);
      d.classList.toggle("watched",next);
      b.textContent=next?"\u2713 Visto":"Marcar visto";
      if(activeCat==="__UNWATCHED__")render();
    };
    d.appendChild(b);
  }

  d.appendChild(imgDiv);
  if(item.cat){
    const ct=document.createElement("span");
    ct.className="cat-tag";
    ct.textContent=item.cat;
    d.appendChild(ct);
  }
  const pEl=document.createElement("p");
  pEl.textContent=item.cleanTitle||item.title;
  d.appendChild(pEl);
  d.onclick=fn;
  grid.appendChild(d);
};

function syncCardState(id){
  const d=grid.querySelector(`.card[data-id="${id}"]`);
  if(!d)return;
  const w=isWatched(id);
  d.classList.toggle("watched",w);
  const b=d.querySelector(".wbtn");
  if(b)b.textContent=w?"\u2713 Visto":"Marcar visto";
}

function updatePlayerWatchedBtn(){
  if(!cur)return;
  const w=isWatched(cur.id);
  toggleWatchedBtn.classList.toggle("on",w);
  toggleWatchedBtn.textContent=w?"\u2713 Visto (desmarcar)":"Marcar como visto";
}

function buildCatBar(){
  const cats=new Set();
  lastData.folders.forEach(f=>{if(f.cat)cats.add(f.cat)});
  lastData.videos.forEach(v=>{if(v.cat)cats.add(v.cat)});
  const hasVideos=lastData.videos.length>0;
  const hasWatchedOrProg=lastData.videos.some(v=>isWatched(v.id)||getProg(v.id));

  if(cats.size===0&&!hasVideos){
    catBar.hidden=true;catBar.innerHTML="";return;
  }
  catBar.hidden=false;catBar.innerHTML="";
  const pills=[{id:"ALL",label:"Todos"}];
  if(hasVideos){
    pills.push({id:"__UNWATCHED__",label:"N\u00e3o vistos"});
    if(hasWatchedOrProg)pills.push({id:"__CONTINUE__",label:"Continuar assistindo"});
  }
  Array.from(cats).sort((a,b)=>a.localeCompare(b,"pt")).forEach(c=>pills.push({id:c,label:c}));

  if(!pills.some(p=>p.id===activeCat))activeCat="ALL";

  pills.forEach(p=>{
    const btn=document.createElement("button");
    btn.className="cat-pill"+(activeCat===p.id?" active":"");
    btn.textContent=p.label;
    btn.onclick=()=>{activeCat=p.id;buildCatBar();render()};
    catBar.appendChild(btn);
  });
}

function render(){
  grid.innerHTML="";
  const q=searchTerm.trim().toLowerCase();
  const matchSearch=it=>!q||it.title.toLowerCase().includes(q)||(it.cat&&it.cat.toLowerCase().includes(q));
  const matchCatFolder=f=>{
    if(activeCat==="ALL")return true;
    if(activeCat==="__UNWATCHED__"||activeCat==="__CONTINUE__")return false;
    return f.cat===activeCat;
  };
  const matchCatVideo=v=>{
    if(activeCat==="ALL")return true;
    if(activeCat==="__UNWATCHED__")return !isWatched(v.id);
    if(activeCat==="__CONTINUE__")return !!getProg(v.id);
    return v.cat===activeCat;
  };

  const folders=lastData.folders.filter(f=>matchSearch(f)&&matchCatFolder(f));
  const videos=lastData.videos.filter(v=>matchSearch(v)&&matchCatVideo(v));

  msg.textContent=folders.length||videos.length?"":"Nenhum item encontrado";
  folders.forEach(f=>card(f,"\uD83D\uDCC1",()=>{stack.push(f);activeCat="ALL";searchInput.value="";searchTerm="";load()},false));
  videos.forEach(v=>card(v,"\uD83C\uDFAC",()=>play(v),true));
}

async function load(){
  grid.innerHTML="";msg.textContent="Carregando...";catBar.hidden=true;
  const curFolder=stack[stack.length-1];
  const r=await fetch("/api/list?"+(curFolder?"folder="+curFolder.id+"&":"")+(bust?"t="+bust:"")),j=await r.json();
  if(!r.ok){msg.textContent=j.error;return}
  const nat=(a,b)=>a.title.localeCompare(b.title,"pt",{numeric:true,sensitivity:"base"});
  const folders=(j.folders||[]).map(f=>({...f,...parseCategory(f.title)})).sort(nat);
  const videos=(j.videos||[]).map(v=>({...v,...parseCategory(v.title)})).sort(nat);
  lastData={folders,videos};
  buildCatBar();
  render();
  crumbs.innerHTML="";stack.forEach((s,i)=>{const a=document.createElement("a");a.textContent="\u203A "+(s.cleanTitle||s.title);
    a.onclick=()=>{stack=stack.slice(0,i+1);activeCat="ALL";load()};crumbs.appendChild(a)});
}

function getAdjacentVideo(dir){
  if(!cur)return null;
  const list=lastData.videos;
  const idx=list.findIndex(v=>v.id===cur.id);
  if(idx===-1)return null;
  return list[idx+dir]||null;
}

function updateNavBtns(){
  const prev=getAdjacentVideo(-1),next=getAdjacentVideo(1);
  prevBtn.hidden=!prev;nextBtn.hidden=!next;
}

function switchToAlt(){
  if(!cur)return;
  if(vplayer)vplayer.pause();
  vjsWrap.hidden=true;
  frame.hidden=false;
  frame.src=`https://drive.google.com/file/d/${cur.id}/preview`;
}

function play(v){
  cur=v;
  document.getElementById("ptitle").textContent=v.cleanTitle||v.title;
  updatePlayerWatchedBtn();
  updateNavBtns();
  frame.hidden=true;frame.src="";
  vjsWrap.hidden=false;
  player.hidden=false;
  const vp=initVjs();
  vp.src({src:"/api/stream?id="+v.id,type:"video/mp4"});
  vp.play().catch(()=>{});
}

function stop(){
  if(vplayer&&cur){
    saveProg(cur.id,vplayer.currentTime(),vplayer.duration());
    vplayer.pause();
    vplayer.reset();
  }
  frame.src="";
  player.hidden=true;
  buildCatBar();
  render();
}

document.getElementById("close").onclick=stop;
document.getElementById("alt").onclick=switchToAlt;
prevBtn.onclick=()=>{const p=getAdjacentVideo(-1);if(p)play(p)};
nextBtn.onclick=()=>{const n=getAdjacentVideo(1);if(n)play(n)};
document.getElementById("back10").onclick=()=>{if(vplayer)vplayer.currentTime(Math.max(0,vplayer.currentTime()-10))};
document.getElementById("fwd10").onclick=()=>{if(vplayer)vplayer.currentTime(vplayer.currentTime()+10)};

toggleWatchedBtn.onclick=()=>{
  if(!cur)return;
  const next=!isWatched(cur.id);
  setWatched(cur.id,next);
  updatePlayerWatchedBtn();
  syncCardState(cur.id);
};

document.addEventListener("keydown",e=>{
  if(player.hidden)return;
  if(e.key==="Escape")stop();
  else if(e.key==="ArrowLeft"&&vplayer)vplayer.currentTime(Math.max(0,vplayer.currentTime()-10));
  else if(e.key==="ArrowRight"&&vplayer)vplayer.currentTime(vplayer.currentTime()+10);
});

searchInput.oninput=e=>{searchTerm=e.target.value;render()};
document.getElementById("home").onclick=e=>{e.preventDefault();stack=[];activeCat="ALL";searchInput.value="";searchTerm="";load()};
document.getElementById("refresh").onclick=()=>{bust=Date.now();load()};

function showApp(u){
  currentUser=u;
  loginScreen.hidden=true;
  appEl.hidden=false;
  const initials=(u.cliente||"U").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  uinfo.innerHTML="";
  const av=document.createElement("span");av.className="u-avatar";av.textContent=initials;
  const meta=document.createElement("span");meta.className="u-meta";
  const nm=document.createElement("strong");nm.className="u-name";nm.textContent=u.cliente||u.usuario;
  meta.appendChild(nm);
  if(u.vencimento){
    const vc=document.createElement("span");vc.className="u-exp";
    vc.innerHTML=`<span class="u-dot"></span>Vence ${u.vencimento}`;
    meta.appendChild(vc);
  }
  uinfo.append(av,meta);
  load();
}

document.getElementById("logout").onclick=()=>{
  localStorage.removeItem("iptv_user");
  currentUser=null;stack=[];
  appEl.hidden=true;loginScreen.hidden=false;
};

document.getElementById("login-form").onsubmit=async e=>{
  e.preventDefault();
  const btn=document.getElementById("l-btn"),err=document.getElementById("l-err");
  err.textContent="";btn.disabled=true;btn.textContent="Verificando...";
  try{
    const r=await fetch("/api/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user:document.getElementById("l-user").value,pass:document.getElementById("l-pass").value})
    });
    const j=await r.json();
    if(!r.ok){err.textContent=j.error||"Erro ao entrar";return}
    localStorage.setItem("iptv_user",JSON.stringify(j.user));
    showApp(j.user);
  }catch{
    err.textContent="Falha de conexao";
  }finally{
    btn.disabled=false;btn.textContent="Entrar";
  }
};

try{
  const saved=JSON.parse(localStorage.getItem("iptv_user")||"null");
  if(saved&&saved.usuario)showApp(saved);
}catch{}
