import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trophy, Shuffle, ZoomIn, ZoomOut, Printer, Image as ImageIcon, Trash2, RotateCcw } from "lucide-react";

type Category = { id:string; tournament_id:string; name:string; format:string; gender:string; hand:string; min_weight:number|null; max_weight:number|null };
type Athlete = { id:string; first_name:string; last_name:string; gender:string; birth_date:string|null; club_id:string|null };
type Registration = { id:string; athlete_id:string; tournament_id:string; hand:string; status:string };
type WeighIn = { id:string; registration_id:string; weight:number; measured_at:string };
type Match = { id:string; round_no:number; match_no:number; athlete_a_id:string|null; athlete_b_id:string|null; score_a:number|null; score_b:number|null; winner_id:string|null; status:string; fouls_a:number; fouls_b:number; remarks_a:number; remarks_b:number; finish_reason:string|null; bracket_side:string; next_match_id:string|null; next_slot:"athlete_a_id"|"athlete_b_id"|null; loser_next_match_id:string|null; loser_next_slot:"athlete_a_id"|"athlete_b_id"|null };
type Bracket = { id:string; name:string; category_id:string; format:string };
type MatchEvent = { id:string; match_id:string; action:string; old_data:any; new_data:any; changed_at:string; changed_by:string|null };

export default function BracketBuilder({client,canEdit,canManage=canEdit,onMessage,initialBracketId,onExit,onOpenEditor}:{client:any;canEdit:boolean;canManage?:boolean;onMessage:(s:string)=>void;initialBracketId?:string;onExit?:()=>void;onOpenEditor?:(id:string)=>void}) {
 const canManageStructure=canManage;
 const [categories,setCategories]=useState<Category[]>([]);
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [registrations,setRegistrations]=useState<Registration[]>([]);
 const [weighIns,setWeighIns]=useState<WeighIn[]>([]);
 const [brackets,setBrackets]=useState<Bracket[]>([]);
 const [selectedCategory,setSelectedCategory]=useState("");
 const [selectedBracket,setSelectedBracket]=useState(initialBracketId||"");
 const [selectedAthletes,setSelectedAthletes]=useState<string[]>([]);
 const [format,setFormat]=useState<"single"|"double"|"rr">("single");
 const [bracketName,setBracketName]=useState("");
 const [matches,setMatches]=useState<Match[]>([]);
 const [matchEvents,setMatchEvents]=useState<MatchEvent[]>([]);
 const [showHistory,setShowHistory]=useState(false);
 const [archivedBrackets,setArchivedBrackets]=useState<Bracket[]>([]);
 const [showTrash,setShowTrash]=useState(false);
 const [zoom,setZoom]=useState(1);
 const [busy,setBusy]=useState(false);
 const athleteMap=useMemo(()=>new Map(athletes.map(a=>[a.id,a])),[athletes]);
 const category=categories.find(c=>c.id===selectedCategory);
 useEffect(()=>{
  setSelectedAthletes([]);
  if(category&&["single","double","rr"].includes(category.format))setFormat(category.format as "single"|"double"|"rr");
 },[selectedCategory]);
 const eligible=useMemo(()=>{
   if(!category)return [];
   const categoryRegistrations=registrations.filter(r=>r.tournament_id===category.tournament_id&&r.status==="approved"&&(category.hand==="both"||r.hand==="both"||r.hand===category.hand));
   const latestWeight=new Map<string,number>();
   const registrationById=new Map(categoryRegistrations.map(r=>[r.id,r]));
   for(const weighIn of weighIns){
     const registration=registrationById.get(weighIn.registration_id);
     if(registration&&!latestWeight.has(registration.athlete_id))latestWeight.set(registration.athlete_id,Number(weighIn.weight));
   }
   const ids=new Set(categoryRegistrations.map(r=>r.athlete_id));
   return athletes.filter(a=>{
     if(!ids.has(a.id)||(category.gender!=="other"&&a.gender!==category.gender))return false;
     const weight=latestWeight.get(a.id);
     if((category.min_weight!==null||category.max_weight!==null)&&weight===undefined)return false;
     if(weight!==undefined&&category.min_weight!==null&&weight<Number(category.min_weight))return false;
     if(weight!==undefined&&category.max_weight!==null&&weight>Number(category.max_weight))return false;
     return true;
   }).sort((a,b)=>a.last_name.localeCompare(b.last_name,"ru")||a.first_name.localeCompare(b.first_name,"ru"));
 },[category,athletes,registrations,weighIns]);
 async function fetchAll(query:any){
  const all:any[]=[];
  for(let offset=0;;offset+=1000){
   const {data,error}=await query.range(offset,offset+999);
   if(error)return {data:null,error};
   all.push(...(data||[]));
   if((data||[]).length<1000)break;
  }
  return {data:all,error:null};
 }
 async function reload(){
  setBusy(true);
  const [c,a,r,b,w,trash]=await Promise.all([
   fetchAll(client.from("tournament_categories").select("*").order("name").order("id")),
   fetchAll(client.from("athletes").select("*").order("last_name").order("id")),
   fetchAll(client.from("registrations").select("*").eq("status","approved").order("id")),
   fetchAll(client.from("brackets").select("*").is("archived_at",null).order("created_at",{ascending:false}).order("id")),
   fetchAll(client.from("weigh_ins").select("id,registration_id,weight,measured_at").order("measured_at",{ascending:false}).order("id")),
   fetchAll(client.from("brackets").select("*").not("archived_at","is",null).order("archived_at",{ascending:false}).order("id"))
  ]);
  const error=c.error||a.error||r.error||b.error||w.error||trash.error;
  if(error)onMessage("Не удалось загрузить данные конструктора: "+error.message);
  setCategories(c.data||[]);setAthletes(a.data||[]);setRegistrations(r.data||[]);setBrackets(b.data||[]);setWeighIns(w.data||[]);setArchivedBrackets(trash.data||[]);
  setBusy(false);
 }
 useEffect(()=>{void reload()},[]);
 useEffect(()=>{if(initialBracketId)void openBracket(initialBracketId)},[initialBracketId]);
 async function openBracket(id:string){
  setSelectedBracket(id);if(onOpenEditor&&!initialBracketId)onOpenEditor(id);setBusy(true);
  const [matchResult,eventResult]=await Promise.all([
   fetchAll(client.from("matches").select("*").eq("bracket_id",id).order("round_no").order("match_no").order("id")),
   client.from("match_change_log").select("id,match_id,action,old_data,new_data,changed_at,changed_by").eq("bracket_id",id).order("changed_at",{ascending:false}).limit(100)
  ]);
  if(matchResult.error)onMessage(matchResult.error.message);else setMatches(matchResult.data||[]);
  if(eventResult.error)onMessage("Не удалось загрузить историю: "+eventResult.error.message);else setMatchEvents(eventResult.data||[]);
  setShowHistory(false);
  setBusy(false);
 }
 async function resolveAutomaticByes(bracketId:string){
  const result=await fetchAll(client.from("matches").select("*").eq("bracket_id",bracketId));
  if(result.error){onMessage("Не удалось проверить автоматические проходы: "+result.error.message);return}
  const graph:any[]=[...(result.data||[])];
  let changed=true,passes=0;
  while(changed&&passes++<graph.length+1){
   changed=false;
   for(const match of graph){
    if(match.status!=="pending"||!["winners","losers"].includes(match.bracket_side))continue;
    const slots=["athlete_a_id","athlete_b_id"] as const;
    const resolved=slots.map(slot=>{
     if(match[slot])return true;
     const feeders=graph.filter(source=>
      (source.next_match_id===match.id&&source.next_slot===slot)||
      (source.loser_next_match_id===match.id&&source.loser_next_slot===slot)
     );
     return feeders.length>0&&feeders.every(source=>
      source.status==="bye"&&(
       (source.loser_next_match_id===match.id&&source.loser_next_slot===slot)||
       source.winner_id==null
      )
     );
    });
    const present=Number(Boolean(match.athlete_a_id))+Number(Boolean(match.athlete_b_id));
    if(present>1||!resolved.every(Boolean))continue;
    const winnerId=match.athlete_a_id||match.athlete_b_id||null;
    const {error:updateError}=await client.from("matches").update({status:"bye",winner_id:winnerId,score_a:null,score_b:null,finish_reason:null}).eq("id",match.id).eq("status","pending");
    if(updateError){onMessage("Не удалось оформить автоматический проход: "+updateError.message);continue}
    match.status="bye";match.winner_id=winnerId;changed=true;
    if(winnerId&&match.next_match_id&&match.next_slot){
      const target=graph.find(x=>x.id===match.next_match_id);
      if(!target){onMessage("Не найден следующий матч для автоматического прохода.");continue}
      const current=target[match.next_slot];
      if(current&&current!==winnerId){onMessage("Автоматический проход остановлен: целевой слот занят другим спортсменом.");continue}
      if(!current){
       const {error:propError}=await client.from("matches").update({[match.next_slot]:winnerId}).eq("id",target.id);
       if(propError){onMessage("Не удалось перенести участника после автоматического прохода: "+propError.message);continue}
       target[match.next_slot]=winnerId;
      }
    }
   }
  }
 }
 async function insertMatchBatches(rows:any[]){
  for(let i=0;i<rows.length;i+=500){
   const {error}=await client.from("matches").insert(rows.slice(i,i+500));
   if(error)return error;
  }
  return null;
 }
 async function propagateInitialByes(rows:any[]){
  for(const match of rows.filter(row=>row.status==="bye"&&row.winner_id&&row.next_match_id&&row.next_slot)){
   const {data:target,error:readError}=await client.from("matches").select("id,"+match.next_slot).eq("id",match.next_match_id).maybeSingle();
   if(readError)return "Не удалось проверить следующий матч после прохода: "+readError.message;
   if(!target)return "Не найден следующий матч после автоматического прохода.";
   const current=target[match.next_slot];
   if(current&&current!==match.winner_id)return "В следующем матче уже указан другой спортсмен.";
   if(!current){
    const {error}=await client.from("matches").update({[match.next_slot]:match.winner_id}).eq("id",match.next_match_id);
    if(error)return "Не удалось перенести спортсмена после автоматического прохода: "+error.message;
   }
  }
  return null;
 }
 function shuffleAthletes(){setSelectedAthletes(prev=>{const next=[...prev];for(let i=next.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[next[i],next[j]]=[next[j],next[i]]}return next})}
 async function archiveBracket(id:string){if(!canManageStructure||!confirm("Переместить сетку в корзину? Матчи и результаты сохранятся."))return;const {error}=await client.from("brackets").update({archived_at:new Date().toISOString()}).eq("id",id);if(error){onMessage(error.message);return}if(selectedBracket===id){setSelectedBracket("");setMatches([])}onMessage("Сетка перемещена в корзину.");await reload()}
 async function restoreBracket(id:string){if(!canManageStructure)return;const {error}=await client.from("brackets").update({archived_at:null}).eq("id",id);if(error){onMessage(error.message);return}onMessage("Сетка восстановлена.");await reload()}
 async function duplicateBracket(id:string){
  if(!canManageStructure)return;
  const source=brackets.find(b=>b.id===id);
  if(!source)return;
  if(!confirm("Создать копию сетки? Участники и структура сохранятся, результаты и нарушения будут очищены."))return;
  setBusy(true);
  const sourceResult=await fetchAll(client.from("matches").select("*").eq("bracket_id",id).order("round_no").order("match_no"));
  const sourceMatches=sourceResult.data;
  const readError=sourceResult.error;
  if(readError||!sourceMatches){onMessage("Не удалось прочитать исходную сетку: "+(readError?.message||"ошибка"));setBusy(false);return}
  const {data:copy,error}=await client.from("brackets").insert({name:source.name+" — копия",category_id:source.category_id,format:source.format}).select("*").single();
  if(error||!copy){onMessage("Не удалось создать копию: "+(error?.message||"ошибка"));setBusy(false);return}
  const idMap=new Map(sourceMatches.map((m:any)=>[m.id,crypto.randomUUID()]));
  const rows=sourceMatches.map((m:any)=>({id:idMap.get(m.id),bracket_id:copy.id,round_no:m.round_no,match_no:m.match_no,bracket_side:m.bracket_side,athlete_a_id:m.athlete_a_id,athlete_b_id:m.athlete_b_id,score_a:null,score_b:null,status:m.status==="bye"&&Boolean(m.athlete_a_id)!==Boolean(m.athlete_b_id)?"bye":"pending",winner_id:m.status==="bye"?(m.athlete_a_id||m.athlete_b_id||null):null,fouls_a:0,fouls_b:0,remarks_a:0,remarks_b:0,finish_reason:null,next_match_id:m.next_match_id?idMap.get(m.next_match_id)||null:null,next_slot:m.next_slot,loser_next_match_id:m.loser_next_match_id?idMap.get(m.loser_next_match_id)||null:null,loser_next_slot:m.loser_next_slot}));
  const insertError=await insertMatchBatches(rows);
  if(insertError){await client.from("brackets").delete().eq("id",copy.id);onMessage("Не удалось скопировать матчи: "+insertError.message);setBusy(false);return}
  const byeError=await propagateInitialByes(rows);
  if(byeError){onMessage(byeError);setBusy(false);return}
  await resolveAutomaticByes(copy.id);
  onMessage("Копия сетки создана без результатов.");await reload();await openBracket(copy.id);
 }
 async function exportBracketPng(){const node=document.querySelector(".bracket-rounds");if(!node){onMessage("Сначала откройте сетку.");return}const markup=node.outerHTML.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>body{background:#0d1014;color:#edf1f5;font-family:Arial}.bracket-rounds{display:flex;gap:18px;align-items:flex-start}.bracket-round{min-width:240px}.match-card{background:#151a20;border:1px solid #2b343e;border-radius:8px;padding:12px;margin:10px 0}.match-athlete{padding:8px;border-bottom:1px solid #333}.match-number{color:#d99b42;font-weight:bold}</style>${markup}</div></foreignObject></svg>`;const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));const img=new Image();img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=1800;canvas.height=1200;const ctx=canvas.getContext("2d");if(ctx){ctx.drawImage(img,0,0);canvas.toBlob(blob=>{if(blob){const pngUrl=URL.createObjectURL(blob);const a=document.createElement("a");a.href=pngUrl;a.download="setka.png";a.click();URL.revokeObjectURL(pngUrl)}URL.revokeObjectURL(url)},"image/png")}};img.onerror=()=>{URL.revokeObjectURL(url);onMessage("Не удалось сформировать PNG в этом браузере.")};img.src=url}
 function exportBracketSvg(){const node=document.querySelector(".bracket-rounds");if(!node){onMessage("Сначала откройте сетку.");return}const html=node.outerHTML.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>body{background:#0d1014;color:#edf1f5;font-family:Arial}.bracket-rounds{display:flex;gap:18px;align-items:flex-start}.bracket-round{min-width:240px}.match-card{background:#151a20;border:1px solid #2b343e;border-radius:8px;padding:12px;margin:10px 0}.match-athlete{padding:8px;border-bottom:1px solid #333}.match-number{color:#d99b42;font-weight:bold}</style>${html}</div></foreignObject></svg>`;const blob=new Blob([svg],{type:"image/svg+xml"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="setka.svg";a.click();URL.revokeObjectURL(url)}
 function moveAthlete(index:number,delta:number){
  setSelectedAthletes(prev=>{const next=[...prev];const to=index+delta;if(to<0||to>=next.length)return prev;[next[index],next[to]]=[next[to],next[index]];return next});
 }
 async function createBracket(){
  if(!canManageStructure||!category||selectedAthletes.length<2){onMessage("Выберите категорию и минимум двух допущенных спортсменов.");return}
  setBusy(true);
  const name=bracketName.trim()||category.name+" — "+(format==="single"?"олимпийская сетка":format==="double"?"двойное выбывание":"круговая система");
  const {data:created,error}=await client.from("brackets").insert({category_id:category.id,name,format}).select("*").single();
  if(error||!created){onMessage("Не удалось создать сетку: "+(error?.message||"нет ответа"));setBusy(false);return}
  let rows:any[]=[];
  if(format==="rr"){
   let n=1;
   for(let i=0;i<selectedAthletes.length;i++)for(let j=i+1;j<selectedAthletes.length;j++)rows.push({bracket_id:created.id,round_no:1,match_no:n++,athlete_a_id:selectedAthletes[i],athlete_b_id:selectedAthletes[j],bracket_side:"winners"});
  }else{
   const size=2**Math.ceil(Math.log2(selectedAthletes.length));
   const wbRounds=Math.log2(size);
   const wb:any[][]=[];
   let seedPositions=[1,2];
   while(seedPositions.length<size){
    const nextSize=seedPositions.length*2;
    seedPositions=seedPositions.flatMap(seed=>[seed,nextSize+1-seed]);
   }
   // seedPositions describes the seed assigned to each visual slot.
   // Map it in slot order; inverting this array pairs the wrong seeds (e.g. 1 vs 3).
   const seededAthletes:(string|null)[] = seedPositions.map(seed=>selectedAthletes[seed-1]||null);
   for(let r=1;r<=wbRounds;r++){
    const count=size/2**r;wb[r]=[];
    for(let m=1;m<=count;m++){
     const id=crypto.randomUUID();
     const row:any={id,bracket_id:created.id,round_no:r,match_no:m,bracket_side:"winners"};
     if(r===1){
      const a=seededAthletes[(m-1)*2]||null,b=seededAthletes[(m-1)*2+1]||null;
      row.athlete_a_id=a;row.athlete_b_id=b;
      if((a&&!b)||(!a&&b)){row.winner_id=a||b;row.status="bye"}
     }
     wb[r][m]=row;rows.push(row);
    }
   }
   const link=(from:any,to:any,slot:"athlete_a_id"|"athlete_b_id",loser=false)=>{
    if(loser){from.loser_next_match_id=to.id;from.loser_next_slot=slot}
    else{from.next_match_id=to.id;from.next_slot=slot}
   };
   for(let r=1;r<wbRounds;r++)for(let m=1;m<=wb[r].length;m++)link(wb[r][m],wb[r+1][Math.ceil(m/2)],m%2===1?"athlete_a_id":"athlete_b_id");
   if(format==="double"){
    if(selectedAthletes.length<3){onMessage("Для двойного выбывания нужно минимум 3 спортсмена.");await client.from("brackets").delete().eq("id",created.id);setBusy(false);return}
    const lbRounds=2*wbRounds-2;const lb:any[][]=[];
    for(let q=1;q<=lbRounds;q++){
     const count=size/2**(Math.ceil(q/2)+1);lb[q]=[];
     for(let m=1;m<=count;m++){
      const row:any={id:crypto.randomUUID(),bracket_id:created.id,round_no:100+q,match_no:m,bracket_side:"losers"};
      lb[q][m]=row;rows.push(row);
     }
    }
    // First losers-bracket round pairs the losers from adjacent first-round winners matches.
    for(let m=1;m<=lb[1].length;m++){
     link(wb[1][m*2-1],lb[1][m],"athlete_a_id",true);
     link(wb[1][m*2],lb[1][m],"athlete_b_id",true);
    }
    // Alternating consolidation rounds and drops from the next winners-bracket round.
    for(let q=2;q<=lbRounds;q++){
     if(q%2===0){
      const wbRound=q/2+1;
      for(let m=1;m<=lb[q].length;m++){
       link(lb[q-1][m],lb[q][m],"athlete_a_id");
       link(wb[wbRound][m],lb[q][m],"athlete_b_id",true);
      }
     }else{
      for(let m=1;m<=lb[q].length;m++){
       link(lb[q-1][m*2-1],lb[q][m],"athlete_a_id");
       link(lb[q-1][m*2],lb[q][m],"athlete_b_id");
      }
     }
    }
    const grand:any={id:crypto.randomUUID(),bracket_id:created.id,round_no:900,match_no:1,bracket_side:"grand_final"};
    const reset:any={id:crypto.randomUUID(),bracket_id:created.id,round_no:901,match_no:1,bracket_side:"reset_final",status:"pending"};
    link(wb[wbRounds][1],grand,"athlete_a_id");
    link(lb[lbRounds][1],grand,"athlete_b_id");
    // The reset final is activated only if the losers-bracket champion wins the grand final.
    rows.push(grand,reset);
   }
  }
  const matchError=await insertMatchBatches(rows);
  if(matchError){await client.from("brackets").delete().eq("id",created.id);onMessage("Не удалось построить матчи: "+matchError.message+" (если это двойное выбывание, выполните миграцию 005).");setBusy(false);return}
  // Propagate first-round byes before resolving dependent losers-bracket passes.
  if(format!=="rr"){
   const byeError=await propagateInitialByes(rows);
   if(byeError){onMessage(byeError);setBusy(false);return}
  }
  await resolveAutomaticByes(created.id);
  onMessage("Сетка создана. Можно проводить матчи и вносить результаты.");
  setBracketName("");setSelectedBracket(created.id);await reload();await openBracket(created.id);
 }
 async function propagateMatchResult(match:Match,winnerId:string,loserId:string|null){
  const updates:{table:string;id:string;slot:"athlete_a_id"|"athlete_b_id";value:string}[]=[];
  if(match.next_match_id&&match.next_slot)updates.push({table:"matches",id:match.next_match_id,slot:match.next_slot,value:winnerId});
  if(match.loser_next_match_id&&match.loser_next_slot&&loserId)updates.push({table:"matches",id:match.loser_next_match_id,slot:match.loser_next_slot,value:loserId});
  for(const item of updates){
   const {data,error}=await client.from(item.table).select("id,status,"+item.slot).eq("id",item.id).maybeSingle();
   if(error)return "Не удалось проверить следующий матч: "+error.message;
   if(!data)return "Следующий матч не найден.";
   if(data.status==="completed"&&data[item.slot]!==item.value)return "Следующий матч уже завершён и содержит другого участника. Переход не изменён.";
   if(data[item.slot]&&data[item.slot]!==item.value)return "В целевом слоте уже назначен другой спортсмен. Переход не изменён.";
   const {error:writeError}=await client.from(item.table).update({[item.slot]:item.value}).eq("id",item.id);
   if(writeError)return "Не удалось перенести участника: "+writeError.message;
  }
  if(match.bracket_side==="grand_final"){
   const {data:resetRows,error}=await client.from("matches").select("*").eq("bracket_id",selectedBracket).eq("bracket_side","reset_final").limit(1);
   if(error)return "Не удалось проверить дополнительный финал: "+error.message;
   const reset=resetRows?.[0];
   if(reset){
    if(winnerId===match.athlete_b_id){
     const {error:resetError}=await client.from("matches").update({athlete_a_id:match.athlete_a_id,athlete_b_id:match.athlete_b_id,status:"pending",winner_id:null,score_a:null,score_b:null,finish_reason:null}).eq("id",reset.id);
     if(resetError)return "Не удалось открыть дополнительный финал: "+resetError.message;
    }else if(reset.status!=="completed"){
     const {error:resetError}=await client.from("matches").update({athlete_a_id:null,athlete_b_id:null,status:"pending",winner_id:null,score_a:null,score_b:null,finish_reason:null}).eq("id",reset.id);
     if(resetError)return "Не удалось сбросить дополнительный финал: "+resetError.message;
    }
   }
  }
  return null;
 }
 async function recordViolation(match:Match,side:"a"|"b",kind:"foul"|"remark"){
  if(!canEdit||match.status==="completed"||!match.athlete_a_id||!match.athlete_b_id||busy)return;
  setBusy(true);
  const {data,error}=await client.rpc("record_match_violation",{
   p_match_id:match.id,p_side:side,p_kind:kind
  });
  if(error){
   onMessage("Не удалось записать нарушение: "+error.message);
   await openBracket(selectedBracket);
   setBusy(false);
   return;
  }
  const winnerId=(data as any)?.winner_id as string|null;
  if(winnerId){
   const loserId=side==="a"?match.athlete_a_id:match.athlete_b_id;
   const propagationError=await propagateMatchResult(match,winnerId,loserId);
   if(propagationError)onMessage("Нарушение записано, но переход требует внимания: "+propagationError);
   else {await resolveAutomaticByes(selectedBracket);onMessage("Второй фол. Победа присуждена сопернику.");}
  }else{
   const result=(data as any)||{};
   onMessage(kind==="remark"?(result.fouls>Number(match[side==="a"?"fouls_a":"fouls_b"]||0)?"Два замечания преобразованы в один фол.":"Замечание записано."):"Фол записан.");
  }
  await openBracket(selectedBracket);
  setBusy(false);
 }
 async function addManualMatch(roundNo?:number){
  if(!canManageStructure||!selectedBracket)return;
  const round=roundNo??(matches.length?Math.max(...matches.map(m=>m.round_no)):1);
  const matchNo=Math.max(0,...matches.filter(m=>m.round_no===round).map(m=>m.match_no))+1;
  setBusy(true);
  const {error}=await client.from("matches").insert({bracket_id:selectedBracket,round_no:round,match_no:matchNo,bracket_side:"winners",status:"pending",fouls_a:0,fouls_b:0,remarks_a:0,remarks_b:0});
  if(error)onMessage("Не удалось добавить блок матча: "+error.message);else onMessage("Блок матча добавлен.");
  await openBracket(selectedBracket);setBusy(false);
 }
 async function addManualRound(){
  const next=Math.max(0,...matches.map(m=>m.round_no))+1;
  await addManualMatch(next);
 }
 async function editMatchParticipants(match:Match,aId:string,bId:string){
  if(!canEdit||!selectedBracket)return;
  if(aId&&aId===bId){onMessage("Один спортсмен не может занимать оба места в матче.");return}
  const duplicate=matches.find(m=>m.id!==match.id&&[m.athlete_a_id,m.athlete_b_id].some(id=>id&&(id===aId||id===bId)));
  if(duplicate){onMessage("Этот спортсмен уже назначен в другой блок этой сетки. Сначала освободите его там.");return}
  if(match.status==="completed"&&!confirm("Матч уже завершён. Изменить участников можно только если последующие матчи ещё не получили результаты или автоматические проходы."))return;
  if(match.status==="completed"){
   const descendants=await hasResolvedDescendants(match);
   if(descendants.error){onMessage("Не удалось проверить следующие матчи: "+descendants.error);return}
   if(descendants.blocked){onMessage("Нельзя менять участников: в последующих матчах уже есть результаты или автоматические проходы. Сначала сбросьте их.");return}
  }
  setBusy(true);
  if(match.status==="completed"){
   const winner=match.winner_id;const loser=winner?(winner===match.athlete_a_id?match.athlete_b_id:match.athlete_a_id):null;
   if(match.next_match_id&&match.next_slot&&winner)await client.from("matches").update({[match.next_slot]:null}).eq("id",match.next_match_id).eq(match.next_slot,winner);
   if(match.loser_next_match_id&&match.loser_next_slot&&loser)await client.from("matches").update({[match.loser_next_slot]:null}).eq("id",match.loser_next_match_id).eq(match.loser_next_slot,loser);
  }
  const {error}=await client.from("matches").update({athlete_a_id:aId||null,athlete_b_id:bId||null,score_a:null,score_b:null,winner_id:null,status:"pending",finish_reason:null,fouls_a:0,fouls_b:0,remarks_a:0,remarks_b:0}).eq("id",match.id);
  if(error)onMessage("Не удалось изменить участников матча: "+error.message);else onMessage("Участники блока обновлены.");
  await openBracket(selectedBracket);setBusy(false);
 }
 async function moveManualMatch(match:Match,targetRound:number,targetIndex:number){
  if(!canEdit||!selectedBracket||busy)return;
  setBusy(true);
  const {error}=await client.rpc("move_bracket_match",{
   p_match_id:match.id,p_target_round:targetRound,p_target_index:targetIndex
  });
  if(error)onMessage("Не удалось переместить блок: "+error.message);
  else onMessage("Блок перемещён.");
  await openBracket(selectedBracket);
  setBusy(false);
 }
 async function saveMatchLinks(match:Match,nextId:string,nextSlot:"athlete_a_id"|"athlete_b_id",loserId:string,loserSlot:"athlete_a_id"|"athlete_b_id"){
  if(!canEdit||!selectedBracket)return;
  if(nextId===match.id||loserId===match.id){onMessage("Матч не может ссылаться сам на себя.");return}
  if(nextId&&nextId===loserId&&nextSlot===loserSlot){onMessage("Победитель и проигравший не могут попасть в один и тот же слот следующего матча.");return}
  const graph=new Map(matches.map(m=>[m.id,[m.next_match_id,m.loser_next_match_id].filter(Boolean) as string[]]));
  graph.set(match.id,[nextId,loserId].filter(Boolean));
  const reaches=(from:string,target:string,seen=new Set<string>()):boolean=>{if(from===target)return true;if(seen.has(from))return false;seen.add(from);return (graph.get(from)||[]).some(n=>reaches(n,target,seen))};
  if((nextId&&reaches(nextId,match.id))||(loserId&&reaches(loserId,match.id))){onMessage("Такая связь создаст цикл переходов. Выберите матч дальше по сетке.");return}
  const {error}=await client.from("matches").update({next_match_id:nextId||null,next_slot:nextId?nextSlot:null,loser_next_match_id:loserId||null,loser_next_slot:loserId?loserSlot:null}).eq("id",match.id);
  if(error)onMessage("Не удалось сохранить связи: "+error.message);else onMessage("Связи матча сохранены.");
  await openBracket(selectedBracket);
 }
 async function deleteManualMatch(match:Match){
  if(!canManageStructure||!selectedBracket||!confirm("Удалить этот блок матча?"))return;
  setBusy(true);
  const {error}=await client.from("matches").delete().eq("id",match.id);
  if(error)onMessage("Не удалось удалить блок: "+error.message);else onMessage("Блок матча удалён.");
  await openBracket(selectedBracket);setBusy(false);
 }
 async function hasResolvedDescendants(match:Match){
  const {data,error}=await client.from("matches").select("id,status,next_match_id,loser_next_match_id,bracket_side").eq("bracket_id",selectedBracket);
  if(error)return {blocked:true,error:error.message};
  const graph:any[]=data||[];
  const queue=[match.id],visited=new Set<string>([match.id]);
  while(queue.length){
   const current=queue.shift()!;
   const source=graph.find(row=>row.id===current);
   if(!source)continue;
   for(const childId of [source.next_match_id,source.loser_next_match_id].filter(Boolean)){
    if(visited.has(childId))continue;
    visited.add(childId);
    const child=graph.find(row=>row.id===childId);
    if(!child)continue;
    if(child.status!=="pending")return {blocked:true,error:null};
    queue.push(child.id);
   }
  }
  if(match.bracket_side==="grand_final"){
   const reset=graph.find(row=>row.bracket_side==="reset_final");
   if(reset&&reset.status!=="pending")return {blocked:true,error:null};
  }
  return {blocked:false,error:null};
 }
 async function saveWinner(match:Match,winnerId:string,scoreA:string,scoreB:string){
  if(!canEdit||!winnerId)return;
  const a=Number(scoreA),b=Number(scoreB);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0||a===b){onMessage("Укажите корректный счёт: ничья в матче на выбывание невозможна.");return}
  if((winnerId===match.athlete_a_id&&a<b)||(winnerId===match.athlete_b_id&&b<a)){onMessage("Победитель не совпадает с указанным счётом.");return}
  if(!match.athlete_a_id||!match.athlete_b_id){onMessage("Сначала назначьте обоих участников матча.");return}
  const isCorrection=match.status==="completed"&&match.winner_id;
  if(isCorrection&&!confirm("Исправить результат этого матча? Если следующие матчи уже начаты или завершены, исправление будет заблокировано, чтобы не испортить сетку."))return;
  if(isCorrection){
   const descendants=await hasResolvedDescendants(match);
   if(descendants.error){onMessage("Не удалось проверить следующие матчи: "+descendants.error);return}
   if(descendants.blocked){onMessage("Нельзя исправить результат: в последующих матчах уже есть результаты или автоматические проходы. Сначала сбросьте их.");return}
  }
  const oldWinner=match.winner_id;
  const oldLoser=oldWinner?(oldWinner===match.athlete_a_id?match.athlete_b_id:match.athlete_a_id):null;
  const loserId=winnerId===match.athlete_a_id?match.athlete_b_id:match.athlete_a_id;
  setBusy(true);
  if(isCorrection&&match.next_match_id&&match.next_slot&&oldWinner){
   const {error:clearError}=await client.from("matches").update({[match.next_slot]:null}).eq("id",match.next_match_id).eq(match.next_slot,oldWinner);
   if(clearError)onMessage("Не удалось очистить прежний слот победителя: "+clearError.message);
  }
  if(isCorrection&&match.loser_next_match_id&&match.loser_next_slot&&oldLoser){
   const {error:clearError}=await client.from("matches").update({[match.loser_next_slot]:null}).eq("id",match.loser_next_match_id).eq(match.loser_next_slot,oldLoser);
   if(clearError)onMessage("Не удалось очистить прежний слот проигравшего: "+clearError.message);
  }
  const {error}=await client.from("matches").update({score_a:a,score_b:b,winner_id:winnerId,status:"completed",finish_reason:"score"}).eq("id",match.id);
  if(error){onMessage("Не удалось сохранить результат: "+error.message);setBusy(false);return}
  const propagationError=await propagateMatchResult(match,winnerId,loserId);
  if(propagationError)onMessage("Результат сохранён, но переход требует внимания: "+propagationError);
  else await resolveAutomaticByes(selectedBracket);
  const {data,error:loadError}=await client.from("matches").select("*").eq("bracket_id",selectedBracket).order("round_no").order("match_no");
  if(loadError)onMessage(loadError.message);else setMatches(data||[]);
  setBusy(false);
 }
 const formatForBracket=brackets.find(b=>b.id===selectedBracket)?.format||format;
 const visibleMatches=matches;
 const rounds=useMemo(()=>Array.from(new Set(visibleMatches.map(m=>m.round_no))).sort((a,b)=>a-b),[visibleMatches]);
 const roundTitle=(round:number)=>{const sample=matches.find(m=>m.round_no===round);if(formatForBracket==="rr")return "Матчи";if(sample?.bracket_side==="losers")return "Утешительная сетка · раунд "+(round-100);if(sample?.bracket_side==="grand_final")return "Большой финал";if(sample?.bracket_side==="reset_final")return "Дополнительный финал";if(sample?.bracket_side==="winners")return round===Math.max(...matches.filter(m=>m.bracket_side==="winners").map(m=>m.round_no))?"Финал победителей":"Основная сетка · раунд "+round;return "Раунд "+round};
 const athleteName=(id:string|null)=>id?(athleteMap.get(id)?athleteMap.get(id)!.last_name+" "+athleteMap.get(id)!.first_name:"Спортсмен"): "Ожидает соперника";
 return <section className={initialBracketId?"bracket-editor-page":"panel"}>
  {initialBracketId&&<div className="editor-topbar"><button className="secondary" onClick={onExit}>← К списку сеток</button><span>SETKA PRO / РЕДАКТОР СЕТКИ</span></div>}
  <div className="section-title"><div><h2>{initialBracketId?(brackets.find(b=>b.id===selectedBracket)?.name||"Редактор сетки"):"Конструктор турнирных сеток"}</h2><p>{initialBracketId?"Управление матчами, результатами и ходом соревнования.":"Состав участников берётся из допущенных регистраций выбранной весовой категории."}</p></div><button className="secondary" onClick={()=>initialBracketId?void openBracket(selectedBracket):void reload()} disabled={busy}><RefreshCw size={15}/> Обновить</button></div>
  {!initialBracketId&&canManageStructure&&<div className="form-grid management-form">
   <label className="full">Весовая категория<select value={selectedCategory} onChange={e=>{setSelectedCategory(e.target.value);setSelectedAthletes([])}}><option value="">Выберите категорию</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name} · {c.gender==="male"?"мужчины":c.gender==="female"?"женщины":"открытая"} · {c.hand==="right"?"правая":c.hand==="left"?"левая":"обе"} рука</option>)}</select></label>
   <label>Формат сетки<select value={format} onChange={e=>setFormat(e.target.value as "single"|"double"|"rr")}><option value="single">Олимпийская — одно поражение</option><option value="double">Двойное выбывание — два поражения</option><option value="rr">Круговая — каждый с каждым</option></select></label>
   <label>Название сетки<input value={bracketName} onChange={e=>setBracketName(e.target.value)} placeholder="Автоматически по категории"/></label>
   <div className="full"><b>Участники ({selectedAthletes.length} выбрано из {eligible.length})</b><button type="button" className="secondary" onClick={shuffleAthletes}><Shuffle size={14}/> Случайный посев</button><p>В список попадают только одобренные регистрации подходящей руки и пола. Если у категории задан диапазон веса, учитывается последнее взвешивание: без зафиксированного веса спортсмен не допускается. Порядок посева задаётся кнопками ↑ и ↓.</p>
    <div className="application-list">{eligible.map(a=>{const index=selectedAthletes.indexOf(a.id);return <div className="application-row" key={a.id}><label className="check-row"><input type="checkbox" checked={index>=0} onChange={e=>setSelectedAthletes(prev=>e.target.checked?[...prev,a.id]:prev.filter(id=>id!==a.id))}/><span>{a.last_name} {a.first_name}</span></label>{index>=0&&<div className="row-actions"><span className="tag">Посев {index+1}</span><button className="icon-btn" type="button" onClick={()=>moveAthlete(index,-1)} disabled={index===0}><ArrowUp size={15}/></button><button className="icon-btn" type="button" onClick={()=>moveAthlete(index,1)} disabled={index===selectedAthletes.length-1}><ArrowDown size={15}/></button></div>}</div>})}{!eligible.length&&<div className="empty"><b>Нет допущенных спортсменов</b><p>Сначала добавьте спортсменов, зарегистрируйте их на турнир и установите статус «Допущен».</p></div>}</div>
   </div>
   <div className="full form-actions"><button className="primary" disabled={busy||selectedAthletes.length<2||!selectedCategory} onClick={()=>void createBracket()}><Plus size={16}/> Построить сетку</button></div>
  </div>}
  {!initialBracketId&&<><div className="section-title" style={{marginTop:24}}><div><h2>Сохранённые сетки</h2><p>Откройте сетку, чтобы вносить результаты и продвигать победителей.</p></div></div>
  <div className="application-list">{brackets.map(b=><div className={selectedBracket===b.id?"application-row selected":"application-row"} key={b.id}><button type="button" className="app-main" onClick={()=>void openBracket(b.id)}><b>{b.name}</b><span>{categories.find(c=>c.id===b.category_id)?.name||"Категория"} · {b.format==="rr"?"Круговая система":b.format==="double"?"Двойное выбывание":"Олимпийская"}</span></button><Trophy size={18}/>{canManageStructure&&<><button type="button" className="icon-btn" title="Дублировать сетку" onClick={()=>void duplicateBracket(b.id)}><Plus size={15}/></button><button type="button" className="icon-btn" title="В корзину" onClick={()=>void archiveBracket(b.id)}><Trash2 size={15}/></button></>}</div>)}{!brackets.length&&<div className="empty"><b>Сеток пока нет</b><p>Создайте первую сетку выше.</p></div>}</div>
  <div className="match-history-tools"><button className="secondary" type="button" onClick={()=>setShowTrash(v=>!v)}><Trash2 size={14}/> {showTrash?"Скрыть корзину":"Корзина ("+archivedBrackets.length+")"}</button></div>{showTrash&&<section className="match-history"><h3>Корзина сеток</h3>{archivedBrackets.map(b=><div className="match-history-row" key={b.id}><b>{b.name}</b><span>Архивная сетка</span><button className="secondary" type="button" onClick={()=>void restoreBracket(b.id)}><RotateCcw size={14}/> Восстановить</button></div>)}{!archivedBrackets.length&&<p>Корзина пуста.</p>}</section>}
  </>}\n  {selectedBracket&&canManageStructure&&<div className="match-history-tools manual-builder-tools"><button type="button" className="primary" onClick={()=>void addManualMatch()} disabled={busy}><Plus size={14}/> Добавить блок матча</button><button type="button" className="secondary" onClick={()=>void addManualRound()} disabled={busy}><Plus size={14}/> Добавить раунд</button></div>}
  {selectedBracket&&<div className="match-history-tools"><button type="button" className="secondary" onClick={()=>setZoom(v=>Math.max(.6,v-.1))}><ZoomOut size={14}/></button><span className="zoom-label">{Math.round(zoom*100)}%</span><button type="button" className="secondary" onClick={()=>setZoom(v=>Math.min(1.6,v+.1))}><ZoomIn size={14}/></button><button type="button" className="secondary" onClick={exportBracketSvg}><ImageIcon size={14}/> SVG</button><button type="button" className="secondary" onClick={()=>void exportBracketPng()}><ImageIcon size={14}/> PNG</button><button type="button" className="secondary" onClick={()=>window.print()}><Printer size={14}/> Печать</button><button type="button" className="secondary" onClick={()=>setShowHistory(v=>!v)}><RefreshCw size={14}/>{showHistory?"Скрыть историю":"История изменений ("+matchEvents.length+")"}</button></div>}
  {selectedBracket&&showHistory&&<section className="match-history"><h3>История изменений сетки</h3>{matchEvents.length?matchEvents.map(ev=>{
   const snapshot=ev.new_data||ev.old_data||{};
   const matchNo=matches.find(m=>m.id===ev.match_id)?.match_no??snapshot.match_no??"—";
   const detail=ev.action==="DELETE"?"Матч удалён":ev.action==="INSERT"?"Матч создан":snapshot.finish_reason==="fouls"?"Зафиксирован результат по фолам":snapshot.finish_reason==="score"?"Сохранён результат боя":"Обновлены данные матча";
   return <div className="match-history-row" key={ev.id}><b>Матч {matchNo}</b><span>{detail}</span><time>{new Date(ev.changed_at).toLocaleString("ru-RU")}</time></div>;
  }):<p>Изменений пока нет.</p>}</section>}
  {selectedBracket&&<div className="bracket-viewport"><div className="bracket-rounds" style={{transform:`scale(${zoom})`,transformOrigin:"top left"}}>{rounds.length?rounds.map(round=><section className="bracket-round" key={round}><h3>{roundTitle(round)}</h3>{visibleMatches.filter(m=>m.round_no===round).map(match=><MatchCard key={match.id} match={match} athletes={athletes} allMatches={matches} athleteName={athleteName} canEdit={canEdit} canManage={canManageStructure} busy={busy} onSave={saveWinner} onViolation={recordViolation} onEditParticipants={editMatchParticipants} onDelete={deleteManualMatch} onSaveLinks={saveMatchLinks} onMove={moveManualMatch}/>)}</section>):<div className="empty bracket-empty"><b>{busy?"Загружаем матчи…":"В этой сетке пока нет матчей"}</b><p>{busy?"Подождите завершения загрузки.":"Сетка создана, но матчи не найдены. Обновите данные или пересоздайте сетку после проверки состава участников."}</p></div>}</div></div>}
 </section>;
}
function MatchCard({match,athletes,allMatches,athleteName,canEdit,canManage,busy,onSave,onViolation,onEditParticipants,onDelete,onSaveLinks,onMove}:{match:Match;athletes:Athlete[];allMatches:Match[];athleteName:(id:string|null)=>string;canEdit:boolean;canManage:boolean;busy:boolean;onSave:(m:Match,w:string,a:string,b:string)=>void;onViolation:(m:Match,side:"a"|"b",kind:"foul"|"remark")=>void;onEditParticipants:(m:Match,a:string,b:string)=>void;onDelete:(m:Match)=>void;onSaveLinks:(m:Match,n:string,ns:"athlete_a_id"|"athlete_b_id",l:string,ls:"athlete_a_id"|"athlete_b_id")=>void;onMove:(m:Match,r:number,i:number)=>void}){
 const [scoreA,setScoreA]=useState(match.score_a===null?"":String(match.score_a));
 const [scoreB,setScoreB]=useState(match.score_b===null?"":String(match.score_b));
 const [winner,setWinner]=useState(match.winner_id||"");
 const [nextId,setNextId]=useState(match.next_match_id||"");const [nextSlot,setNextSlot]=useState<"athlete_a_id"|"athlete_b_id">(match.next_slot||"athlete_a_id");const [loserId,setLoserId]=useState(match.loser_next_match_id||"");const [loserSlot,setLoserSlot]=useState<"athlete_a_id"|"athlete_b_id">(match.loser_next_slot||"athlete_a_id");
 useEffect(()=>{setScoreA(match.score_a===null?"":String(match.score_a));setScoreB(match.score_b===null?"":String(match.score_b));setWinner(match.winner_id||"");setNextId(match.next_match_id||"");setNextSlot(match.next_slot||"athlete_a_id");setLoserId(match.loser_next_match_id||"");setLoserSlot(match.loser_next_slot||"athlete_a_id")},[match]);
 return <div className="match-card" draggable={canManage} onDragStart={e=>{e.dataTransfer.setData("text/plain",match.id);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{if(canManage)e.preventDefault()}} onDrop={e=>{if(!canManage)return;e.preventDefault();const id=e.dataTransfer.getData("text/plain");const moving=allMatches.find(m=>m.id===id);if(moving&&moving.id!==match.id)onMove(moving,match.round_no,Math.max(0,match.match_no-1))}}><div className="match-number-row"><div className="match-number">Матч {match.match_no} {match.status==="bye"?"· проход без боя":""} {match.finish_reason==="fouls"?"· победа по фолам":match.finish_reason==="score"?"· победа по счёту":""}</div>{canManage&&<button type="button" className="icon-btn" title="Удалить блок" onClick={()=>onDelete(match)}><Trash2 size={14}/></button>}</div>{canManage&&<div className="manual-match-fields"><label>Участник А<select value={match.athlete_a_id||""} onChange={e=>onEditParticipants(match,e.target.value,match.athlete_b_id||"")}><option value="">Не назначен</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.last_name} {a.first_name}</option>)}</select></label><label>Участник Б<select value={match.athlete_b_id||""} onChange={e=>onEditParticipants(match,match.athlete_a_id||"",e.target.value)}><option value="">Не назначен</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.last_name} {a.first_name}</option>)}</select></label></div>}{canManage&&<details className="match-links"><summary>Связи матчей</summary><label>Победитель → <select value={nextId} onChange={e=>setNextId(e.target.value)}><option value="">Не назначено</option>{allMatches.filter(m=>m.id!==match.id).map(m=><option key={m.id} value={m.id}>Раунд {m.round_no} · матч {m.match_no}</option>)}</select></label><select value={nextSlot} onChange={e=>setNextSlot(e.target.value as any)}><option value="athlete_a_id">Слот А</option><option value="athlete_b_id">Слот Б</option></select><label>Проигравший → <select value={loserId} onChange={e=>setLoserId(e.target.value)}><option value="">Не назначено</option>{allMatches.filter(m=>m.id!==match.id).map(m=><option key={m.id} value={m.id}>Раунд {m.round_no} · матч {m.match_no}</option>)}</select></label><select value={loserSlot} onChange={e=>setLoserSlot(e.target.value as any)}><option value="athlete_a_id">Слот А</option><option value="athlete_b_id">Слот Б</option></select><button type="button" className="secondary" onClick={()=>onSaveLinks(match,nextId,nextSlot,loserId,loserSlot)}>Сохранить связи</button></details>}<div className={match.winner_id===match.athlete_a_id?"match-athlete winner":"match-athlete"}>{athleteName(match.athlete_a_id)} <b>{match.score_a??"—"}</b><small className="match-penalties">Фолы: {match.fouls_a||0} · Замечания: {match.remarks_a||0}/2</small></div><div className={match.winner_id===match.athlete_b_id?"match-athlete winner":"match-athlete"}>{athleteName(match.athlete_b_id)} <b>{match.score_b??"—"}</b><small className="match-penalties">Фолы: {match.fouls_b||0} · Замечания: {match.remarks_b||0}/2</small></div>{canEdit&&match.athlete_a_id&&match.athlete_b_id&&<><div className="match-violations"><div><button type="button" className="secondary" disabled={busy||match.status==="completed"} onClick={()=>onViolation(match,"a","foul")}>Фол А</button><button type="button" className="secondary" disabled={busy||match.status==="completed"} onClick={()=>onViolation(match,"a","remark")}>Замечание А</button></div><div><button type="button" className="secondary" disabled={busy||match.status==="completed"} onClick={()=>onViolation(match,"b","foul")}>Фол Б</button><button type="button" className="secondary" disabled={busy||match.status==="completed"} onClick={()=>onViolation(match,"b","remark")}>Замечание Б</button></div></div><div className="match-edit"><input aria-label="Счёт первого спортсмена" type="number" min="0" value={scoreA} onChange={e=>setScoreA(e.target.value)}/><input aria-label="Счёт второго спортсмена" type="number" min="0" value={scoreB} onChange={e=>setScoreB(e.target.value)}/><select aria-label="Победитель" value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Победитель</option><option value={match.athlete_a_id}>{athleteName(match.athlete_a_id)}</option><option value={match.athlete_b_id}>{athleteName(match.athlete_b_id)}</option></select><button className="primary" disabled={busy||!winner} onClick={()=>onSave(match,winner,scoreA,scoreB)}>Сохранить</button></div></>}</div>;
}
