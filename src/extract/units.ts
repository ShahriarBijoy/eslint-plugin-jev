import type { SourceCode, AST } from "eslint";
import type * as ESTree from "estree";
import type { FunctionUnit, ThrowSite, Loc } from "../types.js";
import { tagLines, estimateTokens } from "./tag.js";

type Fn = ESTree.FunctionDeclaration | ESTree.FunctionExpression | ESTree.ArrowFunctionExpression;
type Named = { node: Fn; name: string; kind: FunctionUnit["kind"]; nameNode: ESTree.Node; commentAnchor: ESTree.Node };

export interface ExtractResult { units: FunctionUnit[]; skipped: Array<{ name: string; loc: Loc; estimatedTokens: number }> }

export function extractUnits(sourceCode: SourceCode, opts: { maxFunctionTokens: number }): ExtractResult {
  const found: Named[] = [];
  walk(sourceCode.ast as unknown as ESTree.Node, null, found);
  const units: FunctionUnit[] = [];
  const skipped: ExtractResult["skipped"] = [];
  found.forEach((n, i) => {
    const unit = toUnit(sourceCode, n, `f${units.length}`);
    if (unit.estimatedTokens > opts.maxFunctionTokens) {
      skipped.push({ name: unit.name, loc: unit.nameLoc, estimatedTokens: unit.estimatedTokens });
    } else {
      units.push(unit);
    }
  });
  return { units, skipped };
}

function walk(node: ESTree.Node | null | undefined, parent: ESTree.Node | null, out: Named[]): void {
  if (!node || typeof node !== "object") return;
  const named = nameFor(node, parent);
  if (named) out.push(named);
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) value.forEach((v) => walk(v as ESTree.Node, node, out));
    else if (value && typeof value === "object" && "type" in (value as object)) walk(value as ESTree.Node, node, out);
  }
}

function nameFor(node: ESTree.Node, parent: ESTree.Node | null): Named | null {
  if (node.type === "FunctionDeclaration") {
    const name = node.id?.name ?? "default";
    const anchor = parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportDefaultDeclaration" ? parent : node;
    return { node, name, kind: "declaration", nameNode: node.id ?? node, commentAnchor: anchor };
  }
  if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
      const decl = (parent as unknown as { parent?: ESTree.Node }).parent;
      const anchor = decl?.type === "VariableDeclaration" ? ((decl as unknown as { parent?: ESTree.Node }).parent?.type === "ExportNamedDeclaration" ? (decl as unknown as { parent: ESTree.Node }).parent : decl) : parent;
      return { node, name: parent.id.name, kind: node.type === "ArrowFunctionExpression" ? "arrow" : "expression", nameNode: parent.id, commentAnchor: anchor };
    }
    if (parent?.type === "MethodDefinition" && parent.key.type === "Identifier") {
      const cls = (parent as unknown as { parent?: { parent?: ESTree.Node } }).parent?.parent as ESTree.ClassDeclaration | undefined;
      const className = cls && cls.type === "ClassDeclaration" && cls.id ? cls.id.name : "";
      return { node, name: className ? `${className}.${parent.key.name}` : parent.key.name, kind: "method", nameNode: parent.key, commentAnchor: parent };
    }
    if (parent?.type === "Property" && parent.key.type === "Identifier" && parent.value === node) {
      return { node, name: parent.key.name, kind: node.type === "ArrowFunctionExpression" ? "arrow" : "expression", nameNode: parent.key, commentAnchor: parent };
    }
    if (parent?.type === "ExportDefaultDeclaration") {
      return { node, name: node.type === "FunctionExpression" && node.id ? node.id.name : "default", kind: "expression", nameNode: node, commentAnchor: parent };
    }
  }
  return null;
}

function toUnit(sourceCode: SourceCode, n: Named, id: string): FunctionUnit {
  const body = n.node.body;
  const bodyText = body.type === "BlockStatement"
    ? sourceCode.getText(body as unknown as AST.Program).slice(1, -1).replace(/^\s*\n/, "").replace(/\n\s*$/, "")
    : sourceCode.getText(body as unknown as AST.Program);
  const bodyStartLine = body.type === "BlockStatement" ? body.loc!.start.line + (sourceCode.getText(body as unknown as AST.Program).match(/^\{\s*\n/) ? 1 : 0) : body.loc!.start.line;
  const full = sourceCode.getText(n.node as unknown as AST.Program);
  const signature = full.slice(0, full.indexOf(sourceCode.getText(body as unknown as AST.Program))).trim().replace(/\s+/g, " ");
  const comments = sourceCode.getCommentsBefore(n.commentAnchor as unknown as ESTree.Node);
  const commentText = comments.length ? comments.map((c) => c.value).join("\n") : undefined;
  const comment = commentText ? cleanComment(commentText) : undefined;
  const commentLoc = comments.length ? { start: comments[0].loc!.start, end: comments[comments.length - 1].loc!.end } : undefined;
  const throws = collectThrows(sourceCode, n.node, id);
  const rawBody = dedent(bodyText);
  const unit: FunctionUnit = {
    id, name: n.name, kind: n.kind,
    nameLoc: n.nameNode.loc as Loc, commentLoc, bodyStartLine,
    signature, comment, body: tagLines(rawBody), rawBody, throws,
    estimatedTokens: 0,
  };
  unit.estimatedTokens = estimateTokens(unit.signature + (unit.comment ?? "") + unit.body);
  return unit;
}

function cleanComment(text: string): string {
  return text.split("\n").map((l) => l.replace(/^\s*\*+\s?/, "").trim()).filter(Boolean).join(" ").trim();
}

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

function collectThrows(sourceCode: SourceCode, fn: Fn, unitId: string): ThrowSite[] {
  const out: ThrowSite[] = [];
  let i = 0;
  const visit = (node: ESTree.Node | null | undefined): void => {
    if (!node || typeof node !== "object") return;
    if (node !== fn && (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression")) return;
    const arg = node.type === "ThrowStatement" ? node.argument
      : node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "reject" ? node.arguments[0]
      : null;
    if (arg && arg.type === "NewExpression" && arg.arguments[0]) {
      const msg = staticText(arg.arguments[0] as ESTree.Node);
      if (msg !== null) out.push({ id: `${unitId}.t${i++}`, message: msg, line: arg.loc!.start.line, loc: arg.arguments[0].loc as Loc });
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) v.forEach((c) => visit(c as ESTree.Node));
      else if (v && typeof v === "object" && "type" in (v as object)) visit(v as ESTree.Node);
    }
  };
  visit(fn.body as ESTree.Node);
  return out;
}

function staticText(node: ESTree.Node): string | null {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") {
    let s = "";
    node.quasis.forEach((q, idx) => {
      s += q.value.cooked ?? q.value.raw;
      const expr = node.expressions[idx];
      if (expr) s += "${" + exprText(expr) + "}";
    });
    return s;
  }
  return null;
}

function exprText(e: ESTree.Node): string {
  if (e.type === "Identifier") return e.name;
  if (e.type === "MemberExpression" && e.property.type === "Identifier") return `${exprText(e.object)}.${e.property.name}`;
  if (e.type === "UnaryExpression") return `${e.operator} ${exprText(e.argument)}`;
  return "…";
}
