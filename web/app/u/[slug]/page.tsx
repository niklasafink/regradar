import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorityLogo, FirmLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { TrackGoal } from "@/components/track-goal";
import { authority, daysUntil, frameworkById, topicById } from "@/lib/logic";
import { firstParagraph, isoDate, UPDATE_PAGES, updateBySlug, updateHref } from "@/lib/updates";

export const dynamicParams = false;

export function generateStaticParams() {
  return UPDATE_PAGES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = updateBySlug(slug);
  if (!page) return {};
  const { fw, u } = page;
  const title = `${u.ti.de} – ${fw.n.de}`;
  const description =
    (u.s.de && firstParagraph(u.s.de)) ||
    `${u.t.de} der ${authority(u.src)} vom ${u.d} zu ${fw.n.de} (${fw.ref}).`;
  return {
    title,
    description,
    alternates: { canonical: `/u/${slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: isoDate(u.d),
    },
  };
}

export default async function UpdatePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = updateBySlug(slug);
  if (!page) notFound();
  const { fw, u } = page;
  const t = topicById(fw.topic);
  const f = frameworkById(fw.id)!;
  const backHref = `/r/${fw.ents[0]}/f/${fw.id}`;
  const related = UPDATE_PAGES
    .filter((p) => p.fw.id === fw.id && p.slug !== slug)
    .slice(0, 6);

  // Sachlicher LinkedIn-Post in ganzen Sätzen, Regeln siehe LINKEDIN.md im Repo-Root.
  const hashtag = (s: string) => s.replace(/[^0-9A-Za-zÄÖÜäöüß]/g, "");
  const hashtags = [
    ...new Set([
      hashtag(fw.n.de.split(":")[0].trim()),
      hashtag(authority(u.src)),
      "Compliance",
      "regradar",
    ]),
  ]
    .filter(Boolean)
    .map((h) => `#${h}`)
    .join(" ");
  const name = authority(u.src);
  const AUTHORITY_ARTICLE: Record<string, string> = {
    BaFin: "Die", ESMA: "Die", EBA: "Die", EIOPA: "Die", AMLA: "Die",
    Bundesbank: "Die", EZB: "Die", "EU-Kommission": "Die",
    BGH: "Der", EuGH: "Der", Bundestag: "Der", "EU-Rat": "Der",
    BfDI: "Der", EDPB: "Der", ESRB: "Der", SRB: "Der",
    BMF: "Das", BMI: "Das", BSI: "Das",
  };
  const TYPE_PHRASE: Record<string, { obj: string; verb: string }> = {
    Leitlinien: { obj: "neue Leitlinien", verb: "veröffentlicht" },
    Konsultation: { obj: "eine neue Konsultation", verb: "gestartet" },
    Rundschreiben: { obj: "ein neues Rundschreiben", verb: "veröffentlicht" },
    "Q&A": { obj: "neue Q&A", verb: "veröffentlicht" },
    ITS: { obj: "neue technische Durchführungsstandards", verb: "veröffentlicht" },
    Gesetz: { obj: "ein neues Gesetz", verb: "verkündet" },
    Gesetzentwurf: { obj: "einen neuen Gesetzentwurf", verb: "vorgelegt" },
    Urteil: { obj: "ein neues Urteil", verb: "veröffentlicht" },
    Allgemeinverfügung: { obj: "eine neue Allgemeinverfügung", verb: "erlassen" },
    Meldung: { obj: "eine neue Meldung", verb: "veröffentlicht" },
  };
  const phrase = TYPE_PHRASE[u.t.de] ?? TYPE_PHRASE.Meldung;
  const opener = ["EU-Amtsblatt", "BGBl", "Bundesrecht"].includes(name)
    ? `Im ${name === "BGBl" ? "Bundesgesetzblatt" : name} wurde am ${u.d} Folgendes veröffentlicht: „${u.ti.de}“.`
    : name === "ESAs"
    ? `Die ESAs haben am ${u.d} ${phrase.obj} ${phrase.verb}: „${u.ti.de}“.`
    : `${AUTHORITY_ARTICLE[name] ? `${AUTHORITY_ARTICLE[name]} ` : ""}${name} hat am ${u.d} ${phrase.obj} ${phrase.verb}: „${u.ti.de}“.`;
  // Überlange Zusammenfassungen an einer Satzgrenze kürzen, nie mitten im Satz.
  const trimToSentence = (s: string, max: number) => {
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const end = cut.lastIndexOf(". ");
    if (end > max * 0.4) return cut.slice(0, end + 1);
    return `${cut.replace(/\s+\S*$/, "")} …`;
  };
  const excerpt = u.s.de ? trimToSentence(firstParagraph(u.s.de), 400) : "";
  const shareText = [
    opener,
    excerpt,
    u.url ? `Die vollständige Meldung gibt es hier: ${u.url}` : "",
    hashtags,
  ]
    .filter(Boolean)
    .join("\n\n");
  const linkedInHref =
    `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: u.ti.de,
    datePublished: isoDate(u.d),
    inLanguage: "de",
    about: fw.n.de,
    ...(u.url ? { isBasedOn: u.url } : {}),
    publisher: { "@type": "Organization", name: "Regulatory Radar" },
    author: { "@type": "Organization", name: authority(u.src) },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TrackGoal
        goal="update_detail_viewed"
        params={{ slug, framework: fw.id, authority: u.src }}
      />
      <Chrome />

      <main className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        <Link
          href={backHref}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <span aria-hidden>←</span>
          Alle Updates zu {fw.n.de}
        </Link>

        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {t && (
              <span className="rounded-full bg-slate-100 px-3 py-0.5 font-medium text-slate-600">
                {t.n.de}
              </span>
            )}
            <span className="rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-500">
              {u.t.de}
            </span>
            <span className="rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-500">
              {authority(u.src)}
            </span>
            {u.refnum && <span className="num text-slate-400">{u.refnum}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <a
              href={linkedInHref}
              target="_blank"
              rel="noopener noreferrer"
              data-fast-goal="linkedin_share_click"
              data-fast-goal-slug={slug}
              data-fast-goal-authority={u.src}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 px-3.5 py-1 font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.26 2.37 4.26 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z" />
              </svg>
              Auf LinkedIn posten ↗
            </a>
            {u.url && (
              <a
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                data-fast-goal="original_link_click"
                data-fast-goal-slug={slug}
                data-fast-goal-authority={u.src}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 px-3.5 py-1 font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
              >
                Zur Original-Meldung: {new URL(u.url).hostname.replace(/^www\./, "")} ↗
              </a>
            )}
          </div>

          <h1 className="font-heading mt-4 text-balance text-2xl font-medium tracking-tight sm:text-3xl">
            {u.ti.de}
          </h1>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <time dateTime={isoDate(u.d)} className="num">{u.d}</time>
            <span aria-hidden>·</span>
            <AuthorityLogo src={u.src} className="h-3.5" />
            <span aria-hidden>·</span>
            <span>{fw.ref}, {fw.jur}</span>
          </p>

          {u.s.de && (
            <div className="mt-5 space-y-3 text-base leading-relaxed text-slate-700">
              {u.s.de.split(/\n{2,}/).map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          )}

          {(u.deadline || u.eff) && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {u.deadline && (
                <div className="bg-white px-4 py-3">
                  <dd className="num text-base font-semibold tracking-tight text-slate-900">
                    {u.deadline}
                  </dd>
                  <dt className="mt-0.5 text-xs font-medium text-slate-500">
                    Frist ({daysUntil(u.deadline)} Tage)
                  </dt>
                </div>
              )}
              {u.eff && (
                <div className="bg-white px-4 py-3">
                  <dd className="num text-base font-semibold tracking-tight text-slate-900">
                    {u.eff}
                  </dd>
                  <dt className="mt-0.5 text-xs font-medium text-slate-500">
                    Anwendung ab
                  </dt>
                </div>
              )}
            </dl>
          )}

          {u.adv?.length ? (
            <section className="mt-8">
              <h2 className="text-sm font-semibold tracking-tight">
                So kommentieren Big 4 &amp; Kanzleien
              </h2>
              <ul className="mt-3 space-y-2">
                {u.adv.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-900"
                    >
                      <span className="flex w-24 shrink-0 items-center">
                        <FirmLogo firm={a.f} large />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-slate-900">
                          {a.ti}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {a.f}
                          {a.d && (
                            <>
                              , <span className="num">{a.d}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 text-slate-400 group-hover:text-slate-900"
                      >
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold tracking-tight">
              Zum Rahmenwerk: {fw.n.de}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {f.about.de}
            </p>
            <Link
              href={backHref}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              Übersicht und alle Updates →
            </Link>
          </section>

          {related.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold tracking-tight">
                Weitere Updates zu {fw.n.de}
              </h2>
              <ul className="mt-2 space-y-0.5">
                {related.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={updateHref(p.fw.id, p.u)}
                      className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-1 text-sm hover:bg-slate-50"
                    >
                      <span className="num shrink-0 text-xs text-slate-400">{p.u.d}</span>
                      <span className="text-slate-700">{p.u.ti.de}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </main>
      <Footer />
    </>
  );
}
