/**
 * csvExport — generic CSV download helper.
 *
 * For typed exports (e.g. bot trades), prefer dedicated helpers that
 * encode their schema knowledge. This file is for ad-hoc table dumps
 * where the caller knows the columns and just needs the download
 * plumbing.
 *
 * Cell escaping: any cell containing a comma, quote, or newline is
 * wrapped in double quotes with inner quotes doubled (RFC 4180). Empty
 * cells pass through as empty strings.
 */

export type CsvCell = string | number | boolean | null | undefined
export type CsvRow = CsvCell[]

function escapeCell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface DownloadCsvOptions {
  filename: string
  headers: string[]
  rows: CsvRow[]
}

export function downloadCsv({ filename, headers, rows }: DownloadCsvOptions): void {
  const header = headers.map(escapeCell).join(',')
  const body = rows.map(r => r.map(escapeCell).join(',')).join('\n')
  const csv = body.length > 0 ? `${header}\n${body}` : header
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Timestamp suffix for download filenames. Produces `2026-05-16T13-37-00`
 * (filesystem-safe, sortable).
 */
export function csvTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}
