import { FormEvent, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

type ModuleKey = "athletes" | "clubs" | "registration" | "weighin" | "categories" | "brackets";
type Field = { name: string; label: string; type?: string; required?: boolean; options?: {value:string;label:string}[] };
const modules: Record<ModuleKey,{title:string;table:string;fields:Field[];columns:{key:string;label:string}[]}> = {
 athletes:{title:"Спортсмены",table:"athletes",fields:[
  {name:"last_name",label:"Фамилия",required:true},{name:"first_name",label:"Имя",required:true},
  {name:"gender",label:"Пол",type:"select",options:[{value:"male",label:"Мужской"},{value:"female",label:"Женский"},{value:"other",label:"Открытая"}]},
  {name:"birth_date",label:"Дата рождения",type:"date"},{name:"club_id",label:"ID клуба"},
  {name:"city",label:"Город"},{name:"country",label:"Страна"}],
  columns:[{key:"last_name",label:"Фамилия"},{key:"first_name",label:"Имя"},{key:"gender",label:"Пол"},{key:"birth_date",label:"Дата рождения"},{key:"club_id",label:"Клуб (ID)"}]},
 clubs:{title:"Клубы",table:"clubs",fields:[{name:"name",label:"Название клуба",required:true},{name:"city",label:"Город"},{name:"country",label:"Страна"}],columns:[{key:"name",label:"Клуб"},{key:"city",label:"Город"},{key:"country",label:"Страна"}]},
 registration:{title:"Регистрация на турнир",table:"registrations",fields:[
  {name:"tournament_id",label:"ID турнира",required:true},{name:"athlete_id",label:"ID спортсмена",required:true},
  {name:"hand",label:"Рука",type:"select",options:[{value:"right",label:"Правая"},{value:"left",label:"Левая"},{value:"both",label:"Обе"}]},
  {name:"status",label:"Статус",type:"select",options:[{value:"pending",label:"На проверке"},{value:"approved",label:"Допущен"},{value:"rejected",label:"Отклонён"}]}],
  columns:[{key:"tournament_id",label:"Турнир"},{key:"athlete_id",label:"Спортсмен"},{key:"hand",label:"Рука"},{key:"status",label:"Статус"}]},
 weighin:{title:"Взвешивание",table:"weigh_ins",fields:[
  {name:"registration_id",label:"ID заявки",required:true},{name:"weight",label:"Фактический вес, кг",type:"number",required:true},{name:"note",label:"Примечание"}],
  columns:[{key:"registration_id",label:"Заявка"},{key:"weight",label:"Вес, кг"},{key:"measured_at",label:"Время"},{key:"note",label:"Примечание"}]},
 categories:{title:"Весовые категории",table:"tournament_categories",fields:[
  {name:"tournament_id",label:"ID турнира",required:true},{name:"name",label:"Название категории",required:true},
  {name:"gender",label:"Пол",type:"select",options:[{value:"male",label:"Мужчины"},{value:"female",label:"Женщины"},{value:"other",label:"Открытая"}]},
  {name:"min_weight",label:"Вес от, кг",type:"number"},{name:"max_weight",label:"Вес до, кг",type:"number"},
  {name:"hand",label:"Рука",type:"select",options:[{value:"right",label:"Правая"},{value:"left",label:"Левая"},{value:"both",label:"Обе"}]},
  {name:"format",label:"Формат",type:"select",options:[{value:"single",label:"Олимпийская"},{value:"double",label:"Двойное выбывание"},{value:"rr",label:"Круговая"}]}],
  columns:[{key:"name",label:"Категория"},{key:"tournament_id",label:"Турнир"},{key:"gender",label:"Пол"},{key:"min_weight",label:"От"},{key:"max_weight",label:"До"},{key:"hand",label:"Рука"},{key:"format",label:"Формат"}]},
 brackets:{title:"Сетки и результаты",table:"brackets",fields:[{name:"category_id",label:"ID категории",required:true},{name:"name",label:"Название сетки",required:true},{name:"format",label:"Формат",type:"select",options:[{value:"single",label:"Олимпийская"},{value:"double",label:"Двойное выбывание"},{value:"rr",label:"Круговая"}]}],columns:[{key:"name",label:"Сетка"},{key:"category_id",label:"Категория"},{key:"format",label:"Формат"},{key:"created_at",label:"Создана"}]}
};
export default function Management({client,module,canEdit,onMessage}:{client:any;module:ModuleKey;canEdit:boolean;onMessage:(s:string)=>void}) {
 const cfg=modules[module]; const [rows,setRows]=useState<any[]>([]); const [busy,setBusy]=useState(false); const [showForm,setShowForm]=useState(false);
 async function reload(){setBusy(true);const {data,error}=await client.from(cfg.table).select("*").order("created_at",{ascending:false});if(error)onMessage(error.message);else setRows(data||[]);setBusy(false)}
 useEffect(()=>{void reload()},[module]);
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);const value:Record<string,unknown>={};for(const f of cfg.fields){const raw=String(fd.get(f.name)||"").trim();if(raw)value[f.name]=f.type==="number"?Number(raw):raw;}if(module==="weighin")value.operator_id=(await client.auth.getUser()).data.user?.id;const {error}=await client.from(cfg.table).insert(value);if(error)onMessage("Не удалось сохранить: "+error.message);else{onMessage("Запись добавлена.");setShowForm(false);(e.target as HTMLFormElement).reset();await reload()}}
 async function remove(id:string){if(!confirm("Удалить запись?"))return;const {error}=await client.from(cfg.table).delete().eq("id",id);if(error)onMessage("Не удалось удалить: "+error.message);else{onMessage("Запись удалена.");await reload()}}
 return <section className="panel">
  <div className="section-title"><div><h2>{cfg.title}</h2><p>Данные сохраняются в общей базе Supabase и доступны согласно назначенным ролям.</p></div><div className="row-actions"><button className="secondary" onClick={()=>void reload()} disabled={busy}><RefreshCw size={15}/> Обновить</button>{canEdit&&<button className="primary" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/> Добавить</button>}</div></div>
  {showForm&&canEdit&&<form className="form-grid management-form" onSubmit={create}>{cfg.fields.map(f=><label key={f.name}>{f.label}{f.type==="select"?<select name={f.name} required={f.required}>{f.options?.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select>:<input name={f.name} type={f.type||"text"} required={f.required} step={f.type==="number"?"0.01":undefined}/>}</label>)}<div className="full form-actions"><button className="primary" disabled={busy}>Сохранить</button><button type="button" className="secondary" onClick={()=>setShowForm(false)}>Отмена</button></div></form>}
  <div className="table-wrap"><table className="data-table"><thead><tr>{cfg.columns.map(c=><th key={c.key}>{c.label}</th>)}{canEdit&&<th/>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{cfg.columns.map(c=><td key={c.key}>{r[c.key]??"—"}</td>)}{canEdit&&<td><button className="icon-btn danger" title="Удалить" onClick={()=>void remove(r.id)}><Trash2 size={15}/></button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty"><b>Пока нет записей</b><p>Добавьте первую запись в разделе «{cfg.title}».</p></div>}</div>
 </section>;
}
