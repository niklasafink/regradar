import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Subscriber = {
  email: string;
  provider: string;
  confirmedAt: string;
};

const FILE = path.join(process.cwd(), "data", "subscribers.json");

async function readAll(): Promise<Subscriber[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Subscriber[];
  } catch {
    return [];
  }
}

export async function addSubscriber(email: string, provider: string) {
  const all = await readAll();
  const key = email.toLowerCase();
  if (!all.some((s) => s.email === key && s.provider === provider)) {
    all.push({ email: key, provider, confirmedAt: new Date().toISOString() });
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(all, null, 2));
  }
}
