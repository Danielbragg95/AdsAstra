import Link from "next/link";
import { notFound } from "next/navigation";
import { openDb, ScriptSchema } from "@signalwork/engine";
import { Studio } from "@/components/Studio";

export const dynamic = "force-dynamic";

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = openDb();
  const item = db.getContent(id);
  const brief = item?.brief_id ? db.getBrief(item.brief_id) : null;
  const children = item ? db.listContent({ parentId: item.id }) : [];
  db.close();

  if (!item || item.kind !== "script") notFound();
  const script = ScriptSchema.parse(item.body);

  const mins = Math.round(script.estimated_runtime_sec / 60);

  return (
    <main>
      <p className="crumb">
        <Link href="/">← radar</Link>
        {brief ? <> · {brief.topic}</> : null}
      </p>

      <h1 className="view-title">Script</h1>
      <div className="script-meta">
        <span className="tag">→ {item.platform}</span>
        <span className="tag">~{mins} min</span>
        <span className="tag">{script.beats.length} beats</span>
      </div>

      <div className="titles">
        {script.title_options.map((t, i) => (
          <div className="title-opt" key={i}>
            {t}
          </div>
        ))}
      </div>

      <div>
        <div className="beat hook">
          <div className="beat-head">Hook · 0:00</div>
          <p className="beat-vo">{script.hook}</p>
        </div>

        {script.beats.map((b, i) => (
          <div className="beat" key={i}>
            <div className="beat-head">
              Beat {i + 1} · {b.heading}
            </div>
            <p className="beat-vo">{b.vo_text}</p>
            <p className="beat-broll">{b.broll_suggestion}</p>
          </div>
        ))}

        <div className="beat">
          <div className="beat-head">CTA</div>
          <p className="beat-vo">{script.cta}</p>
        </div>

        {script.shorts_cutdowns.length > 0 && (
          <div className="beat">
            <div className="beat-head">Shorts cutdowns</div>
            {script.shorts_cutdowns.map((s, i) => (
              <p className="beat-vo" key={i}>
                <strong>{s.hook}</strong> — {s.vo_text}
              </p>
            ))}
          </div>
        )}
      </div>

      <Studio scriptId={item.id} initialPosts={children} />
    </main>
  );
}
