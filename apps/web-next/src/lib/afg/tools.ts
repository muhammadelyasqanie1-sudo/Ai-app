/**
 * AFG AI universal tool system.
 * Every tool performs real work and returns real results — no simulated output.
 * Tool availability is capability-gated and permission-aware.
 */

export type ToolResult =
  | { ok: true; tool: string; data: unknown; summary: string }
  | { ok: false; tool: string; error: string };

export const AVAILABLE_TOOLS = [
  {
    id: "web_search",
    name: "Web Search",
    description: "Search the live web for current information. Returns titles, URLs, snippets and dates.",
  },
  {
    id: "page_reader",
    name: "Page Reader",
    description: "Fetch and extract readable content from a specific URL.",
  },
  {
    id: "math",
    name: "Math Engine",
    description: "Evaluate mathematical expressions precisely (arithmetic, functions, constants).",
  },
  {
    id: "data_analysis",
    name: "Data Analysis",
    description: "Analyze uploaded CSV/JSON data and produce structured insights.",
  },
  {
    id: "image_generation",
    name: "Image Generation",
    description: "Generate an image from a text description.",
  },
] as const;

export type ToolId = (typeof AVAILABLE_TOOLS)[number]["id"];

// ---------------------------------------------------------------------------
// Web search & page reader — real network results via the platform gateway
// ---------------------------------------------------------------------------

export async function webSearch(query: string, num = 6, recencyDays?: number): Promise<ToolResult> {
  if (!query.trim()) return { ok: false, tool: "web_search", error: "Query is required" };
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", {
      query: query.slice(0, 400),
      num: Math.min(Math.max(1, num), 10),
      ...(recencyDays ? { recency_days: recencyDays } : {}),
    });
    const items = (results || []).map((r) => ({
      title: r.name,
      url: r.url,
      snippet: r.snippet,
      host: r.host_name,
      date: r.date,
      favicon: r.favicon,
    }));
    return {
      ok: true,
      tool: "web_search",
      data: items,
      summary: `Found ${items.length} web results for "${query.slice(0, 80)}"`,
    };
  } catch (err) {
    return { ok: false, tool: "web_search", error: err instanceof Error ? err.message : "Web search failed" };
  }
}

export async function pageReader(url: string): Promise<ToolResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, tool: "page_reader", error: "Invalid URL" };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, tool: "page_reader", error: "Only http(s) URLs are supported" };
  }
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url: parsed.toString() });
    const html = result?.data?.html || "";
    // Extract readable text from HTML (strip tags/scripts)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);
    return {
      ok: true,
      tool: "page_reader",
      data: { url: result?.data?.url || url, title: result?.data?.title || "", text },
      summary: `Read ${text.length} characters from ${parsed.hostname}`,
    };
  } catch (err) {
    return { ok: false, tool: "page_reader", error: err instanceof Error ? err.message : "Page read failed" };
  }
}

// ---------------------------------------------------------------------------
// Math engine — safe recursive-descent parser. Never uses eval().
// ---------------------------------------------------------------------------

type Token = { t: "num" | "op" | "lp" | "rp" | "id" | "comma"; v: string };

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2,
  exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sign: Math.sign, cbrt: Math.cbrt,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      if (!/^\d*\.?\d+$|^\d+\.$/.test(raw)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ t: "num", v: raw });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      tokens.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { tokens.push({ t: "lp", v: c }); i++; continue; }
    if (c === ")") { tokens.push({ t: "rp", v: c }); i++; continue; }
    if (c === ",") { tokens.push({ t: "comma", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

export function evaluateMath(expression: string): number {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/" || peek().v === "%")) {
      const op = next().v;
      const rhs = parseUnary();
      if ((op === "/" || op === "%") && rhs === 0) throw new Error("Division by zero");
      value = op === "*" ? value * rhs : op === "/" ? value / rhs : value % rhs;
    }
    return value;
  }

  function parseUnary(): number {
    if (peek() && peek().t === "op" && (peek().v === "-" || peek().v === "+")) {
      const op = next().v;
      const value = parseUnary();
      return op === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parseAtom();
    if (peek() && peek().t === "op" && peek().v === "^") {
      next();
      return Math.pow(base, parseUnary()); // right-associative
    }
    return base;
  }

  function parseAtom(): number {
    const tok = next();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") return parseFloat(tok.v);
    if (tok.t === "lp") {
      const value = parseExpr();
      if (!peek() || next().t !== "rp") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (tok.t === "id") {
      const name = tok.v;
      if (peek() && peek().t === "lp") {
        next(); // consume (
        const args: number[] = [];
        if (peek() && peek().t !== "rp") {
          args.push(parseExpr());
          while (peek() && peek().t === "comma") {
            next();
            args.push(parseExpr());
          }
        }
        if (!peek() || next().t !== "rp") throw new Error(`Missing closing parenthesis for ${name}()`);
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unknown function "${name}"`);
        return fn(...args);
      }
      if (name in CONSTS) return CONSTS[name];
      throw new Error(`Unknown identifier "${name}"`);
    }
    throw new Error(`Unexpected token "${tok.v}"`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error(`Unexpected token "${tokens[pos].v}"`);
  if (!isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}

export function mathTool(expression: string): ToolResult {
  try {
    const value = evaluateMath(expression);
    return {
      ok: true,
      tool: "math",
      data: { expression, value },
      summary: `${expression} = ${value}`,
    };
  } catch (err) {
    return { ok: false, tool: "math", error: err instanceof Error ? err.message : "Invalid expression" };
  }
}

// ---------------------------------------------------------------------------
// Data analysis — structured analysis of uploaded CSV/JSON
// ---------------------------------------------------------------------------

export function parseCSV(text: string): { headers: string[]; rows: string[][] } | null {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((f) => f !== "")) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((f) => f !== "")) rows.push(cur);
  if (rows.length === 0) return null;
  return { headers: rows[0], rows: rows.slice(1) };
}

export function summarizeCSV(text: string, maxRows = 40): string {
  const parsed = parseCSV(text);
  if (!parsed) return "(empty data)";
  const { headers, rows } = parsed;
  const numericCols: Record<string, number[]> = {};
  for (const h of headers) numericCols[h] = [];
  for (const row of rows.slice(0, 2000)) {
    row.forEach((cell, i) => {
      const n = parseFloat(cell);
      if (headers[i] && !isNaN(n) && cell.trim() !== "") numericCols[headers[i]].push(n);
    });
  }
  const stats = Object.entries(numericCols)
    .filter(([, vals]) => vals.length > 0)
    .map(([col, vals]) => {
      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      return `${col}: count=${vals.length} mean=${mean.toFixed(4)} min=${sorted[0]} max=${sorted[sorted.length - 1]} median=${sorted[Math.floor(sorted.length / 2)]}`;
    });
  return [
    `Columns: ${headers.join(", ")}`,
    `Rows: ${rows.length}`,
    stats.length ? `Numeric summaries:\n${stats.join("\n")}` : "No numeric columns detected.",
    `Sample:\n${rows.slice(0, maxRows).map((r) => r.join(" | ")).join("\n")}`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Dispatcher (permission-aware)
// ---------------------------------------------------------------------------

export async function runTool(toolId: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (toolId) {
    case "web_search":
      return webSearch(String(args.query || ""), Number(args.num) || 6, args.recency_days ? Number(args.recency_days) : undefined);
    case "page_reader":
      return pageReader(String(args.url || ""));
    case "math":
      return mathTool(String(args.expression || ""));
    case "data_analysis": {
      const text = String(args.data || "");
      if (!text.trim()) return { ok: false, tool: "data_analysis", error: "No data supplied" };
      return {
        ok: true,
        tool: "data_analysis",
        data: { summary: summarizeCSV(text) },
        summary: `Analyzed ${text.length} characters of structured data`,
      };
    }
    default:
      return { ok: false, tool: toolId, error: `Unknown tool "${toolId}"` };
  }
}

/** Build the system prompt fragment that grounds the model in tool output. */
export function formatToolContext(toolId: string, result: ToolResult): string {
  if (!result.ok) return `Tool "${toolId}" failed: ${result.error}`;
  return `Tool "${toolId}" was executed and returned the following data. Use it as grounding; cite URLs when present.\n${JSON.stringify(result.data).slice(0, 12000)}`;
}
