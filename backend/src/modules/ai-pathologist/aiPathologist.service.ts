import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import {
  AnalyzeResultInput,
  AnalyzeResultOutput,
  PatientSummaryInput,
  PatientSummaryOutput,
  TestResultInput
} from "./aiPathologist.types";
import { llmProvider } from "./llm.provider";

const formatResultsBlock = (results: TestResultInput[]): string =>
  results
    .map((r) => {
      const val = r.value ?? "—";
      const flags = [
        r.isCritical ? "CRITICAL" : null,
        r.isAbnormal ? "ABNORMAL" : null,
        r.flag ? r.flag : null
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${r.parameterName}: ${val}${r.unit ? ` ${r.unit}` : ""} (Ref: ${r.referenceRange})${flags ? ` [${flags}]` : ""}`;
    })
    .join("\n");

const ruleBasedClinicalImpression = (input: AnalyzeResultInput): string => {
  const abnormal = input.testResults.filter((r) => r.isAbnormal || r.isCritical);
  const critical = input.testResults.filter((r) => r.isCritical);
  const age = input.patientAgeYears ?? "unknown";
  const gender = input.patientGender ?? "patient";

  if (critical.length > 0) {
    const names = critical.map((r) => r.parameterName).join(", ");
    return `Critical values detected (${names}) in this ${age}-year-old ${gender.toLowerCase()} require urgent clinical correlation and repeat testing if indicated. Recommend immediate physician review and condition-appropriate follow-up panels.`;
  }
  if (abnormal.length > 0) {
    const names = abnormal.map((r) => r.parameterName).join(", ");
    return `Abnormal findings (${names}) in a ${age}-year-old ${gender.toLowerCase()} may reflect metabolic, hematologic, or organ-specific dysfunction pending clinical context. Consider targeted follow-up tests and trend comparison with prior results.`;
  }
  return `Laboratory parameters for this ${age}-year-old ${gender.toLowerCase()} are within expected reference intervals for the tests performed. Continue routine monitoring as clinically indicated.`;
};

const ruleBasedPatientSummary = (input: PatientSummaryInput): string[] => {
  const abnormal = input.testResults.filter((r) => r.isAbnormal || r.isCritical);
  const hi = input.language === "hi";

  if (abnormal.length === 0) {
    return hi
      ? [
          "• आपके परीक्षण परिणाम सामान्य सीमा में हैं — यह एक अच्छा संकेत है।",
          "• कोई तत्काल चिंता का कारण नहीं दिखता; अपने चिकित्सक की सलाह जारी रखें।",
          "• संतुलित आहार, नियमित व्यायाम और पर्याप्त नींद स्वस्थ रहने में मदद करते हैं।"
        ]
      : [
          "• Your test results are within the normal range — this is reassuring.",
          "• Nothing urgent stands out; continue follow-up with your doctor as planned.",
          "• Balanced nutrition, regular activity, and adequate sleep support long-term wellness."
        ];
  }

  const names = abnormal.map((r) => r.parameterName).join(", ");
  return hi
    ? [
        `• कुछ मान (${names}) सामान्य सीमा से बाहर हैं — डॉक्टर इन्हें आपके लक्षणों के साथ देखेंगे।`,
        "• ये परिणाम अकेले निदान नहीं बताते; आपके चिकित्सक सही व्याख्या करेंगे।",
        "• निर्धारित दवाएँ लें, पानी पिएँ, और अगली जाँच / फॉलो-अप तिथि न चूकें।"
      ]
    : [
        `• Some values (${names}) fall outside the usual range — your doctor will interpret these with your symptoms.`,
        "• Lab results alone do not diagnose a condition; please discuss these findings with your physician.",
        "• Take medications as prescribed, stay hydrated, and keep your follow-up appointment."
      ];
};

const parseBullets = (text: string): string[] => {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-*\d.)]+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 3) return lines.slice(0, 3);
  return lines.length > 0 ? lines : [];
};

export const aiPathologistService = {
  async analyzeResult(input: AnalyzeResultInput): Promise<AnalyzeResultOutput> {
    const generatedAt = new Date().toISOString();
    const provider = llmProvider.resolveProvider();
    const model = llmProvider.resolveModel(provider);

    if (!env.aiEnabled || provider === "mock") {
      return {
        clinicalImpression: ruleBasedClinicalImpression(input),
        provider: "mock",
        model: "mock-clinical-v1",
        generatedAt,
        fallback: true
      };
    }

    const systemPrompt = `You are an AI Co-Pathologist assisting MD pathologists in an ISO 15189 / NABL accredited diagnostic laboratory in India.
Write exactly TWO concise clinical sentences for the pathologist's report impression.
Focus on: abnormal/critical flags, plausible differential diagnoses, and recommended follow-up tests.
Do NOT diagnose definitively. Use professional medical language. No bullet points. No disclaimers.`;

    const userPrompt = `Patient: ${input.patientAgeYears ?? "?"} years, ${input.patientGender ?? "unknown"} gender.
Panel: ${input.testName ?? "Laboratory panel"} (${input.departmentName ?? "General"})

Results:
${formatResultsBlock(input.testResults)}

Provide a 2-sentence clinical impression for the pathologist.`;

    try {
      const { text, provider: usedProvider, model: usedModel } = await llmProvider.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxTokens: 256,
        temperature: 0.2
      });

      const impression = text.replace(/\n+/g, " ").trim() || ruleBasedClinicalImpression(input);
      return {
        clinicalImpression: impression,
        provider: usedProvider,
        model: usedModel,
        generatedAt,
        fallback: !text
      };
    } catch (err) {
      logger.warn({ err }, "AI analyze-result fallback to rules");
      return {
        clinicalImpression: ruleBasedClinicalImpression(input),
        provider: "mock",
        model: "mock-clinical-v1",
        generatedAt,
        fallback: true
      };
    }
  },

  async patientSummary(input: PatientSummaryInput): Promise<PatientSummaryOutput> {
    const generatedAt = new Date().toISOString();
    const language = input.language ?? "en";
    const provider = llmProvider.resolveProvider();
    const model = llmProvider.resolveModel(provider);
    const disclaimer =
      language === "hi"
        ? "यह सारांश केवल शैक्षिक उद्देश्यों के लिए है — चिकित्सा सलाह नहीं। कृपया अपने चिकित्सक से परामर्श करें।"
        : "This summary is for educational purposes only — not medical advice. Please consult your physician.";

    if (!env.aiEnabled || provider === "mock") {
      return {
        bullets: ruleBasedPatientSummary(input),
        language,
        disclaimer,
        provider: "mock",
        model: "mock-clinical-v1",
        generatedAt,
        fallback: true
      };
    }

    const langInstruction =
      language === "hi"
        ? "Write in simple Hindi (Devanagari script) that a patient with basic literacy can understand."
        : "Write in simple plain English that a patient with basic literacy can understand.";

    const systemPrompt = `You are a compassionate health educator helping pathology lab patients understand their reports.
${langInstruction}
Provide exactly 3 bullet points covering: (1) what the results mean overall, (2) normal vs abnormal findings in plain language, (3) simple lifestyle or follow-up advice.
Avoid alarming language. Do not diagnose. Keep each bullet under 35 words. Start each line with "•".`;

    const userPrompt = `Patient: ${input.patientAgeYears ?? "?"} years, ${input.patientGender ?? "unknown"}.
Tests: ${input.testName ?? "Laboratory report"}

Results:
${formatResultsBlock(input.testResults)}

Generate 3 patient-friendly bullet points.`;

    try {
      const { text, provider: usedProvider, model: usedModel } = await llmProvider.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxTokens: 400,
        temperature: 0.35
      });

      let bullets = parseBullets(text);
      if (bullets.length < 3) {
        bullets = ruleBasedPatientSummary(input);
      }
      bullets = bullets.map((b) => (b.startsWith("•") ? b : `• ${b}`));

      return {
        bullets: bullets.slice(0, 3),
        language,
        disclaimer,
        provider: usedProvider,
        model: usedModel,
        generatedAt,
        fallback: !text
      };
    } catch (err) {
      logger.warn({ err }, "AI patient-summary fallback to rules");
      return {
        bullets: ruleBasedPatientSummary(input),
        language,
        disclaimer,
        provider: "mock",
        model: "mock-clinical-v1",
        generatedAt,
        fallback: true
      };
    }
  }
};

/** Flatten verified lab rows into test result inputs for AI */
export const flattenVerifiedResults = (
  rows: Array<{
    testName: string;
    entries: Array<{
      parameterName: string;
      value: number | null;
      valueText: string | null;
      unit: string | null;
      referenceRange: string;
      isAbnormal: boolean;
      isCritical: boolean;
      flag: string | null;
    }>;
  }>
): TestResultInput[] =>
  rows.flatMap((row) =>
    row.entries.map((e) => ({
      parameterName: `${row.testName} — ${e.parameterName}`,
      value: e.value ?? e.valueText,
      unit: e.unit,
      referenceRange: e.referenceRange,
      isAbnormal: e.isAbnormal,
      isCritical: e.isCritical,
      flag: e.flag
    }))
  );
