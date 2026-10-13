export type WhatsAppSessionState =
  | "MENU"
  | "REPORT_LOOKUP"
  | "BOOK_ADDRESS"
  | "BOOK_TIME"
  | "BOOK_TESTS"
  | "TRACK_LOOKUP";

export type WhatsAppSession = {
  phone: string;
  tenantId: string;
  state: WhatsAppSessionState;
  context: Record<string, unknown>;
  updatedAt: string;
};

export type IncomingWhatsAppMessage = {
  from: string;
  messageId: string;
  type: "text" | "interactive" | "button" | "unknown";
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
};

export type OutboundWhatsAppMessage =
  | { kind: "text"; body: string }
  | {
      kind: "buttons";
      body: string;
      buttons: Array<{ id: string; title: string }>;
    }
  | { kind: "document"; caption: string; filename: string; pdfBuffer: Buffer };
