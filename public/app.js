const grid=document.getElementById("grid"),msg=document.getElementById("msg"),crumbs=document.getElementById("crumbs");
const player=document.getElementById("player"),frame=document.getElementById("frame"),vjsWrap=document.getElementById("vjs-wrap");
const loginScreen=document.getElementById("login-screen"),appEl=document.getElementById("app"),uinfo=document.getElementById("uinfo");
const toggleWatchedBtn=document.getElementById("toggle-watched"),catBar=document.getElementById("cat-bar"),subcatBar=document.getElementById("subcat-bar"),searchInput=document.getElementById("search");
const prevBtn=document.getElementById("prev-ep"),nextBtn=document.getElementById("next-ep");
const backBtn=document.getElementById("back-btn"),appFsBtn=document.getElementById("app-fs"),playerFsBtn=document.getElementById("player-fs"),playerFsBtn2=document.getElementById("player-fs2");

const MAIN_CATS=[
  {id:"ALL",label:"\uD83C\uDFE0 Todos"},
  {id:"Filmes",label:"\uD83C\uDFAC Filmes"},
  {id:"S\u00e9ries",label:"\uD83D\uDCFA S\u00e9ries"},
  {id:"Novelas",label:"\uD83C\uDFAD Novelas"},
  {id:"Novelinhas",label:"\uD83D\uDCF1 Novelinhas"},
  {id:"Animes",label:"\u26A1 Animes"},
  {id:"Biblioteca",label:"\uD83D\uDCDA Biblioteca"}
];

const SUBCATS_BY_MAIN={
  "Filmes":["\uD83D\uDD25 Em Alta","A\u00e7\u00e3o","Aventura","Com\u00e9dia","Drama","Terror","Suspense","Romance","Fic\u00e7\u00e3o Cient\u00edfica","Anima\u00e7\u00e3o","Document\u00e1rio","Nacionais"],
  "S\u00e9ries":["\uD83D\uDD25 Em Alta","A\u00e7\u00e3o","Com\u00e9dia","Drama","Suspense","Policial","Fic\u00e7\u00e3o Cient\u00edfica","Romance","Terror","Doramas","Document\u00e1rio"],
  "Biblioteca":["\uD83D\uDD25 Em Alta","Romance","Fic\u00e7\u00e3o Cient\u00edfica","Autoajuda","Finan\u00e7as & Neg\u00f3cios","Biografia","Fantasia","Terror","Suspense","Estudos","Religi\u00e3o","Quadrinhos & Mang\u00e1s"]
};

let stack=[],bust="",cur=null,currentUser=null,vplayer=null;
let lastData={folders:[],videos:[],books:[]},activeCat="ALL",activeSub="ALL",savedCat="ALL",savedSub="ALL",searchTerm="";

function normStr(s){
  return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
}

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

const card=(item,icon,fn,mediaType)=>{
  const d=document.createElement("div");
  const isVideo=mediaType==="video",isBook=mediaType==="book";
  const watched=(isVideo||isBook)&&isWatched(item.id);
  d.className="card"+(watched?" watched":"");
  d.dataset.id=item.id;
  const imgDiv=document.createElement("div");
  imgDiv.className="img";
  if(item.cover)imgDiv.style.backgroundImage=`url('${item.cover}')`;
  else imgDiv.textContent=icon;

  if(isVideo||isBook){
    const p=getProg(item.id);
    if(p&&p.d>0){
      const pct=Math.min(100,Math.round((p.t/p.d)*100));
      const bar=document.createElement("div");
      bar.className="prog";
      bar.innerHTML=`<i style="width:${pct}%"></i>`;
      imgDiv.appendChild(bar);
      if(isBook){
        const bd=document.createElement("span");
        bd.className="book-badge";
        bd.textContent=`P\u00e1g. ${p.t}/${p.d} (${pct}%)`;
        imgDiv.appendChild(bd);
      }
    }else if(isBook){
      const bd=document.createElement("span");
      bd.className="book-badge";
      bd.textContent="\uD83D\uDCD6 "+String(item.ext||"PDF").toUpperCase();
      imgDiv.appendChild(bd);
    }
    const doneLbl=isBook?"\u2713 Lido":"\u2713 Visto";
    const markLbl=isBook?"Marcar lido":"Marcar visto";
    const b=document.createElement("button");
    b.className="wbtn";
    b.textContent=watched?doneLbl:markLbl;
    b.onclick=e=>{
      e.stopPropagation();
      const next=!isWatched(item.id);
      setWatched(item.id,next);
      d.classList.toggle("watched",next);
      b.textContent=next?doneLbl:markLbl;
      if(activeCat==="__UNWATCHED__")render();
    };
    d.appendChild(b);
  }

  d.appendChild(imgDiv);
  const tagText=[item.cat,item.sub].filter(Boolean).join(" \u2022 ");
  if(tagText){
    const ct=document.createElement("span");
    ct.className="cat-tag";
    ct.textContent=tagText;
    d.appendChild(ct);
  }
  const pEl=document.createElement("p");
  pEl.textContent=item.title;
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

function goBack(){
  if(!readerEl.hidden){closeBook();return}
  if(!player.hidden){stop();return}
  if(stack.length>1){
    stack.pop();
    activeCat="ALL";
    activeSub="ALL";
    searchInput.value="";searchTerm="";
    load();
  }else if(stack.length===1){
    stack=[];
    activeCat=savedCat||"ALL";
    activeSub=savedSub||"ALL";
    searchInput.value="";searchTerm="";
    load();
  }else if(activeSub!=="ALL"){
    activeSub="ALL";
    buildBars();
    render();
  }else if(activeCat!=="ALL"){
    activeCat="ALL";
    activeSub="ALL";
    buildBars();
    render();
  }
}

function updateCrumbsAndBack(){
  const inRoot=stack.length===0;
  backBtn.hidden=inRoot&&activeCat==="ALL"&&activeSub==="ALL";
  crumbs.innerHTML="";
  if(inRoot){
    if(activeCat!=="ALL"){
      const ca=document.createElement("a");
      ca.textContent="\u203A "+activeCat;
      ca.onclick=()=>{activeSub="ALL";buildBars();render()};
      crumbs.appendChild(ca);
      if(activeSub!=="ALL"){
        const sa=document.createElement("a");
        sa.textContent="\u203A "+activeSub;
        crumbs.appendChild(sa);
      }
    }
    return;
  }
  const catLabel=(savedCat&&savedCat!=="ALL")?savedCat:(stack[0]&&stack[0].cat?stack[0].cat:"");
  if(catLabel){
    const ca=document.createElement("a");
    ca.textContent="\u203A "+catLabel;
    ca.onclick=()=>{stack=[];activeCat=catLabel;activeSub=savedSub||"ALL";searchInput.value="";searchTerm="";load()};
    crumbs.appendChild(ca);
  }
  stack.forEach((s,i)=>{
    const a=document.createElement("a");
    a.textContent="\u203A "+s.title;
    a.onclick=()=>{stack=stack.slice(0,i+1);activeCat="ALL";activeSub="ALL";load()};
    crumbs.appendChild(a);
  });
}

function buildBars(){
  catBar.innerHTML="";
  subcatBar.innerHTML="";
  const inRoot=stack.length===0;
  updateCrumbsAndBack();

  if(inRoot){
    catBar.hidden=false;
    MAIN_CATS.forEach(c=>{
      const btn=document.createElement("button");
      btn.className="cat-pill"+(activeCat===c.id?" active":"");
      btn.textContent=c.label;
      btn.onclick=()=>{activeCat=c.id;activeSub="ALL";savedCat=c.id;savedSub="ALL";buildBars();render()};
      catBar.appendChild(btn);
    });

    const subs=SUBCATS_BY_MAIN[activeCat];
    if(subs&&subs.length){
      subcatBar.hidden=false;
      const allBtn=document.createElement("button");
      allBtn.className="subcat-pill"+(activeSub==="ALL"?" active":"");
      allBtn.textContent="Todas";
      allBtn.onclick=()=>{activeSub="ALL";savedSub="ALL";buildBars();render()};
      subcatBar.appendChild(allBtn);

      subs.forEach(s=>{
        const val=s.replace(/^[^\wA-Za-z\u00C0-\u017F]+\s*/,"");
        const btn=document.createElement("button");
        btn.className="subcat-pill"+(activeSub===val?" active":"");
        btn.textContent=s;
        btn.onclick=()=>{activeSub=val;savedSub=val;buildBars();render()};
        subcatBar.appendChild(btn);
      });
    }else{
      subcatBar.hidden=true;
    }
  }else{
    subcatBar.hidden=true;
    catBar.hidden=false;
    const bPill=document.createElement("button");
    bPill.className="cat-pill back-pill";
    bPill.textContent="\u2190 Voltar";
    bPill.onclick=goBack;
    catBar.appendChild(bPill);

    const hasVideos=lastData.videos.length>0;
    const hasBooks=(lastData.books||[]).length>0;
    if(!hasVideos&&!hasBooks)return;
    const onlyBooks=hasBooks&&!hasVideos;
    const pills=[
      {id:"ALL",label:onlyBooks?"Todos os livros":"Todos os cap\u00edtulos"},
      {id:"__UNWATCHED__",label:onlyBooks?"N\u00e3o lidos":"N\u00e3o vistos"},
      {id:"__CONTINUE__",label:onlyBooks?"Continuar lendo":"Continuar assistindo"}
    ];
    if(!pills.some(p=>p.id===activeCat))activeCat="ALL";
    pills.forEach(p=>{
      const btn=document.createElement("button");
      btn.className="cat-pill"+(activeCat===p.id?" active":"");
      btn.textContent=p.label;
      btn.onclick=()=>{activeCat=p.id;buildBars();render()};
      catBar.appendChild(btn);
    });
  }
}

function matchCatAndSub(item){
  const itemCat=normStr(item.cat);
  const bibCat=normStr("Biblioteca");
  if(activeCat==="ALL"){
    if(itemCat===bibCat)return false;
  }else if(activeCat!=="__UNWATCHED__"&&activeCat!=="__CONTINUE__"){
    if(itemCat!==normStr(activeCat))return false;
  }
  if(activeSub!=="ALL"){
    const target=normStr(activeSub);
    const list=Array.isArray(item.subs)?item.subs:(item.sub?[item.sub]:[]);
    if(!list.some(s=>normStr(s)===target))return false;
  }
  return true;
}

function render(){
  grid.innerHTML="";
  const q=normStr(searchTerm);
  const matchSearch=it=>!q||normStr(it.title).includes(q)||normStr(it.cat).includes(q)||normStr(it.sub).includes(q);
  const inRoot=stack.length===0;

  let folders=[],videos=[],books=[];
  if(inRoot){
    folders=lastData.folders.filter(f=>matchSearch(f)&&matchCatAndSub(f));
    videos=lastData.videos.filter(v=>matchSearch(v)&&matchCatAndSub(v));
    if(normStr(activeCat)===normStr("Biblioteca")){
      books=(lastData.books||[]).filter(b=>matchSearch(b)&&matchCatAndSub(b));
    }
  }else{
    folders=lastData.folders.filter(f=>matchSearch(f));
    const filterMedia=it=>{
      if(!matchSearch(it))return false;
      if(activeCat==="__UNWATCHED__")return !isWatched(it.id);
      if(activeCat==="__CONTINUE__")return !!getProg(it.id);
      return true;
    };
    videos=lastData.videos.filter(filterMedia);
    books=(lastData.books||[]).filter(filterMedia);
  }

  msg.textContent=folders.length||videos.length||books.length?"":"Nenhum título encontrado nesta categoria";
  folders.forEach(f=>card(f,"\uD83D\uDCC1",()=>{
    if(stack.length===0){
      savedCat=activeCat!=="ALL"?activeCat:(f.cat||"ALL");
      savedSub=activeSub;
    }
    stack.push(f);
    activeCat="ALL";
    activeSub="ALL";
    searchInput.value="";
    searchTerm="";
    load();
  },"folder"));
  books.forEach(b=>card(b,"\uD83D\uDCD6",()=>openBook(b),"book"));
  videos.forEach(v=>card(v,"\uD83C\uDFAC",()=>play(v),"video"));
}

async function load(){
  grid.innerHTML="";msg.textContent="Carregando...";
  const curFolder=stack[stack.length-1];
  const url="/api/list?"+(curFolder?"folder="+curFolder.id+"&":"mode=catalog&")+(bust?"t="+bust:"");
  const r=await fetch(url),j=await r.json();
  if(!r.ok){msg.textContent=j.error;return}
  const nat=(a,b)=>a.title.localeCompare(b.title,"pt",{numeric:true,sensitivity:"base"});
  const folders=(j.folders||[]).sort(nat);
  const videos=(j.videos||[]).sort(nat);
  const books=(j.books||[]).sort(nat);
  lastData={folders,videos,books};
  buildBars();
  render();
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
  document.getElementById("ptitle").textContent=v.title;
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
  buildBars();
  render();
}

function toggleElementFs(el){
  if(document.fullscreenElement){
    document.exitFullscreen().catch(()=>{});
  }else if(el&&el.requestFullscreen){
    el.requestFullscreen().catch(()=>{});
  }
}

function togglePlayerFs(){
  if(!vjsWrap.hidden&&vplayer){
    try{
      if(vplayer.isFullscreen())vplayer.exitFullscreen();
      else vplayer.requestFullscreen();
      return;
    }catch{}
  }
  toggleElementFs(!frame.hidden?frame:player);
}

document.getElementById("close").onclick=stop;
document.getElementById("alt").onclick=switchToAlt;
backBtn.onclick=goBack;
appFsBtn.onclick=()=>toggleElementFs(document.documentElement);
playerFsBtn.onclick=togglePlayerFs;
playerFsBtn2.onclick=togglePlayerFs;
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
  if(!readerEl.hidden){
    if(document.activeElement===rPageIn)return;
    if(e.key==="Escape"&&!document.fullscreenElement)closeBook();
    else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();turnBookPage(-1)}
    else if(e.key==="ArrowRight"||e.key==="PageDown"||e.key===" "){e.preventDefault();turnBookPage(1)}
    else if(e.key==="f"||e.key==="F")toggleElementFs(readerEl);
    return;
  }
  if(player.hidden)return;
  if(e.key==="Escape"&&!document.fullscreenElement)stop();
  else if((e.key==="f"||e.key==="F"))togglePlayerFs();
  else if(e.key==="ArrowLeft"&&vplayer)vplayer.currentTime(Math.max(0,vplayer.currentTime()-10));
  else if(e.key==="ArrowRight"&&vplayer)vplayer.currentTime(vplayer.currentTime()+10);
});

/* ==================== LEITOR KINDLE (PDF) ==================== */
const readerEl=document.getElementById("reader"),rTitle=document.getElementById("rtitle"),rSub=document.getElementById("rsub");
const rAmber=document.getElementById("r-amber"),rSettings=document.getElementById("r-settings");
const rCanvasWrap=document.getElementById("r-canvas-wrap"),rLoader=document.getElementById("r-loader");
const rPages=document.getElementById("r-pages"),c1=document.getElementById("pdf-c1"),c2=document.getElementById("pdf-c2");
const rReflow=document.getElementById("r-reflow"),rFrame=document.getElementById("r-frame");
const rSlider=document.getElementById("r-slider"),rPageIn=document.getElementById("r-page-in"),rTotal=document.getElementById("r-total");
const rPct=document.getElementById("r-pct"),rEta=document.getElementById("r-eta"),rZoomVal=document.getElementById("rzoom-val");
const rBmkBtn=document.getElementById("r-bmk-btn"),rWatchedBtn=document.getElementById("r-watched-btn"),rBmkList=document.getElementById("r-bmk-list");

if(window.pdfjsLib){
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

let curBook=null,pdfDoc=null,bookPage=1,bookTotal=1,bookMode="page",bookSpread=1,bookZoom=1,kindleFontPx=20,renderToken=0;
let bookPagesData=[],cbzImages=[],blobUrlsToCleanup=[];

function cleanupBookBlobs(){
  for(const u of blobUrlsToCleanup){try{URL.revokeObjectURL(u)}catch{}}
  blobUrlsToCleanup=[];
  bookPagesData=[];
  cbzImages=[];
}

function paginatePlainText(text,charsPerPage=2300){
  const paras=String(text||"").replace(/\r\n/g,"\n").split(/\n{2,}/);
  const pages=[];
  let curP="";
  for(const p of paras){
    const trimmed=p.trim();
    if(!trimmed)continue;
    if(curP.length+trimmed.length>charsPerPage&&curP.length>300){
      pages.push({type:"text",content:curP.trim()});
      curP=trimmed+"\n\n";
    }else{
      curP+=trimmed+"\n\n";
    }
  }
  if(curP.trim()||!pages.length)pages.push({type:"text",content:curP.trim()||"(Arquivo vazio)"});
  return pages;
}

function resolveZipPath(baseFile,relHref){
  const cleanRel=String(relHref||"").split("#")[0].split("?")[0];
  if(!cleanRel)return "";
  const parts=baseFile.split("/");
  parts.pop();
  for(const seg of cleanRel.split("/")){
    if(!seg||seg===".")continue;
    if(seg==="..")parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

async function parseEpubBuffer(buf){
  const zip=await window.JSZip.loadAsync(buf);
  const parser=new DOMParser();
  const containerXml=await zip.file("META-INF/container.xml")?.async("string");
  if(!containerXml)throw new Error("EPUB invalido");
  const cDoc=parser.parseFromString(containerXml,"application/xml");
  const rootfile=cDoc.querySelector("rootfile")?.getAttribute("full-path");
  if(!rootfile)throw new Error("OPF nao encontrado");

  const opfXml=await zip.file(rootfile)?.async("string");
  if(!opfXml)throw new Error("OPF ausente");
  const opfDoc=parser.parseFromString(opfXml,"application/xml");

  const manifest={};
  opfDoc.querySelectorAll("manifest > item").forEach(it=>{
    const id=it.getAttribute("id"),href=it.getAttribute("href"),mt=it.getAttribute("media-type")||"";
    if(id&&href)manifest[id]={href:resolveZipPath(rootfile,decodeURIComponent(href)),mt};
  });

  const blobByPath={};
  for(const k of Object.keys(manifest)){
    const item=manifest[k];
    if(item.mt.startsWith("image/")){
      const zf=zip.file(item.href);
      if(zf){
        const b=await zf.async("blob");
        const u=URL.createObjectURL(new Blob([b],{type:item.mt}));
        blobUrlsToCleanup.push(u);
        blobByPath[item.href]=u;
      }
    }
  }

  const spineIds=[];
  opfDoc.querySelectorAll("spine > itemref").forEach(ir=>{
    const idref=ir.getAttribute("idref");
    if(idref&&manifest[idref])spineIds.push(idref);
  });

  const sections=[];
  for(const idref of spineIds){
    const item=manifest[idref];
    const zf=zip.file(item.href);
    if(!zf)continue;
    const rawHtml=await zf.async("string");
    const hDoc=parser.parseFromString(rawHtml,"text/html");
    hDoc.querySelectorAll("script,style,link,meta").forEach(el=>el.remove());
    hDoc.querySelectorAll("img,image").forEach(im=>{
      const src=im.getAttribute("src")||im.getAttribute("xlink:href")||im.getAttribute("href");
      if(src){
        const full=resolveZipPath(item.href,decodeURIComponent(src));
        if(blobByPath[full]){
          if(im.tagName.toLowerCase()==="image"){
            const newImg=hDoc.createElement("img");
            newImg.src=blobByPath[full];
            im.replaceWith(newImg);
          }else{
            im.src=blobByPath[full];
          }
        }
      }
    });
    const body=hDoc.body;
    if(!body)continue;
    const blocks=Array.from(body.children);
    if(!blocks.length){
      const t=(body.textContent||"").trim();
      if(t)sections.push({type:"html",content:`<p>${t}</p>`});
      continue;
    }
    let chunkHtml="",chunkLen=0;
    for(const blk of blocks){
      const outer=blk.outerHTML||"";
      const tLen=(blk.textContent||"").trim().length+(blk.querySelectorAll("img").length*400);
      if(chunkLen+tLen>2800&&chunkLen>300){
        sections.push({type:"html",content:chunkHtml});
        chunkHtml=outer;
        chunkLen=tLen;
      }else{
        chunkHtml+=outer;
        chunkLen+=tLen;
      }
    }
    if(chunkHtml.trim())sections.push({type:"html",content:chunkHtml});
  }
  return sections.length?sections:[{type:"text",content:"(Nenhum texto legível encontrado neste EPUB)"}];
}

async function parseDocxBuffer(buf){
  const zip=await window.JSZip.loadAsync(buf);
  const xml=await zip.file("word/document.xml")?.async("string");
  if(!xml)throw new Error("DOCX invalido");
  const parser=new DOMParser();
  const doc=parser.parseFromString(xml,"application/xml");
  const paras=[];
  doc.querySelectorAll("p").forEach(p=>{
    let line="";
    p.querySelectorAll("t").forEach(t=>{line+=t.textContent||""});
    if(line.trim())paras.push(line.trim());
  });
  return paginatePlainText(paras.join("\n\n"),2300);
}

async function parseCbzBuffer(buf){
  const zip=await window.JSZip.loadAsync(buf);
  const imgRe=/\.(jpe?g|png|webp|gif|bmp|avif)$/i;
  const entries=[];
  zip.forEach((relPath,file)=>{
    if(!file.dir&&imgRe.test(relPath)&&!relPath.includes("__MACOSX")){
      entries.push(file);
    }
  });
  entries.sort((a,b)=>a.name.localeCompare(b.name,"pt",{numeric:true,sensitivity:"base"}));
  const urls=[];
  for(const entry of entries){
    const blob=await entry.async("blob");
    const u=URL.createObjectURL(blob);
    blobUrlsToCleanup.push(u);
    urls.push(u);
  }
  return urls;
}

async function renderCbzCanvas(pageNum,canvas){
  const url=cbzImages[pageNum-1];
  if(!url)return;
  const imgEl=await new Promise((res,rej)=>{
    const im=new Image();
    im.onload=()=>res(im);
    im.onerror=rej;
    im.src=url;
  });
  const isImm=readerEl.classList.contains("immersive");
  const padW=isImm?16:(window.innerWidth<=720?28:110);
  const padH=isImm?12:32;
  const availW=Math.max(240,(rCanvasWrap.clientWidth-padW)/(bookSpread===2?2.05:1));
  const availH=Math.max(280,rCanvasWrap.clientHeight-padH);
  const fitScale=Math.min(availW/imgEl.naturalWidth,availH/imgEl.naturalHeight);
  const finalScale=Math.max(0.3,fitScale*bookZoom);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(imgEl.naturalWidth*finalScale*dpr);
  canvas.height=Math.floor(imgEl.naturalHeight*finalScale*dpr);
  canvas.style.width=Math.floor(imgEl.naturalWidth*finalScale)+"px";
  canvas.style.height=Math.floor(imgEl.naturalHeight*finalScale)+"px";
  const ctx=canvas.getContext("2d");
  ctx.drawImage(imgEl,0,0,canvas.width,canvas.height);
}

function rPrefKey(){return "iptv_rpref_"+uPrefix()}
function bmkKey(){return "iptv_bmk_"+uPrefix()}
function getRPrefs(){try{return JSON.parse(localStorage.getItem(rPrefKey())||"{}")}catch{return {}}}
function saveRPrefs(patch){
  const curP=getRPrefs();
  Object.assign(curP,patch);
  localStorage.setItem(rPrefKey(),JSON.stringify(curP));
}
function getBookBmks(id){
  try{const m=JSON.parse(localStorage.getItem(bmkKey())||"{}");return Array.isArray(m[id])?m[id]:[]}catch{return []}
}
function toggleBookBmk(id,pg){
  try{
    const m=JSON.parse(localStorage.getItem(bmkKey())||"{}");
    const list=Array.isArray(m[id])?m[id]:[];
    const idx=list.indexOf(pg);
    if(idx>=0)list.splice(idx,1);else list.push(pg);
    list.sort((a,b)=>a-b);
    m[id]=list;
    localStorage.setItem(bmkKey(),JSON.stringify(m));
  }catch{}
  updateBmkUI();
}

function saveBookProgress(id,pg,tot){
  if(!id||!tot)return;
  const m=getProgMap();
  m[id]={t:pg,d:tot};
  localStorage.setItem(pKey(),JSON.stringify(m));
  if(pg>=tot)setWatched(id,true);
}

function applyReaderTheme(theme){
  readerEl.classList.remove("theme-light","theme-sepia","theme-dark","theme-amoled");
  readerEl.classList.add("theme-"+theme);
  readerEl.querySelectorAll(".rtheme").forEach(b=>b.classList.toggle("active",b.dataset.theme===theme));
  saveRPrefs({theme});
}

function applyComfort(bright,warmth,font){
  document.getElementById("rstage").style.filter=`brightness(${bright}%)`;
  rAmber.style.background=`rgba(255,140,0,${(warmth/100)*0.45})`;
  if(font)rReflow.style.fontFamily=font;
  document.getElementById("r-bright-val").textContent=bright+"%";
  document.getElementById("r-warmth-val").textContent=warmth+"%";
  saveRPrefs({bright,warmth,font});
}

function updateBmkUI(){
  if(!curBook)return;
  const list=getBookBmks(curBook.id);
  const marked=list.includes(bookPage);
  rBmkBtn.classList.toggle("active",marked);
  rBmkBtn.textContent=marked?"\uD83D\uDD16 Marcada":"\uD83D\uDD16 Marcar";
  rBmkList.innerHTML="";
  if(!list.length){
    rBmkList.innerHTML="<span style='color:#888'>Nenhuma página marcada ainda</span>";
    return;
  }
  list.forEach(p=>{
    const ch=document.createElement("button");
    ch.className="bmk-chip";
    ch.textContent="P\u00e1g. "+p;
    ch.onclick=()=>{goToBookPage(p);rSettings.hidden=true};
    rBmkList.appendChild(ch);
  });
}

function updateBookWatchedUI(){
  if(!curBook)return;
  const w=isWatched(curBook.id);
  rWatchedBtn.classList.toggle("active",w);
  rWatchedBtn.textContent=w?"\u2713 Lido":"\u2713 Marcar lido";
}

function getContentBounds(ctx,w,h){
  try{
    const data=ctx.getImageData(0,0,w,h).data;
    const bgR=data[0],bgG=data[1],bgB=data[2];
    const tol=26;
    let minX=w,minY=h,maxX=0,maxY=0,found=false;
    const step=3;
    for(let y=0;y<h;y+=step){
      const row=y*w*4;
      for(let x=0;x<w;x+=step){
        const i=row+x*4;
        if(data[i+3]>20&&(Math.abs(data[i]-bgR)>tol||Math.abs(data[i+1]-bgG)>tol||Math.abs(data[i+2]-bgB)>tol)){
          if(x<minX)minX=x;
          if(x>maxX)maxX=x;
          if(y<minY)minY=y;
          if(y>maxY)maxY=y;
          found=true;
        }
      }
    }
    if(!found||(maxX-minX)<w*0.18||(maxY-minY)<h*0.12)return {x:0,y:0,w,h};
    const padX=Math.round(w*0.02);
    const padY=Math.round(h*0.016);
    const x=Math.max(0,minX-padX);
    const y=Math.max(0,minY-padY);
    const cw=Math.min(w-x,(maxX-minX)+padX*2);
    const ch=Math.min(h-y,(maxY-minY)+padY*2);
    return {x,y,w:cw,h:ch};
  }catch{
    return {x:0,y:0,w,h};
  }
}

async function renderSingleCanvas(pageNum,canvas){
  const page=await pdfDoc.getPage(pageNum);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const renderVp=page.getViewport({scale:2});
  const tmp=document.createElement("canvas");
  tmp.width=Math.floor(renderVp.width);
  tmp.height=Math.floor(renderVp.height);
  const tctx=tmp.getContext("2d",{willReadFrequently:true});
  tctx.fillStyle="#ffffff";
  tctx.fillRect(0,0,tmp.width,tmp.height);
  await page.render({canvasContext:tctx,viewport:renderVp}).promise;

  const b=getContentBounds(tctx,tmp.width,tmp.height);
  const isImm=readerEl.classList.contains("immersive");
  const isMobile=window.innerWidth<=720;
  const padW=isImm?8:(isMobile?12:64);
  const padH=isImm?8:(isMobile?10:24);
  const availW=Math.max(240,(rCanvasWrap.clientWidth-padW)/(bookSpread===2?2.04:1));
  const availH=Math.max(280,rCanvasWrap.clientHeight-padH);

  const fitScale=Math.min(availW/b.w,availH/b.h)*bookZoom;
  let dispW=Math.floor(b.w*fitScale);
  let dispH=Math.floor(b.h*fitScale);

  if(isMobile&&bookSpread===1&&bookZoom===1&&dispH<availH*0.92&&pageNum>1){
    dispH=Math.min(Math.floor(availH*0.96),Math.floor(dispH*1.32));
  }

  canvas.width=Math.floor(dispW*dpr);
  canvas.height=Math.floor(dispH*dpr);
  canvas.style.width=dispW+"px";
  canvas.style.height=dispH+"px";
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(tmp,b.x,b.y,b.w,b.h,0,0,canvas.width,canvas.height);
}

async function renderKindleText(pageNum){
  rReflow.style.fontSize=kindleFontPx+"px";
  rReflow.innerHTML="";
  const head=document.createElement("div");
  head.className="r-reflow-head";
  head.innerHTML=`<span>${curBook.title}</span><span>P\u00e1gina ${pageNum} de ${bookTotal}</span>`;
  const body=document.createElement("div");

  if(bookPagesData.length>0){
    const pgObj=bookPagesData[pageNum-1]||{type:"text",content:""};
    if(pgObj.type==="html"){
      rReflow.classList.add("html-mode");
      body.innerHTML=pgObj.content;
    }else{
      rReflow.classList.remove("html-mode");
      body.textContent=pgObj.content;
    }
    rReflow.append(head,body);
    rCanvasWrap.scrollTop=0;
    return;
  }

  rReflow.classList.remove("html-mode");
  if(!pdfDoc)return;
  const page=await pdfDoc.getPage(pageNum);
  const tc=await page.getTextContent();
  let lines=[],lastY=null,curLine="";
  for(const item of tc.items){
    const y=item.transform?Math.round(item.transform[5]):0;
    if(lastY!==null&&Math.abs(y-lastY)>6){
      lines.push(curLine.trim());
      if(Math.abs(y-lastY)>18)lines.push("");
      curLine=item.str;
    }else{
      curLine+=(curLine&&!curLine.endsWith(" ")&&!item.str.startsWith(" ")?" ":"")+item.str;
    }
    lastY=y;
  }
  if(curLine.trim())lines.push(curLine.trim());
  const bodyText=lines.join("\n").trim();
  body.textContent=bodyText||"(Esta página contém apenas imagens/ilustrações. Use o modo '📄 Página' acima para visualizá-la.)";
  rReflow.append(head,body);
  rCanvasWrap.scrollTop=0;
}

async function renderBookView(){
  if(!curBook)return;
  const myToken=++renderToken;
  const ext=(curBook.ext||"pdf").toLowerCase();
  const isTextOnlyFormat=ext==="epub"||ext==="txt"||ext==="md"||ext==="docx";
  const isCbz=ext==="cbz";

  const pct=bookTotal>0?Math.round((bookPage/bookTotal)*100):0;
  const minsLeft=Math.max(1,Math.round((bookTotal-bookPage)*1.2));
  rSub.textContent=`P\u00e1gina ${bookPage} de ${bookTotal} \u2022 ${pct}% conclu\u00eddo`;
  rSlider.max=bookTotal;
  rSlider.value=bookPage;
  rPageIn.max=bookTotal;
  rPageIn.value=bookPage;
  rTotal.textContent=bookTotal;
  rPct.textContent=pct+"% conclu\u00eddo";
  rEta.textContent=bookPage>=bookTotal?"\uD83C\uDF89 Leitura conclu\u00edda!":`~${minsLeft} min restantes`;
  saveBookProgress(curBook.id,bookPage,bookTotal);
  updateBmkUI();

  document.getElementById("rmode-page").hidden=isTextOnlyFormat;
  document.getElementById("rmode-kindle").hidden=isCbz;
  document.getElementById("rmode-page").classList.toggle("active",bookMode==="page");
  document.getElementById("rmode-kindle").classList.toggle("active",bookMode==="kindle");
  document.getElementById("rmode-drive").classList.toggle("active",bookMode==="drive");
  document.getElementById("rlayout-group").hidden=bookMode!=="page";
  document.getElementById("rlay-1").classList.toggle("active",bookSpread===1);
  document.getElementById("rlay-2").classList.toggle("active",bookSpread===2);

  if(bookMode==="drive"){
    rLoader.hidden=true;
    rPages.hidden=true;
    rReflow.hidden=true;
    rFrame.hidden=false;
    const targetSrc=`https://drive.google.com/file/d/${curBook.id}/preview`;
    if(rFrame.src!==targetSrc)rFrame.src=targetSrc;
    return;
  }

  rFrame.hidden=true;

  if(bookMode==="kindle"||isTextOnlyFormat){
    rPages.hidden=true;
    rReflow.hidden=false;
    rZoomVal.textContent=kindleFontPx+"px";
    rLoader.hidden=false;
    try{
      await renderKindleText(bookPage);
    }catch{}
    if(myToken===renderToken)rLoader.hidden=true;
    return;
  }

  if(!pdfDoc&&!cbzImages.length)return;
  rReflow.hidden=true;
  rPages.hidden=false;
  rZoomVal.textContent=Math.round(bookZoom*100)+"%";
  rLoader.hidden=false;
  try{
    if(isCbz){
      await renderCbzCanvas(bookPage,c1);
      if(bookSpread===2&&bookPage+1<=bookTotal){
        c2.hidden=false;
        await renderCbzCanvas(bookPage+1,c2);
      }else{
        c2.hidden=true;
      }
    }else{
      await renderSingleCanvas(bookPage,c1);
      if(bookSpread===2&&bookPage+1<=bookTotal){
        c2.hidden=false;
        await renderSingleCanvas(bookPage+1,c2);
      }else{
        c2.hidden=true;
      }
    }
    rCanvasWrap.scrollTop=0;
  }catch{}
  if(myToken===renderToken)rLoader.hidden=true;
}

function goToBookPage(n){
  if(!bookTotal)return;
  bookPage=Math.max(1,Math.min(bookTotal,Number(n)||1));
  renderBookView();
}

function turnBookPage(dir){
  const step=(bookMode==="page"&&bookSpread===2)?2:1;
  goToBookPage(bookPage+dir*step);
}

async function openBook(b){
  cleanupBookBlobs();
  curBook=b;
  const ext=(b.ext||"pdf").toLowerCase();
  rTitle.textContent=b.title;
  rSub.textContent="Abrindo livro...";
  rSettings.hidden=true;
  readerEl.hidden=false;
  pdfDoc=null;

  const prefs=getRPrefs();
  applyReaderTheme(prefs.theme||"sepia");
  const bright=prefs.bright||100,warmth=prefs.warmth||0,font=prefs.font||"Georgia, 'Times New Roman', serif";
  document.getElementById("r-bright").value=bright;
  document.getElementById("r-warmth").value=warmth;
  document.getElementById("r-font").value=font;
  applyComfort(bright,warmth,font);

  const savedP=getProg(b.id);
  bookPage=(savedP&&savedP.t>=1)?savedP.t:1;
  bookTotal=(savedP&&savedP.d>=1)?savedP.d:1;
  bookMode=(ext==="epub"||ext==="txt"||ext==="md"||ext==="docx")?"kindle":"page";
  bookZoom=1;
  updateBookWatchedUI();
  updateBmkUI();

  rLoader.hidden=false;
  rLoader.textContent=`Carregando ${ext.toUpperCase()}...`;
  rPages.hidden=true;
  rReflow.hidden=true;
  rFrame.hidden=true;

  try{
    const streamUrl=`/api/stream?id=${b.id}&type=book`;
    if(ext==="epub"){
      const resp=await fetch(streamUrl);
      if(!resp.ok)throw new Error("erro download");
      bookPagesData=await parseEpubBuffer(await resp.arrayBuffer());
      bookTotal=bookPagesData.length||1;
    }else if(ext==="docx"){
      const resp=await fetch(streamUrl);
      if(!resp.ok)throw new Error("erro download");
      bookPagesData=await parseDocxBuffer(await resp.arrayBuffer());
      bookTotal=bookPagesData.length||1;
    }else if(ext==="txt"||ext==="md"){
      const resp=await fetch(streamUrl);
      if(!resp.ok)throw new Error("erro download");
      bookPagesData=paginatePlainText(await resp.text(),2300);
      bookTotal=bookPagesData.length||1;
    }else if(ext==="cbz"){
      const resp=await fetch(streamUrl);
      if(!resp.ok)throw new Error("erro download");
      cbzImages=await parseCbzBuffer(await resp.arrayBuffer());
      if(!cbzImages.length)throw new Error("cbz vazio");
      bookTotal=cbzImages.length;
    }else{
      const loadingTask=window.pdfjsLib.getDocument({
        url:`/api/stream?id=${b.id}&type=pdf`,
        cMapUrl:"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
        cMapPacked:true
      });
      pdfDoc=await loadingTask.promise;
      bookTotal=pdfDoc.numPages||1;
    }
    if(bookPage>bookTotal)bookPage=1;
    await renderBookView();
  }catch{
    bookMode="drive";
    await renderBookView();
  }
}

const rExitFsBtn=document.getElementById("r-exit-fs");

function setReaderImmersive(on){
  readerEl.classList.toggle("immersive",on);
  rExitFsBtn.hidden=!on;
  if(on){
    rSettings.hidden=true;
    if(!document.fullscreenElement&&readerEl.requestFullscreen){
      readerEl.requestFullscreen().catch(()=>{});
    }
  }else if(document.fullscreenElement){
    document.exitFullscreen().catch(()=>{});
  }
  setTimeout(()=>renderBookView(),50);
}

function toggleReaderImmersive(){
  setReaderImmersive(!readerEl.classList.contains("immersive"));
}

function closeBook(){
  if(pdfDoc){try{pdfDoc.destroy()}catch{}pdfDoc=null}
  cleanupBookBlobs();
  rFrame.src="";
  rSettings.hidden=true;
  readerEl.classList.remove("immersive");
  rExitFsBtn.hidden=true;
  if(document.fullscreenElement){document.exitFullscreen().catch(()=>{})}
  readerEl.hidden=true;
  curBook=null;
  buildBars();
  render();
}

document.getElementById("r-close").onclick=closeBook;
document.getElementById("r-prev").onclick=()=>turnBookPage(-1);
document.getElementById("r-next").onclick=()=>turnBookPage(1);
document.getElementById("r-prev-zone").onclick=()=>turnBookPage(-1);
document.getElementById("r-next-zone").onclick=()=>turnBookPage(1);
document.getElementById("rmode-page").onclick=()=>{bookMode="page";renderBookView()};
document.getElementById("rmode-kindle").onclick=()=>{bookMode="kindle";renderBookView()};
document.getElementById("rmode-drive").onclick=()=>{bookMode="drive";renderBookView()};
document.getElementById("rlay-1").onclick=()=>{bookSpread=1;renderBookView()};
document.getElementById("rlay-2").onclick=()=>{bookSpread=2;renderBookView()};
readerEl.querySelectorAll(".rtheme").forEach(btn=>{
  btn.onclick=()=>applyReaderTheme(btn.dataset.theme);
});
document.getElementById("rzoom-in").onclick=()=>{
  if(bookMode==="kindle")kindleFontPx=Math.min(34,kindleFontPx+2);
  else bookZoom=Math.min(2.5,+(bookZoom+0.15).toFixed(2));
  renderBookView();
};
document.getElementById("rzoom-out").onclick=()=>{
  if(bookMode==="kindle")kindleFontPx=Math.max(14,kindleFontPx-2);
  else bookZoom=Math.max(0.5,+(bookZoom-0.15).toFixed(2));
  renderBookView();
};
document.getElementById("rzoom-fit").onclick=()=>{
  bookZoom=1;kindleFontPx=20;renderBookView();
};
document.getElementById("r-aa-btn").onclick=e=>{
  e.stopPropagation();
  rSettings.hidden=!rSettings.hidden;
};
document.getElementById("r-settings-close").onclick=()=>{
  rSettings.hidden=true;
};
rSettings.onclick=e=>e.stopPropagation();
readerEl.addEventListener("click",e=>{
  if(!rSettings.hidden&&!rSettings.contains(e.target)&&e.target.id!=="r-aa-btn"){
    rSettings.hidden=true;
  }
});
document.getElementById("r-bright").oninput=e=>{
  applyComfort(+e.target.value,+document.getElementById("r-warmth").value,document.getElementById("r-font").value);
};
document.getElementById("r-warmth").oninput=e=>{
  applyComfort(+document.getElementById("r-bright").value,+e.target.value,document.getElementById("r-font").value);
};
document.getElementById("r-font").onchange=e=>{
  applyComfort(+document.getElementById("r-bright").value,+document.getElementById("r-warmth").value,e.target.value);
};
rBmkBtn.onclick=()=>{if(curBook)toggleBookBmk(curBook.id,bookPage)};
rWatchedBtn.onclick=()=>{
  if(!curBook)return;
  const next=!isWatched(curBook.id);
  setWatched(curBook.id,next);
  updateBookWatchedUI();
  syncCardState(curBook.id);
};
document.getElementById("r-fs-btn").onclick=toggleReaderImmersive;
rExitFsBtn.onclick=()=>setReaderImmersive(false);
rSlider.oninput=e=>{rPageIn.value=e.target.value};
rSlider.onchange=e=>goToBookPage(e.target.value);
rPageIn.onchange=e=>goToBookPage(e.target.value);

let touchStartX=0,touchStartY=0;
rCanvasWrap.addEventListener("touchstart",e=>{
  if(e.touches.length===1){touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY}
},{passive:true});
rCanvasWrap.addEventListener("touchend",e=>{
  if(!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-touchStartX;
  const dy=e.changedTouches[0].clientY-touchStartY;
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){
    if(dx<0)turnBookPage(1);else turnBookPage(-1);
  }
},{passive:true});

searchInput.oninput=e=>{searchTerm=e.target.value;render()};
document.getElementById("home").onclick=e=>{e.preventDefault();stack=[];activeCat="ALL";activeSub="ALL";savedCat="ALL";savedSub="ALL";searchInput.value="";searchTerm="";load()};
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
