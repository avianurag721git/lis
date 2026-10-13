import { Router } from "express";
import { handleWhatsAppWebhook, verifyWhatsAppWebhook } from "./whatsapp.controller";

const whatsappRouter = Router();
const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get("/webhook", verifyWhatsAppWebhook);
whatsappWebhookRouter.post("/webhook", handleWhatsAppWebhook);

whatsappRouter.get("/webhook", verifyWhatsAppWebhook);
whatsappRouter.post("/webhook", handleWhatsAppWebhook);

export { whatsappRouter, whatsappWebhookRouter };
