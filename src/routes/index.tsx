import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Manyar — Planificador de comedores empresariales" },
      { name: "description", content: "Manyar: planificador de comedores empresariales. Proyecto en preparación." },
      { property: "og:title", content: "Manyar" },
      { property: "og:description", content: "Planificador de comedores empresariales" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">Manyar</h1>
        <p className="mt-3 text-lg text-foreground">Planificador de comedores empresariales</p>
        <p className="mt-6 text-sm text-muted-foreground">Proyecto en preparación</p>
      </div>
    </main>
  );
}
