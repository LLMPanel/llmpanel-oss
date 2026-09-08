import { randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@llmpanel/db"
import * as schema from "@llmpanel/db/schema"
import { auth } from "../src/lib/auth"

const email = process.argv[2]
if (!email) throw new Error("usage: reset-password <email> [password]")

// Generate a strong random password unless one is supplied.
const password =
  process.argv[3] ??
  randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16)

async function main() {
  const target = await db.query.user.findFirst({
    where: eq(schema.user.email, email),
  })
  if (!target) throw new Error(`no user with email ${email}`)

  // Use Better Auth's configured hasher so the hash format matches login.
  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)

  await db
    .update(schema.account)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(schema.account.userId, target.id))

  console.log(`\nPassword reset for ${email}`)
  console.log(`New password: ${password}\n`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
