import type { Patch } from '@traqula/core';
import type * as T12 from '@traqula/rules-sparql-1-2';

export type SparqlNextNodes =
  | Exclude<T12.Sparql12Nodes, T12.Query>
  | Query
  | PatternLateral;

export type SparqlQuery = Query | T12.Update;

export type Query =
  | Exclude<T12.Query, T12.QueryConstruct>
  | QueryConstruct;

export type QueryConstruct = Patch<T12.QueryConstruct, {
  template: T12.Quads[];
}>;

/**
 * A group graph pattern that additionally allows the SPARQL Next `LATERAL` pattern
 * ({@link PatternLateral}) anywhere a regular SPARQL 1.2 {@link T12.Pattern} may occur.
 */
export type Pattern = T12.Pattern | PatternLateral;

/**
 * AST node for a [`LATERAL`](https://github.com/w3c-cg/sparql-dev/blob/main/SEP/SEP-0006/sep-0006.md)
 * graph pattern: `LATERAL { ... }`. It shares the shape of a group graph pattern, so its
 * `patterns` may in turn contain nested `LATERAL` patterns.
 */
export type PatternLateral = T12.PatternBase & {
  subType: 'lateral';
  patterns: Pattern[];
};
