import { toAlgebra12Builder, toAst12Builder } from '@traqula/algebra-sparql-1-2';
import type {
  Algebra,
  AlgebraIndir,
  AstIndir,
  ContextConfigs,
  FlattenedTriple,
} from '@traqula/algebra-transformations-1-2';
import { createAlgebraContext, createAstContext } from '@traqula/algebra-transformations-1-2';
import type { Patch } from '@traqula/core';
import { IndirBuilder } from '@traqula/core';
import { findPatternBoundedVars } from '@traqula/rules-sparql-1-1';
import type * as T12 from '@traqula/rules-sparql-1-2';
import type { Pattern, PatternLateral, Query, SparqlQuery } from './astTypes';

const translateBasicGraphPattern = toAlgebra12Builder.getRule('translateBasicGraphPattern');
/**
 * Patched `translateBasicGraphPattern` that understands `GRAPH` blocks
 * ({@link T12.GraphQuads}) inside a CONSTRUCT template.
 *
 * When a `GRAPH <name> { ... }` block is encountered, its triples are flattened
 * and the given graph name is assigned to the `graph` field of every resulting
 * quad. The regular `translateQuad` step then places these quads (with their
 * graph) into the CONSTRUCT algebra template.
 */
const translateBasicGraphPatternWithGraph: AlgebraIndir<
  typeof translateBasicGraphPattern['name'],
void,
[(T12.GraphQuads | T12.BasicGraphPattern[0])[], FlattenedTriple[]]
> = <const> {
  name: translateBasicGraphPattern.name,
  fun: $ => (c, triples, result): void => {
    for (const triple of triples) {
      if (triple.type === 'graph') {
        const graph = $.SUBRULE(translateTerm, triple.graph);
        const inner: FlattenedTriple[] = [];
        $.SUBRULE(translateBasicGraphPatternWithGraph, triple.triples.triples, inner);
        result.push(...inner.map(x => Object.assign(x, { graph })));
      } else {
        // Delegate regular triples/collections to the original implementation.
        translateBasicGraphPattern.fun($)(c, [ triple ], result);
      }
    }
  },
};

const translateAggregates = toAlgebra12Builder.getRule('translateAggregates');
const translateTerm = toAlgebra12Builder.getRule('translateTerm');

/**
 * Patched `translateAggregates` that understands a CONSTRUCT template shaped as a
 * list of {@link T12.Quads} (`CONSTRUCT { QUAD ... { ... } } WHERE { ... }`).
 *
 * The upstream rule expects `query.template` to be a single {@link T12.PatternBgp}
 * and reads `query.template.triples`. The SPARQL Next parser instead produces
 * `query.template` as a `Quads[]` array, mixing plain triple blocks with
 * `GRAPH` blocks ({@link T12.GraphQuads}). This patch flattens that array back
 * into a single `PatternBgp` (keeping `GRAPH` blocks inline, where they are
 * subsequently interpreted by {@link translateBasicGraphPatternWithGraph}) and
 * then delegates to the original implementation for all remaining work.
 */
const translateAggregatesQuadTemplate:
AlgebraIndir<typeof translateAggregates['name'], Algebra.Operation, [Query, Algebra.Operation]> = <const> {
  name: translateAggregates.name,
  fun: $ => (c, query, res) => {
    const { astFactory: F } = c;
    if (query.subType === 'construct') {
      const template = query.template;
      // Flatten `Quads[]` into a single `PatternBgp`, keeping `GRAPH` blocks inline
      // for `translateBasicGraphPatternWithGraph` to interpret.
      const triples: (T12.GraphQuads | T12.BasicGraphPattern[0])[] = [];
      for (const quad of template) {
        if (quad.type === 'graph') {
          triples.push(quad);
        } else {
          triples.push(...quad.triples);
        }
      }
      query = <Query> <unknown> ({
        ...query,
        template: { type: 'pattern', subType: 'bgp', triples, loc: F.sourceLocation() },
      } satisfies Patch<Query, {
        template: Patch<T12.PatternBgp, { triples: (T12.PatternBgp['triples'][0] | T12.GraphQuads)[] }>;
      }>);
    }
    return translateAggregates.fun($)(c, <T12.Query> query, res);
  },
};

// ===========================================================================
// ============================= LATERAL =====================================
// ===========================================================================
// The `LATERAL` operator (SEP-0006) evaluates its right-hand side once for every
// solution of its left-hand side, with those left-hand solutions injected as if
// they were fixed. It has no counterpart in the base SPARQL 1.2 algebra, so we
// introduce a dedicated {@link Lateral} algebra node and teach both the AST→algebra
// and algebra→AST translations about it.

/**
 * Algebra node produced for a SPARQL Next `LATERAL` pattern. `input[0]` is the
 * left-hand side (evaluated first) and `input[1]` is the right-hand side that is
 * (re-)evaluated for each left-hand solution.
 */
export type Lateral = {
  type: 'lateral';
  input: [Algebra.Operation, Algebra.Operation];
};

// ---------------------------------------------------------------------------
// toAlgebra (AST -> Algebra)
// ---------------------------------------------------------------------------

const origTranslateGraphPattern = toAlgebra12Builder.getRule('translateGraphPattern');
const origAccumulateGroupGraphPattern = toAlgebra12Builder.getRule('accumulateGroupGraphPattern');
const origInScopeVariables = toAlgebra12Builder.getRule('inScopeVariables');

/**
 * A structural view of an AST node that is enough to walk the pattern tree
 * looking for `LATERAL` patterns without depending on the concrete AST shape.
 */
interface WalkableAstNode {
  type?: unknown;
  subType?: unknown;
  patterns?: unknown;
  where?: unknown;
}

/**
 * Recursively walk an AST (sub)tree, collect the variables that any `LATERAL`
 * pattern introduces, and add them to `boundedVars`. This is needed because
 * {@link findPatternBoundedVars} from the base SPARQL 1.1 library does not know
 * about the custom `lateral` subType and would otherwise miss variables bound
 * inside a `LATERAL` block (e.g. when expanding `SELECT *`).
 */
function collectLateralBoundedVars(node: unknown, boundedVars: Set<string>): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectLateralBoundedVars(item, boundedVars);
    }
    return;
  }
  const record = <WalkableAstNode> node;
  if (record.type === 'pattern' && record.subType === 'lateral') {
    // A LATERAL pattern: collect the variables bound by its body...
    findPatternBoundedVars(<Parameters<typeof findPatternBoundedVars>[0]> record.patterns, boundedVars);
    // ...and recurse to also discover any nested LATERAL patterns inside it.
    collectLateralBoundedVars(record.patterns, boundedVars);
  } else {
    // Recurse into other pattern containers (group, union, optional, graph, ...) and into
    // query bodies (kept under `where`). Missing fields resolve to `undefined` and stop the walk.
    collectLateralBoundedVars(record.patterns, boundedVars);
    collectLateralBoundedVars(record.where, boundedVars);
  }
}

type InScopeInput = T12.SparqlQuery | T12.TripleNesting | T12.TripleCollection | T12.Path | T12.Term;

/**
 * Patched `inScopeVariables` that additionally accounts for the variables bound
 * inside `LATERAL` patterns, so that wildcard projections (`SELECT *`) covering a
 * `LATERAL` block expose those variables.
 */
export const inScopeVariablesWithLateral: AlgebraIndir<'inScopeVariables', Set<string>, [InScopeInput]> = {
  name: 'inScopeVariables',
  fun: $ => (c, thingy) => {
    const vars = origInScopeVariables.fun($)(c, thingy);
    collectLateralBoundedVars(thingy, vars);
    return vars;
  },
};

/**
 * Patched `accumulateGroupGraphPattern` that turns a `LATERAL` pattern into a
 * {@link Lateral} algebra node whose left input is everything accumulated so far
 * in the enclosing group and whose right input is the translation of the
 * `LATERAL` body. All other patterns are handled by the original implementation.
 */
export const accumulateGroupGraphPattern: AlgebraIndir<
  'accumulateGroupGraphPattern',
  Algebra.Operation | Lateral,
  [Algebra.Operation, Pattern]
> = {
  name: 'accumulateGroupGraphPattern',
  fun: $ => (c, algebraOp, pattern) => {
    if (pattern.subType === 'lateral') {
      return {
        type: 'lateral',
        input: [
          algebraOp,
          $.SUBRULE(
            origTranslateGraphPattern,
            c.astFactory.patternGroup(<Parameters<typeof c.astFactory.patternGroup>[0]> pattern.patterns, pattern.loc),
          ),
        ],
      } satisfies Lateral;
    }
    return origAccumulateGroupGraphPattern.fun($)(c, algebraOp, pattern);
  },
};

// ---------------------------------------------------------------------------
// toAst (Algebra -> AST)
// ---------------------------------------------------------------------------

const origTranslateAlgPatternNew = toAst12Builder.getRule('translatePatternNew');
const origOperationAlgInputAsPatternList = toAst12Builder.getRule('operationInputAsPatternList');

/**
 * Patched `translatePatternNew` that routes {@link Lateral} algebra nodes to
 * {@link translateAlgLateral} and delegates everything else to the original
 * implementation.
 */
export const translateAlgPatternNewReplace: AstIndir<
  (typeof origTranslateAlgPatternNew)['name'],
  Pattern | Pattern[],
  [Algebra.Operation | Lateral]
> = {
  name: 'translatePatternNew',
  fun: $ => (c, op) => {
    if (op.type === 'lateral') {
      return $.SUBRULE(translateAlgLateral, op);
    }
    return origTranslateAlgPatternNew.fun($)(c, op);
  },
};

/**
 * Translate a {@link Lateral} algebra node back into AST: the left input becomes
 * regular pattern(s) and the right input becomes a {@link PatternLateral}.
 */
export const translateAlgLateral: AstIndir<'translateLateral', Pattern[], [Lateral]> = {
  name: 'translateLateral',
  fun: ({ SUBRULE }) => ({ astFactory: F }, op) =>
    [
      SUBRULE(translateAlgPatternNewReplace, op.input[0]),
      {
        type: 'pattern',
        subType: 'lateral',
        patterns: SUBRULE(origOperationAlgInputAsPatternList, op.input[1]),
        loc: F.gen(),
      } satisfies PatternLateral,
    ].flat(),
};

// ---------------------------------------------------------------------------
// Builders and public entry points
// ---------------------------------------------------------------------------

const toAlgebraBuilder = IndirBuilder
  .create(toAlgebra12Builder)
  .patchRule(translateBasicGraphPatternWithGraph)
  .patchRule(translateAggregatesQuadTemplate)
  .patchRule(accumulateGroupGraphPattern)
  .patchRule(inScopeVariablesWithLateral);

const toAstBuilder = IndirBuilder
  .create(toAst12Builder)
  .addRule(translateAlgLateral)
  .patchRule(translateAlgPatternNewReplace);

/**
 * Translates a SPARQL Next AST to SPARQL Algebra.
 *
 * Behaves like `toAlgebra` from `@traqula/algebra-sparql-1-2`, but additionally
 * supports `GRAPH` blocks inside CONSTRUCT templates (the graph named in the
 * template is used as the graph of the corresponding CONSTRUCT quads) and the
 * SPARQL Next `LATERAL` pattern (translated to a {@link Lateral} node).
 */
export function toAlgebra(query: SparqlQuery, options: ContextConfigs = {}): Algebra.Operation {
  const c = createAlgebraContext(options);
  const transformer = toAlgebraBuilder.build();
  return transformer.translateQuery(c, <T12.SparqlQuery> <unknown> query, options.quads, options.blankToVariable);
}

/**
 * Translates SPARQL Algebra back to a SPARQL Next AST.
 *
 * Behaves like `toAst` from `@traqula/algebra-sparql-1-2`, but additionally
 * supports the {@link Lateral} algebra node, regenerating it as a `LATERAL`
 * pattern.
 */
export function toAst(op: Algebra.Operation): SparqlQuery {
  const c = createAstContext();
  const transformer = toAstBuilder.build();
  return <SparqlQuery> <unknown> transformer.algToSparql(c, op);
}
