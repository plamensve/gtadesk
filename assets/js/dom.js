/** Shared DOM helpers for client-side modules. */
export const byId = id => document.getElementById(id);

/** Escape untrusted text before interpolating HTML markup. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
