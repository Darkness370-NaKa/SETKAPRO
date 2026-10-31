import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import BracketBuilder from "./BracketBuilder";

type ModuleKey = "athletes" | "clubs" | "registration" | "weighin" | "categories" | "brackets";
type Option = { value:string; label:string };
type Field = { name:string; label:string; type?:string; required?:boolean; options?:Option[]; relation?:string };
type ModuleConfig = { title:string; table:string; fields:Field[]; columns:{key:string;label:string}[] };
const modules:Record<ModuleKey,ModuleConfig> = {
 athletes:{title:"Спортсмены",table:"athletes",fields:[
  {name:"last_name",label:"Фамилия",required:true},{name:"first_name",label:"Имя",required:true},
  {name:"gender",label:"Пол",type:"select",options:[{value:"male",label:"Мужской"},{value:"female",label:"Женский"},{value:"other",label:"Открытая"}]},
  {name:"birth_date",label:"Дата рождения",type:"date"},{name:"club_id",label:"Клуб",type:"select",relation:"clubs"},
  {name:"city",label:"Город"},{name:"country",label:"Страна"}],
  columns:[{key:"last_name",label:"Фамилия"},{key:"first_name",label:"Имя"},{key:"gender",label:"Пол"},{key:"birth_date",label:"Дата рождения"},{key:"club_id",label:"Клуб"}]},
 clubs:{title:"Клубы",table:"clubs",fields:[{name:"name",label:"Название клуба",required:true},{name:"city",label:"Город"},{name:"country",label:"Страна"}],columns:[{key:"name",label:"Клуб"},{key:"city",label:"Город"},{key:"country",label:"Страна"}]},
 registration:{title:"Регистрация на турнир",table:"registrations",fields:[
  {name:"tournament_id",label:"Турнир",type:"select",relation:"tournaments",required:true},
  {name:"athlete_id",label:"Спортсмен",type:"select",relation:"athletes",required:true},
  {name:"hand",label:"Рука",type:"select",options:[{value:"right",label:"Правая"},{value:"left",label:"Левая"},{value:"both",label:"Обе"}]},
  {name:"status",label:"Статус",type:"select",options:[{value:"pending",label:"На проверке"},{value:"approved",label:"Допущен"},{value:"rejected",label:"Отклонён"}]}],
  columns:[{key:"tournament_id",label:"Турнир"},{key:"athlete_id",label:"Спортсмен"},{key:"hand",label:"Рука"},{key:"status",label:"Статус"}]},
 weighin:{title:"Взвешивание",table:"weigh_ins",fields:[
  {name:"registration_id",label:"Регистрация спортсмена",type:"select",relation:"registrations",required:true},
  {name:"weight",label:"Фактический вес, кг",type:"number",required:true},{name:"note",label:"Примечание"}],
  columns:[{key:"registration_id",label:"Спортсмен / турнир"},{key:"weight",label:"Вес, кг"},{key:"measured_at",label:"Время"},{key:"note",label:"Примечание"}]},
 categories:{title:"Весовые категории",table:"tournament_categories",fields:[
  {name:"tournament_id",label:"Турнир",type:"select",relation:"tournaments",required:true},{name:"name",label:"Название категории",required:true},
  {name:"gender",label:"Пол",type:"select",options:[{value:"male",label:"Мужчины"},{value:"female",label:"Женщины"},{value:"other",label:"Открытая"}]},
  {name:"min_weight",label:"Вес от, кг",type:"number"},{name:"max_weight",label:"Вес до, кг",type:"number"},
  {name:"hand",label:"Рука",type:"select",options:[{value:"right",label:"Правая"},{value:"left",label:"Левая"},{value:"both",label:"Обе"}]},
  {name:"format",label:"Формат",type:"select",options:[{value:"single",label:"Олимпийская"},{value:"double",label:"Двойное выбывание"},{value:"rr",label:"Круговая"}]}],
  columns:[{key:"name",label:"Категория"},{key:"tournament_id",label:"Турнир"},{key:"gender",label:"Пол"},{key:"min_weight",label:"От"},{key:"max_weight",label:"До"},{key:"hand",label:"Рука"},{key:"format",label:"Формат"}]},
 brackets:{title:"Сетки и результаты",table:"brackets",fields:[{name:"category_id",label:"Категория",required:true},{name:"name",label:"Название сетки",required:true}],columns:[{key:"name",label:"Сетка"},{key:"category_id",label:"Категория"},{key:"format",label:"Формат"},{key:"created_at",label:"Создана"}]}
};

export default function Management({client,module,canEdit,onMessage}:{client:any;module:ModuleKey;canEdit:boolean;onMessage:(s:string)=>void}) {
 if(module==="brackets") return <BracketBuilder client={client} canEdit={canEdit} onMessage={onMessage}/>;
 const cfg=modules[module];
 const [rows,setRows]=useState<any[]>([]);
 const [relations,setRelations]=useState<Record<string,any[]>>({});
 const [busy,setBusy]=useState(false);
 const [showForm,setShowForm]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [formKey,setFormKey]=useState(0);

 async function reload(){
  setBusy(true);
  const [main,tournaments,athletes,clubs,registrations]=await Promise.all([
   client.from(cfg.table).select("*").order("created_at",{ascending:false}),
   client.from("tournaments").select("id,name").order("starts_at"),
   client.from("athletes").select("id,first_name,last_name").order("last_name"),
   client.from("clubs").select("id,name").order("name"),
   client.from("registrations").select("id,tournament_id,athlete_id,hand,status,athletes(first_name,last_name),tournaments(name)").order("created_at",{ascending:false})
  ]);
  const error=main.error||tournaments.error||athletes.error||clubs.error||registrations.error;
  if(error)onMessage("Не удалось загрузить данные: "+error.message);
  else{
   setRows(main.data||[]);
   setRelations({tournaments:tournaments.data||[],athletes:athletes.data||[],clubs:clubs.data||[],registrations:registrations.data||[]});
  }
  setBusy(false);
 }
 useEffect(()=>{void reload();setShowForm(false);setEditingId(null)},[module]);

 const options=useMemo(()=>{
  const result:Record<string,Option[]>={};
  for(const f of cfg.fields){
   if(!f.relation)continue;
   const source=relations[f.relation]||[];
   result[f.relation]=source.map(row=>{
    if(f.relation==="athletes")return {value:row.id,label:row.last_name+" "+row.first_name};
    if(f.relation==="registrations")return {value:row.id,label:(row.athletes?.last_name||"Спортсмен")+" "+(row.athletes?.first_name||"")+" · "+(row.tournaments?.name||"Турнир")+" · "+(row.hand==="left"?"левая":row.hand==="right"?"правая":"обе")};
    return {value:row.id,label:row.name};
   });
  }
  return result;
 },[cfg,relations]);

 function display(row:any,key:string){
  if(key==="club_id")return relations.clubs?.find(x=>x.id===row.club_id)?.name||"—";
  if(key==="athlete_id") {const a=relations.athletes?.find(x=>x.id===row.athlete_id);return a?a.last_name+" "+a.first_name:"—";}
  if(key==="tournament_id")return relations.tournaments?.find(x=>x.id===row.tournament_id)?.name||"—";
  if(key==="registration_id"){const r=relations.registrations?.find(x=>x.id===row.registration_id);return r?(r.athletes?.last_name||"Спортсмен")+" "+(r.athletes?.first_name||"")+" · "+(r.tournaments?.name||"Турнир"):"—";}
  const labels:Record<string,Record<string,string>>={gender:{male:"Мужской",female:"Женский",other:"Открытая"},hand:{right:"Правая",left:"Левая",both:"Обе"},format:{single:"Олимпийская",double:"Двойное выбывание",rr:"Круговая"},status:{pending:"На проверке",approved:"Допущен",rejected:"Отклонён"}};
  if(labels[key]?.[row[key]])return labels[key][row[key]];
  if(key==="created_at"||key==="measured_at")return row[key]?new Date(row[key]).toLocaleString("ru-RU"):"—";
  return row[key]??"—";
 }
 function startEdit(row:any){
  setEditingId(row.id);setShowForm(true);setFormKey(v=>v+1);
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!canEdit)return;
  const fd=new FormData(e.currentTarget);
  const value:Record<string,unknown>={};
  for(const f of cfg.fields){
   const raw=String(fd.get(f.name)||"").trim();
   value[f.name]=raw?(f.type==="number"?Number(raw):raw):null;
  }
  if(module==="weighin")value.operator_id=(await client.auth.getUser()).data.user?.id;
  setBusy(true);
  const result=editingId
   ? await client.from(cfg.table).update(value).eq("id",editingId)
   : await client.from(cfg.table).insert(value);
  if(result.error)onMessage("Не удалось сохранить: "+result.error.message);
  else{onMessage(editingId?"Изменения сохранены.":"Запись добавлена.");setShowForm(false);setEditingId(null);await reload();}
  setBusy(false);
 }
 async function remove(id:string){
  if(!confirm("Удалить запись?"))return;
  const {error}=await client.from(cfg.table).delete().eq("id",id);
  if(error)onMessage("Не удалось удалить: "+error.message);
  else{onMessage("Запись удалена.");await reload();}
 }
 const editing=rows.find(r=>r.id===editingId);
 return <section className="panel">
  <div className="section-title"><div><h2>{cfg.title}</h2><p>Данные сохраняются в общей базе. Связанные записи выбираются из справочников, а не вводятся вручную по ID.</p></div><div className="row-actions"><button className="secondary" onClick={()=>void reload()} disabled={busy}><RefreshCw size={15}/> Обновить</button>{canEdit&&<button className="primary" onClick={()=>{setEditingId(null);setShowForm(v=>!v);setFormKey(v=>v+1)}}><Plus size={16}/> Добавить</button>}</div></div>
  {showForm&&canEdit&&<form key={formKey} className="form-grid management-form" onSubmit={save}>
   {cfg.fields.map(f=><label key={f.name}>{f.label}{f.type==="select"||f.relation?<select name={f.name} required={f.required} defaultValue={editing?.[f.name]??(f.options?.[0]?.value||"")}><option value="">Выберите…</option>{(f.relation?(options[f.relation]||[]):(f.options||[])).map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select>:<input name={f.name} type={f.type||"text"} required={f.required} step={f.type==="number"?"0.01":undefined} defaultValue={editing?.[f.name]??""}/>}</label>)}
   <div className="full form-actions"><button className="primary" disabled={busy}>{busy?"Сохранение…":editingId?"Сохранить изменения":"Сохранить"}</button><button type="button" className="secondary" onClick={()=>{setShowForm(false);setEditingId(null)}}><X size={15}/> Отмена</button></div>
  </form>}
  <div className="table-wrap"><table className="data-table"><thead><tr>{cfg.columns.map(col=><th key={col.key}>{col.label}</th>)}{canEdit&&<th>Действия</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id}>{cfg.columns.map(col=><td key={col.key}>{display(row,col.key)}</td>)}{canEdit&&<td><div className="row-actions"><button className="icon-btn" title="Редактировать" onClick={()=>startEdit(row)}><Pencil size={15}/></button><button className="icon-btn danger" title="Удалить" onClick={()=>void remove(row.id)}><Trash2 size={15}/></button></div></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty"><b>Пока нет записей</b><p>Добавьте первую запись в разделе «{cfg.title}».</p></div>}</div>
 </section>;
}
