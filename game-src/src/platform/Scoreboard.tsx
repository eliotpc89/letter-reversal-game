import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { encodeSave, type GameState } from "../api";

export function Scoreboard({ state, onReset, resetting }: { state: GameState; onReset: () => void; resetting: boolean }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedLink, setScannedLink] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const transferLink = () => `${window.location.origin}${window.location.pathname}#save=${encodeSave(state)}`;

  useEffect(() => {
    if (qrOpen && qrCanvasRef.current) {
      setQrError(null);
      QRCode.toCanvas(qrCanvasRef.current, transferLink(), { width: 220, margin: 2 })
        .catch(() => setQrError("Couldn't draw the QR code — use the link instead."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen]);

  const stopScan = () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stopScan, []);

  const scanFrame = () => {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (found?.data) {
          const text = found.data;
          stopScan();
          if (text.includes("#save=")) setScannedLink(text);
          else setScanError("That QR code isn't a coins + trophies link.");
          return;
        }
      }
    }
    requestAnimationFrame(scanFrame);
  };

  const startScan = async () => {
    setScanError(null);
    setScannedLink(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      scanningRef.current = true;
      setScanning(true);
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) { stopScan(); return; }
        video.srcObject = stream;
        video.play().then(() => scanFrame()).catch(() => {
          setScanError("Couldn't start the camera preview.");
          stopScan();
        });
      });
    } catch {
      setScanError("Camera isn't available — paste the link below instead.");
    }
  };

  const importPasted = () => {
    const text = pasteValue.trim();
    if (!text) return;
    const link = text.includes("#save=") ? text : `${window.location.origin}${window.location.pathname}#save=${text}`;
    window.location.assign(link);
  };
  const shareProgress = async () => {
    setSharing(true);
    setShareNote(null);
    try {
      const link = `${window.location.origin}${window.location.pathname}#save=${encodeSave(state)}`;
      setShareLink(link);
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Miles' coins and trophies", text: "Open this to bring over Miles' coins and trophies.", url: link });
        setShareNote("Coins + trophies link ready.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setShareNote("Coins + trophies link copied — open it on the other device to import.");
      } else {
        setShareNote("Sharing isn't available in this browser.");
      }
    } catch {
      // The share sheet was dismissed; nothing to report.
    } finally {
      setSharing(false);
    }
  };
  const rounds = state.wins + state.losses;
  return <section className={`stats-panel ${open ? "open" : ""}`}>
    <button className="stats-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span>Grown-up stats</span><span className="stats-summary">{rounds} round{rounds === 1 ? "" : "s"}</span><span className="stats-plus" aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="stats-body">
      <div className="stat-strip">
        <div><strong>{state.coins}</strong><span>coins now</span></div>
        <div><strong>{state.totalEarned}</strong><span>earned</span></div>
        <div><strong>{state.wins} / {state.losses}</strong><span>right / wrong</span></div>
        <div><strong>{state.streak} / {state.bestStreak}</strong><span>streak / best</span></div>
      </div>
      <div className="letter-grid" aria-label="Accuracy by letter">
        {state.letters.map((item) => {
          const percent = item.attempts ? Math.round(item.correct / item.attempts * 100) : null;
          return <div className="letter-stat" key={item.letter}><span className="letter-glyph">{item.letter}</span><span>{percent === null ? "—" : `${percent}%`}</span><small>{item.correct}/{item.attempts}</small></div>;
        })}
      </div>
      {!armed ? <button className="reset-link" type="button" onClick={() => setArmed(true)}>Reset progress…</button> :
        <div className="reset-row"><span>Erase coins, stats, and trophies?</span><button type="button" onClick={() => { onReset(); setArmed(false); }} disabled={resetting}>Yes, reset</button><button type="button" onClick={() => setArmed(false)}>Cancel</button></div>}
      <button className="reset-link" type="button" onClick={() => void shareProgress()} disabled={sharing}>{sharing ? "Preparing link…" : "Create coins + trophies link…"}</button>
      <div className="share-row">
        <button className="reset-link" type="button" onClick={() => setQrOpen((value) => !value)}>{qrOpen ? "Hide QR code" : "Show QR code…"}</button>
        <button className="reset-link" type="button" onClick={() => void startScan()} disabled={scanning}>{scanning ? "Scanning…" : "Scan QR code…"}</button>
      </div>
      {shareNote && <p className="share-note" role="status">{shareNote}</p>}
      {shareLink && <a className="share-link" href={shareLink}>Open saved coins + trophies link</a>}
      {qrOpen && <div className="qr-panel">
        <canvas ref={qrCanvasRef} width={220} height={220} aria-label="QR code with the coins and trophies transfer link" />
        {qrError ? <p className="share-note" role="alert">{qrError}</p> : <p className="share-note">Point the other device's camera at this code.</p>}
      </div>}
      {scanning && <div className="qr-panel">
        <video ref={videoRef} className="qr-video" playsInline muted aria-label="Camera preview for scanning a QR code" />
        <canvas ref={scanCanvasRef} hidden aria-hidden="true" />
        <p className="share-note">Point the camera at the QR code…</p>
        <button className="reset-link" type="button" onClick={stopScan}>Cancel</button>
      </div>}
      {scanError && <p className="share-note" role="alert">{scanError}</p>}
      {scannedLink && <div className="qr-panel"><p className="share-note" role="status">Found a coins + trophies link!</p><button type="button" onClick={() => window.location.assign(scannedLink)}>Import on this device</button></div>}
      <div className="qr-panel">
        <label className="share-note" htmlFor="qr-paste">Or paste a link / code:</label>
        <div className="share-row"><input id="qr-paste" type="text" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="Paste link or code…" /><button type="button" onClick={importPasted} disabled={!pasteValue.trim()}>Import</button></div>
      </div>
    </div>}
  </section>;
}

