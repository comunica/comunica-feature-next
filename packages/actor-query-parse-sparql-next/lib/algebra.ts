import { toAlgebra12Builder } from '@traqula/algebra-sparql-1-2';
import { translateAggregates, translateBasicGraphPattern, translateTerm } from '@traqula/algebra-transformations-1-1';
import type { Algebra, ContextConfigs } from '@traqula/algebra-transformations-1-2';
import { createAlgebraContext } from '@traqula/algebra-transformations-1-2';
import { IndirBuilder } from '@traqula/core';
import type * as T12 from '@traqula/rules-sparql-1-2';
import type { QueryConstruct, SparqlQuery } from './astTypes';

export { toAst } from '@traqula/algebra-sparql-1-2';

/**
 * Patched `translateBasicGraphPattern` that understands `GRAPH` blocks
 * ({@link T12.GraphQuads}) inside a CONSTRUCT template.
 *
 * When a `GRAPH <name> { ... }` block is encountered, its triples are flattened
 * and the given graph name is assigned to the `graph` field of every resulting
 * quad. The regular `translateQuad` step then places these quads (with their
 * graph) into the CONSTRUCT algebra template.
 */
const translateBasicGraphPatternWithGraph = <typeof translateBasicGraphPattern> {
  name: translateBasicGraphPattern.name,
  fun: (impl: Parameters<typeof translateBasicGraphPattern.fun>[0]) =>
    (c: Parameters<ReturnType<typeof translateBasicGraphPattern.fun>>[0], triples: any[], result: any[]): void => {
      const { SUBRULE } = impl;
      const F = c.astFactory;
      for (const triple of triples) {
        if (F.isGraphQuads(triple)) {
          const graph = SUBRULE(translateTerm, triple.graph);
          const inner: any[] = [];
          SUBRULE(translateBasicGraphPattern, triple.triples.triples, inner);
          for (const quad of inner) {
            result.push(Object.assign(quad, { graph }));
          }
        } else {
          // Delegate regular triples/collections to the original implementation.
          translateBasicGraphPattern.fun(impl)(c, [ triple ], result);
        }
      }
    },
};

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
const translateAggregatesQuadTemplate = <typeof translateAggregates> {
  name: translateAggregates.name,
  fun: (impl: Parameters<typeof translateAggregates.fun>[0]) =>
    (
      c: Parameters<ReturnType<typeof translateAggregates.fun>>[0],
      query: Parameters<ReturnType<typeof translateAggregates.fun>>[1],
      res: Parameters<ReturnType<typeof translateAggregates.fun>>[2],
    ): ReturnType<ReturnType<typeof translateAggregates.fun>> => {
      const F = c.astFactory;
      if (F.isQueryConstruct(query)) {
        const template = (<QueryConstruct> <unknown> query).template;
        // Flatten `Quads[]` into a single `PatternBgp`, keeping `GRAPH` blocks inline
        // for `translateBasicGraphPatternWithGraph` to interpret.
        const triples: any[] = [];
        for (const quad of <any[]> template) {
          if (F.isGraphQuads(quad)) {
            triples.push(quad);
          } else {
            triples.push(...quad.triples);
          }
        }
        query = <typeof query> <unknown> { ...query, template: F.patternBgp(triples, F.gen()) };
      }
      return translateAggregates.fun(impl)(c, query, res);
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
