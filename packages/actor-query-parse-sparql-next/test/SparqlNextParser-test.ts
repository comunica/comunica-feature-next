import fs from 'node:fs';
import path from 'node:path';
import type { BaseQuad } from '@rdfjs/types';
import { AstFactory, lex as l12 } from '@traqula/rules-sparql-1-2';
import { positiveTest, importSparql11NoteTests, negativeTest, getStaticFilePath } from '@traqula/test-utils';
import { DataFactory } from 'rdf-data-factory';
import { SparqlNextParser, sparqlNextParserBuilder, toAlgebra, toAst } from '../lib';

describe('a SPARQL 1.2 parser', () => {
  const astFactory = new AstFactory({ tracksSourceLocation: false });
  const sourceTrackingAstFactory = new AstFactory();
  const sourceTrackingParser = new SparqlNextParser({
    defaultContext: { astFactory: sourceTrackingAstFactory },
    lexerConfig: { positionTracking: 'full' },
  });
  const noSourceTrackingParser = new SparqlNextParser({ defaultContext: { astFactory }});
  const context = { prefixes: { ex: 'http://example.org/' }};

  beforeEach(() => {
    astFactory.resetBlankNodeCounter();
    sourceTrackingAstFactory.resetBlankNodeCounter();
  });

  function _sinkAst(suite: string, test: string, response: object): void {
    const dir = getStaticFilePath();
    const fileLoc = path.join(dir, 'ast', 'ast-source-tracked', suite, `${test}.json`);

    fs.writeFileSync(fileLoc, JSON.stringify(response, null, 2));
  }

  it('passes chevrotain validation', () => {
    sparqlNextParserBuilder.build({
      tokenVocabulary: l12.sparql12LexerBuilder.tokenVocabulary,
      lexerConfig: {
        skipValidations: false,
        ensureOptimizations: true,
      },
      parserConfig: {
        skipValidations: false,
      },
    });
  });

  describe('positive sparql 1.1', () => {
    it.each([ ...positiveTest('sparql-1-1') ])('can parse $name', async({ statics }) => {
      const { query, astWithSource } = await statics();
      const astNoSource = astFactory.forcedAutoGenTree(<object> astWithSource);
      const res: unknown = sourceTrackingParser.parse(query, context);
      expect(res)
        .toEqualParsedQueryIgnoring(obj => astFactory.isTriple(obj), [ 'annotations' ], astWithSource);
      const resNoSource = noSourceTrackingParser.parse(query, context);
      expect(resNoSource)
        .toEqualParsedQueryIgnoring(obj => astFactory.isTriple(obj), [ 'annotations' ], astNoSource);
    });
  });

  describe('negative SPARQL 1.1', () => {
    it.each([ ...negativeTest('sparql-1-1-invalid') ])('should NOT parse $name', async({ statics }) => {
      const { query } = await statics();
      expect(() => sourceTrackingParser.parse(query, context)).toThrow(/./u);
      expect(() => noSourceTrackingParser.parse(query, context)).toThrow(/./u);
    });
  });

  describe('positive sparql 1.2', () => {
    it.each([ ...positiveTest('sparql-1-2') ])('can parse $name', async({ statics }) => {
      const { query, astWithSource } = await statics();
      const astNoSource = astFactory.forcedAutoGenTree(<object> astWithSource);
      const res: unknown = sourceTrackingParser.parse(query, context);
      // _sinkAst('sparql-1-2', name, <object> res);
      expect(res).toEqualParsedQuery(astWithSource);
      const resNoSource = noSourceTrackingParser.parse(query, context);
      expect(resNoSource)
        .toEqualParsedQuery(astNoSource);
    });
  });

  describe('negative sparql 1.2', () => {
    const skip = new Set([
      'sparql-1-2-syntax-compound-tripleterm-subject',
      'sparql-1-2-syntax-subject-tripleterm',
    ]);
    const negTests = negativeTest('sparql-1-2-invalid', name => !skip.has(name));
    it.each([ ...negTests ])('should NOT parse $name', async({ statics }) => {
      const { query } = await statics();
      expect(() => sourceTrackingParser.parse(query, context)).toThrow(/./u);
      expect(() => noSourceTrackingParser.parse(query, context)).toThrow(/./u);
    });
  });

  describe('specific sparql 1.1 with source tracking', () => {
    importSparql11NoteTests(sourceTrackingParser, new DataFactory<BaseQuad>());
  });

  describe('specific sparql 1.1 without source tracking', () => {
    importSparql11NoteTests(noSourceTrackingParser, new DataFactory<BaseQuad>());
  });

  it('can be instantiated without arguments', () => {
    const parser = new SparqlNextParser();
    expect(parser.parse('SELECT * WHERE { ?s ?p ?o }')).toBeDefined();
  });

  it('can convert algebra back to AST via toAst', () => {
    const parser = new SparqlNextParser();
    const parsed = parser.parse('SELECT * WHERE { ?s ?p ?o }');
    const algebra = toAlgebra(parsed);
    expect(toAst(algebra)).toBeDefined();
  });
});
