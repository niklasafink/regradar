import { currentVisitor, domainOf, getDomainProfile, primaryProfile } from "@/lib/accounts";
import { profileChanged } from "@/lib/relevance/profile";

/* Wer ist der Besucher? Für die Einschlägigkeits-Zeile oben auf jeder Seite. */
export async function GET() {
  try {
    const { email, account, subscriberEmail } = await currentVisitor();
    if (account) {
      return Response.json({
        loggedIn: true,
        email,
        activeId: account.activeId ?? account.profiles[0]?.id ?? null,
        primaryId: primaryProfile(account)?.id ?? null,
        profiles: account.profiles.map((p) => ({ id: p.id, name: p.name, origin: p.origin, stale: profileChanged(p) })),
        pre: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    let pre = null;
    if (subscriberEmail) {
      const dp = await getDomainProfile(domainOf(subscriberEmail));
      pre = dp?.profile
        ? { name: dp.profile.name, domain: dp.domain, kind: dp.kind, profile: dp.profile }
        : dp ? { name: null, domain: dp.domain, kind: dp.kind } : { name: null, domain: domainOf(subscriberEmail), kind: "unbekannt" };
    }
    return Response.json({ loggedIn: false, email: null, profiles: [], activeId: null, pre, subscriber: !!subscriberEmail },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("me failed:", e);
    return Response.json({ loggedIn: false, profiles: [], pre: null });
  }
}
