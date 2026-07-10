import { toAlgebra12Builder } from '@traqula/algebra-sparql-1-2';
import { translateBasicGraphPattern, translateTerm } from '@traqula/algebra-transformations-1-1';
import type { Algebra, ContextConfigs } from '@traqula/algebra-transformations-1-2';
import { createAlgebraContext } from '@traqula/algebra-transformations-1-2';
import { IndirBuilder } from '@traqula/core';
import type * as T12 from '@traqula/rules-sparql-1-2';

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

const toAlgebraBuilder = IndirBuilder
  .create(toAlgebra12Builder)
  .patchRule(translateBasicGraphPatternWithGraph);

/**
 * Translates a SPARQL Next AST to SPARQL Algebra.
 *
 * Behaves like {@link toAlgebra} from `@traqula/algebra-sparql-1-2`, but additionally
 * supports `GRAPH` blocks inside CONSTRUCT templates: the graph named in the
 * template is used as the graph of the corresponding CONSTRUCT quads.
 */
export function toAlgebra(query: T12.SparqlQuery, options: ContextConfigs = {}): Algebra.Operation {
  const c = createAlgebraContext(options);
  const transformer = toAlgebraBuilder.build();
  return transformer.translateQuery(c, query, options.quads, options.blankToVariable);
}
