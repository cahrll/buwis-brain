import type { MarkdownSectionInput } from "./chunk";

/** ATX headings only (`# ...` through `###### ...`); setext headings are not supported. */
export function parseMarkdown(source: string): MarkdownSectionInput[] {
  const lines = source.split(/\r?\n/);
  const sections: MarkdownSectionInput[] = [];
  const trail: { level: number; title: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text.length === 0) return;
    const headingTrail = trail.length ? trail.map((t) => t.title).join(" > ") : null;
    sections.push({ headingTrail, text });
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      while (trail.length > 0 && trail[trail.length - 1].level >= level) trail.pop();
      trail.push({ level, title: m[2] });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}
