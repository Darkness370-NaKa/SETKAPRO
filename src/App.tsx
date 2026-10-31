import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, ClipboardList, Download, Pencil, LogOut, Plus, ShieldCheck, Trophy, UserRound, Users } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { AppRole, ParticipationApplication, Tournament } from "./types";
import Management from "./Management";
import BracketBuilder from "./BracketBuilder";

type SessionUser = { id: string; email?: string };
type ManagedUser = { user_id: string; email: string | null; full_name: string | null; role: AppRole; created_at: string };
const roleNames: Record<AppRole, string> = {
  SUPER_ADMIN: "Суперадминистратор", ADMIN: "Администратор", ORGANIZER: "Организатор",
  SECRETARY: "Секретарь", WEIGH_IN_OPERATOR: "Оператор взвешивания",
  CHIEF_JUDGE: "Главный судья", JUDGE: "Судья", OBSERVER: "Наблюдатель"
};

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<AppRole>("OBSERVER");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [message, setMessage] = useState("");
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [editorBracketId, setEditorBracketId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("bracket"));
  const [tab, setTab] = useState<"tournaments" | "apply" | "applications" | "admin" | "users" | "athletes" | "clubs" | "registration" | "weighin" | "categories" | "brackets">("tournaments");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [applications, setApplications] = useState<ParticipationApplication[]>([]);
  const [selectedTournament, setSelectedTournament] = useState("");
  const [busy, setBusy] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null)).finally(() => setLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) { setRole("OBSERVER"); setTournaments([]); setApplications([]); return; }
    void loadUserData();
  }, [user?.id]);

  async function fetchAllRows(query: any) {
    const all: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await query.range(offset, offset + 999);
      if (error) return { data: null, error };
      all.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    return { data: all, error: null };
  }

  async function loadUserData() {
    if (!supabase || !user) return;
    const [roleResult, tournamentResult, applicationResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      fetchAllRows(supabase.from("tournaments").select("id,name,location,starts_at,ends_at,status").order("starts_at").order("id")),
      fetchAllRows(supabase.from("participation_applications").select("*,tournaments(name)").order("created_at", { ascending: false }).order("id"))
    ]);
    const loadError = roleResult.error || tournamentResult.error || applicationResult.error;
    if (loadError) {
      setMessage("Не удалось обновить данные кабинета: " + loadError.message);
      return;
    }
    const roles = (roleResult.data ?? []).map(x => x.role as AppRole);
    const priority: AppRole[] = ["SUPER_ADMIN","ADMIN","ORGANIZER","SECRETARY","WEIGH_IN_OPERATOR","CHIEF_JUDGE","JUDGE","OBSERVER"];
    const activeRole = priority.find(r => roles.includes(r)) ?? "OBSERVER";
    setRole(activeRole);
    setTournaments((tournamentResult.data ?? []) as Tournament[]);
    setApplications((applicationResult.data ?? []) as ParticipationApplication[]);
    if (activeRole === "SUPER_ADMIN") {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) setMessage(`Не удалось загрузить пользователей: ${error.message}`);
      else setManagedUsers((data ?? []) as ManagedUser[]);
    } else setManagedUsers([]);
  }

  async function authSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMessage("");
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    let error;
    if (mode === "signup") {
      ({ error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString() } }));
      if (!error) setMessage("Проверьте почту и подтвердите адрес. После подтверждения вы сможете войти.");
    } else if (mode === "reset") {
      ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString() }));
      if (!error) setMessage("Если адрес зарегистрирован, на него придёт письмо для сброса пароля.");
    } else {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function createTournament(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !user || !["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role)) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const starts = String(fd.get("starts_at") || "");
    const ends = String(fd.get("ends_at") || "");
    const name = String(fd.get("name") || "").trim();
    const location = String(fd.get("location") || "").trim() || null;
    const status = String(fd.get("status") || "draft");
    if (!name) { setMessage("Укажите название турнира."); return; }
    if (starts && Number.isNaN(Date.parse(starts))) { setMessage("Проверьте дату начала турнира."); return; }
    if (ends && Number.isNaN(Date.parse(ends))) { setMessage("Проверьте дату окончания турнира."); return; }
    if (starts && ends && new Date(ends).getTime() < new Date(starts).getTime()) { setMessage("Окончание турнира не может быть раньше его начала."); return; }
    const payload = {
      name, location, status,
      starts_at: starts ? new Date(starts).toISOString() : null,
      ends_at: ends ? new Date(ends).toISOString() : null,
    };
    setBusy(true); setMessage("");
    const { error } = editingTournamentId ? await supabase.from("tournaments").update(payload).eq("id", editingTournamentId) : await supabase.from("tournaments").insert({ ...payload, created_by: user.id });
    if (error) setMessage("Не удалось создать турнир: " + error.message);
    else {
      setMessage(editingTournamentId ? "Изменения турнира сохранены." : "Турнир создан.");
      setEditingTournamentId(null);
      setShowTournamentForm(false);
      form.reset();
      await loadUserData();
    }
    setBusy(false);
  }

  async function exportTournamentData() {
    if (!supabase) return;
    setBusy(true);
    const tables = ['tournaments','athletes','clubs','registrations','participation_applications','weigh_ins','tournament_categories','brackets','matches','match_change_log'];
    const data: Record<string, unknown[]> = {};
    for (const table of tables) {
      const allRows: unknown[] = [];
      let offset = 0;
      while (true) {
        const result = await supabase.from(table).select("*").order("id").range(offset, offset + 999);
        if (result.error) { setMessage("Не удалось экспортировать "+table+": "+result.error.message); setBusy(false); return; }
        allRows.push(...(result.data || []));
        if ((result.data || []).length < 1000) break;
        offset += 1000;
      }
      data[table] = allRows;
    }
    const blob = new Blob([JSON.stringify({format:'SETKA_PRO_BACKUP',version:1,exported_at:new Date().toISOString(),data},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download='setka-pro-backup.json'; link.click(); URL.revokeObjectURL(url);
    setMessage('Резервная копия скачана.'); setBusy(false);
  }

  async function importTournamentBackup(file: File) {
    if (!supabase || !["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role)) return;
    if (!confirm("Восстановить данные из резервной копии? Записи с теми же ID будут обновлены. Отсутствующие в копии записи НЕ удаляются. Сначала рекомендуется скачать текущую копию.")) {
      if (backupInputRef.current) backupInputRef.current.value = "";
      return;
    }
    setBusy(true);
    setMessage("Проверяем резервную копию…");
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== "SETKA_PRO_BACKUP" || backup?.version !== 1 || !backup?.data || typeof backup.data !== "object") {
        throw new Error("Файл не является резервной копией SETKA PRO версии 1.");
      }
      const order = ["tournaments","clubs","athletes","tournament_categories","registrations","participation_applications","weigh_ins","brackets","matches","match_change_log"];
      if (Array.isArray(backup.data)) throw new Error("Разделы резервной копии имеют неверный формат.");
      const allowed = new Set(order);
      for (const table of order) {
        if (!Object.prototype.hasOwnProperty.call(backup.data, table)) {
          throw new Error("В резервной копии отсутствует обязательный раздел: " + table);
        }
      }
      for (const key of Object.keys(backup.data)) {
        if (!allowed.has(key) || !Array.isArray(backup.data[key])) throw new Error("Некорректный раздел резервной копии: " + key);
        if (backup.data[key].some((row: any) => !row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string")) {
          throw new Error("В разделе " + key + " обнаружена запись без корректного ID.");
        }
      }
      let restored = 0;
      for (const table of order) {
        const rows = backup.data[table] || [];
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: table === "match_change_log" });
          if (error) throw new Error("Ошибка восстановления " + table + ": " + error.message + ". Предыдущие разделы уже могли сохраниться.");
          restored += Math.min(200, rows.length - i);
        }
      }
      await loadUserData();
      setMessage("Обработано записей: " + restored + ". Данные объединены по ID; отсутствующие записи не удалялись.");
    } catch (error: any) {
      setMessage("Не удалось полностью восстановить копию: " + (error?.message || String(error)));
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
      setBusy(false);
    }
  }

  async function submitApplication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || !user) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true); setMessage("");
    const payload = {
      tournament_id: String(fd.get("tournament_id")),
      user_id: user.id,
      first_name: String(fd.get("first_name")).trim(),
      last_name: String(fd.get("last_name")).trim(),
      gender: String(fd.get("gender") || "male"),
      birth_date: String(fd.get("birth_date") || "") || null,
      club_name: String(fd.get("club_name") || "").trim() || null,
      body_weight: fd.get("body_weight") ? Number(fd.get("body_weight")) : null,
      arm: String(fd.get("arm"))
    };
    const { error } = await supabase.from("participation_applications").insert(payload);
    setMessage(error ? error.message : "Заявка отправлена. Статус можно отслеживать в личном кабинете.");
    if (!error) { (e.target as HTMLFormElement).reset(); await loadUserData(); setTab("applications"); }
    setBusy(false);
  }

  async function reviewApplication(id: string, status: "approved" | "rejected") {
    if (!supabase) return;
    const { error } = await supabase.rpc("review_participation_application", { p_application_id: id, p_status: status, p_review_note: null });
    setMessage(error ? `Не удалось обработать заявку: ${error.message}` : status === "approved" ? "Заявка одобрена: спортсмен и регистрация созданы, данные переданы в список взвешивания." : "Заявка отклонена.");
    await loadUserData();
  }

  const canReview = useMemo(() => ["SUPER_ADMIN","ADMIN","ORGANIZER","SECRETARY"].includes(role), [role]);
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canEditModules = ["SUPER_ADMIN","ADMIN","ORGANIZER","SECRETARY","WEIGH_IN_OPERATOR","CHIEF_JUDGE","JUDGE"].includes(role);

  async function changeManagedRole(userId: string, nextRole: AppRole) {
    if (!supabase || !isSuperAdmin) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: nextRole });
    setMessage(error ? `Не удалось изменить роль: ${error.message}` : "Роль пользователя обновлена.");
    if (!error) await loadUserData();
    setBusy(false);
  }

  if (loading) return <div className="center"><div className="loader" />Загрузка SETKA PRO…</div>;
  if (!isSupabaseConfigured || !supabase) return <SetupScreen />;
  if (!user) return <AuthScreen mode={mode} setMode={setMode} onSubmit={authSubmit} busy={busy} message={message} />;
  if (editorBracketId) return <BracketBuilder client={supabase} canEdit={canEditModules} onMessage={setMessage} initialBracketId={editorBracketId} onExit={() => { window.history.pushState({}, "", window.location.pathname); setEditorBracketId(null); setTab("brackets"); }} />;

  const nav = [
    { id: "tournaments", label: "Турниры", icon: Trophy },
    { id: "apply", label: "Подать заявку", icon: ClipboardList },
    { id: "applications", label: "Мои заявки", icon: UserRound },
    ...(canReview ? [{ id: "admin", label: "Заявки участников", icon: Users }] : []),
    { id: "athletes", label: "Спортсмены", icon: UserRound },
    { id: "clubs", label: "Клубы", icon: Users },
    { id: "registration", label: "Регистрация", icon: ClipboardList },
    { id: "weighin", label: "Взвешивание", icon: Activity },
    { id: "categories", label: "Весовые категории", icon: Trophy },
    { id: "brackets", label: "Сетки и результаты", icon: CheckCircle2 },
    ...(isSuperAdmin ? [{ id: "users", label: "Пользователи и роли", icon: ShieldCheck }] : [])
  ] as const;

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><img className="brand-mark" src="./arm-msk37-logo.svg" alt="АРМ МСК 37"/><div><b>SETKA <span>PRO</span></b><small>ARM WRESTLING MANAGEMENT</small></div></div>
      <div className="userbox"><span className="avatar">{(user.email || "U").slice(0,1).toUpperCase()}</span><div><b>{user.email}</b><small>{roleNames[role]}</small></div><button className="icon-btn" title="Выйти" onClick={() => { void supabase?.auth.signOut(); }}><LogOut size={17}/></button></div>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <div className="side-caption">РАБОЧАЯ ОБЛАСТЬ</div>
        {nav.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id as "tournaments" | "apply" | "applications" | "admin" | "users" | "athletes" | "clubs" | "registration" | "weighin" | "categories" | "brackets")}><item.icon size={18}/>{item.label}</button>)}
        <div className="side-foot"><ShieldCheck size={16}/> Доступ определяется серверными ролями</div>
      </aside>
      <main className="main">
        <div className="page-head"><div><div className="eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</div><h1>{nav.find(x => x.id === tab)?.label ?? "SETKA PRO"}</h1></div><div className="live-pill"><Activity size={14}/> SUPABASE CONNECTED</div></div>
        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}
        {tab === "tournaments" && <>
          <section className="panel">
            <div className="section-title"><div><h2>Турниры</h2><p>Создавайте соревнования и управляйте их публикацией.</p></div>
              {["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role) && <div className="row-actions"><button className="secondary" onClick={() => void exportTournamentData()} disabled={busy}><Download size={15}/> Резервная копия</button><button className="secondary" onClick={() => backupInputRef.current?.click()} disabled={busy}>Восстановить копию</button><input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={e => { const file=e.target.files?.[0]; if(file) void importTournamentBackup(file); }}/><button className="primary" onClick={() => setShowTournamentForm(v => !v)}><Plus size={16}/> Создать турнир</button></div>}
            </div>
            {showTournamentForm && ["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role) && <form className="form-grid" key={editingTournamentId || "new"} onSubmit={createTournament}>
              <label className="full">Название турнира<input name="name" required maxLength={180} defaultValue={tournaments.find(t => t.id === editingTournamentId)?.name || ""} placeholder="Например, Кубок города по армрестлингу"/></label>
              <label className="full">Место проведения<input name="location" maxLength={180} defaultValue={tournaments.find(t => t.id === editingTournamentId)?.location || ""} placeholder="Город, спортивный комплекс"/></label>
              <label>Начало турнира<input name="starts_at" type="datetime-local" defaultValue={localDateTimeValue(tournaments.find(t => t.id === editingTournamentId)?.starts_at || null)}/></label>
              <label>Окончание турнира<input name="ends_at" type="datetime-local" defaultValue={localDateTimeValue(tournaments.find(t => t.id === editingTournamentId)?.ends_at || null)}/></label>
              <label>Статус турнира<select name="status" defaultValue={tournaments.find(t => t.id === editingTournamentId)?.status || "draft"}><option value="draft">Черновик</option><option value="published">Опубликован — открыт для заявок</option><option value="registration_closed">Регистрация закрыта</option><option value="completed">Завершён</option></select></label>
              <div className="full form-actions"><button className="primary" disabled={busy}>{busy ? "Сохранение…" : editingTournamentId ? "Сохранить изменения" : "Создать турнир"}</button><button type="button" className="secondary" onClick={() => {setShowTournamentForm(false);setEditingTournamentId(null);}}>Отмена</button></div>
              <p className="full">Выберите «Черновик» для подготовки или «Опубликован», чтобы сразу открыть турнир в каталоге для заявок.</p>
            </form>}
          </section>
          <section className="dashboard-stats"><article><span>Всего турниров</span><b>{tournaments.length}</b></article><article><span>Опубликовано</span><b>{tournaments.filter(t => t.status === "published").length}</b></article><article><span>Заявки</span><b>{applications.length}</b></article><article><span>Ожидают решения</span><b>{applications.filter(a => a.status === "pending").length}</b></article></section><section className="cards">
            {tournaments.length ? tournaments.map(t => <article className="tournament-card" key={t.id}><div className="card-top"><span className="tag">{t.status === "draft" ? "ЧЕРНОВИК" : t.status === "completed" ? "ЗАВЕРШЁН" : t.status === "registration_closed" ? "РЕГИСТРАЦИЯ ЗАКРЫТА" : "ОТКРЫТАЯ ИНФОРМАЦИЯ"}</span><Trophy size={20}/></div><h2>{t.name}</h2><p>{t.location || "Место проведения уточняется"}</p><div className="card-bottom"><span>{t.starts_at ? new Date(t.starts_at).toLocaleDateString("ru-RU") : "Дата уточняется"}</span>{["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role) && <button className="icon-btn" title="Редактировать турнир" onClick={() => {setEditingTournamentId(t.id);setShowTournamentForm(true);}}><Pencil size={15}/></button>}{t.status === "published" && <button className="text-btn" onClick={() => {setSelectedTournament(t.id);setTab("apply");}}>Подать заявку <ArrowRight size={15}/></button>}</div></article>) : <Empty title="Пока нет турниров" text={["SUPER_ADMIN","ADMIN","ORGANIZER"].includes(role) ? "Создайте первый турнир кнопкой выше." : "Когда организатор опубликует турнир, он появится здесь."}/>}
          </section>
        </>}
        {tab === "apply" && <section className="panel"><div className="section-title"><div><h2>Заявка на участие</h2><p>Заполните данные спортсмена. Заявка поступит организаторам на рассмотрение.</p></div><span className="tag amber">НОВАЯ ЗАЯВКА</span></div>
          <form className="form-grid" onSubmit={submitApplication}>
            <label className="full">Турнир<select name="tournament_id" required value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)}><option value="">Выберите турнир</option>{tournaments.filter(t => t.status === "published").map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
            <label>Имя<input name="first_name" required maxLength={80}/></label><label>Фамилия<input name="last_name" required maxLength={80}/></label>
            <label>Дата рождения<input type="date" name="birth_date"/></label><label>Пол<select name="gender"><option value="male">Мужской</option><option value="female">Женский</option><option value="other">Открытая категория</option></select></label><label>Клуб<input name="club_name" maxLength={120}/></label>
            <label>Вес, кг<input name="body_weight" type="number" min="20" max="250" step="0.1"/></label>
            <label>Рука<select name="arm"><option value="right">Правая</option><option value="left">Левая</option><option value="both">Обе</option></select></label>
            <div className="full form-actions"><button className="primary" disabled={busy || !tournaments.some(t => t.id === selectedTournament && t.status === "published")}>{busy ? "Отправка…" : "Отправить заявку"} <ArrowRight size={17}/></button></div>
          </form>
        </section>}
        {tab === "applications" && <section className="panel"><div className="section-title"><div><h2>Мои заявки</h2><p>Здесь отображаются только ваши заявки.</p></div></div><ApplicationList items={applications.filter(a => a.user_id === user.id)} /></section>}
        {tab === "admin" && canReview && <section className="panel"><div className="section-title"><div><h2>Заявки участников</h2><p>Список заявок, доступный вашей роли.</p></div></div><div className="application-list">{applications.map(a => <div className="application-row" key={a.id}><div className="app-main"><b>{a.last_name} {a.first_name}</b><span>{a.tournaments?.name || "Турнир"} · {a.club_name || "Без клуба"} · {a.body_weight ? `${a.body_weight} кг` : "Вес не указан"}</span></div><Status status={a.status}/>{a.status === "pending" && <div className="row-actions"><button className="approve" onClick={() => reviewApplication(a.id,"approved")}>Одобрить</button><button className="reject" onClick={() => reviewApplication(a.id,"rejected")}>Отклонить</button></div>}</div>)}</div></section>}
        {(["athletes","clubs","registration","weighin","categories"] as const).includes(tab as any) && <Management client={supabase} module={tab as "athletes" | "clubs" | "registration" | "weighin" | "categories"} canEdit={canEditModules} onMessage={setMessage} />}
        {tab === "brackets" && <BracketBuilder client={supabase} canEdit={canEditModules} onMessage={setMessage} onOpenEditor={(id) => { window.history.pushState({}, "", `${window.location.pathname}?bracket=${id}`); setEditorBracketId(id); }} />}
        {tab === "users" && isSuperAdmin && <section className="panel"><div className="section-title"><div><h2>Пользователи и роли</h2><p>Назначайте права зарегистрированным пользователям. Новые аккаунты получают роль «Наблюдатель».</p></div><span className="tag">ТОЛЬКО СУПЕРАДМИНИСТРАТОР</span></div><div className="application-list">{managedUsers.map(item => <div className="application-row" key={item.user_id}><div className="app-main"><b>{item.email || "Без email"}</b><span>{item.full_name || "Имя не указано"} · регистрация {new Date(item.created_at).toLocaleDateString("ru-RU")}</span></div><select aria-label={`Роль пользователя ${item.email || item.user_id}`} value={item.role} disabled={busy || item.user_id === user.id} onChange={e => void changeManagedRole(item.user_id, e.target.value as AppRole)}>{(["OBSERVER","JUDGE","CHIEF_JUDGE","WEIGH_IN_OPERATOR","SECRETARY","ORGANIZER","ADMIN"] as AppRole[]).map(r => <option key={r} value={r}>{roleNames[r]}</option>)}</select></div>)}</div>{managedUsers.length === 0 && <Empty title="Пользователей пока нет" text="Зарегистрированные аккаунты появятся здесь после подтверждения регистрации."/>}<div className="admin-hint"><ShieldCheck size={17}/> Назначение и проверка ролей выполняются на стороне Supabase. Самостоятельно назначить себе права нельзя.</div></section>}
      </main>
    </div>
  </div>;
}

function localDateTimeValue(value:string|null):string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
}

function ApplicationList({items}:{items:ParticipationApplication[]}) {
  if (!items.length) return <Empty title="Заявок пока нет" text="После отправки заявка появится в этом разделе."/>;
  return <div className="application-list">{items.map(a => <div className="application-row" key={a.id}><div className="app-main"><b>{a.tournaments?.name || "Турнир"}</b><span>{a.first_name} {a.last_name} · {new Date(a.created_at).toLocaleDateString("ru-RU")}</span></div><Status status={a.status}/></div>)}</div>;
}
function Status({status}:{status:string}) {
  const label = status === "approved" ? "Одобрена" : status === "rejected" ? "Отклонена" : "На рассмотрении";
  return <span className={`status ${status}`}>{label}</span>;
}
function Empty({title,text}:{title:string;text:string}) { return <div className="empty"><div className="empty-icon"><ClipboardList size={22}/></div><b>{title}</b><p>{text}</p></div>; }
function AuthScreen({mode,setMode,onSubmit,busy,message}:{mode:"login"|"signup"|"reset";setMode:(m:"login"|"signup"|"reset")=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;busy:boolean;message:string}) {
  return <div className="auth-page"><div className="auth-visual"><div className="brand"><img className="brand-mark" src="./arm-msk37-logo.svg" alt="АРМ МСК 37"/><div><b>SETKA <span>PRO</span></b><small>ARM WRESTLING MANAGEMENT</small></div></div><div className="visual-copy"><div className="eyebrow">ЕДИНАЯ СИСТЕМА ТУРНИРОВ</div><h1>СИЛА.<br/><em>ТОЧНОСТЬ.</em><br/>РЕЗУЛЬТАТ.</h1><p>Регистрация спортсменов, организация соревнований и управление турнирами в одной системе.</p></div><div className="visual-foot">SETKA PRO · TOURNAMENT PLATFORM</div></div><div className="auth-side"><form className="auth-card" onSubmit={onSubmit}><div className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</div><h2>{mode === "signup" ? "Создать аккаунт" : mode === "reset" ? "Сброс пароля" : "С возвращением"}</h2><p>{mode === "signup" ? "После регистрации вам будет назначена роль наблюдателя." : "Войдите, чтобы продолжить работу с турнирами."}</p><label>Email<input name="email" type="email" required placeholder="name@example.com"/></label>{mode !== "reset" && <label>Пароль<input name="password" type="password" minLength={8} required placeholder="Не менее 8 символов"/></label>}{message && <div className="notice">{message}</div>}<button className="primary wide" disabled={busy}>{busy ? "Подождите…" : mode === "signup" ? "Зарегистрироваться" : mode === "reset" ? "Отправить ссылку" : "Войти"} <ArrowRight size={17}/></button><div className="auth-links">{mode !== "login" && <button type="button" onClick={() => setMode("login")}>Ко входу</button>}{mode === "login" && <><button type="button" onClick={() => setMode("signup")}>Создать аккаунт</button><button type="button" onClick={() => setMode("reset")}>Забыли пароль?</button></>}</div></form></div></div>;
}
function SetupScreen() {
  return <div className="setup-page"><div className="brand"><img className="brand-mark" src="./arm-msk37-logo.svg" alt="АРМ МСК 37"/><div><b>SETKA <span>PRO</span></b><small>ARM WRESTLING MANAGEMENT</small></div></div><div className="setup-card"><div className="setup-icon"><ShieldCheck size={25}/></div><div className="eyebrow">ПОДКЛЮЧЕНИЕ БАЗЫ ДАННЫХ</div><h1>Подключим Supabase</h1><p>Приложение подготовлено. Чтобы включить регистрацию и общую базу, создайте проект Supabase и добавьте его URL и публичный ключ в файл <code>.env</code>.</p><ol><li>Создайте проект на <b>supabase.com</b>.</li><li>В SQL Editor выполните файл <code>supabase/migrations/001_initial_schema.sql</code>.</li><li>Скопируйте Project URL и publishable/anon key в <code>.env</code> по примеру <code>.env.example</code>.</li><li>Запустите <code>npm install</code>, затем <code>npm run dev</code>.</li></ol><div className="notice">Не вставляйте secret или service_role key в браузерный проект.</div></div></div>;
}
