import { generateKeyPairSync } from "node:crypto"

/**
 * Generate an ed25519 keypair and return the public half in OpenSSH format.
 *
 * Some providers (Hyperstack) require an SSH key at launch but only *import*
 * public keys — they will not generate one for you. Provisioning happens
 * entirely through cloud-init, so we never need to SSH in; the private half is
 * discarded and only the public key is uploaded to satisfy the requirement.
 *
 * The OpenSSH wire format is:
 *   "ssh-ed25519 " + base64( str("ssh-ed25519") || str(raw 32-byte key) )
 * where str(s) is a 4-byte big-endian length followed by the bytes.
 */
export function generateOpenSshEd25519PublicKey(comment = "llmpanel"): string {
  const { publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  })

  // An ed25519 SPKI is a fixed 44 bytes whose final 32 are the raw key.
  const raw = publicKey.subarray(publicKey.length - 32)

  const algorithm = Buffer.from("ssh-ed25519", "utf8")
  const lengthPrefixed = (buf: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(buf.length, 0)
    return Buffer.concat([len, buf])
  }

  const blob = Buffer.concat([lengthPrefixed(algorithm), lengthPrefixed(raw)])
  return `ssh-ed25519 ${blob.toString("base64")} ${comment}`
}
