import { LexerBuilder } from '@traqula/core';
import { lex as lex11 } from '@traqula/rules-sparql-1-1';
import { lex as lexAdj } from '@traqula/rules-sparql-1-1-adjust';
import { lex as lex12 } from '@traqula/rules-sparql-1-2';

export const sparqlNextLexerBuilder = LexerBuilder
  .create(lex12.sparql12LexerBuilder)
  .addBefore(lex11.a, lexAdj.BuiltInAdjust);
