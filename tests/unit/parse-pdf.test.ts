import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parsePdf, PdfParseError } from "../../src/lib/ingest/parse-pdf";

async function makePdf(pagesText: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pagesText) {
    const page = doc.addPage();
    page.drawText(text, { x: 50, y: 700, size: 12, font, maxWidth: 500, lineHeight: 14 });
  }
  return doc.save();
}

describe("parsePdf", () => {
  it("extracts text per page with 1-based page numbers", async () => {
    const data = await makePdf(["alpha page one text", "beta page two text"]);
    const parsed = await parsePdf(data);
    expect(parsed.pageCount).toBe(2);
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(parsed.pages[0].text).toContain("alpha");
    expect(parsed.pages[1].pageNumber).toBe(2);
    expect(parsed.pages[1].text).toContain("beta");
  });

  it("throws PdfParseError on a corrupt buffer", async () => {
    await expect(parsePdf(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(PdfParseError);
  });

  it("throws PdfParseError when no page has extractable text", async () => {
    const data = await makePdf([]); // zero pages
    await expect(parsePdf(data)).rejects.toBeInstanceOf(PdfParseError);
  });
});
