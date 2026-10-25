// Number formatting for desk figures: fixed decimals for normal magnitudes, but values too
// small to show at that precision get three significant figures instead of collapsing to
// 0.00 / 0.01; negative zero is never printed.
export function num(v, d = 2) {
  if (v == null || !Number.isFinite(+v)) return '—'
  const x = +v, a = Math.abs(x)
  const dd = a > 0 && a < 100 * 10 ** -d ? Math.min(8, Math.max(d, 2 - Math.floor(Math.log10(a)))) : d
  const s = x.toLocaleString(undefined, { minimumFractionDigits: dd, maximumFractionDigits: dd })
  return /^-0([.,]0*)?$/.test(s) ? s.slice(1) : s
}
