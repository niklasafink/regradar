import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorityLogo, FirmLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { TrackGoal } from "@/components/track-goal";
import { authority, daysUntil, frameworkById, topicById } from "@/lib/logic";
import { isoDate, UPDATE_PAGES, updateBySlug, updateHref } from "@/lib/updates";

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
    u.s.de ||
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
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
            <p className="mt-5 text-base leading-relaxed text-slate-700">
              {u.s.de}
            </p>
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
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Fachbeiträge zu dieser Meldung, externe Inhalte, automatisch
                zugeordnet, keine Empfehlung.
              </p>
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
