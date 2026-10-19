import { Praxis } from "./praxis-client";
import { dt } from "@/lib/logic";
import { PRAXIS } from "@/lib/live";

export default function Page() {
  return <Praxis items={[...PRAXIS].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime())} />;
}
