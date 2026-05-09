// src/utils/helpers.ts

/**
 * Generate a unique ticket ID in format TK-YYYYMMDD-XXX
 */
export function generateTicketId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Date.now()).slice(-3);
  return `TK-${date}-${seq}`;
}

/**
 * Normalize department name from various aliases
 */
export function normalizeDepartment(input: string): string {
  const deptMap: Record<string, string> = {
    ristek: "Ristek",
    tech: "Ristek",
    it: "Ristek",
    teknologi: "Ristek",
    design: "Design",
    ui: "Design",
    ux: "Design",
    product: "Product",
    pm: "Product",
    marketing: "Marketing",
    promo: "Marketing",
    hr: "HR",
    human: "HR",
    finance: "Finance",
    keuangan: "Finance",
  };

  return deptMap[input.toLowerCase()] || input;
}

/**
 * Safely parse JSON from a string that might contain extra text
 */
export function extractJSON(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Extract Notion page URL from MCP response content
 */
export function extractNotionUrl(content: string): string {
  const urlMatch = content.match(/https:\/\/www\.notion\.so\/[^\s"<>]+/);
  return urlMatch ? urlMatch[0] : "";
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a date to YYYY-MM-DD
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}
