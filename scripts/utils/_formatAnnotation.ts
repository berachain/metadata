import core from "@actions/core";
import { findNodeAtLocation, parseTree } from "jsonc-parser";

function offsetToLineCol(text: string, offset: number) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
export function formatAnnotation({
  rawContent,
  xPath,
  message,
  file,
  level = "error",
}: {
  rawContent: string;
  xPath: string;
  message: string;
  file: string;
  level?: "error" | "warning";
}): string {
  // Removes the BOM header if present
  const contentWithoutBOM = rawContent.replace(
    /^(\uFEFF|\uFEFF\n|\uFEFF\r\n)/,
    "",
  );
  // Normalizes line endings to '\n'
  const normalizedContent = contentWithoutBOM.replace(/\r\n/g, "\n");

  const tree = parseTree(normalizedContent);
  if (!tree) {
    throw new Error("Failed to parse tree");
  }
  const parts = xPath
    .replace(/^\//, "")
    .split("/")
    .map((p) => (/^\d+$/.test(p) ? +p : p));

  const node = findNodeAtLocation(tree, parts);

  if (node) {
    const { line, col } = offsetToLineCol(normalizedContent, node.offset);

    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      core[level](message, {
        // This is needed to make it work with the checkout action
        file: file.replace(process.argv[2], ""),
        startLine: line,
        startColumn: col,
      });
    } else {
      return `${file}:${line}:${col} ${message}`;
    }
  }

  return message;
}
