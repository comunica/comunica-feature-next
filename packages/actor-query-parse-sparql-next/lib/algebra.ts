import { toAlgebra12Builder } from '@traqula/algebra-sparql-1-2';
import type {
  Algebra,
  AlgebraIndir,
  ContextConfigs,
  FlattenedTriple,
} from '@traqula/algebra-transformations-1-2';
import { createAlgebraContext } from '@traqula/algebra-transformations-1-2';
import type { Patch } from '@traqula/core';
import { IndirBuilder } from '@traqula/core';
import type * as T12 from '@traqula/rules-sparql-1-2';
import type { Query, SparqlQuery } from './astTypes';

export { toAst } from '@traqula/algebra-sparql-1-2';

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

const toAlgebraBuilder = IndirBuilder
  .create(toAlgebra12Builder)
  .patchRule(translateBasicGraphPatternWithGraph)
  .patchRule(translateAggregatesQuadTemplate);

/**
 * Translates a SPARQL Next AST to SPARQL Algebra.
 *
 * Behaves like {@link toAlgebra} from `@traqula/algebra-sparql-1-2`, but additionally
 * supports `GRAPH` blocks inside CONSTRUCT templates: the graph named in the
 * template is used as the graph of the corresponding CONSTRUCT quads.
 */
export function toAlgebra(query: SparqlQuery, options: ContextConfigs = {}): Algebra.Operation {
  const c = createAlgebraContext(options);
  const transformer = toAlgebraBuilder.build();
  return transformer.translateQuery(c, <T12.SparqlQuery> <unknown> query, options.quads, options.blankToVariable);
}

// ToAlgebra

const origTranslateGraphPattern = toAlgebra11Builder.getRule('translateGraphPattern');
const origAccumulateGroupGraphPattern = toAlgebra11Builder.getRule('accumulateGroupGraphPattern');
const origInScopeVariables = toAlgebra11Builder.getRule('inScopeVariables');

/**
 * Walk the AST pattern tree to find lateral patterns and collect the variables
 * they introduce. This is needed because `findPatternBoundedVars` in the base
 * SPARQL 1.1 library doesn't know about the custom 'lateral' subType.
 */
function addLateralBoundedVars(op: any, vars: Set<string>): void {
  if (!op || typeof op !== 'object') {
    return;
  }
  if (Array.isArray(op)) {
    for (const item of op) {
      addLateralBoundedVars(item, vars);
    }
    return;
  }
  if (op.type === 'pattern' && op.subType === 'lateral') {
    // Found a lateral pattern – collect variables from its body
    findPatternBoundedVars(op.patterns, vars);
    // Also recurse to discover nested lateral patterns inside this body
    addLateralBoundedVars(op.patterns, vars);
  } else if (op.patterns) {
    // Recurse into other pattern containers (group, union, optional, …)
    addLateralBoundedVars(op.patterns, vars);
  } else if (op.where) {
    // Handle SELECT query objects: the WHERE clause is in op.where, not op.patterns
    addLateralBoundedVars(op.where, vars);
  }
}

export const inScopeVariablesWithLateral: AlgebraIndir<'inScopeVariables', Set<string>, [any]> = {
  name: 'inScopeVariables',
  fun: ($: any) => (C: any, thingy: any): Set<string> => {
    const vars: Set<string> = origInScopeVariables.fun($)(C, thingy);
    addLateralBoundedVars(thingy, vars);
    return vars;
  },
};

export const accumulateGroupGraphPattern: AlgebraIndir<'accumulateGroupGraphPattern', Algebra.Operation | Lateral, [Algebra.Operation, Pattern]> = {
  name: 'accumulateGroupGraphPattern',
  fun: $ => (C, algebraOp, pattern) => {
    // If the subtype is lateral, handle it, otherwise fall though to the original implementation
    if (pattern.subType === 'lateral') {
      return {
        type: 'lateral',
        input: [
          algebraOp,
          $.SUBRULE(origTranslateGraphPattern, C.astFactory.patternGroup(<never[]> pattern.patterns, pattern.loc)),
        ],
      } satisfies Lateral;
    }
    return origAccumulateGroupGraphPattern.fun($)(C, algebraOp, pattern);
  },
};

// FromAlgebra
const origTranslateAlgPatternNew = toAst11Builder.getRule('translatePatternNew');
const origOperationAlgInputAsPatternList = toAst11Builder.getRule('operationInputAsPatternList');

export const translateAlgPatternNewReplace: AstIndir<
  (typeof origTranslateAlgPatternNew)['name'],
  Pattern | Pattern[],
  [Algebra.Operation | Lateral]
> = {
  name: 'translatePatternNew',
  fun: $ => (C, op) => {
    if (op.type === 'lateral') {
      return $.SUBRULE(translateAlgLateral, op);
    }
    return origTranslateAlgPatternNew.fun($)(C, op);
  },
};

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

export type Pattern = T12.Pattern | PatternLateral;
export type PatternLateral = T12.PatternBase & {
  subType: 'lateral';
  patterns: Pattern[];
};

export type Lateral = {
  type: 'lateral';
  input: [Algebra.Operation, Algebra.Operation];
};
