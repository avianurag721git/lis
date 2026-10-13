export type ReadoutLanguage = "en" | "hi" | "mr" | "ta" | "te" | "es";

export type ReportSummaryLine = {
  parameterName: string;
  value: number | null;
  unit: string | null;
  status: string;
};

const statusPhrase = (lang: ReadoutLanguage, status: string): string => {
  const abnormal = status === "abnormal";
  const map: Record<ReadoutLanguage, { normal: string; abnormal: string }> = {
    en: { normal: "which is normal", abnormal: "which needs follow-up" },
    hi: { normal: "जो सामान्य है", abnormal: "जिस पर ध्यान देना होगा" },
    mr: { normal: "जे सामान्य आहे", abnormal: "ज्याकडे लक्ष देणे आवश्यक आहे" },
    ta: { normal: "இது சாதாரணமானது", abnormal: "இதற்கு கவனம் தேவை" },
    te: { normal: "ఇది సాధారణం", abnormal: "దీనికి శ్రద్ధ అవసరం" },
    es: { normal: "lo cual es normal", abnormal: "lo cual requiere seguimiento" }
  };
  return abnormal ? map[lang].abnormal : map[lang].normal;
};

const greeting = (lang: ReadoutLanguage, name: string): string => {
  const n = name.split(" ")[0] ?? name;
  const map: Record<ReadoutLanguage, string> = {
    en: `Hello ${n}.`,
    hi: `नमस्ते ${n}.`,
    mr: `नमस्कार ${n}.`,
    ta: `வணக்கம் ${n}.`,
    te: `నమస్కారం ${n}.`,
    es: `Hola ${n}.`
  };
  return map[lang];
};

export const buildReportReadoutScript = (
  patientName: string,
  lines: ReportSummaryLine[],
  lang: ReadoutLanguage
): string => {
  const parts = [greeting(lang, patientName)];
  const top = lines.slice(0, 6);
  for (const line of top) {
    if (line.value == null) continue;
    const unit = line.unit ? ` ${line.unit}` : "";
    const phrase = statusPhrase(lang, line.status);
    if (lang === "en") {
      parts.push(`Your ${line.parameterName} is ${line.value}${unit}, ${phrase}.`);
    } else if (lang === "hi") {
      parts.push(`आपका ${line.parameterName} ${line.value}${unit} है, ${phrase}.`);
    } else if (lang === "es") {
      parts.push(`Su ${line.parameterName} es ${line.value}${unit}, ${phrase}.`);
    } else {
      parts.push(`${line.parameterName}: ${line.value}${unit}. ${phrase}.`);
    }
  }
  if (lang === "en") parts.push("Please download your official PDF report for full details.");
  else if (lang === "hi") parts.push("पूरी जानकारी के लिए अपनी आधिकारिक PDF रिपोर्ट डाउनलोड करें।");
  return parts.join(" ");
};

export const speakReportSummary = (
  text: string,
  lang: ReadoutLanguage,
  onEnd?: () => void
): SpeechSynthesisUtterance | null => {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const localeMap: Record<ReadoutLanguage, string> = {
    en: "en-IN",
    hi: "hi-IN",
    mr: "mr-IN",
    ta: "ta-IN",
    te: "te-IN",
    es: "es-ES"
  };
  utter.lang = localeMap[lang];
  utter.rate = 0.92;
  if (onEnd) utter.onend = onEnd;
  window.speechSynthesis.speak(utter);
  return utter;
};

export const stopReadout = (): void => {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
