import { useState, useRef, useEffect } from "react";

const T = {
  bg: "#FAF6F1", surface: "#FFFFFF", surfaceAlt: "#F0EBE4",
  border: "#E8E2DA", text: "#1A1A1A", textMuted: "#8A8478",
  pink: "#E8577A", pinkLight: "#FCE8ED", pinkDark: "#C94466",
  green: "#34A853", red: "#EA4335", orange: "#F59E0B",
};

const CALENDAR_URL = "https://calendar.app.google/YGrz3ycn7CFNtJET7";
const WEBHOOK_URL = ""; // Set your Make/Zapier webhook URL here

const STEPS = [
  "Fetching your App Store data...",
  "Analyzing your screenshots like a real user...",
  "Auditing your value proposition...",
  "Benchmarking against top performers...",
  "Writing your report...",
];

const EXAMPLES = [
  { label: "Duolingo", u: "https://apps.apple.com/us/app/duolingo/id570060128" },
  { label: "Calm", u: "https://apps.apple.com/us/app/calm/id571800810" },
  { label: "memoryOS", u: "https://apps.apple.com/fr/app/memoryos-jeux-de-memoire/id1553283646" },
];

const sevColor = (s) => s === "critical" ? T.red : s === "underperforming" ? T.orange : s === "decent" ? T.pink : T.green;
const sevLabel = (s) => s === "critical" ? "Critical — leaking installs" : s === "underperforming" ? "Underperforming — real work needed" : s === "decent" ? "Decent — leaving money on the table" : "Strong — refine the edges";
const scColor = (n) => n <= 1 ? T.red : n === 2 ? T.orange : n === 3 ? T.pink : T.green;

const fileToB64 = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(f);
});

const extractJSON = (str) => {
  const s = str.replace(/```json\s*/gi, "").replace(/```/g, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let d = 0, q = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { q = !q; continue; }
    if (q) continue;
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return s.slice(start, i + 1); }
  }
  return null;
};

export default function ASOScorer() {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState("input");
  const [step, setStep] = useState(0);
  const [appData, setAppData] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [icon, setIcon] = useState(null);
  const [iconUrl, setIconUrl] = useState(null);
  const [shots, setShots] = useState([]);
  const [shotUrls, setShotUrls] = useState([]);
  const [dragIcon, setDragIcon] = useState(false);
  const [dragShot, setDragShot] = useState(false);
  const iconRef = useRef(null);
  const shotRef = useRef(null);
  const resRef = useRef(null);

  useEffect(() => {
    if (stage !== "loading") return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 3000);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    if (stage === "results" && resRef.current) resRef.current.scrollIntoView({ behavior: "smooth" });
  }, [stage]);

  const getAppId = (u) => { const m = u.match(/\/id(\d+)/); return m ? m[1] : null; };
  const getCountry = (u) => { const m = u.match(/apps\.apple\.com\/([a-z]{2})\//i); return m ? m[1].toLowerCase() : "us"; };

  const onIconFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setIcon(file);
    const reader = new FileReader();
    reader.onload = () => setIconUrl(reader.result);
    reader.readAsDataURL(file);
  };
  const onShotFiles = (files) => {
    const newImgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!newImgs.length) return;
    const combined = [...shots, ...newImgs].slice(0, 10);
    setShots(combined);
    // Convert all to data URLs
    Promise.all(combined.map((f) => {
      if (typeof f === "string") return Promise.resolve(f);
      return new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      });
    })).then(setShotUrls);
  };
  const removeShot = (i) => {
    setShots((p) => { const n = p.filter((_, idx) => idx !== i); return n; });
    setShotUrls((p) => p.filter((_, idx) => idx !== i));
  };

  const goUpload = () => {
    setError("");
    if (!getAppId(url)) { setError("Invalid App Store URL. Example: https://apps.apple.com/us/app/your-app/id1234567890"); return; }
    setStage("upload");
  };

  const reset = () => {
    setStage("input"); setReport(null); setAppData(null); setError("");
    setEmailSent(false); setEmail(""); setEmailLoading(false);
    setIcon(null); setIconUrl(null); setShots([]); setShotUrls([]); setUrl(""); setStep(0);
  };

  const sendPdf = async () => {
    if (!email.includes("@") || !report) return;
    setEmailLoading(true);
    try {
      if (WEBHOOK_URL) {
        await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: appId, country: country, system: sys,
            email,
            app_url: url,
            app_name: appData?.trackName || "",
            score: report.total_score,
            severity: report.severity,
            headline: report.headline_verdict,
            pillars: report.pillars,
            timestamp: new Date().toISOString(),
          }),
        });
      }
      setEmailSent(true);
    } catch (e) {
      console.error("Email webhook failed:", e);
      setEmailSent(true);
    }
    setEmailLoading(false);
  };

  const runAudit = async () => {
    const appId = getAppId(url);
    const country = getCountry(url);
    const itunesUrl = `https://itunes.apple.com/lookup?id=${appId}&country=${country}`;
    setStage("loading"); setStep(0);

    try {
      const imgs = [];
      const labels = [];
      if (icon) {
        imgs.push({ type: "image", source: { type: "base64", media_type: icon.type || "image/png", data: await fileToB64(icon) } });
        labels.push("Image 1 = APP ICON.");
      }
      for (let i = 0; i < shots.length; i++) {
        imgs.push({ type: "image", source: { type: "base64", media_type: shots[i].type || "image/png", data: await fileToB64(shots[i]) } });
        labels.push(`Image ${icon ? i + 2 : i + 1} = SCREENSHOT ${i + 1}.`);
      }

      const sys = `You are a senior ASO consultant (500+ app audits, 50M+ installs). You think like a growth operator.

TASK:
1. Use web_fetch on this EXACT URL: ${itunesUrl}
   Parse the JSON "results" array, use the FIRST result. This is mandatory.
2. Produce a detailed ASO audit using the fetched data + any uploaded images.

${imgs.length > 0 ? `3. User uploaded ${imgs.length} image(s): ${labels.join(" ")} Analyze visuals carefully.` : "3. No images. Cap Icon and Screenshots at max 2/4 each."}

SCORING — 20 points, 4 per pillar:
P1 Title & Subtitle: memorable(1), keyword-rich subtitle not tagline(1), category keywords present(1), clear value prop from title+subtitle alone(1)
P2 Icon: ${icon ? "Judge visually:" : "No image, cap 2/4:"} stands out small(1), clear focal point(1), distinctive(1), modern(1)
P3 Screenshots: ${shots.length > 0 ? `${shots.length} provided. Judge:` : "None, cap 2/4:"} first has benefit headline(1), text scannable <10 words(1), progressive story(1), visual consistency(1)
P4 Description: QUOTE THE FIRST 3 LINES OF THE DESCRIPTION VERBATIM in your findings. first 3 lines have value prop(1), structured(1), has social proof(1), length 800-2500 chars(1)
P5 Social Proof: rating>=4.5=2pts/4.0-4.4=1pt/<4.0=0pts, count>=1000=1pt, updated within 90 days=1pt

RULES:
- NEVER generic. Reference SPECIFIC text/numbers/visuals from THIS app.
- Every recommendation: concrete BEFORE (verbatim) and AFTER.
- Direct: "Change X to Y" not "Consider..."
- Most apps get 2-3/pillar. 4 is rare. Be honest.

RESPONSE: Single JSON object only. First char { last char }. No text before/after. No markdown.
{
  "app_metadata":{"trackName":"","artistName":"","primaryGenreName":"","averageUserRating":0,"userRatingCount":0,"artworkUrl100":"","screenshotCount":0},
  "total_score":0,"headline_verdict":"","severity":"critical|underperforming|decent|strong",
  "pillars":[{"name":"","score":0,"verdict":"","findings":[{"type":"good|bad","text":""}],"recommendations":[{"impact":"high|medium|low","action":"","before":"","after":""}]}]
}
Severity: 0-8=critical, 9-12=underperforming, 13-16=decent, 17-20=strong.`;

      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appId, country: country, system: sys,
          model: "claude-sonnet-4-20250514", max_tokens: 4096,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const texts = data.content.filter((b) => b.type === "text");
      if (!texts.length) throw new Error("No analysis returned.");
      const js = extractJSON(texts[texts.length - 1].text);
      if (!js) throw new Error("No JSON in response.");
      const p = JSON.parse(js);
      const m = p.app_metadata || {};
      setAppData({ trackName: m.trackName || "Unknown", artistName: m.artistName || "", primaryGenreName: m.primaryGenreName || "", artworkUrl100: iconUrl || m.artworkUrl100 });
      setReport(p); setStage("results");
    } catch (e) {
      console.error(e); setError(e.message); setStage("error");
    }
  };

  const dd = (set) => ({
    onDragOver: (e) => { e.preventDefault(); set(true); },
    onDragEnter: (e) => { e.preventDefault(); set(true); },
    onDragLeave: (e) => { e.preventDefault(); set(false); },
  });

  const btnPrimary = { background: T.pink, color: "#fff", border: "none", padding: "14px 32px", fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: "pointer", transition: "background .2s", fontFamily: "inherit" };
  const btnOutline = { background: "transparent", color: T.text, border: `1.5px solid ${T.border}`, padding: "14px 24px", fontSize: 14, fontWeight: 500, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        *{box-sizing:border-box;margin:0}
        @keyframes fi{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pu{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes sh{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes sr{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
        .fi{animation:fi .5s ease-out forwards}
        .sr{animation:sr .7s cubic-bezier(.34,1.56,.64,1) forwards}
        .sm{background:linear-gradient(90deg,${T.surfaceAlt},${T.surface},${T.surfaceAlt});background-size:200% 100%;animation:sh 2s infinite}
        input:focus{outline:none} input::placeholder{color:${T.textMuted}}
        .dz{border:2px dashed ${T.border};border-radius:12px;transition:all .2s;cursor:pointer}
        .dz:hover{border-color:${T.pink};background:${T.pinkLight}}
      `}</style>

      {/* NAV */}
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="90" height="28" viewBox="0 0 90 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <text x="0" y="22" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="22" fill="#1A1A1A">Klymb</text>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: T.textMuted }}>/ ASO Scorer</span>
        </div>
        <a href={CALENDAR_URL} target="_blank" rel="noopener noreferrer"
          style={{ ...btnOutline, padding: "10px 20px", fontSize: 13, borderRadius: 24, textDecoration: "none" }}>
          Book a call
        </a>
      </div>

      {/* INPUT */}
      {stage === "input" && (
        <div className="fi" style={{ maxWidth: 800, margin: "0 auto", padding: "60px 40px 40px", textAlign: "center" }}>
          <div style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: T.pink, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 24, background: T.pinkLight, padding: "6px 16px", borderRadius: 20 }}>
            Free App Store Audit
          </div>
          <h1 style={{ fontSize: "clamp(36px,5vw,64px)", lineHeight: 1.05, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-.03em" }}>
            Is your App Store page<br />
            <span style={{ color: T.pink }}>costing you installs?</span>
          </h1>
          <p style={{ fontSize: 18, color: T.textMuted, maxWidth: 520, margin: "0 auto 40px", lineHeight: 1.5 }}>
            Paste your App Store link, upload your screenshots, and get audited out of 20 with real visual analysis.
          </p>
          <div style={{ display: "flex", maxWidth: 600, margin: "0 auto 16px", background: T.surface, borderRadius: 12, border: `1.5px solid ${T.border}`, overflow: "hidden" }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goUpload()}
              placeholder="https://apps.apple.com/us/app/..."
              style={{ flex: 1, border: "none", padding: "16px 20px", fontSize: 15, background: "transparent", color: T.text }} />
            <button onClick={goUpload} style={{ ...btnPrimary, borderRadius: 0, padding: "16px 28px" }}>Next →</button>
          </div>
          {error && <div style={{ fontSize: 13, color: T.red, marginTop: 8 }}>{error}</div>}
          <p style={{ fontSize: 13, color: T.textMuted, marginTop: 16 }}>Step 1 of 2 · Paste your App Store URL</p>

          <div style={{ marginTop: 60, paddingTop: 32, borderTop: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Try it on →</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {EXAMPLES.map((x) => (
                <button key={x.label} onClick={() => setUrl(x.u)}
                  style={{ ...btnOutline, padding: "8px 16px", fontSize: 13, borderRadius: 20 }}>{x.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {stage === "upload" && (
        <div className="fi" style={{ maxWidth: 800, margin: "0 auto", padding: "40px 40px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.pink, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 24 }}>Step 2 — Upload visuals</div>
          <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 700, lineHeight: 1.1, margin: "0 0 12px", letterSpacing: "-.02em" }}>
            Add your <span style={{ color: T.pink }}>icon & screenshots</span>
          </h2>
          <p style={{ fontSize: 16, color: T.textMuted, marginBottom: 40, maxWidth: 520, lineHeight: 1.5 }}>
            Drag & drop or click to upload for a full visual audit. Or skip for text-only.
          </p>

          {/* Icon */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>App Icon</p>
            <div className="dz" {...dd(setDragIcon)}
              onDrop={(e) => { e.preventDefault(); setDragIcon(false); onIconFile(e.dataTransfer.files[0]); }}
              onClick={() => iconRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, background: dragIcon ? T.pinkLight : T.surface, borderColor: dragIcon ? T.pink : T.border }}>
              <input ref={iconRef} type="file" accept="image/*" onChange={(e) => onIconFile(e.target.files[0])} style={{ display: "none" }} />
              {iconUrl ? (
                <>
                  <img src={iconUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${T.border}` }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.green }}>✓ Icon uploaded</div>
                    <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{icon?.name}</div>
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{dragIcon ? "Drop your icon here" : "Drag & drop or click to upload"}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>PNG or JPG</div>
                </div>
              )}
            </div>
          </div>

          {/* Screenshots */}
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>Screenshots (up to 10)</p>
            <div className="dz" {...dd(setDragShot)}
              onDrop={(e) => { e.preventDefault(); setDragShot(false); onShotFiles(e.dataTransfer.files); }}
              onClick={() => { if (!shotUrls.length) shotRef.current?.click(); }}
              style={{ padding: 20, background: dragShot ? T.pinkLight : T.surface, borderColor: dragShot ? T.pink : T.border }}>
              <input ref={shotRef} type="file" accept="image/*" multiple onChange={(e) => onShotFiles(e.target.files)} style={{ display: "none" }} />
              {shotUrls.length > 0 ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.green }}>✓ {shotUrls.length} screenshot{shotUrls.length > 1 ? "s" : ""}</span>
                    <button onClick={(e) => { e.stopPropagation(); shotRef.current?.click(); }}
                      style={{ ...btnOutline, padding: "4px 12px", fontSize: 11, borderRadius: 6 }}>Add more</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    {shotUrls.map((p, i) => (
                      <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                        <img src={p} alt="" style={{ height: 140, borderRadius: 8, border: `1px solid ${T.border}` }} />
                        <button onClick={(e) => { e.stopPropagation(); removeShot(i); }}
                          style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.6)", border: "none", color: "#fff", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{dragShot ? "Drop screenshots here" : "Drag & drop screenshots here"}</div>
                  <div style={{ fontSize: 13, color: T.textMuted }}>or <span style={{ color: T.pink, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); shotRef.current?.click(); }}>browse files</span> · up to 10 images</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={runAudit} style={btnPrimary}>Run audit →</button>
            <button onClick={runAudit} style={btnOutline}>Skip — text only</button>
            <button onClick={() => setStage("input")} style={{ ...btnOutline, border: "none", color: T.textMuted }}>← Change URL</button>
          </div>
          <p style={{ fontSize: 12, color: T.textMuted, marginTop: 16 }}>Auditing: {url}</p>
        </div>
      )}

      {/* LOADING */}
      {stage === "loading" && (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "100px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.pink, letterSpacing: ".1em", marginBottom: 24, animation: "pu 1.5s infinite" }}>AUDIT IN PROGRESS</div>
          <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 40 }}>{STEPS[step]}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            {STEPS.map((m, i) => (
              <div key={i} style={{ fontSize: 13, fontWeight: 500, color: i <= step ? T.text : T.textMuted, opacity: i <= step ? 1 : .4, transition: "all .3s" }}>
                {i < step ? "✓" : i === step ? "→" : "○"} {m}
              </div>
            ))}
          </div>
          <div className="sm" style={{ marginTop: 40, height: 3, borderRadius: 2, maxWidth: 400, margin: "40px auto 0" }} />
        </div>
      )}

      {/* ERROR */}
      {stage === "error" && (
        <div className="fi" style={{ maxWidth: 600, margin: "0 auto", padding: "100px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😬</div>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Something broke</h2>
          <p style={{ color: T.textMuted, marginBottom: 32, fontSize: 15, wordBreak: "break-word", lineHeight: 1.5 }}>{error}</p>
          <button onClick={reset} style={btnPrimary}>← Try again</button>
        </div>
      )}

      {/* RESULTS */}
      {stage === "results" && report && appData && (
        <div ref={resRef} className="fi" style={{ maxWidth: 900, margin: "0 auto", padding: "40px 40px 100px" }}>
          {/* App header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40, padding: 24, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
            {appData.artworkUrl100 && <img src={appData.artworkUrl100} alt="" style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${T.border}` }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>Audited</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{appData.trackName}</div>
              <div style={{ fontSize: 13, color: T.textMuted }}>{appData.artistName} · {appData.primaryGenreName}</div>
            </div>
            <button onClick={reset} style={{ ...btnOutline, padding: "8px 16px", fontSize: 12, borderRadius: 8 }}>← New audit</button>
          </div>

          {/* Score */}
          <div style={{ display: "flex", gap: 40, alignItems: "center", marginBottom: 60, flexWrap: "wrap" }}>
            <div className="sr" style={{ position: "relative", flexShrink: 0 }}>
              <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="80" fill="none" stroke={T.border} strokeWidth="6" />
                <circle cx="90" cy="90" r="80" fill="none" stroke={sevColor(report.severity)} strokeWidth="6"
                  strokeDasharray={`${(report.total_score / 20) * 502} 502`} transform="rotate(-90 90 90)" strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1 }}>{report.total_score}</div>
                <div style={{ fontSize: 14, color: T.textMuted, fontWeight: 500 }}>/ 20</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: sevColor(report.severity), background: `${sevColor(report.severity)}15`, padding: "5px 12px", borderRadius: 6, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 16 }}>
                {sevLabel(report.severity)}
              </div>
              <h2 style={{ fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 600, lineHeight: 1.3 }}>{report.headline_verdict}</h2>
            </div>
          </div>

          {/* Pillars */}
          <p style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 16 }}>Pillar Breakdown</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.pillars.map((p, i) => <Pillar key={i} p={p} i={i} />)}
          </div>

          {/* Email */}
          <div style={{ marginTop: 60, padding: 40, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: T.pink, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Optional</p>
            <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Want this as a shareable PDF?</h3>
            <p style={{ color: T.textMuted, fontSize: 15, marginBottom: 20, maxWidth: 480, lineHeight: 1.5 }}>Enter your email and we'll send you a clean report to share with your team or designer.</p>
            {!emailSent ? (
              <div style={{ display: "flex", maxWidth: 440, background: T.bg, borderRadius: 8, border: `1.5px solid ${T.border}`, overflow: "hidden" }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                  style={{ flex: 1, border: "none", padding: "14px 16px", fontSize: 14, background: "transparent", color: T.text }} />
                <button onClick={sendPdf} disabled={emailLoading}
                  style={{ ...btnPrimary, borderRadius: 0, padding: "14px 20px", fontSize: 13, opacity: emailLoading ? .6 : 1 }}>
                  {emailLoading ? "Sending..." : "Send PDF →"}
                </button>
              </div>
            ) : (
              <div style={{ color: T.green, fontSize: 14, fontWeight: 600 }}>✓ Sent! Check your inbox.</div>
            )}
          </div>

          {/* CTA */}
          <div style={{ marginTop: 24, padding: 48, background: T.pink, borderRadius: 16, color: "#fff" }}>
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12, opacity: .8 }}>ASO is one lever</p>
            <h3 style={{ fontSize: "clamp(24px,3.5vw,36px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 16 }}>
              Want us to audit your entire growth stack?
            </h3>
            <p style={{ fontSize: 16, marginBottom: 28, maxWidth: 520, lineHeight: 1.5, opacity: .9 }}>
              TikTok Spark Ads, UGC creator ops, creative testing, paywall conversion — everything that drives installs.
            </p>
            <a href={CALENDAR_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", background: "#fff", color: T.pink, padding: "14px 28px", fontSize: 14, fontWeight: 700, borderRadius: 8, textDecoration: "none" }}>
              Book a 20-min strategy call →
            </a>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: T.textMuted }}>
        <span>Built by <strong style={{ color: T.text }}>Klymb</strong> · TikTok growth agency for consumer apps</span>
        <span>klymbgrowth.com</span>
      </div>
    </div>
  );
}

function Pillar({ p, i }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 16, alignItems: "center", padding: "20px 24px", background: "transparent", border: "none", color: T.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: scColor(p.score) }}>
          {p.score}<span style={{ fontSize: 13, fontWeight: 400, color: T.textMuted }}>/4</span>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>Pillar {i + 1}</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
          <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.4 }}>{p.verdict}</div>
        </div>
        <div style={{ fontSize: 18, color: T.textMuted, fontWeight: 300 }}>{open ? "−" : "+"}</div>
      </button>
      {open && (
        <div className="fi" style={{ padding: "0 24px 24px 92px", borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
          {p.findings?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Findings</p>
              {p.findings.map((f, j) => (
                <div key={j} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
                  <span style={{ color: f.type === "good" ? T.green : T.red, fontWeight: 700, flexShrink: 0 }}>{f.type === "good" ? "✓" : "✗"}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          )}
          {p.recommendations?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Recommendations</p>
              {p.recommendations.map((r, j) => (
                <div key={j} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", background: T.bg, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", padding: "3px 8px", borderRadius: 4, marginBottom: 10, display: "inline-block",
                    background: r.impact === "high" ? `${T.red}15` : r.impact === "medium" ? `${T.orange}15` : `${T.textMuted}15`,
                    color: r.impact === "high" ? T.red : r.impact === "medium" ? T.orange : T.textMuted }}>{(r.impact || "").toUpperCase()} IMPACT</span>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, margin: "8px 0 10px" }}>{r.action}</div>
                  {r.before && <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4, lineHeight: 1.5, fontFamily: "'DM Sans',sans-serif" }}>
                    <span style={{ color: T.red, fontWeight: 600 }}>BEFORE:</span> {r.before}
                  </div>}
                  {r.after && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                    <span style={{ color: T.green, fontWeight: 600 }}>AFTER:</span> {r.after}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
