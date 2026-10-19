// Meldet alle Adressen aus der Live-Sitemap an IndexNow (Bing, Yandex, Seznam,
// Naver; Bing gibt sie an seine Partner weiter). Kein Konto nötig: Der Schlüssel
// liegt als Datei auf der Website (public/<schlüssel>.txt).
// Aufruf nach dem Deploy:  node scripts/indexnow.mjs [nur-geänderte-URLs …]

const HOST = "www.regradar.de";
const KEY = "18a1fda77f633d7f1206cfcc2b112c74";

let urlList = process.argv.slice(2);
if (!urlList.length) {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
// IndexNow nimmt bis zu 10.000 Adressen je Aufruf an.
for (let i = 0; i < urlList.length; i += 10000) {
  const batch = urlList.slice(i, i + 10000);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: batch }),
  });
  console.log(`IndexNow: ${batch.length} Adressen, Antwort ${response.status} ${await response.text()}`);
}
