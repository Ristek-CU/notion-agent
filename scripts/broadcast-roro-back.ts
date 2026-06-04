/**
 * Broadcast script: kirim pesan "roro sudah kembali" ke semua kontak
 * dengan nama masing-masing sesuai identitas.
 *
 * Usage: npx tsx scripts/broadcast-roro-back.ts
 */

import { sendDirectMessage } from "../src/wa/sender.js";
import { env } from "../src/config.js";
import contactsData from "../src/config/contacts.json";

const CONTACTS = contactsData as Array<{
  name: string;
  phone: string;
  nickname: string;
  division?: string;
  role?: string;
}>;

const MESSAGE_TEMPLATE = (displayName: string) =>
  `Hai ${displayName}! 👋\n\nRoro sudah kembali, bisa di gunakan ya ^^`;

const DELAY_MS = 1500; // 1.5 detik antar pengiriman

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n🚀 Broadcast: "Roro sudah kembali" ke ${CONTACTS.length} kontak\n`);
  console.log("─".repeat(60));

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < CONTACTS.length; i++) {
    const contact = CONTACTS[i];
    const displayName = contact.nickname || contact.name.split(" ")[0];
    const message = MESSAGE_TEMPLATE(displayName);

    try {
      await sendDirectMessage(env.EVOLUTION_INSTANCE_NAME, contact.phone, message);
      success++;
      console.log(`✅ [${i + 1}/${CONTACTS.length}] ${displayName} (${contact.phone}) — terkirim`);
    } catch (error) {
      failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${displayName} (${contact.phone}): ${errMsg}`);
      console.error(`❌ [${i + 1}/${CONTACTS.length}] ${displayName} (${contact.phone}) — gagal: ${errMsg}`);
    }

    // Delay antar pengiriman (kecuali kontak terakhir)
    if (i < CONTACTS.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log(`\n📊 Hasil Broadcast:`);
  console.log(`   ✅ Berhasil: ${success}/${CONTACTS.length}`);
  console.log(`   ❌ Gagal: ${failed}/${CONTACTS.length}`);

  if (errors.length > 0) {
    console.log(`\n❌ Detail error:`);
    for (const err of errors) {
      console.log(`   - ${err}`);
    }
  }

  console.log(`\n🏁 Broadcast selesai!\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
