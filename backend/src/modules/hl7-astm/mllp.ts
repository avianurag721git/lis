/**
 * MLLP (Minimal Lower Layer Protocol) framing for HL7 over TCP.
 * Start block: VT (\x0b), End block: FS CR (\x1c\x0d)
 */

export const MLLP_START = 0x0b;
export const MLLP_END_FS = 0x1c;
export const MLLP_END_CR = 0x0d;

export const wrapMllp = (payload: string): Buffer => {
  const body = Buffer.from(payload, "utf8");
  return Buffer.concat([Buffer.from([MLLP_START]), body, Buffer.from([MLLP_END_FS, MLLP_END_CR])]);
};

/**
 * Incremental MLLP frame extractor. Append chunks; returns complete messages.
 */
export class MllpBuffer {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): string[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const messages: string[] = [];

    while (true) {
      const start = this.buf.indexOf(MLLP_START);
      if (start < 0) {
        // No start — keep last few bytes in case of split; drop garbage
        if (this.buf.length > 64) this.buf = this.buf.subarray(this.buf.length - 64);
        break;
      }
      if (start > 0) this.buf = this.buf.subarray(start);

      // Look for FS CR after start
      let end = -1;
      for (let i = 1; i < this.buf.length - 1; i += 1) {
        if (this.buf[i] === MLLP_END_FS && this.buf[i + 1] === MLLP_END_CR) {
          end = i;
          break;
        }
      }
      if (end < 0) break;

      const payload = this.buf.subarray(1, end).toString("utf8");
      messages.push(payload);
      this.buf = this.buf.subarray(end + 2);
    }

    return messages;
  }

  /** Force-flush remaining buffer as one message (idle timeout). */
  flush(): string[] {
    if (!this.buf.length) return [];
    const text = this.buf
      .toString("utf8")
      .replace(/^\x0b/, "")
      .replace(/\x1c\x0d$/, "")
      .trim();
    this.buf = Buffer.alloc(0);
    return text ? [text] : [];
  }
}

export const buildHl7Ack = (originalMsh: string, ackCode: "AA" | "AE" = "AA"): string => {
  const fields = originalMsh.split("|");
  const sendingApp = fields[2] ?? "";
  const sendingFac = fields[3] ?? "";
  const receivingApp = fields[4] ?? "DiagLab";
  const receivingFac = fields[5] ?? "";
  const controlId = fields[9] ?? String(Date.now());
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const msh = [
    "MSH",
    "^~\\&",
    receivingApp,
    receivingFac,
    sendingApp,
    sendingFac,
    ts,
    "",
    "ACK",
    `ACK${controlId}`,
    "P",
    "2.5"
  ].join("|");
  const msa = ["MSA", ackCode, controlId].join("|");
  return `${msh}\r${msa}\r`;
};
