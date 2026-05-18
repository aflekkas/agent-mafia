import { GameShell } from "@/components/GameShell";

export default function Home() {
  return <GameShell micInputEnabled={process.env.MIC_INPUT_ENABLED !== "false"} />;
}
