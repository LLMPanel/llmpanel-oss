// Ambiguous-looking characters (0/O, 1/l/I) are omitted so generated
// passwords are safe to read aloud or copy by hand.
const PASSWORD_ALPHABET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"

export function generatePassword(length = 16): string {
  const values = new Uint32Array(length)
  globalThis.crypto.getRandomValues(values)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[values[i] % PASSWORD_ALPHABET.length]
  }
  return out
}
