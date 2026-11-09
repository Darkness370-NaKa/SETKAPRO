import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, CheckCircle2, Copy, ExternalLink, ImagePlus, ScanLine, Square } from "lucide-react";

export default function QrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  async function startCamera() {
    if (!videoRef.current || scanning) return;
    setError("");
    setResult("");
    setScanning(true);
    try {
      const reader = readerRef.current ?? new BrowserQRCodeReader();
      readerRef.current = reader;
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (decoded) => {
          if (!decoded) return;
          setResult(decoded.getText());
          setScanning(false);
          controlsRef.current?.stop();
          controlsRef.current = null;
        }
      );
      controlsRef.current = controls;
    } catch (cause) {
      setScanning(false);
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError" ? "Доступ к камере запрещён. Разрешите его в настройках браузера." :
        name === "NotFoundError" ? "Камера не найдена на этом устройстве." :
        "Не удалось запустить камеру. Проверьте разрешение браузера и подключение камеры.");
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }

  async function scanImage(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult("");
    stopCamera();
    const url = URL.createObjectURL(file);
    try {
      const reader = readerRef.current ?? new BrowserQRCodeReader();
      readerRef.current = reader;
      const decoded = await reader.decodeFromImageUrl(url);
      setResult(decoded.getText());
    } catch {
      setError("QR-код на изображении не найден. Попробуйте другое фото или снимок покрупнее.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  let safeUrl: URL | null = null;
  try {
    const parsed = new URL(result);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") safeUrl = parsed;
  } catch { /* Plain text QR payload. */ }

  return <section className="panel qr-scanner">
    <div className="section-title"><div><h2>Сканирование QR-кода</h2><p>Наведите камеру на код или загрузите изображение с QR-кодом.</p></div><span className="tag">ЛОКАЛЬНОЕ СКАНИРОВАНИЕ</span></div>
    <div className="qr-scanner-grid">
      <div className="qr-camera">
        <video ref={videoRef} className={scanning ? "qr-video active" : "qr-video"} muted playsInline />
        {!scanning && <div className="qr-camera-placeholder"><Camera size={34}/><b>Камера выключена</b><span>Нажмите «Включить камеру», чтобы начать сканирование.</span></div>}
        {scanning && <div className="qr-frame" aria-hidden="true"><i/><i/><i/><i/></div>}
      </div>
      <div className="qr-actions">
        <button className="primary wide" onClick={() => void startCamera()} disabled={scanning || busy}><Camera size={16}/> Включить камеру</button>
        <button className="secondary wide" onClick={stopCamera} disabled={!scanning}><Square size={14}/> Остановить камеру</button>
        <label className="secondary qr-upload"><ImagePlus size={16}/> Загрузить изображение<input type="file" accept="image/*" disabled={busy} onChange={e => { void scanImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/></label>
        <p className="qr-privacy">Изображение и видеопоток обрабатываются в браузере и не отправляются на сервер.</p>
        {error && <div className="notice" role="alert">{error}</div>}
      </div>
    </div>
    {result && <div className="qr-result">
      <div className="qr-result-title"><CheckCircle2 size={18}/><b>QR-код распознан</b></div>
      <div className="qr-result-value">{result}</div>
      <div className="qr-result-actions"><button className="secondary" onClick={() => void navigator.clipboard?.writeText(result)}><Copy size={14}/> Копировать</button>{safeUrl && <a className="secondary" href={safeUrl.toString()} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Открыть ссылку</a>}</div>
    </div>}
    {busy && <p className="qr-privacy">Обрабатываем изображение…</p>}
    {!result && !error && <p className="qr-privacy"><ScanLine size={14}/> Поддерживаются QR-коды со ссылками, текстом и другими данными.</p>}
  </section>;
}
