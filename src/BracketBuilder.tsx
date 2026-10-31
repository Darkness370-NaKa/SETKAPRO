import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trophy } from "lucide-react";

type Category = { id:string; tournament_id:string; name:string; format:string; gender:string; hand:string; min_weight:number|null; max_weight:number|null };
type Athlete = { id:string; first_name:string; last_name:string; gender:string; birth_date:string|null; club_id:string|null };
type Registration = { id:string; athlete_id:string; tournament_id:string; hand:string; status:string };
type Match = { id:string; round_no:number; match_no:number; athlete_a_id:string|null; athlete_b_id:string|null; score_a:number|null; score_b:number|null; winner_id:string|null; status:string };
type Bracket = { id:string; name:string; category_id:string; format:string };

export default function BracketBuilder({client,canEdit,onMessage}:{client:any;canEdit:boolean;onMessage:(s:string)=>void}) {
 const [categories,setCategories]=useState<Category[]>([]);
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [registrations,setRegistrations]=useState<Registration[]>([]);
 const [brackets,setBrackets]=useState<Bracket[]>([]);
 const [selectedCategory,setSelectedCategory]=useState("");
 const [selectedBracket,setSelectedBracket]=useState("");
 const [selectedAthletes,setSelectedAthletes]=useState<string[]>([]);
 const [format,setFormat]=useState<"single"|"rr">("single");
 const [bracketName,setBracketName]=useState("");
 const [matches,setMatches]=useState<Match[]>([]);
 const [busy,setBusy]=useState(false);
 const athleteMap=useMemo(()=>new Map(athletes.map(a=>[a.id,a])),[athletes]);
 const category=categories.find(c=>c.id===selectedCategory);
 const eligible=useMemo(()=>{
   if(!category)return [];
   const ids=new Set(registrations.filter(r=>r.tournament_id===category.tournament_id&&r.status==="approved"&&(category.hand==="both"||r.hand==="both"||r.hand===category.hand)).map(r=>r.athlete_id));
   return athletes.filter(a=>ids.has(a.id)&&(category.gender==="other"||a.gender===category.gender)).sort((a,b)=>a.last_name.localeCompare(b.last_name,"ru")||a.first_name.localeCompare(b.first_name,"ru"));
 },[category,athletes,registrations]);
 async function reload(){
  setBusy(true);
  const [c,a,r,b]=await Promise.all([
   client.from("tournament_categories").select("*").order("name"),
   client.from("athletes").select("*").order("last_name"),
   client.from("registrations").select("*").eq("status","approved"),
   client.from("brackets").select("*").order("created_at",{ascending:false})
  ]);
  const error=c.error||a.error||r.error||b.error;
  if(error)onMessage("Не удалось загрузить данные конструктора: "+error.message);
  setCategories(c.data||[]);setAthletes(a.data||[]);setRegistrations(r.data||[]);setBrackets(b.data||[]);
  setBusy(false);
 }
 useEffect(()=>{void reload()},[]);
 async function openBracket(id:string){
  setSelectedBracket(id);setBusy(true);
  const {data,error}=await client.from("matches").select("*").eq("bracket_id",id).order("round_no").order("match_no");
  if(error)onMessage(error.message);else setMatches(data||[]);
  setBusy(false);
 }
 function moveAthlete(index:number,delta:number){
  setSelectedAthletes(prev=>{const next=[...prev];const to=index+delta;if(to<0||to>=next.length)return prev;[next[index],next[to]]=[next[to],next[index]];return next});
 }
 async function createBracket(){
  if(!canEdit||!category||selectedAthletes.length<2){onMessage("Выберите категорию и минимум двух допущенных спортсменов.");return}
  setBusy(true);
  const name=bracketName.trim()||category.name+" — "+(format==="single"?"олимпийская сетка":"круговая система");
  const {data:created,error}=await client.from("brackets").insert({category_id:category.id,name,format}).select("*").single();
  if(error||!created){onMessage("Не удалось создать сетку: "+(error?.message||"нет ответа"));setBusy(false);return}
  let rows:any[]=[];
  if(format==="rr"){
   let n=1;
   for(let i=0;i<selectedAthletes.length;i++)for(let j=i+1;j<selectedAthletes.length;j++)rows.push({bracket_id:created.id,round_no:1,match_no:n++,athlete_a_id:selectedAthletes[i],athlete_b_id:selectedAthletes[j]});
  }else{
   const size=2**Math.ceil(Math.log2(selectedAthletes.length));
   const rounds=Math.log2(size);
   for(let round=1;round<=rounds;round++){
    const count=size/2**round;
    for(let match=1;match<=count;match++){
     const row:any={bracket_id:created.id,round_no:round,match_no:match};
     if(round===1){
      const a=selectedAthletes[(match-1)*2]||null,b=selectedAthletes[(match-1)*2+1]||null;
      row.athlete_a_id=a;row.athlete_b_id=b;
      if(a&&!b){row.winner_id=a;row.status="bye"}
      if(!a&&!b)row.status="pending";
     }
     rows.push(row);
    }
   }
  }
  const {error:matchError}=await client.from("matches").insert(rows);
  if(matchError){await client.from("brackets").delete().eq("id",created.id);onMessage("Не удалось построить матчи: "+matchError.message);setBusy(false);return}
  if(format==="single"){
   const {data:generated}=await client.from("matches").select("*").eq("bracket_id",created.id).order("round_no").order("match_no");
   for(const match of generated||[]){
    if(match.status==="bye"&&match.winner_id){
     const next=(generated||[]).find((m:any)=>m.round_no===match.round_no+1&&m.match_no===Math.ceil(match.match_no/2));
     if(next){const side=match.match_no%2===1?"athlete_a_id":"athlete_b_id";await client.from("matches").update({[side]:match.winner_id}).eq("id",next.id)}
    }
   }
  }
  onMessage("Сетка создана. Можно проводить матчи и вносить результаты.");
  setBracketName("");setSelectedBracket(created.id);await reload();await openBracket(created.id);
 }
 async function saveWinner(match:Match,winnerId:string,scoreA:string,scoreB:string){
  if(!canEdit||!winnerId)return;
  const a=Number(scoreA),b=Number(scoreB);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0||a===b){onMessage("Укажите корректный счёт: ничья в матче на выбывание невозможна.");return}
  if((winnerId===match.athlete_a_id&&a<b)||(winnerId===match.athlete_b_id&&b<a)){onMessage("Победитель не совпадает с указанным счётом.");return}
  setBusy(true);
  const {error}=await client.from("matches").update({score_a:a,score_b:b,winner_id:winnerId,status:"completed"}).eq("id",match.id);
  if(error){onMessage("Не удалось сохранить результат: "+error.message);setBusy(false);return}
  if(formatForBracket==="single"&&match.round_no>0){
   const nextRound=match.round_no+1,nextNo=Math.ceil(match.match_no/2);
   const next=matches.find(m=>m.round_no===nextRound&&m.match_no===nextNo);
   if(next){
    const side=match.match_no%2===1?"athlete_a_id":"athlete_b_id";
    const {error:advanceError}=await client.from("matches").update({[side]:winnerId}).eq("id",next.id);
    if(advanceError)onMessage("Результат сохранён, но не удалось перенести победителя: "+advanceError.message);
   }
  }
  const {data,error:loadError}=await client.from("matches").select("*").eq("bracket_id",selectedBracket).order("round_no").order("match_no");
  if(loadError)onMessage(loadError.message);else setMatches(data||[]);
  setBusy(false);
 }
 const formatForBracket=brackets.find(b=>b.id===selectedBracket)?.format||format;
 const rounds=useMemo(()=>Array.from(new Set(matches.map(m=>m.round_no))).sort((a,b)=>a-b),[matches]);
 const roundTitle=(round:number)=>formatForBracket==="rr"?"Матчи":round===Math.max(...rounds)?"Финал":round===Math.max(...rounds)-1?"Полуфиналы":round===Math.max(...rounds)-2?"Четвертьфиналы":`Раунд ${round}`;
 const athleteName=(id:string|null)=>id?(athleteMap.get(id)?athleteMap.get(id)!.last_name+" "+athleteMap.get(id)!.first_name:"Спортсмен"): "Ожидает соперника";
 return <section className="panel">
  <div className="section-title"><div><h2>Конструктор турнирных сеток</h2><p>Состав участников берётся из допущенных регистраций выбранной весовой категории.</p></div><button className="secondary" onClick={()=>void reload()} disabled={busy}><RefreshCw size={15}/> Обновить</button></div>
  {canEdit&&<div className="form-grid management-form">
   <label className="full">Весовая категория<select value={selectedCategory} onChange={e=>{setSelectedCategory(e.target.value);setSelectedAthletes([])}}><option value="">Выберите категорию</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name} · {c.gender==="male"?"мужчины":c.gender==="female"?"женщины":"открытая"} · {c.hand==="right"?"правая":c.hand==="left"?"левая":"обе"} рука</option>)}</select></label>
   <label>Формат сетки<select value={format} onChange={e=>setFormat(e.target.value as "single"|"rr")}><option value="single">Олимпийская — на выбывание</option><option value="rr">Круговая — каждый с каждым</option></select></label>
   <label>Название сетки<input value={bracketName} onChange={e=>setBracketName(e.target.value)} placeholder="Автоматически по категории"/></label>
   <div className="full"><b>Участники ({selectedAthletes.length} выбрано из {eligible.length})</b><p>Отметьте спортсменов и при необходимости задайте порядок посева кнопками ↑ и ↓. Первый участник попадёт в первую пару.</p>
    <div className="application-list">{eligible.map(a=>{const index=selectedAthletes.indexOf(a.id);return <div className="application-row" key={a.id}><label className="check-row"><input type="checkbox" checked={index>=0} onChange={e=>setSelectedAthletes(prev=>e.target.checked?[...prev,a.id]:prev.filter(id=>id!==a.id))}/><span>{a.last_name} {a.first_name}</span></label>{index>=0&&<div className="row-actions"><span className="tag">Посев {index+1}</span><button className="icon-btn" type="button" onClick={()=>moveAthlete(index,-1)} disabled={index===0}><ArrowUp size={15}/></button><button className="icon-btn" type="button" onClick={()=>moveAthlete(index,1)} disabled={index===selectedAthletes.length-1}><ArrowDown size={15}/></button></div>}</div>})}{!eligible.length&&<div className="empty"><b>Нет допущенных спортсменов</b><p>Сначала добавьте спортсменов, зарегистрируйте их на турнир и установите статус «Допущен».</p></div>}</div>
   </div>
   <div className="full form-actions"><button className="primary" disabled={busy||selectedAthletes.length<2||!selectedCategory} onClick={()=>void createBracket()}><Plus size={16}/> Построить сетку</button></div>
  </div>}
  <div className="section-title" style={{marginTop:24}}><div><h2>Сохранённые сетки</h2><p>Откройте сетку, чтобы вносить результаты и продвигать победителей.</p></div></div>
  <div className="application-list">{brackets.map(b=><button type="button" className={selectedBracket===b.id?"application-row selected":"application-row"} key={b.id} onClick={()=>void openBracket(b.id)}><div className="app-main"><b>{b.name}</b><span>{categories.find(c=>c.id===b.category_id)?.name||"Категория"} · {b.format==="rr"?"Круговая система":"Олимпийская"}</span></div><Trophy size={18}/></button>)}{!brackets.length&&<div className="empty"><b>Сеток пока нет</b><p>Создайте первую сетку выше.</p></div>}</div>
  {selectedBracket&&<div className="bracket-rounds">{rounds.map(round=><section className="bracket-round" key={round}><h3>{roundTitle(round)}</h3>{matches.filter(m=>m.round_no===round).map(match=><MatchCard key={match.id} match={match} athleteName={athleteName} canEdit={canEdit} busy={busy} onSave={saveWinner}/>)}</section>)}</div>}
 </section>;
}
function MatchCard({match,athleteName,canEdit,busy,onSave}:{match:Match;athleteName:(id:string|null)=>string;canEdit:boolean;busy:boolean;onSave:(m:Match,w:string,a:string,b:string)=>void}){
 const [scoreA,setScoreA]=useState(match.score_a===null?"":String(match.score_a));
 const [scoreB,setScoreB]=useState(match.score_b===null?"":String(match.score_b));
 const [winner,setWinner]=useState(match.winner_id||"");
 useEffect(()=>{setScoreA(match.score_a===null?"":String(match.score_a));setScoreB(match.score_b===null?"":String(match.score_b));setWinner(match.winner_id||"")},[match]);
 return <div className="match-card"><div className="match-number">Матч {match.match_no} {match.status==="bye"?"· проход без боя":""}</div><div className={match.winner_id===match.athlete_a_id?"match-athlete winner":"match-athlete"}>{athleteName(match.athlete_a_id)} <b>{match.score_a??"—"}</b></div><div className={match.winner_id===match.athlete_b_id?"match-athlete winner":"match-athlete"}>{athleteName(match.athlete_b_id)} <b>{match.score_b??"—"}</b></div>{canEdit&&match.athlete_a_id&&match.athlete_b_id&&<div className="match-edit"><input aria-label="Счёт первого спортсмена" type="number" min="0" value={scoreA} onChange={e=>setScoreA(e.target.value)}/><input aria-label="Счёт второго спортсмена" type="number" min="0" value={scoreB} onChange={e=>setScoreB(e.target.value)}/><select aria-label="Победитель" value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Победитель</option><option value={match.athlete_a_id}>{athleteName(match.athlete_a_id)}</option><option value={match.athlete_b_id}>{athleteName(match.athlete_b_id)}</option></select><button className="primary" disabled={busy||!winner} onClick={()=>onSave(match,winner,scoreA,scoreB)}>Сохранить</button></div>}</div>;
}
