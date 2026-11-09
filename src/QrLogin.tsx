import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, QrCode, RefreshCw, ShieldCheck } from "lucide-react";

type Props = { client: SupabaseClient; showQr?: boolean };
type Request = { id: string; qr_token: string; desktop_token: string; expires_at: string };

export function QrLoginPanel({ client, showQr = true }: Props) {
  const [request, setRequest] = useState<Request | null>(null);
  const [image, setImage] = useState("");
  const [state, setState] = useState<"idle" | "creating" | "waiting" | "approved" | "expired">("idle");
  const [error, setError] = useState("");
  const exchanged = useRef(false);

  async function createRequest() {
    setState("creating"); setError(""); setRequest(null); setImage(""); exchanged.current = false;
    const { data, error: invokeError } = await client.functions.invoke("qr-login", { body: { action: "create" } });
    if (invokeError || !data?.id) {
      setError(invokeError?.message || data?.error || "Не удалось создать QR-код."); setState("idle"); return;
    }
    const next = data as Request;
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    base.searchParams.set("qr_login", next.id + "." + next.qr_token);
    try {
      const qr = await QRCode.toDataURL(base.toString(), { errorCorrectionLevel: "M", margin: 2, width: 260, color: { dark: "#101111", light: "#ffffff" } });
      setRequest(next); setImage(qr); setState("waiting");
    } catch { setError("Не удалось отобразить QR-код."); setState("idle"); }
  }

  useEffect(() => {
    if (state !== "waiting" || !request) return;
    let active = true;
    const poll = async () => {
      if (!active || exchanged.current) return;
      if (Date.now() >= Date.parse(request.expires_at)) { setState("expired"); return; }
      const { data, error: pollError } = await client.functions.invoke("qr-login", { body: { action: "poll", request_id: request.id, desktop_token: request.desktop_token } });
      if (!active) return;
      if (pollError || data?.error) { setState("expired"); setError(data?.error || pollError?.message || "QR-код больше не действует."); return; }
      if (data?.status === "approved" && !exchanged.current) {
        exchanged.current = true; setState("approved");
        const { data: exchange, error: exchangeError } = await client.functions.invoke("qr-login", { body: { action: "exchange", request_id: request.id, desktop_token: request.desktop_token } });
        if (exchangeError || !exchange?.token_hash) { setState("expired"); setError(exchange?.error || exchangeError?.message || "Не удалось завершить вход."); return; }
        const { error: verifyError } = await client.auth.verifyOtp({ token_hash: exchange.token_hash, type: "magiclink" });
        if (verifyError) { setState("expired"); setError("Подтверждение истекло. Создайте новый QR-код и повторите вход."); }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1800);
    return () => { active = false; window.clearInterval(timer); };
  }, [client, request, state]);

  if (!showQr) return null;
  return <section className="qr-login">
    <div className="qr-login-divider"><span>ИЛИ</span></div>
    <button type="button" className="secondary qr-open" onClick={() => void createRequest()} disabled={state === "creating" || state === "waiting" || state === "approved"}>
      <QrCode size={17}/>{state === "creating" ? "Создаём QR-код…" : state === "waiting" ? "Ожидаем подтверждение" : "Войти по QR-коду"}
    </button>
    {image && state === "waiting" && <div className="qr-login-card">
      <img src={image} alt="QR-код для безопасного входа в SETKA PRO"/>
      <b>Отсканируйте телефоном</b>
      <p>Откройте SETKA PRO на телефоне, войдите в аккаунт и подтвердите запрос.</p>
      <span><span className="qr-pulse"/> Код действует 2 минуты</span>
      <button type="button" className="text-btn" onClick={() => { setState("expired"); setRequest(null); setImage(""); }}>Отмена</button>
    </div>}
    {state === "approved" && <div className="notice"><CheckCircle2 size={16}/> Подтверждено. Выполняем вход…</div>}
    {state === "expired" && <div className="notice"><span>QR-код истёк или был использован.</span><button type="button" onClick={() => { setState("idle"); setError(""); }}>×</button></div>}
    {error && <div className="notice" role="alert">{error}</div>}
    {state === "expired" && <button type="button" className="text-btn" onClick={() => void createRequest()}><RefreshCw size={14}/> Создать новый QR-код</button>}
  </section>;
}

export function QrApprovalScreen({ client, token }: { client: SupabaseClient; token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => { void client.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || "")); const url = new URL(window.location.href); url.searchParams.delete("qr_login"); window.history.replaceState({}, "", url.toString()); }, [client]);
  const [requestId, qrToken] = token.split(".", 2);
  async function approve() {
    if (!requestId || !qrToken || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.functions.invoke("qr-login", { body: { action: "approve", request_id: requestId, qr_token: qrToken } });
    if (error || data?.error) setMessage(data?.error || error?.message || "Не удалось подтвердить вход.");
    else setDone(true);
    setBusy(false);
  }
  return <div className="auth-page qr-approval-page">
    <div className="auth-visual"><div className="brand"><img className="brand-mark" src="./arm-msk37-original.jpg" alt="АРМ МСК 37"/><div><b>SETKA <span>PRO</span></b><small>ARM WRESTLING MANAGEMENT</small></div></div><div className="visual-copy"><div className="eyebrow">БЕЗОПАСНОЕ ПОДТВЕРЖДЕНИЕ</div><h1>ВХОД<br/><em>ПО QR-КОДУ.</em></h1><p>Подтвердите вход на компьютере с помощью уже авторизованного телефона.</p></div><div className="visual-foot">SETKA PRO · SECURE DEVICE SIGN-IN</div></div>
    <div className="auth-side"><div className="auth-card">
      <div className="eyebrow">ЗАПРОС НА ВХОД</div><h2>{done ? "Подтверждено" : "Подтвердить устройство"}</h2>
      <p>{done ? "Телефон подтвердил запрос. Вернитесь к компьютеру — вход завершится автоматически." : "Вы разрешаете войти на другом устройстве в аккаунт:"}</p>
      <div className="qr-account"><ShieldCheck size={18}/><b>{userEmail || "Проверяем аккаунт…"}</b></div>
      {message && <div className="notice" role="alert">{message}</div>}
      {done ? <div className="notice"><CheckCircle2 size={17}/> Запрос подтверждён. Можно закрыть эту страницу.</div> : <button className="primary wide" onClick={() => void approve()} disabled={busy || !userEmail}>{busy ? "Подтверждаем…" : "Разрешить вход"} <ArrowRight size={17}/></button>}
      <button type="button" className="text-btn qr-cancel" onClick={() => { window.history.replaceState({}, "", window.location.pathname); window.location.reload(); }}>Отмена</button>
    </div></div>
  </div>;
}
