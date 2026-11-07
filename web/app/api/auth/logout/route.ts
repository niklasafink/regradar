import { endSession } from "@/lib/accounts";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
