/** A gradient avatar derived from the address, so a wallet is recognisable at a glance. Decorative only. */
export function avatarGradient(address: string): string {
  const hex = address.replace(/^0x/, '')
  const a = parseInt(hex.slice(0, 4), 16) % 360
  const b = (a + 50 + (parseInt(hex.slice(-4), 16) % 60)) % 360
  return `linear-gradient(135deg, hsl(${a} 78% 60%), hsl(${b} 76% 50%))`
}
