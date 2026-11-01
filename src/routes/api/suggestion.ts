import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

// Appelée par le navigateur : POST /api/suggestion { "prompt": "..." }
// La clé OPENAI_API_KEY est lue côté Worker uniquement et n'est jamais envoyée au navigateur.
export const Route = createFileRoute("/api/suggestion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = (env as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
        if (!apiKey) return Response.json({ error: "Service IA non configuré" }, { status: 503 });

        let prompt = "";
        try {
          prompt = String(((await request.json()) as { prompt?: unknown }).prompt ?? "").trim();
        } catch {
          return Response.json({ error: "Requête invalide" }, { status: 400 });
        }
        if (!prompt || prompt.length > 2000) {
          return Response.json({ error: "Texte manquant ou trop long" }, { status: 400 });
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Tu proposes une suggestion courte et utile, en français." },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (!res.ok) return Response.json({ error: "Échec du service IA" }, { status: 502 });
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return Response.json({ suggestion: data.choices?.[0]?.message?.content ?? "" });
      },
    },
  },
});
