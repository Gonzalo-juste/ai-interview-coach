import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("Invalid request body.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return err("No file provided.", 400);
  if (file.size === 0) return err("The uploaded file is empty.", 400);
  if (file.size > MAX_BYTES) return err("File too large — maximum is 5 MB.", 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const mime = file.type;

  let raw = "";

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    try {
      // pdf-parse v2.x: class-based API, no default export.
      // LoadParameters.data accepts Buffer (extends Uint8Array / TypedArray).
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      raw = textResult.text;
    } catch {
      return err(
        "Could not extract text from this PDF. It may be password-protected, image-only (scanned), or corrupted. Please paste your CV as text instead.",
        422
      );
    }
  } else if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value;
    } catch {
      return err(
        "Could not read this .docx file. It may be corrupted or in an unsupported format.",
        422
      );
    }
  } else {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "unknown";
    return err(
      `Unsupported format (.${ext}). Please upload a PDF or .docx file.`,
      400
    );
  }

  // Normalise whitespace
  const text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < 50) {
    return err(
      "Extracted text is too short to be a CV. The file may be empty, purely image-based, or only contain formatting. Please paste your CV as text instead.",
      422
    );
  }

  return NextResponse.json({ text });
}
