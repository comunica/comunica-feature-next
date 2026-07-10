import type { ImplArgs } from '@traqula/core';
import { gram as gram11, lex as l11 } from '@traqula/rules-sparql-1-1';
import type * as T12 from '@traqula/rules-sparql-1-2';

/**
 * Patched `constructTemplate` rule ([[73]](https://www.w3.org/TR/sparql12-query/#rConstructTemplate)).
 *
 * The standard grammar only allows a `TriplesTemplate` inside a CONSTRUCT template.
 * This patch additionally allows `GRAPH` blocks (like the `Quads` rule used by
 * INSERT/DELETE), so a query such as
 * ```sparql
 * CONSTRUCT { ?s ?p ?o . GRAPH ?g { ?s ?p ?o } } WHERE { ... }
 * ```
 * can be parsed.
 *
 * When no `GRAPH` block is present the rule behaves exactly like the original
 * `constructTemplate` (identical AST and source locations). When at least one
 * `GRAPH` block is present, the result keeps the shape of a {@link T12.PatternBgp},
 * but its `triples` array may also contain {@link T12.GraphQuads} nodes for the
 * `GRAPH` blocks. The algebra transformation consumes these to set the `graph`
 * field of the generated CONSTRUCT quads.
 */
export const constructTemplateGraphPatch = {
  name: gram11.constructTemplate.name,
  impl: ({ ACTION, SUBRULE1, SUBRULE2, SUBRULE3, CONSUME, OPTION1, OPTION2, OPTION3, MANY }: ImplArgs) =>
    (C: T12.SparqlContext) => {
      const open = CONSUME(l11.symbols.LCurly);
      // A heterogeneous list of triples-templates (PatternBgp) and GRAPH blocks (GraphQuads).
      const parts: any[] = [];
      let sawGraph = false;

      OPTION1(() => {
        parts.push(SUBRULE1(gram11.triplesTemplate));
      });
      MANY(() => {
        const graphBlock = SUBRULE3(gram11.quadsNotTriples);
        sawGraph = true;
        parts.push(graphBlock);
        OPTION2(() => CONSUME(l11.symbols.dot));
        OPTION3(() => {
          parts.push(SUBRULE2(gram11.triplesTemplate));
        });
      });
      const close = CONSUME(l11.symbols.RCurly);

      return ACTION(() => {
        const F = C.astFactory;
        if (!sawGraph) {
          // No GRAPH blocks: behave exactly like the original constructTemplate rule.
          const bgp = parts[0] ?? F.patternBgp([], F.sourceLocation());
          return F.wrap(bgp, F.sourceLocation(open, close));
        }
        // Flatten plain triples-templates while keeping GRAPH blocks as GraphQuads entries.
        const triples: any[] = [];
        for (const part of parts) {
          if (F.isGraphQuads(part)) {
            triples.push(part);
          } else {
            triples.push(...part.triples);
          }
        }
        return F.wrap(F.patternBgp(triples, F.sourceLocation(...triples)), F.sourceLocation(open, close));
      });
    },
};
