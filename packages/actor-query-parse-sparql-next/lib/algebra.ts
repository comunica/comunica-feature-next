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
