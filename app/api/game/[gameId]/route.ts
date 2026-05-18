import { NextResponse } from "next/server";
import { getGame } from "@/lib/store/game-store";

export async function GET(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  return NextResponse.json({ game });
}
