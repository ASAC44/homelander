import type { TargetedDoubtKind, TargetedDoubtRoute } from "./types.js";

const TARGET_PATTERNS: Array<{ kind: TargetedDoubtKind; patterns: RegExp[] }> = [
  {
    kind: "tariff",
    patterns: [
      /\b(tariffs?|dut(?:y|ies)|customs?|hs\s*code|hts|section\s*301|landed\s+dut)/i,
    ],
  },
  {
    kind: "port",
    patterns: [
      /\b(port|terminal|berth|dwell|vessel\s+queue|congest(?:ed|ion)|demurrage)\b/i,
    ],
  },
  {
    kind: "freight",
    patterns: [
      /\b(freight|shipping\s+rate|ocean\s+rate|container\s+rate|carrier|capacity|blank\s+sailing|gri)\b/i,
    ],
  },
  {
    kind: "weather",
    patterns: [
      /\b(weather|storm|typhoon|hurricane|cyclone|flood|monsoon|seasonal\s+disruption)\b/i,
    ],
  },
  {
    kind: "supplier",
    patterns: [
      /\b(supplier|factory|manufactur(?:er|ing)|pmi|strike|production|backup\s+supplier)\b/i,
    ],
  },
  {
    kind: "regulatory",
    patterns: [
      /\b(regulat(?:ion|ory)|compliance|documentation|documents?|permit|license|certificate|classification\s+change)\b/i,
    ],
  },
  {
    kind: "geopolitical",
    patterns: [
      /\b(geopolitical|sanction|trade\s+restriction|conflict|red\s+sea|war|export\s+control|trade\s+war)\b/i,
    ],
  },
  {
    kind: "commodity",
    patterns: [
      /\b(commodity|material|raw\s+material|feedstock|resin|steel|aluminum|copper|oil|crude|input\s+cost)\b/i,
    ],
  },
];

export function classifyTargetedDoubt(text: string): TargetedDoubtRoute {
  const cleaned = text.trim();
  if (!cleaned) return { type: "unknown" };

  const lower = cleaned.toLowerCase();
  const looksLikeShipment =
    /\b(ship|shipping|send|move|export|import|from|to)\b/.test(lower) &&
    /\b(kg|kilogram|ton|tons|container|pallet|units?|by\s+\w+)\b/.test(lower);
  if (looksLikeShipment) return { type: "full_analysis" };

  const matches = TARGET_PATTERNS.filter(({ patterns }) => patterns.some((pattern) => pattern.test(cleaned)));
  if (matches.length === 1) return { type: "targeted_doubt", kind: matches[0].kind };

  if (matches.length > 1) {
    const tariff = matches.find((m) => m.kind === "tariff");
    const port = matches.find((m) => m.kind === "port");
    if (tariff && /\b(customs?|dut(?:y|ies)|tariffs?|hs\s*code|hts)\b/i.test(cleaned)) {
      return { type: "targeted_doubt", kind: "tariff" };
    }
    if (port && /\b(port|terminal|dwell|congest(?:ed|ion))\b/i.test(cleaned)) {
      return { type: "targeted_doubt", kind: "port" };
    }
    return { type: "unknown" };
  }

  return { type: "unknown" };
}
