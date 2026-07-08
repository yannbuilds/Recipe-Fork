// Convert stored HTML notes (from the web tiptap editor) to plain text for the
// mobile plain-text notes field, and decode a few common entities.
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/(p|div|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
