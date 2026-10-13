import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { whatsappBotService } from "./whatsappBot.service";

export const verifyWhatsAppWebhook = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsappVerifyToken) {
    res.status(HTTP_STATUS.OK).send(challenge);
    return;
  }
  res.status(HTTP_STATUS.FORBIDDEN).send("Forbidden");
};

export const handleWhatsAppWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(HTTP_STATUS.OK).json({ received: true });

    const messages = whatsappBotService.parseWebhookBody(req.body);
    for (const msg of messages) {
      try {
        await whatsappBotService.handleIncoming(msg);
      } catch (err) {
        logger.error({ err, from: msg.from }, "WhatsApp message handler failed");
      }
    }
  } catch (err) {
    next(err);
  }
};
