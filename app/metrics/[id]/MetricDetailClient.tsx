"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import Link from "next/link";
import type { ReelDetail, RewriteRow, CurvePoint } from "./page";
import {
  updateMetricField,
  createRewrite,
  updateRewrite,
  deleteRewrite,
} from "@/app/actions";
import { buildRepurposeBlob } from "@/lib/repurpose";

function firstLine(s: string | null): string {
  if (!s) return "";
  const line = s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.replace(/^\[[^\]]*\]\s*/, "").trim() || line.trim();
}
function label(r: ReelDetail): string {
  if (r.title_hook && r.title_hook.trim()) return r.title_hook.trim();
  return firstLine(r.transcript) || firstLine(r.caption) || `Reel #${r.id}`;
}
function fmtDate(d: string | null) {
  return d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)) : "—";
}

// ── Retention chart ──────────────────────────────────────────────────────
function RetentionChart({ curve }: { curve: CurvePoint[] }) {
  const W = 720, H = 200, PAD = 28;
  const maxT = Math.max(...curve.map((p) => p.t), 1);
  const maxPct = Math.max(100, ...curve.map((p) => p.pct));
  const x = (t: number) => PAD + (t / maxT) * (W - PAD * 2);
  const y = (pct: number) => H - PAD - (pct / maxPct) * (H - PAD * 2);
  const pts = curve.map((p) => `${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const area = `${PAD},${H - PAD} ${pts} ${x(maxT).toFixed(1)},${H - PAD}`;
  const gridY = [0, 25, 50, 75, 100].filter((g) => g <= maxPct);
  return (
    <svg className="m-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Retention curve">
      {gridY.map((g) => (
        <g key={g}>
          <line x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} className="m-chart__grid" />
          <text x={4} y={y(g) + 3} className="m-chart__axis">{g}</text>
        </g>
      ))}
      <polygon points={area} className="m-chart__area" />
      <polyline points={pts} className="m-chart__line" />
      {curve.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.pct)} r={2.5} className="m-chart__dot">
          <title>{p.t}s · {p.pct}%</title>
        </circle>
      ))}
    </svg>
  );
}

// ── Editable stat ────────────────────────────────────────────────────────
function EditableStat({
  id, field, label: lab, value, suffix, kind = "int",
}: {
  id: number; field: string; label: string; value: number | string | null; suffix?: string; kind?: "int" | "numeric";
}) {
  const [val, setVal] = useState<string>(value == null ? "" : String(value));
  const [, start] = useTransition();
  const save = (next: string) => {
    if (next.trim() === (value == null ? "" : String(value))) return;
    start(async () => { await updateMetricField(id, field, next.trim() === "" ? null : next.trim()); });
  };
  return (
    <label className="m-stat m-stat--edit">
      <span className="m-stat__label">{lab}</span>
      <span className="m-stat__inputwrap">
        <input
          className={"m-stat__input" + (val.trim() === "" ? " m-stat__input--empty" : "")}
          type="number" step={kind === "numeric" ? "0.1" : "1"}
          value={val} placeholder="—"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => save(e.target.value)}
        />
        {suffix && val.trim() !== "" && <span className="m-stat__suffix">{suffix}</span>}
      </span>
    </label>
  );
}

const REWRITE_PROMPT = (id: number) => `Use the posted-video-rewrite skill on rewrite #${id}`;

function StatusBadge({ status }: { status: string }) {
  return <span className={`m-rwbadge m-rwbadge--${status}`}>{status}</span>;
}

export function MetricDetailClient({ reel, rewrites: initialRewrites }: { reel: ReelDetail; rewrites: RewriteRow[] }) {
  const [rewrites, setRewrites] = useState<RewriteRow[]>(initialRewrites);
  const [trial, setTrial] = useState<boolean>(!!reel.is_trial_reel);
  const [notes, setNotes] = useState<string>(reel.analyst_notes ?? "");
  const [showDescriptors, setShowDescriptors] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [repurposeCopied, setRepurposeCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1800); };

  const copyRepurpose = useCallback(async () => {
    const blob = buildRepurposeBlob({ id: reel.id, title: label(reel), permalink: reel.permalink });
    try { await navigator.clipboard.writeText(blob); } catch { /* ignore */ }
    setRepurposeCopied(true); setTimeout(() => setRepurposeCopied(false), 1600);
    flash("Copied — paste into plan-post reel-repurpose");
  }, [reel]);

  const toggleTrial = useCallback(() => {
    const next = !trial; setTrial(next);
    start(async () => { await updateMetricField(reel.id, "is_trial_reel", next); });
  }, [trial, reel.id]);

  const saveNotes = useCallback(() => {
    if (notes === (reel.analyst_notes ?? "")) return;
    start(async () => { await updateMetricField(reel.id, "analyst_notes", notes); });
  }, [notes, reel.id, reel.analyst_notes]);

  const copyPrompt = useCallback(async (rid: number) => {
    try { await navigator.clipboard.writeText(REWRITE_PROMPT(rid)); } catch { /* ignore */ }
    setCopiedId(rid); setTimeout(() => setCopiedId(null), 1600);
    flash("Prompt copied — paste into Claude Code");
  }, []);

  const addRewrite = useCallback(() => {
    const req = draft.trim();
    if (!req) return;
    start(async () => {
      const res = await createRewrite(reel.id, req);
      if (res.success) {
        setRewrites((p) => [{
          id: res.id, title: null, rewrite_request: req, status: "pending",
          result_script_id: null, notes: null, created_at: new Date().toISOString(), completed_at: null,
        }, ...p]);
        setDraft(""); setAdding(false); flash("Rewrite added");
      }
    });
  }, [draft, reel.id]);

  const saveEdit = useCallback((rid: number) => {
    const req = editDraft.trim(); if (!req) return;
    start(async () => {
      await updateRewrite(rid, reel.id, req);
      setRewrites((p) => p.map((r) => (r.id === rid ? { ...r, rewrite_request: req } : r)));
      setEditingId(null); flash("Rewrite updated");
    });
  }, [editDraft, reel.id]);

  const removeRewrite = useCallback((rid: number) => {
    if (!confirm("Delete this rewrite?")) return;
    start(async () => {
      await deleteRewrite(rid, reel.id);
      setRewrites((p) => p.filter((r) => r.id !== rid));
      flash("Rewrite deleted");
    });
  }, [reel.id]);

  const curve = reel.retention_curve?.curve ?? null;
  const descriptorEntries = useMemo(() => {
    if (!reel.descriptors) return [];
    return Object.entries(reel.descriptors).sort((a, b) => {
      const na = parseInt(a[0].replace(/\D/g, ""), 10) || 999;
      const nb = parseInt(b[0].replace(/\D/g, ""), 10) || 999;
      return na - nb;
    });
  }, [reel.descriptors]);

  return (
    <div className="m-detail">
      {toast && <div className="m-toast">{toast}</div>}

      {/* Header */}
      <header className="m-detail__head">
        <div className="m-detail__headrow">
          <div className="pagehead__eyebrow">Reel #{reel.id}</div>
          <button
            className={"m-btn m-btn--accent m-repurpose" + (repurposeCopied ? " m-repurpose--ok" : "")}
            title="Copy reel for plan-post reel-repurpose"
            onClick={copyRepurpose}
          >
            {repurposeCopied ? "Copied ✓" : "Copy to repurpose"}
          </button>
        </div>
        <h1 className="m-detail__title">{label(reel)}</h1>
        <div className="m-detail__meta">
          <span>{fmtDate(reel.created_at)}</span>
          <span className="m-dot">·</span>
          <button className={"m-trial " + (trial ? "m-trial--on" : "")} onClick={toggleTrial}>
            {trial ? "Trial reel" : "Mark as trial"}
          </button>
          {reel.youtube_shorts_uploaded && <><span className="m-dot">·</span><span className="m-flag">YT Shorts</span></>}
          {reel.tiktok_uploaded && <><span className="m-dot">·</span><span className="m-flag">TikTok</span></>}
          {reel.permalink && (
            <>
              <span className="m-dot">·</span>
              <a className="m-extlink-text" href={reel.permalink} target="_blank" rel="noreferrer">Open on Instagram ↗</a>
            </>
          )}
        </div>
      </header>

      {/* Retention curve */}
      <section className="m-card">
        <div className="m-card__head"><h2 className="m-card__title">Retention curve</h2></div>
        {curve && curve.length > 0 ? (
          <>
            <RetentionChart curve={curve} />
            {reel.retention_curve?.summary && <p className="m-chart__summary">{reel.retention_curve.summary}</p>}
          </>
        ) : (
          <p className="m-missing">No distribution curve recorded for this reel.</p>
        )}
      </section>

      {/* Metrics grid (editable) */}
      <section className="m-card">
        <div className="m-card__head"><h2 className="m-card__title">Metrics</h2><span className="m-card__hint">click any value to edit</span></div>
        <div className="m-statgrid">
          <EditableStat id={reel.id} field="follows_generated" label="Follows" value={reel.follows_generated} />
          <EditableStat id={reel.id} field="reach" label="Reach" value={reel.reach} />
          <EditableStat id={reel.id} field="skip_rate" label="Skip rate" value={reel.skip_rate} suffix="%" kind="numeric" />
          <div className="m-stat">
            <span className="m-stat__label">Avg watch</span>
            <span className="m-stat__static">{reel.avg_watch_time == null ? "—" : `${(reel.avg_watch_time / 1000).toFixed(1)}s`}</span>
          </div>
          <EditableStat id={reel.id} field="saves" label="Saves" value={reel.saves} />
          <EditableStat id={reel.id} field="shares" label="Shares" value={reel.shares} />
          <EditableStat id={reel.id} field="likes" label="Likes" value={reel.likes} />
          <EditableStat id={reel.id} field="comments" label="Comments" value={reel.comments} />
        </div>
      </section>

      {/* Rewrites */}
      <section className="m-card">
        <div className="m-card__head">
          <h2 className="m-card__title">Rewrites <span className="m-card__count">{rewrites.length}</span></h2>
          {!adding && <button className="m-btn m-btn--accent" onClick={() => setAdding(true)}>+ Add rewrite</button>}
        </div>

        {adding && (
          <div className="m-rwform">
            <textarea
              className="m-rwform__ta" autoFocus value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What do you want rewritten? The new angle, what to fix, what to keep…"
              rows={5}
            />
            <div className="m-rwform__actions">
              <button className="m-btn" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</button>
              <button className="m-btn m-btn--accent" onClick={addRewrite} disabled={!draft.trim()}>Save rewrite</button>
            </div>
          </div>
        )}

        {rewrites.length === 0 && !adding && <p className="m-missing">No rewrites yet. Add one to queue it for the posted-video-rewrite skill.</p>}

        <div className="m-rwlist">
          {rewrites.map((r) => (
            <div key={r.id} className="m-rw">
              {editingId === r.id ? (
                <div className="m-rwform">
                  <textarea className="m-rwform__ta" autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={5} />
                  <div className="m-rwform__actions">
                    <button className="m-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="m-btn m-btn--accent" onClick={() => saveEdit(r.id)} disabled={!editDraft.trim()}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="m-rw__top">
                    <span className="m-rw__id">#{r.id}</span>
                    <StatusBadge status={r.status} />
                    <span className="m-rw__spacer" />
                    <button className={"m-iconbtn " + (copiedId === r.id ? "m-iconbtn--ok" : "")} title="Copy skill prompt" onClick={() => copyPrompt(r.id)}>
                      {copiedId === r.id ? "Copied ✓" : "Copy"}
                    </button>
                    {r.status === "pending" && (
                      <button className="m-iconbtn" title="Edit" onClick={() => { setEditingId(r.id); setEditDraft(r.rewrite_request); }}>Edit</button>
                    )}
                    <button className="m-iconbtn m-iconbtn--danger" title="Delete" onClick={() => removeRewrite(r.id)}>Delete</button>
                  </div>
                  <p className="m-rw__req">{r.rewrite_request}</p>
                  {r.status === "done" && r.result_script_id && (
                    <Link className="m-rw__draftlink" href={`/${r.result_script_id}`}>→ Open resulting draft</Link>
                  )}
                  {r.notes && <p className="m-rw__notes">{r.notes}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Analyst notes */}
      <section className="m-card">
        <div className="m-card__head"><h2 className="m-card__title">Analyst notes</h2></div>
        <textarea
          className="m-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
          placeholder="Your read on this reel — what worked, what didn't, why…" rows={4}
        />
      </section>

      {/* Descriptors (collapsed) */}
      {descriptorEntries.length > 0 && (
        <section className="m-card">
          <button className="m-collapse" onClick={() => setShowDescriptors((v) => !v)}>
            <span className="m-collapse__chev">{showDescriptors ? "▾" : "▸"}</span>
            Descriptors {reel.question_set_version && <span className="m-card__hint">({reel.question_set_version})</span>}
          </button>
          {showDescriptors && (
            <dl className="m-desc">
              {descriptorEntries.map(([k, v]) => (
                <div key={k} className="m-desc__row">
                  <dt className="m-desc__k">{k}</dt>
                  <dd className="m-desc__v">{Array.isArray(v) ? v.join(" · ") : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {/* Transcript + visual (collapsed) */}
      {(reel.transcript || reel.visual_description) && (
        <section className="m-card">
          <button className="m-collapse" onClick={() => setShowTranscript((v) => !v)}>
            <span className="m-collapse__chev">{showTranscript ? "▾" : "▸"}</span>
            Transcript &amp; visual
          </button>
          {showTranscript && (
            <div className="m-transcript">
              {reel.transcript && <><h3 className="m-transcript__h">Transcript</h3><p className="m-transcript__body">{reel.transcript}</p></>}
              {reel.visual_description && <><h3 className="m-transcript__h">Visual</h3><p className="m-transcript__body">{reel.visual_description}</p></>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
