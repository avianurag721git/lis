import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ordersService } from "../orders/orders.service";
import { PrescriptionOcrMatch, PrescriptionOcrResult } from "./ocr.types";

const parseJsonFromLlm = (text: string): PrescriptionOcrResult => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new AppError("OCR could not parse prescription JSON", HTTP_STATUS.BAD_REQUEST, "OCR_PARSE_FAILED");
  }
  const raw = JSON.parse(match[0]) as Record<string, unknown>;
  const genderRaw = String(raw.gender ?? "").toUpperCase();
  const gender =
    genderRaw === "MALE" || genderRaw === "FEMALE" || genderRaw === "OTHER"
      ? (genderRaw as PrescriptionOcrResult["gender"])
      : null;
  return {
    patientName: raw.patientName ? String(raw.patientName).trim() : null,
    age: raw.age != null && Number.isFinite(Number(raw.age)) ? Number(raw.age) : null,
    gender,
    doctorName: raw.doctorName ? String(raw.doctorName).trim() : null,
    detectedTests: Array.isArray(raw.detectedTests)
      ? raw.detectedTests.map((t) => String(t).trim()).filter(Boolean)
      : []
  };
};

const callOpenAiVision = async (base64: string, mimeType: string): Promise<PrescriptionOcrResult> => {
  if (!env.openaiApiKey) {
    throw new AppError("OpenAI API key not configured for OCR", HTTP_STATUS.INTERNAL_SERVER_ERROR, "OCR_NOT_CONFIGURED");
  }
  const model = env.aiModel || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a medical prescription OCR assistant for an Indian pathology lab.
Extract from this prescription image and return ONLY valid JSON (no markdown):
{
  "patientName": string | null,
  "age": number | null,
  "gender": "MALE" | "FEMALE" | "OTHER" | null,
  "doctorName": string | null,
  "detectedTests": string[]
}
List all lab tests mentioned (CBC, LFT, KFT, HbA1c, Lipid Profile, Thyroid, etc.). Use English test names.`
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` }
            }
          ]
        }
      ]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new AppError(`Vision API failed: ${err.slice(0, 200)}`, HTTP_STATUS.INTERNAL_SERVER_ERROR, "OCR_VISION_FAILED");
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  return parseJsonFromLlm(content);
};

const mockOcr = (): PrescriptionOcrResult => ({
  patientName: "Demo Patient",
  age: 42,
  gender: "MALE",
  doctorName: "Dr. Sharma",
  detectedTests: ["Complete Blood Count", "HbA1c", "Lipid Profile"]
});

const matchTests = (
  tenantId: string,
  extracted: PrescriptionOcrResult,
  catalog: Awaited<ReturnType<typeof ordersService.listCatalog>>
): PrescriptionOcrMatch["matchedTests"] => {
  const matched: PrescriptionOcrMatch["matchedTests"] = [];
  const used = new Set<string>();

  for (const detected of extracted.detectedTests) {
    const needle = detected.toLowerCase();
    let best: { testId: string; testName: string; code: string | null; score: number } | null = null;

    for (const test of catalog.tests) {
      if (used.has(test.id)) continue;
      const name = test.name.toLowerCase();
      const code = (test.code ?? "").toLowerCase();
      let score = 0;
      if (name === needle || code === needle) score = 1;
      else if (name.includes(needle) || needle.includes(name)) score = 0.85;
      else if (code && (code.includes(needle) || needle.includes(code))) score = 0.8;
      else {
        const tokens = needle.split(/\W+/).filter((t) => t.length > 2);
        const hits = tokens.filter((t) => name.includes(t)).length;
        if (hits > 0) score = 0.5 + hits * 0.1;
      }
      if (score > (best?.score ?? 0)) {
        best = { testId: test.id, testName: test.name, code: test.code, score };
      }
    }

    if (best && best.score >= 0.5) {
      used.add(best.testId);
      matched.push({
        testId: best.testId,
        testName: best.testName,
        code: best.code,
        matchedFrom: detected,
        confidence: Math.round(best.score * 100) / 100
      });
    }
  }

  void tenantId;
  return matched;
};

export const ocrService = {
  async parsePrescription(
    tenantId: string,
    input: { base64: string; mimeType?: string }
  ): Promise<PrescriptionOcrMatch> {
    const mimeType = input.mimeType?.startsWith("image/") ? input.mimeType : "image/jpeg";
    let extracted: PrescriptionOcrResult;

    try {
      if (env.openaiApiKey && env.aiEnabled) {
        extracted = await callOpenAiVision(input.base64, mimeType);
      } else {
        logger.info("OCR using mock fallback — set OPENAI_API_KEY for GPT-4o vision");
        extracted = mockOcr();
      }
    } catch (err) {
      logger.warn({ err }, "OCR vision failed, using mock fallback");
      extracted = mockOcr();
    }

    const catalog = await ordersService.listCatalog(tenantId);
    const matchedTests = matchTests(tenantId, extracted, catalog);
    const matchedFrom = new Set(matchedTests.map((m) => m.matchedFrom.toLowerCase()));
    const unmatchedTests = extracted.detectedTests.filter((t) => !matchedFrom.has(t.toLowerCase()));

    return { extracted, matchedTests, unmatchedTests };
  }
};
