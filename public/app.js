const grid=document.getElementById("grid"),msg=document.getElementById("msg"),crumbs=document.getElementById("crumbs");
const player=document.getElementById("player"),frame=document.getElementById("frame");
let stack=[],bust="";
const card=(t,c,icon,fn)=>{const d=document.createElement("div");d.className="card";
d.innerHTML=`<div class="img" style="${c?`background-image:url('${c}')`:""}">${c?"":icon}</div><p></p>`;
d.querySelector("p").textContent=t;d.onclick=fn;grid.appendChild(d)};
async function load(){
  grid.innerHTML="";msg.textContent="Carregando...";
  const cur=stack[stack.length-1];
  const r=await fetch("/api/list?"+(cur?"folder="+cur.id+"&":"")+(bust?"t="+bust:"")),j=await r.json();
  if(!r.ok){msg.textContent=j.error;return}
  const nat=(a,b)=>a.title.localeCompare(b.title,"pt",{numeric:true,sensitivity:"base"});j.folders.sort(nat);j.videos.sort(nat);msg.textContent=j.folders.length||j.videos.length?"":"Pasta vazia";
  j.folders.forEach(f=>card(f.title,f.cover,"\uD83D\uDCC1",()=>{stack.push(f);load()}));
  j.videos.forEach(v=>card(v.title,v.cover,"\uD83C\uDFAC",()=>play(v)));
  crumbs.innerHTML="";stack.forEach((s,i)=>{const a=document.createElement("a");a.textContent="\u203A "+s.title;
    a.onclick=()=>{stack=stack.slice(0,i+1);load()};crumbs.appendChild(a)});
}
const vid=document.getElementById("vid");let cur=null;
function play(v){cur=v;document.getElementById("ptitle").textContent=v.title;
  frame.hidden=true;frame.src="";vid.hidden=false;vid.src="/api/stream?id="+v.id;player.hidden=false;vid.play().catch(()=>{})}
function stop(){vid.pause();vid.removeAttribute("src");vid.load();frame.src="";player.hidden=true}
document.getElementById("close").onclick=stop;
document.getElementById("alt").onclick=()=>{vid.pause();vid.hidden=true;frame.hidden=false;frame.src=`https://drive.google.com/file/d/${cur.id}/preview`};
vid.onerror=()=>{document.getElementById("alt").click()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")stop()});
document.getElementById("home").onclick=e=>{e.preventDefault();stack=[];load()};
load();



document.getElementById("refresh").onclick=()=>{bust=Date.now();load()};

