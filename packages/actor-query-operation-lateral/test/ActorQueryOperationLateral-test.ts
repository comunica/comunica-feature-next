import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext, IQueryOperationResultBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { getSafeBindings } from '@comunica/utils-query-operation';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import type { Lateral } from '../lib/ActorQueryOperationLateral';
import { ActorQueryOperationLateral, lateralDisableKey } from '../lib/ActorQueryOperationLateral';
import '@comunica/utils-jest';
import 'jest-rdf';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('ActorQueryOperationLateral', () => {
  let context: IActionContext;
  let bus: any;
  let mediatorQueryOperation: any;
  let op3: () => any;
  let op2: () => any;
  let op2Undef: () => any;

  beforeEach(() => {
    context = new ActionContext().set(KeysInitQuery.dataFactory, DF);
    bus = new Bus({ name: 'bus' });
    mediatorQueryOperation = {
      async mediate(arg: any) {
        if (arg.operation.type === 'boolean') {
          return {
            type: 'boolean',
          };
        }
        return {
          bindingsStream: arg.operation.stream,
          metadata: arg.operation.metadata,
          type: 'bindings',
          variables: arg.operation.variables,
        };
      },
    };
    op3 = () => ({
      metadata: () => Promise.resolve({
        state: new MetadataValidationState(),
        cardinality: { type: 'estimate', value: 3 },

        variables: [{ variable: DF.variable('a'), canBeUndef: false }],
      }),
      stream: new ArrayIterator([
        BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('3') ]]),
      ], { autoStart: false }),
      type: 'bindings',
    });
    op2 = () => ({
      metadata: () => Promise.resolve({
        state: new MetadataValidationState(),
        cardinality: { type: 'estimate', value: 2 },

        variables: [{ variable: DF.variable('b'), canBeUndef: false }],
      }),
      stream: new ArrayIterator([
        BF.bindings([[ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('b'), DF.literal('2') ]]),
      ], { autoStart: false }),
      type: 'bindings',
    });
    op2Undef = () => ({
      metadata: () => Promise.resolve({
        state: new MetadataValidationState(),
        cardinality: { type: 'estimate', value: 2 },
        variables: [{ variable: DF.variable('b'), canBeUndef: true }],
      }),
      stream: new ArrayIterator([
        BF.bindings([[ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('b'), DF.literal('2') ]]),
      ], { autoStart: false }),
      type: 'bindings',
    });
  });

  describe('The ActorQueryOperationLateral module', () => {
    it('should be a function', () => {
      expect(ActorQueryOperationLateral).toBeInstanceOf(Function);
    });

    it('should be an ActorQueryOperationLateral constructor', () => {
      expect(new (<any> ActorQueryOperationLateral)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperationLateral);
      expect(new (<any> ActorQueryOperationLateral)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperation);
    });

    it('should not be able to create new ActorQueryOperationLateral objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryOperationLateral)();
      }).toThrow(`Class constructor ActorQueryOperationLateral cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQueryOperationLateral instance', () => {
    let actor: ActorQueryOperationLateral;

    beforeEach(() => {
      actor = new ActorQueryOperationLateral(
        { name: 'actor', bus, mediatorQueryOperation },
      );
    });

    it('should test on lateral', async() => {
      const input = [ op3(), op2() ];
      await expect(actor.test(<any> {
        operation: { type: 'lateral', input },
        context,
      })).resolves.toPassTestVoid();
      for (const op of input) {
        op.stream.destroy();
      }
    });

    it('should not test when the actor is disabled via the context', async() => {
      const input = [ op3(), op2() ];
      await expect(actor.test(<any> {
        operation: { type: 'lateral', input },
        context: context.set(lateralDisableKey, true),
      })).resolves.toFailTest('');
      for (const op of input) {
        op.stream.destroy();
      }
    });

    it('should not test on non-lateral', async() => {
      const input = [ op3(), op2() ];
      await expect(actor.test(<any> {
        operation: { type: 'some-other-type', input },
        context,
      })).resolves.toFailTest(`Actor actor only supports lateral operations, but got some-other-type`);
      for (const op of input) {
        op.stream.destroy();
      }
    });

    it('should run on two bindings streams performing a lateral join', async() => {
      const op: { operation: Lateral; context: IActionContext } = {
        operation: { type: 'lateral', input: [ op3(), op2() ]},
        context,
      };
      const output = getSafeBindings(await actor.run(op, undefined));
      await expect(output.metadata()).resolves.toMatchObject({
        cardinality: { type: 'estimate', value: 6 },
        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: true },
        ],
      });
      expect(output.type).toBe('bindings');
      // Lateral join: for each LHS binding, evaluate RHS and merge
      await expect(output.bindingsStream).toEqualBindingsStream([
        BF.bindings([[ DF.variable('a'), DF.literal('1') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('1') ], [ DF.variable('b'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('2') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('2') ], [ DF.variable('b'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('3') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('3') ], [ DF.variable('b'), DF.literal('2') ]]),
      ]);
    });

    it('should run with a right bindings stream with undefs', async() => {
      const op: { operation: Lateral; context: IActionContext } =
        { operation: { type: 'lateral', input: [ op3(), op2Undef() ]}, context };
      const output = getSafeBindings(await actor.run(op, undefined));
      await expect(output.metadata()).resolves.toMatchObject({
        cardinality: { type: 'estimate', value: 6 },
        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: true },
        ],
      });
      expect(output.type).toBe('bindings');
      await expect(output.bindingsStream).toEqualBindingsStream([
        BF.bindings([[ DF.variable('a'), DF.literal('1') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('1') ], [ DF.variable('b'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('2') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('2') ], [ DF.variable('b'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('3') ], [ DF.variable('b'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('a'), DF.literal('3') ], [ DF.variable('b'), DF.literal('2') ]]),
      ]);
    });

    it('should keep exact cardinality, dedupe shared variables and skip conflicting merges', async() => {
      // LHS and RHS both bind ?a (shared variable) and both have exact cardinality.
      const opExactA: () => any = () => ({
        metadata: () => Promise.resolve({
          state: new MetadataValidationState(),
          cardinality: { type: 'exact', value: 2 },
          variables: [{ variable: DF.variable('a'), canBeUndef: false }],
        }),
        stream: new ArrayIterator([
          BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
          BF.bindings([[ DF.variable('a'), DF.literal('2') ]]),
        ], { autoStart: false }),
        type: 'bindings',
      });
      const opExactAOne: () => any = () => ({
        metadata: () => Promise.resolve({
          state: new MetadataValidationState(),
          cardinality: { type: 'exact', value: 1 },
          variables: [{ variable: DF.variable('a'), canBeUndef: false }],
        }),
        stream: new ArrayIterator([
          BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
        ], { autoStart: false }),
        type: 'bindings',
      });
      const op: { operation: Lateral; context: IActionContext } =
        { operation: { type: 'lateral', input: [ opExactA(), opExactAOne() ]}, context };
      const output = getSafeBindings(await actor.run(op, undefined));
      // Both cardinalities exact -> exact; the shared ?a is not duplicated.
      await expect(output.metadata()).resolves.toMatchObject({
        cardinality: { type: 'exact', value: 2 },
        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
        ],
      });
      // Only the non-conflicting merge (?a=1 with ?a=1) survives; ?a=2 with ?a=1 conflicts and is skipped.
      await expect(output.bindingsStream).toEqualBindingsStream([
        BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
      ]);
    });

    it('should run on two bindings streams with metadata invalidation', async() => {
      // An operation in which we can access the metadata state
      const state = new MetadataValidationState();
      const opCustom = {
        metadata: () => Promise.resolve({
          state,
          cardinality: { type: 'estimate', value: 2 },
          variables: [{ variable: DF.variable('b'), canBeUndef: false }],
        }),
        stream: new ArrayIterator([
          BF.bindings([[ DF.variable('b'), DF.literal('1') ]]),
          BF.bindings([[ DF.variable('b'), DF.literal('2') ]]),
        ], { autoStart: false }),
        type: 'bindings',
      };

      // Execute the operation, and expect a valid metadata
      const op: any =
        { operation: { type: 'lateral', input: [ op3(), opCustom ]}, context };
      const output: IQueryOperationResultBindings = <any> await actor.run(op, undefined);
      const outputMetadata = await output.metadata();
      expect(outputMetadata).toMatchObject({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 6 },
        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: true },
        ],
      });

      // After invoking this, we expect the returned metadata to also be invalidated
      state.invalidate();
      expect(outputMetadata.state.valid).toBeFalsy();

      // We can request a new metadata object, which will be valid again.
      const outputMetadata2 = await output.metadata();
      expect(outputMetadata2).toMatchObject({
        state: { valid: true },
        cardinality: { type: 'estimate', value: 6 },
        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: true },
        ],
      });
    });

    it('should invalidate its metadata when the left-hand side metadata is invalidated', async() => {
      // A left-hand side operation in which we can access the metadata state
      const state = new MetadataValidationState();
      const opCustom = {
        metadata: () => Promise.resolve({
          state,
          cardinality: { type: 'estimate', value: 3 },
          variables: [{ variable: DF.variable('a'), canBeUndef: false }],
        }),
        stream: new ArrayIterator([
          BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
        ], { autoStart: false }),
        type: 'bindings',
      };

      const op: any = { operation: { type: 'lateral', input: [ opCustom, op2() ]}, context };
      const output: IQueryOperationResultBindings = <any> await actor.run(op, undefined);
      const outputMetadata = await output.metadata();
      expect(outputMetadata.state.valid).toBeTruthy();

      // Invalidating the LHS state should invalidate the combined metadata state.
      state.invalidate();
      expect(outputMetadata.state.valid).toBeFalsy();
    });
  });
});
