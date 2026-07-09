import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Source } from "./types.js";
import { env } from "../config.js";

const API_TOKEN = env.BRIGHTDATA_API_TOKEN || "";

let clientPromise: Promise<Client | null> | null = null;
let liveUsed = false;

export function brightDataMode(): "live" | "mock" {
  return liveUsed ? "live" : "mock";
}

export interface SearchLogEntry {
  query: string;
  results: number;
  mode: "live" | "mock";
  sources: Source[];
}
let searchLog: SearchLogEntry[] = [];
export function resetSearchLog(): void {
  searchLog = [];
}
export function getSearchLog(): SearchLogEntry[] {
  return searchLog;
}

async function getClient(): Promise<Client | null> {
  if (!API_TOKEN) return null;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@brightdata/mcp"],
        env: {
          ...process.env,
          API_TOKEN,
          PRO_MODE: env.BRIGHTDATA_PRO_MODE,
        } as Record<string, string>,
      });
      const client = new Client({ name: "homelander", version: "1.0.0" });
      await client.connect(transport);
      return client;
    } catch (err) {
      console.error("[brightdata] MCP connect failed, using mock fallback:", err);
      return null;
    }
  })();

  return clientPromise;
}

function textFromToolResult(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

interface SerpItem {
  link?: string;
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
}

function parseSources(raw: string, limit = 5): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  const push = (title?: string, url?: string, snippet?: string) => {
    if (!title || !url || seen.has(url) || sources.length >= limit) return;
    if (/google\.com\/(search|aclk)|gstatic|w3\.org/.test(url)) return;
    seen.add(url);
    sources.push({ title: title.trim(), url: url.trim(), snippet: snippet?.trim() || undefined });
  };

  try {
    const data = JSON.parse(raw);
    const buckets: SerpItem[][] = [data.organic, data.news, data.top_stories, data.results].filter(
      Array.isArray,
    ) as SerpItem[][];
    for (const bucket of buckets) {
      for (const it of bucket) {
        push(it.title, it.link || it.url, it.description || it.snippet);
      }
    }
    if (sources.length) return sources;
  } catch {
  }

  const linkRe = /\[([^\]]{4,160})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(raw)) && sources.length < limit) {
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 240);
    const snippet = after.replace(/[#*>\-\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    push(m[1], m[2], snippet);
  }
  return sources;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

export async function bdSearch(query: string, limit = 5): Promise<Source[]> {
  const client = await getClient();
  if (client) {
    try {
      const res = await withTimeout(
        client.callTool({
          name: "search_engine",
          arguments: { query, engine: "google" },
        }),
        18_000,
      );
      const text = textFromToolResult(res);
      const sources = parseSources(text, limit);
      if (sources.length) {
        liveUsed = true;
        searchLog.push({ query, results: sources.length, mode: "live", sources });
        return sources;
      }
    } catch (err) {
      console.error(`[brightdata] search "${query}" failed:`, err);
    }
  }
  const mock = mockSearch(query, limit);
  searchLog.push({ query, results: mock.length, mode: "mock", sources: mock });
  return mock;
}

export async function bdScrape(url: string): Promise<string> {
  const client = await getClient();
  if (client) {
    try {
      const res = await withTimeout(
        client.callTool({ name: "scrape_as_markdown", arguments: { url } }),
        45_000,
      );
      const text = textFromToolResult(res);
      if (text) {
        liveUsed = true;
        return text;
      }
    } catch (err) {
      console.error(`[brightdata] scrape "${url}" failed:`, err);
    }
  }
  return "";
}

function host(seed: string, base: string): string {
  return `https://${base}/${encodeURIComponent(seed.toLowerCase().replace(/\s+/g, "-")).slice(0, 40)}`;
}

function mockSearch(query: string, limit: number): Source[] {
  const q = query.toLowerCase();
  const pick = (arr: Source[]) => arr.slice(0, limit);

  if (/freight|container|shipping rate|ocean/.test(q)) {
    return pick([
      { title: "Drewry World Container Index holds steady week-on-week", url: host(query, "drewry.co.uk"), snippet: "Composite index at $2,310 per 40ft container; Shanghai–LA lane up 3% on capacity tightening." },
      { title: "Freightos Baltic Index: Transpacific rates edge higher", url: host(query, "freightos.com"), snippet: "Spot rates on the China–US West Coast trade rose amid peak-season front-loading." },
      { title: "Carriers announce GRI for transpacific routes", url: host(query, "joc.com"), snippet: "General Rate Increase of $600/FEU planned as blank sailings tighten available space." },
    ]);
  }
  if (/port|congestion|berth|vessel queue/.test(q)) {
    return pick([
      { title: "LA/Long Beach dwell times tick up as imports rise", url: host(query, "porttechnology.org"), snippet: "Container dwell time climbed to 4.1 days; vessel queue forming offshore." },
      { title: "Pacific Merchant Shipping Assn signals labor uncertainty", url: host(query, "freightwaves.com"), snippet: "Ongoing negotiations raise risk of slowdowns at West Coast terminals." },
    ]);
  }
  if (/oil|crude|brent|wti|natural gas|resin|plastic/.test(q)) {
    return pick([
      { title: "Brent crude rises on supply concerns", url: host(query, "reuters.com"), snippet: "Oil up 4% week-on-week; downstream petrochemical and resin feedstock costs expected to follow." },
      { title: "Polypropylene resin prices firm in Asia", url: host(query, "icis.com"), snippet: "Spot PP resin gained on higher propylene; converters face margin pressure." },
    ]);
  }
  if (/steel|aluminum|copper|metal/.test(q)) {
    return pick([
      { title: "Steel benchmark prices steady amid soft demand", url: host(query, "spglobal.com"), snippet: "HRC prices flat; mills hold output as construction demand cools." },
    ]);
  }
  if (/typhoon|weather|storm|hurricane|flood/.test(q)) {
    return pick([
      { title: "South China Sea typhoon season outlook", url: host(query, "tropicaltidbits.com"), snippet: "Forecasters expect above-average tropical activity; shipping lanes may face periodic disruption." },
      { title: "JMA issues storm advisory near major shipping lanes", url: host(query, "jma.go.jp"), snippet: "Vessels advised to monitor developing systems off the southern coast." },
    ]);
  }
  if (/tariff|trade war|sanction|geopolit|export restriction/.test(q)) {
    return pick([
      { title: "US reviews Section 301 tariffs on Chinese goods", url: host(query, "ustr.gov"), snippet: "Potential adjustments to tariff lines covering consumer and industrial imports under review." },
      { title: "Red Sea diversions continue to lengthen some routes", url: host(query, "lloydslist.com"), snippet: "Carriers maintain Cape of Good Hope routing on select services." },
    ]);
  }
  if (/supplier|manufactur|factory|bankrupt|strike|pmi/.test(q)) {
    return pick([
      { title: "China Caixin manufacturing PMI signals modest expansion", url: host(query, "tradingeconomics.com"), snippet: "PMI at 50.8; new export orders mixed amid uneven global demand." },
      { title: "Guangdong factories report stable order books", url: host(query, "scmp.com"), snippet: "Consumer-goods manufacturers see steady but cautious Q3 outlook." },
    ]);
  }
  return pick([
    { title: `Logistics intelligence: ${query}`, url: host(query, "supplychaindive.com"), snippet: "Latest developments relevant to global supply chains and shipping." },
    { title: `Market brief: ${query}`, url: host(query, "splash247.com"), snippet: "Industry coverage of conditions affecting freight and trade flows." },
  ]);
}
