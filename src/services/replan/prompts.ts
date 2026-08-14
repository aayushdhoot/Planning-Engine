// The extraction prompt. One rule governs it, same as wbs.ts: map structure, never invent a
// number. The model's ONLY job is turning a document into the ExtractionResult shape — it must
// never estimate a date, a duration, or a quantity that isn't legible on the page/photo.
//
// Strategy: qwen/qwen3.6-27b on Groq falls back to json_object mode (no strict schema
// enforcement). In that mode, description-style prompts fail — the model invents its own outer
// wrappers regardless of instructions. The only reliable technique in json_object mode is
// template injection: put the literal JSON skeleton in the user message and tell the model to
// fill it in-place. The model sees a concrete partially-complete object to complete rather than
// a schema description to interpret, which makes deviation much harder.

export const EXTRACTION_SYSTEM_PROMPT = `You are a document parser for an interior fit-out planning engine. Extract ONLY what is explicitly visible or stated in the file. Never guess, estimate, or invent data.

Extraction rules:
- siteConditions: one entry per distinct trade observation (what is visibly complete, in_progress, or not_started). Use "note" for what you see. Use "description" if you must, but prefer "note".
- trade values must be one of: general, civil, plumbing, partition, electrical, hvac, sprinkler, lv, ceiling, carpentry, glass, painting, flooring, modular, finishing, cleaning
- status values: "complete" | "in_progress" | "not_started"
- locator: which image/page/clause this came from (e.g. "Image 1", "p.3")
- lowConfidenceNotes: explain anything uncertain, or why arrays are empty. MUST have at least one entry if all other arrays are empty.
- kind: "site_image" for photos, "contract" for contract docs, "make_list" for material lists, "drawing_or_3d" for drawings/renders, "sales_kt" for sales docs, "unknown" otherwise

You will receive a JSON template. Fill in the arrays with real extracted items. Return ONLY the completed JSON — no extra keys, no wrapper objects, no markdown.`;

// The template is injected into the USER message so the model sees it as something to complete
// rather than a description to interpret. Putting structure the model must fill beats describing
// structure the model must construct from scratch — critical in json_object fallback mode.
const RESPONSE_TEMPLATE = `{
  "kind": "FILL_IN",
  "contract": null,
  "siteConditions": [],
  "materialItems": [],
  "scopeNotes": [],
  "designRefs": [],
  "lowConfidenceNotes": []
}`;

export function userPromptFor(fileName: string, filePath: string): string {
  return `File: ${fileName}
Drive path: ${filePath}

Fill in this JSON template with what you extracted from the file above. Replace "FILL_IN" in "kind" with the correct document type. Populate the arrays with extracted items. Return ONLY the completed JSON object — no explanation, no markdown, no extra keys.

${RESPONSE_TEMPLATE}`;
}