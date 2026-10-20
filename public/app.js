const grid=document.getElementById("grid"),msg=document.getElementById("msg"),crumbs=document.getElementById("crumbs");
const player=document.getElementById("player"),frame=document.getElementById("frame");
let stack=[];
const card=(t,c,icon,fn)=>{const d=document.createElement("div");d.className="card";
d.innerHTML=`<div class="img" style="${c?`background-image:url('${c}')`:""}">${c?"":icon}</div><p></p>`;
d.querySelector("p").textContent=t;d.onclick=fn;grid.appendChild(d)};
async function load(){
  grid.innerHTML="";msg.textContent="Carregando...";
  const cur=stack[stack.length-1];
  const r=await fetch("/api/list"+(cur?"?folder="+cur.id:"")),j=await r.json();
  if(!r.ok){msg.textContent=j.error;return}
  const nat=(a,b)=>a.title.localeCompare(b.title,"pt",{numeric:true,sensitivity:"base"});j.folders.sort(nat);j.videos.sort(nat);msg.textContent=j.folders.length||j.videos.length?"":"Pasta vazia";
  j.folders.forEach(f=>card(f.title,f.cover,"\uD83D\uDCC1",()=>{stack.push(f);load()}));
  j.videos.forEach(v=>card(v.title,v.cover,"\uD83C\uDFAC",()=>play(v)));
  crumbs.innerHTML="";stack.forEach((s,i)=>{const a=document.createElement("a");a.textContent="\u203A "+s.title;
    a.onclick=()=>{stack=stack.slice(0,i+1);load()};crumbs.appendChild(a)});
}
function play(v){document.getElementById("ptitle").textContent=v.title;
  frame.src=`https://drive.google.com/file/d/${v.id}/preview`;player.hidden=false}
document.getElementById("close").onclick=()=>{player.hidden=true;frame.src=""};
document.getElementById("home").onclick=e=>{e.preventDefault();stack=[];load()};
load();


