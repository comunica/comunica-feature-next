import type { ParserBuildArgs, ImplArgs } from '@traqula/core';
import { ParserBuilder } from '@traqula/core';
import { sparql12ParserBuilder } from '@traqula/parser-sparql-1-2';
import { gram as gram11, lex as l } from '@traqula/rules-sparql-1-1';
import { gram as gramAdj } from '@traqula/rules-sparql-1-1-adjust';
import type * as T12 from '@traqula/rules-sparql-1-2';
import type { PatternBgp } from '@traqula/rules-sparql-1-2';
import { gram as gram12, completeParseContext, copyParseContext } from '@traqula/rules-sparql-1-2';
import type { PatternRestrictedGraph } from './astTypes';
import { sparqlNextLexerBuilder } from './lexer';
import type { SparqlGrammarRule12 } from './types';

/**
 * Patch builtInCall to add ADJUST support alongside all SPARQL 1.1 and 1.2 built-ins.
 * Uses OR2 (occurrence 2) to avoid conflicts with SPARQL 1.1's internal OR (occurrence 0).
 * SPARQL 1.2 built-ins are listed explicitly via SUBRULE so Chevrotain can statically
 * analyze their first sets, matching the pattern of the original SPARQL 1.2 builtInCall rule.
 */
const builtInPatch = {
  name: gram12.builtInCall.name,
  impl: ($: ImplArgs) => (c: Parameters<ReturnType<typeof gram12.builtInCall.impl>>[0]) => $.OR3([
    { ALT: () => gram12.builtInCall.impl($)(c) },
    { ALT: () => $.SUBRULE(gramAdj.builtInAdjust) },
  ]),
};

const exportTemplate12 = sparql12ParserBuilder.getRule('constructTemplate');
const constructTriples12 = sparql12ParserBuilder.getRule('constructTriples');
const triplesTemplate12 = sparql12ParserBuilder.getRule('triplesTemplate');
const varOrIri = sparql12ParserBuilder.getRule('varOrIri');
const triplesBlock = sparql12ParserBuilder.getRule('triplesBlock');
/**
 * Similar to
 * [GraphGraphTemplate](https://www.w3.org/TR/sparql12-query/#rGraphGraphPattern)
 * {@link gram11.graphGraphPattern} but contained can only be triplesTemplate or graphGraphTemplate.
 */
export const graphGraphTemplate: SparqlGrammarRule12<'graphGraphTemplate', PatternRestrictedGraph> = <const> {
  name: 'graphGraphTemplate',
  impl: ({ ACTION, SUBRULE, SUBRULE1, SUBRULE2, CONSUME, MANY, OPTION1, OPTION2, OPTION3 }) => (C) => {
    const patterns: (PatternRestrictedGraph | T12.PatternBgp)[] = [];

    const graph = CONSUME(l.graph.graph);
    const name = SUBRULE(varOrIri);

    CONSUME(l.symbols.LCurly);
    const bgpPattern = OPTION1(() => SUBRULE1(triplesBlock));
    if (bgpPattern) {
      patterns.push(bgpPattern);
    }
    MANY(() => {
      const notTriples = SUBRULE(graphGraphTemplate);
      patterns.push(notTriples);

      OPTION2(() => CONSUME(l.symbols.dot));

      const moreTriples = OPTION3(() => SUBRULE2(triplesBlock));
      if (moreTriples) {
        patterns.push(moreTriples);
      }
    });
    const close = CONSUME(l.symbols.RCurly);

    return ACTION(() => ({
      type: 'pattern',
      subType: 'graph',
      name,
      patterns,
      loc: C.astFactory.sourceLocation(graph, close),
    } satisfies PatternRestrictedGraph));
  },
};

// ConstructTremplate -> constructTriples (was = triplesTemnplate)

// ConstructTriples == triplesTemplate
export const constructTriples:
SparqlGrammarRule12<typeof constructTriples12['name'], PatternBgp | PatternRestrictedGraph> = <const> {
  name: 'constructTriples',
  impl: triplesTemplate.impl,
};
export const constructTemplate:
SparqlGrammarRule12<typeof exportTemplate12['name'], T12.BasicGraphPattern | PatternRestrictedGraph> = {
  name: gram11.constructTemplate.name,
  impl: ({ ACTION, SUBRULE1, CONSUME, OPTION }) => (C) => {
    const open = CONSUME(l.symbols.LCurly);
    const triples = OPTION(() => SUBRULE1(constructTriples));
    const close = CONSUME(l.symbols.RCurly);

    return ACTION(() => C.astFactory.wrap(
      triples ?? C.astFactory.patternBgp([], C.astFactory.sourceLocation()),
      C.astFactory.sourceLocation(open, close),
    ));
  },
};

export const sparqlNextParserBuilder = ParserBuilder
  .create(sparql12ParserBuilder)
  .patchRule(gram11.prologue)
  .patchRule(gram12.prologue)
  .addRule(gramAdj.builtInAdjust)
  .patchRule(builtInPatch)
  .patchRule(constructTemplateGraphPatch);

export type FullSparqlNextParser = ReturnType<typeof sparqlNextParserBuilder.build>;

/**
 * Parser that can parse a SPARQL Next string into a SPARQL Next AST.
 */
export class SparqlNextParser {
  private readonly parser: FullSparqlNextParser;
  protected readonly defaultContext: T12.SparqlContext;

  public constructor(
    args: Pick<ParserBuildArgs, 'parserConfig' | 'lexerConfig'> & { defaultContext?: Partial<T12.SparqlContext> } = {},
  ) {
    this.parser = sparqlNextParserBuilder.build({
      ...args,
      tokenVocabulary: sparqlNextLexerBuilder.tokenVocabulary,
    });
    this.defaultContext = completeParseContext(args.defaultContext ?? {});
  }

  /**
   * Parse a query string starting from the
   * [QueryUnit](https://www.w3.org/TR/sparql12-query/#rQueryUnit)
   * or [QueryUpdate](https://www.w3.org/TR/sparql12-query/#rUpdateUnit) rules.
   * @param query
   * @param context
   */
  public parse(query: string, context: Partial<T12.SparqlContext> = {}): T12.SparqlQuery {
    const ast = this.parser.queryOrUpdate(query, copyParseContext({ ...this.defaultContext, ...context }));
    ast.loc = this.defaultContext.astFactory.sourceLocationInlinedSource(query, ast.loc, 0, Number.MAX_SAFE_INTEGER);
    return ast;
  }
}
