const LATEX_SPECIAL: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "%": "\\%",
  "#": "\\#",
  "_": "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

const UNICODE_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↔/g, "<->"],
  [/—/g, "--"],
  [/–/g, "-"],
  [/−/g, "-"],
  [/•/g, "*"],
  [/…/g, "..."],
  [/“|”/g, "\""],
  [/‘|’/g, "'"],
  [/⚠/g, "!"],
  [/\u00A0/g, " "],
];

export function escapeLatex(text: string): string {
  let result = text.normalize("NFKD");
  for (const [pattern, replacement] of UNICODE_NORMALIZATIONS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/[^\x00-\x7F]/g, "");
  for (const [char, replacement] of Object.entries(LATEX_SPECIAL)) {
    result = result.split(char).join(replacement);
  }
  return result;
}
