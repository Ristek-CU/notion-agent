// src/index.ts — Entry Point
import Fastify from "fastify";
import { env } from "./config.js";
import { registerWebhookRoutes, initBotJid } from "./webhook/handler.js";
import { closeMcpClient } from "./mcp/notion-client.js";

async function main() {
  console.log("===========================================");
  console.log("  WA Notion Bot — Starting...");
  console.log("===========================================");
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  Port: ${env.PORT}`);
  console.log(`  AI Model: ${env.AI_MODEL} (z.ai proxy)`);
  console.log(`  AI Base URL: ${env.ANTHROPIC_BASE_URL}`);
  console.log(`  Evolution API: ${env.EVOLUTION_API_URL}`);
  console.log(`  Instance: ${env.EVOLUTION_INSTANCE_NAME}`);
  console.log("===========================================");

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Initialize bot JID for mention detection
  await initBotJid();

  // Register webhook routes
  await registerWebhookRoutes(app);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Bot] Received ${signal}, shutting down gracefully...`);
    await closeMcpClient();
    await app.close();
    console.log("[Bot] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start server
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`\n[Bot] Server running on http://0.0.0.0:${env.PORT}`);
    console.log("[Bot] Webhook endpoint: POST /webhook/:instanceName");
    console.log("[Bot] Health check: GET /health");
    console.log("\n[Bot] Ready to receive WhatsApp messages!");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
