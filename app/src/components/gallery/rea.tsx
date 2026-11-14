import { z } from "zod";
import type { GalleryComponent } from "@/lib/copilot/gallery-registry";
import { GalleryFrame } from "./frame";

/**
 * Reverse-engineering results the REA tools produce: the evidence bundle a pass leaves behind and
 * the diff between two versions of a binary.
 *
 * There is no bundle store on the server, so a component shows what the Bot passes it — the
 * summary it wrote and the files it names — rather than fetching anything.
 */

export const EvidenceBundleProps = z.object({
  title: z.string().describe("What was analysed, e.g. the app or binary"),
  caption: z
    .string()
    .optional()
    .describe("One line of context, e.g. which version or which tool"),
  summary: z
    .string()
    .describe("The findings, already written for a person to read"),
  files: z
    .array(
      z.object({
        name: z.string().describe("File path or module name"),
        size: z
          .string()
          .optional()
          .describe("Already formatted, e.g. '1.2 MB'"),
        note: z.string().optional().describe("What this file shows"),
      }),
    )
    .describe("The files in the bundle, in reading order"),
});

export function EvidenceBundle({
  title,
  caption,
  summary,
  files: given,
}: Partial<z.infer<typeof EvidenceBundleProps>>) {
  const files = given ?? [];
  return (
    <GalleryFrame caption={caption} title={title}>
      <p className="text-sm whitespace-pre-line">{summary}</p>
      {files.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">
          No files recorded in this bundle.
        </p>
      ) : (
        <ul className="mt-3">
          {files.map((file) => (
            <li
              className="border-border/60 border-b py-1.5 first:pt-0 last:border-b-0 last:pb-0"
              key={file.name}
            >
              <p className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-all font-mono text-xs">
                  {file.name}
                </span>
                {file.size ? (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {file.size}
                  </span>
                ) : null}
              </p>
              {file.note ? (
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {file.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </GalleryFrame>
  );
}

export const VersionDiffProps = z.object({
  title: z.string().describe("What is being compared, e.g. the binary name"),
  caption: z.string().optional(),
  from: z.string().describe("The older version label"),
  to: z.string().describe("The newer version label"),
  summary: z
    .string()
    .optional()
    .describe("What changed, in a sentence, before the diff"),
  diff: z
    .string()
    .describe("A unified diff, with - and + lines and @@ hunks, as text"),
});

/** The four kinds of line a unified diff has, and the one class each gets. */
function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "text-sky-700 dark:text-sky-300";
  if (line.startsWith("---") || line.startsWith("+++")) {
    return "text-muted-foreground";
  }
  if (line.startsWith("+")) {
    return "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
  }
  if (line.startsWith("-")) {
    return "bg-red-500/10 text-red-900 dark:text-red-200";
  }
  return "";
}

export function VersionDiff({
  title,
  caption,
  from,
  to,
  summary,
  diff,
}: Partial<z.infer<typeof VersionDiffProps>>) {
  const lines = diff === undefined || diff.length === 0 ? [] : diff.split("\n");
  return (
    <GalleryFrame
      action={
        from || to ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {from} → {to}
          </span>
        ) : undefined
      }
      caption={caption}
      title={title}
    >
      {summary ? <p className="text-sm">{summary}</p> : null}
      {lines.length === 0 ? (
        <p className="mt-2 text-muted-foreground text-sm">No changes.</p>
      ) : (
        <div
          className={`overflow-x-auto rounded-md border bg-muted/40 font-mono text-xs ${summary ? "mt-2" : ""}`}
        >
          {lines.map((line, index) => (
            <pre
              className={`px-2 py-0.5 whitespace-pre ${diffLineClass(line)}`}
              // biome-ignore lint/suspicious/noArrayIndexKey: a diff is a fixed record, never reordered; the position is the identity.
              key={index}
            >
              {line || " "}
            </pre>
          ))}
        </div>
      )}
    </GalleryFrame>
  );
}

export const GALLERY: GalleryComponent[] = [
  {
    name: "showEvidenceBundle",
    title: "Evidence bundle",
    kind: "card",
    description:
      "Show the findings of a reverse-engineering pass together with the files that back them. Use after an analysis instead of listing files in prose.",
    parameters: EvidenceBundleProps,
    Component: EvidenceBundle as GalleryComponent["Component"],
    preview: {
      title: "Telegram Android 10.14.2",
      caption: "Decompiled and inspected with REA",
      summary:
        "The app stores its session token in shared_prefs without encryption, and reports its build number from a hardcoded constant.",
      files: [
        { name: "classes.dex", size: "24.1 MB", note: "Main dex, 38k classes" },
        {
          name: "resources.arsc",
          size: "1.8 MB",
          note: "String table, build label",
        },
        { name: "lib/arm64-v8a/libtm.so", size: "3.2 MB" },
      ],
    },
    confirmation: "The evidence bundle is now on screen for the person.",
  },
  {
    name: "showVersionDiff",
    title: "Version diff",
    kind: "card",
    description:
      "Show what changed between two versions of a binary or file, as a coloured unified diff. Use instead of pasting raw diff text into the conversation.",
    parameters: VersionDiffProps,
    Component: VersionDiff as GalleryComponent["Component"],
    preview: {
      title: "app.asar",
      from: "10.14.1",
      to: "10.14.2",
      summary: "Retry limit raised and a backoff added; nothing else moved.",
      diff: [
        "@@ -12,7 +12,9 @@",
        " const CLIENT = new Client({",
        "-  retries: 3,",
        "+  retries: 5,",
        "+  backoffMs: 250,",
        "   timeout: 10_000,",
        " });",
      ].join("\n"),
    },
    confirmation: "The diff is now on screen for the person.",
  },
];
