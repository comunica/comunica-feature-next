/**
 * We redefine our algebra components to use interfaces instead of type unions.
 * Thereby opening up the algebra for unknown extensions
 */

import type { Algebra } from '@comunica/utils-algebra';
import type { TypesNext } from './TypesNext';

// Redefinitions of types
export type KnownNextOperation = Algebra.KnownOperation | Lateral;
export type KnownNextExpression = Algebra.KnownExpression;
export type KnownNextPropertyPathSymbol = Algebra.KnownPropertyPathSymbol;
export type KnownNextUpdate = Algebra.KnownUpdate;

export type TypedKnownOperation<T extends Algebra.Types> = Extract<KnownNextOperation, { type: T }>;
export type TypedKnownExpression<T extends Algebra.ExpressionTypes> = Extract<KnownNextOperation, { subType: T }>;

export type Lateral = {
  type: TypesNext.LATERAL;
  input: [Algebra.Operation, Algebra.Operation];
};
