import { RelevanceStatus } from "@/components/relevance-status";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { TrackGoal } from "@/components/track-goal";
import { RichUpdateSections, richToc } from "@/components/rich-update";
import { PrintButton } from "@/components/print-button";
import { Toc } from "@/components/toc";
import { richBySlug, trimDescription } from "@/lib/rich";
import { authority, daysUntil, deadlineExpired, frameworkById, providerSlug, topicById } from "@/lib/logic";
import { firstParagraph, isoDate, LEGACY_SLUGS, UPDATE_PAGES, updateBySlug, updateBySlugLoose } from "@/lib/updates";
import {
  breadcrumbLd, clip, description, frameworkPath, ldGraph, organizationLd, pageMeta, SITE_URL, title, TITLE_MAX,
} from "@/lib/seo";

// Unbekannte Slugs werden zur Laufzeit aufgelöst: Wandert eine Meldung in ein
// anderes Rahmenwerk oder fällt sie bei einer Bereinigung weg, führen Links aus
// verschickten Newslettern auf die neue Seite bzw. das Rahmenwerk statt ins Leere.
export const dynamicParams = true;

export function generateStaticParams() {
  return [
    ...UPDATE_PAGES.map(({ slug }) => ({ slug })),
    ...[...LEGACY_SLUGS.keys()].map((slug) => ({ slug })),
  ];
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = updateBySlug(slug);
  if (!page) return {};
  const { fw, u } = page;
  const rich = richBySlug(slug);
  return pageMeta({
    title: rich && rich.seo_title.length >= 30 ? title(rich.seo_title) : updateTitle(u.ti.de, fw.n.de, u.d),
    ogTitle: rich?.h1 ?? u.ti.de,
    description: rich ? trimDescription(rich.meta_description) : updateDescription(page),
    path: `/u/${slug}`,
    type: "article",
    publishedTime: isoDate(u.d),
  });
}

/* Titel: der deutsche Meldungstitel; kurze bekommen das Rahmenwerk dazu,
   lange werden für das <title>-Element an einer Wortgrenze gekürzt und mit
   dem Datum eindeutig gemacht (og:title und die Überschrift bleiben vollständig). */
function updateTitle(ti: string, fwName: string, d: string): string {
  if (ti.length < 30) return clip(`${ti} – ${fwName}`, TITLE_MAX);
  if (ti.length > TITLE_MAX) return `${clip(ti, TITLE_MAX - d.length - 3)} (${d})`;
  return title(ti);
}

/* Beschreibung: erster Absatz der Zusammenfassung, bei Bedarf ergänzt um
   Dokumenttyp, Behörde und Datum, auf 120–160 Zeichen gebracht. */
function updateDescription({ fw, u }: { fw: { n: { de: string }; ref: string }; u: { s: { de: string }; t: { de: string }; src: string; d: string } }): string {
  const context = `${u.t.de} der ${authority(u.src)} vom ${u.d} zu ${fw.n.de}.`;
  const lead = u.s.de ? firstParagraph(u.s.de) : `${context} (${fw.ref})`;
  return description(lead, u.s.de ? context : "");
}

export default async function UpdatePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const moved = LEGACY_SLUGS.get(slug);
  if (moved) permanentRedirect(`/u/${moved}`);
  const page = updateBySlug(slug);
  if (!page) {
    const loose = updateBySlugLoose(slug);
    if (loose) permanentRedirect(`/u/${loose.slug}`);
    const gone = frameworkById(slug.split("-")[0]);
    if (gone) redirect(`/r/${providerSlug(gone.ents[0])}/f/${gone.id}`);
    notFound();
  }
  const { fw, u } = page;
  const rich = richBySlug(slug);
  const t = topicById(fw.topic);
  const backHref = `/r/${providerSlug(fw.ents[0])}/f/${fw.id}`;
  const extra = [
    ...(u.deadline ? [{ label: deadlineExpired(u.deadline) ? "Frist abgelaufen" : "Frist", value: u.deadline }] : []),
    ...(u.eff ? [{ label: "Anwendung ab", value: u.eff }] : []),
  ];

  const url = `${SITE_URL}/u/${slug}`;
  const fwPath = frameworkPath(fw);
  const jsonLd = ldGraph(
    {
      "@type": "NewsArticle",
      "@id": `${url}#article`,
      mainEntityOfPage: url,
      url,
      headline: clip(rich?.h1 ?? u.ti.de, 110),
      description: rich ? trimDescription(rich.meta_description) : updateDescription(page),
      ...(rich ? {
        abstract: rich.summary,
        keywords: rich.aka.join(", "),
        speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".rich-summary"] },
      } : {}),
      image: [`${SITE_URL}/og.png`],
      datePublished: isoDate(u.d),
      dateModified: rich ? rich.meta.generated : isoDate(u.d),
      inLanguage: "de-DE",
      about: { "@type": "Thing", name: fw.n.de },
      ...(u.url ? { isBasedOn: u.url } : {}),
      publisher: { "@id": organizationLd["@id"] },
      // Veröffentlichende Stelle; @id über ihre Domain, damit dieselbe Behörde
      // auf allen Seiten als eine Organisation erkannt wird.
      // Ohne Anreicherung gibt die Seite die Meldung der Behörde wieder (Autor:
      // Behörde); angereicherte Seiten schreibt Regulatory Radar, die Behörde ist Quelle.
      [rich ? "sourceOrganization" : "author"]: {
        "@type": "Organization",
        "@id": `https://${u.src}/#organization`,
        name: authority(u.src),
        url: `https://${u.src}/`,
      },
      ...(rich ? { author: { "@id": organizationLd["@id"] } } : {}),
    },
    organizationLd,
    breadcrumbLd([
      [fw.n.de, fwPath],
      [clip(rich?.h1 ?? u.ti.de, 80), `/u/${slug}`],
    ]),
    ...(rich ? [{
      "@type": "FAQPage",
      mainEntity: rich.faq.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })),
    }] : []),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <TrackGoal
        goal="update_detail_viewed"
        params={{ slug, framework: fw.id, authority: u.src }}
      />
      <Chrome />

      <main className="mx-auto max-w-4xl px-3 pb-24 sm:px-4">
        <article className="mt-6 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs print:hidden">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-500 hover:text-slate-900"
            >
              <span aria-hidden>←</span>
              Zurück
            </Link>
            {t && (
              <span className="rounded-full bg-slate-100 px-3 py-0.5 font-medium text-slate-600">
                {t.n.de}
              </span>
            )}
            <span className="rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-500">
              {u.t.de}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-0.5">
              <AuthorityLogo src={u.src} className="h-3.5" />
            </span>
            <span className="ml-auto flex items-center gap-2">
              {rich && (
                <PrintButton className="rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-600 transition-colors hover:border-slate-900 hover:text-slate-900" />
              )}
              {u.url && (
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-fast-goal="original_link_click"
                  data-fast-goal-slug={slug}
                  data-fast-goal-authority={u.src}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1 font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Zur Originalmeldung ↗
                </a>
              )}
            </span>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <span>
              <time dateTime={isoDate(u.d)} className="num">{u.d}</time>, {fw.ref}, {fw.jur}
              {u.refnum ? `, ${u.refnum}` : ""}
            </span>
          </p>

          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="font-heading text-balance text-2xl font-medium tracking-tight sm:text-3xl">
              {rich?.h1 ?? u.ti.de}
            </h1>
            <RelevanceStatus target={`u:${slug}`} className="mt-1" />
          </div>

          {rich ? (
            <RichUpdateSections rich={rich} published={u.d} extra={extra} seed={[...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7)} />
          ) : u.s.de && (
            <div className="mt-5 space-y-3 text-base leading-relaxed text-slate-700">
              {u.s.de.split(/\n{2,}/).map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          )}

          {!rich && (u.deadline || u.eff) && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {u.deadline && (
                <div className="bg-white px-4 py-3">
                  <dd className="num text-base font-semibold tracking-tight text-slate-900">
                    {u.deadline}
                  </dd>
                  <dt className="mt-0.5 text-xs font-medium text-slate-500">
                    {deadlineExpired(u.deadline)
                      ? "Frist abgelaufen"
                      : daysUntil(u.deadline) === 0
                        ? "Frist (heute)"
                        : `Frist (${daysUntil(u.deadline)} Tage)`}
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
        </article>
        {rich && <Toc items={richToc(rich)} />}
      </main>
      <Footer hideSources />
    </>
  );
}
