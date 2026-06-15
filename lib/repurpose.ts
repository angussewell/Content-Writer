// Shared contract for "copy to repurpose" — the blob Angus pastes into
// plan-post's reel-repurpose mode to turn a posted reel into a Substack post.
// Keep this format stable: it's the input contract the plan-post skill parses.

export type RepurposeSource = {
  id: number;
  title: string;
  permalink: string | null;
};

export function buildRepurposeBlob({ id, title, permalink }: RepurposeSource): string {
  const lines = [
    "Repurpose this posted reel into a Substack post (plan-post reel-repurpose mode).",
    `reel_id: ${id}`,
    `title: ${title}`,
    `permalink: ${permalink ?? "—"}`,
  ];
  return lines.join("\n");
}
