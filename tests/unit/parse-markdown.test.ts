import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../src/lib/ingest/parse-markdown";

describe("parseMarkdown", () => {
  it("returns one null-trail section when there are no headings", () => {
    const sections = parseMarkdown("Just a paragraph.\n\nAnother one.");
    expect(sections).toHaveLength(1);
    expect(sections[0].headingTrail).toBeNull();
    expect(sections[0].text).toContain("Just a paragraph.");
  });

  it("builds nested heading trails", () => {
    const md = "# SSS\n\nIntro text.\n\n## Voluntary Members\n\nDetails here.";
    const sections = parseMarkdown(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].headingTrail).toBe("SSS");
    expect(sections[1].headingTrail).toBe("SSS > Voluntary Members");
    expect(sections[1].text).toBe("Details here.");
  });

  it("resets siblings at the same level", () => {
    const md = "# A\n\n## B\n\nb text\n\n## C\n\nc text";
    const sections = parseMarkdown(md);
    expect(sections.map((s) => s.headingTrail)).toEqual(["A > B", "A > C"]);
  });

  it("keeps preamble before the first heading", () => {
    const sections = parseMarkdown("preamble\n\n# H\n\nbody");
    expect(sections[0].headingTrail).toBeNull();
    expect(sections[0].text).toBe("preamble");
    expect(sections[1].headingTrail).toBe("H");
  });

  it("skips headings with no body text", () => {
    const sections = parseMarkdown("# Empty\n\n# Full\n\ncontent");
    expect(sections).toHaveLength(1);
    expect(sections[0].headingTrail).toBe("Full");
  });
});
