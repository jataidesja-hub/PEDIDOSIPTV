const grid=document.getElementById("grid"),msg=document.getElementById("msg"),crumbs=document.getElementById("crumbs");
const player=document.getElementById("player"),frame=document.getElementById("frame"),vid=document.getElementById("vid");
const loginScreen=document.getElementById("login-screen"),appEl=document.getElementById("app"),uinfo=document.getElementById("uinfo");
const toggleWatchedBtn=document.getElementById("toggle-watched");
let stack=[],bust="",cur=null,currentUser=null;

function wKey(){return "iptv_watched_"+(currentUser?currentUser.usuario:"guest")}
function getWatched(){try{return JSON.parse(localStorage.getItem(wKey())||"{}")}catch{return {}}}
function isWatched(id){return !!getWatched()[id]}
function setWatched(id,val){
  const w=getWatched();
  if(val)w[id]=1;else delete w[id];
  localStorage.setItem(wKey(),JSON.stringify(w));
}

const card=(item,icon,fn,isVideo)=>{
  const d=document.createElement("div");
  const watched=isVideo&&isWatched(item.id);
  d.className="card"+(watched?" watched":"");
  d.dataset.id=item.id;
  d.innerHTML=`<div class="img" style="${item.cover?`background-image:url('${item.cover}')`:""}">${item.cover?"":icon}</div><p></p>`;
  d.querySelector("p").textContent=item.title;
  if(isVideo){
    const b=document.createElement("button");
    b.className="wbtn";
    b.textContent=watched?"\u2713 Visto":"Marcar visto";
    b.onclick=e=>{
      e.stopPropagation();
      const next=!isWatched(item.id);
      setWatched(item.id,next);
      d.classList.toggle("watched",next);
      b.textContent=next?"\u2713 Visto":"Marcar visto";
    };
    d.appendChild(b);
  }
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

async function load(){
  grid.innerHTML="";msg.textContent="Carregando...";
  const curFolder=stack[stack.length-1];
  const r=await fetch("/api/list?"+(curFolder?"folder="+curFolder.id+"&":"")+(bust?"t="+bust:"")),j=await r.json();
  if(!r.ok){msg.textContent=j.error;return}
  const nat=(a,b)=>a.title.localeCompare(b.title,"pt",{numeric:true,sensitivity:"base"});
  j.folders.sort(nat);j.videos.sort(nat);
  msg.textContent=j.folders.length||j.videos.length?"":"Pasta vazia";
  j.folders.forEach(f=>card(f,"\uD83D\uDCC1",()=>{stack.push(f);load()},false));
  j.videos.forEach(v=>card(v,"\uD83C\uDFAC",()=>play(v),true));
  crumbs.innerHTML="";stack.forEach((s,i)=>{const a=document.createElement("a");a.textContent="\u203A "+s.title;
    a.onclick=()=>{stack=stack.slice(0,i+1);load()};crumbs.appendChild(a)});
}

function play(v){
  cur=v;document.getElementById("ptitle").textContent=v.title;
  updatePlayerWatchedBtn();
  frame.hidden=true;frame.src="";vid.hidden=false;vid.src="/api/stream?id="+v.id;player.hidden=false;vid.play().catch(()=>{});
}
function stop(){vid.pause();vid.removeAttribute("src");vid.load();frame.src="";player.hidden=true}
document.getElementById("close").onclick=stop;
document.getElementById("alt").onclick=()=>{vid.pause();vid.hidden=true;frame.hidden=false;frame.src=`https://drive.google.com/file/d/${cur.id}/preview`};
toggleWatchedBtn.onclick=()=>{
  if(!cur)return;
  const next=!isWatched(cur.id);
  setWatched(cur.id,next);
  updatePlayerWatchedBtn();
  syncCardState(cur.id);
};
vid.onended=()=>{
  if(!cur)return;
  setWatched(cur.id,true);
  updatePlayerWatchedBtn();
  syncCardState(cur.id);
};
vid.onerror=()=>{document.getElementById("alt").click()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")stop()});
document.getElementById("home").onclick=e=>{e.preventDefault();stack=[];load()};
document.getElementById("refresh").onclick=()=>{bust=Date.now();load()};

function showApp(u){
  currentUser=u;
  loginScreen.hidden=true;
  appEl.hidden=false;
  uinfo.textContent=`${u.cliente}${u.vencimento?` (Venc: ${u.vencimento})`:""}`;
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
