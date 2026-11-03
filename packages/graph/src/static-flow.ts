import ts from "typescript";

interface Step { role: "source" | "call" | "sink"; path: string; line: number; label: string; }
export interface StaticFlow { path: string; line: number; summary: string; steps: Step[]; }
type Origin = { path: string; line: number; label: string };
const SOURCE = /\b(?:req|request)\.(?:body|query|params)\b|\b(?:ctx|context)\.(?:request|body|query|params)\b|\bprocess\.argv\b/;
const SINK = /^(?:eval|exec|execSync|fetch|.*\.queryRawUnsafe|.*\$queryRaw|.*\.execute|axios\.(?:get|post|put|patch|delete))$/;

/** Bounded syntactic trace. No alias, runtime, branch-feasibility or sanitiser proof. */
export function traceJavaScriptFlows(files: Map<string, string>): StaticFlow[] {
  const flows: StaticFlow[] = [];
  for (const [path, content] of files) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    const declarations = new Map<string, ts.FunctionLikeDeclaration>();
    const names = new Set<string>();
    const index = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (names.has(node.name.text)) declarations.delete(node.name.text);
        else declarations.set(node.name.text, node);
        names.add(node.name.text);
      }
      ts.forEachChild(node, index);
    };
    index(file);
    const location = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const originOf = (node: ts.Node, values: Map<string, Origin>): Origin | undefined => {
      if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return undefined;
      if (ts.isIdentifier(node)) return values.get(node.text);
      // Do not propagate argument taint through an arbitrary function's return value.
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) return undefined;
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && SOURCE.test(node.getText(file))) {
        return {path, line: location(node), label: "Request or process input"};
      }
      let result: Origin | undefined;
      ts.forEachChild(node, child => { result ??= originOf(child, values); });
      return result;
    };
    const emit = (source: Origin, node: ts.Node, name: string, via: Step[]) => {
      if (flows.length >= 200) return;
      const line = location(node);
      const steps: Step[] = [{role: "source", ...source}, ...via, {role: "sink", path, line, label: name}];
      if (flows.some(f => f.path === path && f.line === line && f.steps[0]?.line === source.line)) return;
      const functionAt = (lineNumber: number) => [...declarations.entries()].find(([, declaration]) => location(declaration) <= lineNumber && file.getLineAndCharacterOfPosition(declaration.end).line + 1 >= lineNumber)?.[0] ?? "function";
      flows.push({path, line, summary: `Static candidate: input in ${functionAt(source.line)} is passed to ${functionAt(line)} (${name}); runtime reachability and controls need review.`, steps});
    };
    const inspect = (body: ts.Node, values: Map<string, Origin>, via: Step[], depth: number): void => {
      if (depth > 3) return;
      const walk = (node: ts.Node, state: Map<string, Origin>): void => {
        if (ts.isFunctionLike(node) && node !== body) return;
        if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isTryStatement(node) || ts.isIterationStatement(node, false)) {
          // Branches get independent scopes. Their effects are not promoted to straight-line proof.
          ts.forEachChild(node, child => walk(child, new Map(state)));
          state.clear();
          return;
        }
        if (ts.isBlock(node) && node !== body) {
          ts.forEachChild(node, child => walk(child, new Map(state)));
          return;
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const origin = node.initializer ? originOf(node.initializer, state) : undefined;
          state.delete(node.name.text);
          if (origin) state.set(node.name.text, origin);
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const origin = originOf(node.right, state);
          if (ts.isIdentifier(node.left)) {
            state.delete(node.left.text);
            if (origin) state.set(node.left.text, origin);
          } else if (/\.(?:innerHTML|outerHTML)$/.test(node.left.getText(file)) && origin) emit(origin, node, "HTML assignment", via);
        }
        if (ts.isCallExpression(node)) {
          const name = node.expression.getText(file);
          const origins = node.arguments.map(arg => originOf(arg, state));
          const first = origins.find(Boolean);
          if (first && SINK.test(name)) emit(first, node, name, via);
          // Resolve only unique, same-file function declarations with passed arguments.
          const target = ts.isIdentifier(node.expression) ? declarations.get(name) : undefined;
          if (target?.body && first) {
            const parameters = new Map<string, Origin>();
            target.parameters.forEach((parameter, i) => {
              if (ts.isIdentifier(parameter.name) && origins[i]) parameters.set(parameter.name.text, origins[i]!);
            });
            inspect(target.body, parameters, [...via, {role: "call", path, line: location(node), label: `Argument passed to ${name}`}], depth + 1);
          }
        }
        ts.forEachChild(node, child => walk(child, state));
      };
      walk(body, new Map(values));
    };
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node) && "body" in node && node.body) inspect(node.body, new Map(), [], 0);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return flows;
}
