import type { ParserBuildArgs, ImplArgs } from '@traqula/core';
import { GeneratorBuilder, ParserBuilder } from '@traqula/core';
import { sparql12ParserBuilder } from '@traqula/parser-sparql-1-2';
import { gram as gram11, lex as l } from '@traqula/rules-sparql-1-1';
import { gram as gramAdj } from '@traqula/rules-sparql-1-1-adjust';
import type * as T12 from '@traqula/rules-sparql-1-2';
import { gram as gram12, completeParseContext, copyParseContext } from '@traqula/rules-sparql-1-2';
import type { Query, QueryConstruct, SparqlQuery } from './astTypes';
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

const constructQuery12 = sparql12ParserBuilder.getRule('constructQuery');
const quadPattern = sparql12ParserBuilder.getRule('quadPattern');
const datasetClauseStar = sparql12ParserBuilder.getRule('datasetClauses');
const whereClause = sparql12ParserBuilder.getRule('whereClause');
const solutionModifier = sparql12ParserBuilder.getRule('solutionModifier');

// The constructQuery rule can just call QuadPattern directly. (already contained within `{ ... }`).
// ConstructTemplate -> constructTriples (was = triplesTemplate)

/**
 * [[12]](https://www.w3.org/TR/sparql12-query/#rConstructQuery)
 * like this, graphs operations cannot be nested. This may or may not be an issue?
 * It is in line with what update queries do...
 */
export const constructQuery:
SparqlGrammarRule12<typeof constructQuery12['name'], Omit<QueryConstruct, gram11.HandledByBase>> = <const> {
  name: 'constructQuery',
  impl: ({ ACTION, SUBRULE1, SUBRULE2, CONSUME, OR }) => (C) => {
    const construct = CONSUME(l.construct);
    return OR<Omit<QueryConstruct, gram11.HandledByBase>>([
      { ALT: () => {
        const template = SUBRULE1(quadPattern);
        const from = SUBRULE1(datasetClauseStar);
        const where = SUBRULE1(whereClause);
        const modifiers = SUBRULE1(solutionModifier);
        return ACTION(() => ({
          subType: 'construct',
          template: template.val,
          datasets: from,
          where: where.val,
          solutionModifiers: modifiers,
          loc: C.astFactory.sourceLocation(
            construct,
            where,
            modifiers.group,
            modifiers.having,
            modifiers.order,
            modifiers.limitOffset,
          ),
        } satisfies Omit<QueryConstruct, gram11.HandledByBase>));
      } },
      { ALT: () => {
        const from = SUBRULE2(datasetClauseStar);
        CONSUME(l.where);
        const template = SUBRULE2(quadPattern);
        const modifiers = SUBRULE2(solutionModifier);

        return ACTION(() => ({
          subType: 'construct',
          template: template.val,
          datasets: from,
          where: C.astFactory.patternGroup(<Parameters<typeof C.astFactory.patternGroup>[0]> template.val.map((x) => {
            if (x.type === 'pattern') {
              return x;
            }
            return {
              type: 'pattern',
              subType: 'graph',
              name: x.graph,
              patterns: [ x.triples ],
              loc: x.loc,
            } satisfies T12.PatternGraph;
          }), C.astFactory.sourceLocation()),
          solutionModifiers: modifiers,
          loc: C.astFactory.sourceLocation(
            construct,
            template,
            modifiers.group,
            modifiers.having,
            modifiers.order,
            modifiers.limitOffset,
          ),
        }));
      } },
    ]);
  },
};

const origGraphPatternNotTriplesParserRule = sparql12ParserBuilder
  .getRule('graphPatternNotTriples');
const origGraphPatternNotTriplesGeneratorRule = sparql12GeneratorBuilder
  .getRule('graphPatternNotTriples');
const origGroupGraphPatternParserRule = sparql12ParserBuilder
  .getRule('groupGraphPattern');
const origGroupGraphPatternGeneratorRule = sparql12GeneratorBuilder
  .getRule('groupGraphPattern');

export const graphPatternNotTriples: T11.SparqlRule<
  typeof origGraphPatternNotTriplesParserRule['name'],
  RuleDefReturn<typeof origGraphPatternNotTriplesParserRule> | PatternLateral
> = {
  name: 'graphPatternNotTriples',
  impl: $ => C => $.OR2<RuleDefReturn<typeof graphPatternNotTriples>>([
    { ALT: () => $.SUBRULE(lateralGraphPattern) },
    { ALT: () => origGraphPatternNotTriplesParserRule.impl($)(C) },
  ]),
  gImpl: $ => (ast, C) => {
    if (ast.subType === 'lateral') {
      $.SUBRULE(lateralGraphPattern, ast);
    } else {
      origGraphPatternNotTriplesGeneratorRule.gImpl($)(ast, C);
    }
  },
};

export const lateralGraphPattern: T11.SparqlRule<'lateralGraphPattern', PatternLateral> = {
  name: 'lateralGraphPattern',
  impl: ({ CONSUME, SUBRULE, ACTION }) => (C) => {
    const token = CONSUME(lateral);
    const group = SUBRULE(origGroupGraphPatternParserRule);
    return ACTION(() => ({
      type: 'pattern',
      subType: 'lateral',
      patterns: group.patterns,
      loc: C.astFactory.sourceLocation(token, group),
    } satisfies PatternLateral));
  },
  gImpl: ({ SUBRULE, PRINT_WORD }) => (ast, { astFactory: F }) => {
    F.printFilter(ast, () => PRINT_WORD('LATERAL'));
    SUBRULE(origGroupGraphPatternGeneratorRule, F.patternGroup(<T11.Pattern[]> ast.patterns, ast.loc));
  },
};

export const sparqlNextParserBuilder = ParserBuilder
  .create(sparql12ParserBuilder)
  .typePatch<{
    queryOrUpdate: [SparqlQuery];
    query: [Query];
  }>()
  .patchRule(gram11.prologue)
  .patchRule(gram12.prologue)
  .addRule(gramAdj.builtInAdjust)
  .patchRule(builtInPatch)
  .deleteRule('constructTriples')
  .deleteRule('constructTemplate')
  .patchRule(constructQuery)
  .addRule(lateralGraphPattern)
  .patchRule(graphPatternNotTriples);

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
  public parse(query: string, context: Partial<T12.SparqlContext> = {}): SparqlQuery {
    const ast = this.parser.queryOrUpdate(query, copyParseContext({ ...this.defaultContext, ...context }));
    ast.loc = this.defaultContext.astFactory.sourceLocationInlinedSource(query, ast.loc, 0, Number.MAX_SAFE_INTEGER);
    return ast;
  }
}

export const lateralGeneratorBuilder = GeneratorBuilder.create(sparql12GeneratorBuilder)
  .addRule(lateralGraphPattern)
  .patchRule(graphPatternNotTriples);
