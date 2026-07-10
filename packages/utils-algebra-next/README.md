# Comunica Algebra Next

[![npm version](https://badge.fury.io/js/%40comunica%2Futils-algebra-next.svg)](https://www.npmjs.com/package/@comunica/utils-algebra-next)

Extends the algebra used by Comunica with next-generation operations such as `Lateral` joins.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/utils-algebra-next
```

## Exposed

* `Algebra`: Extended algebra types, including `Lateral`, `KnownNextOperation`, `KnownNextExpression`, `KnownNextPropertyPathSymbol`, and `KnownNextUpdate`.
* `AlgebraFactory`: An extended factory to create both standard and next-generation algebra operations (e.g. `createLateral()`).
* `TypesNext`: An enum of algebra operation types introduced by Comunica Next (currently `LATERAL`).

## Additional info

This package extends [`@comunica/utils-algebra`](https://www.npmjs.com/package/@comunica/utils-algebra) with algebra operations that are defined by Comunica Next.

### Lateral joins

The `Lateral` operation represents a [lateral join](https://github.com/w3c-cg/sparql-dev/blob/main/SEP/SEP-0006/sep-0006.md)
where the right-hand side pattern can reference variables bound by the left-hand side.
It takes two `Operation` inputs and is identified by the type `TypesNext.LATERAL` (`'lateral'`).

A `Lateral` operation can be created via `AlgebraFactory`:

```ts
import { AlgebraFactory } from '@comunica/utils-algebra-next';

const factory = new AlgebraFactory();
const lateral = factory.createLateral(leftPattern, rightPattern);
```

The `KnownNextOperation` type union extends `Algebra.KnownOperation` with the new operations defined in this package,
allowing type-safe handling of both base and next-generation operations throughout Comunica.
