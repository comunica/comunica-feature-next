import { ActorQueryOperation } from '@comunica/bus-query-operation';
import type { IActionRdfMetadataAccumulate, MediatorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext, IQueryOperationResultBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { getSafeBindings } from '@comunica/utils-query-operation';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import type { Lateral } from '../lib/ActorQueryOperationLateral';
import { ActorQueryOperationLateral } from '../lib/ActorQueryOperationLateral';
import '@comunica/utils-jest';
import 'jest-rdf';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('ActorQueryOperationLateral', () => {
  let context: IActionContext;
  let bus: any;
  let mediatorQueryOperation: any;
  let mediatorRdfMetadataAccumulate: MediatorRdfMetadataAccumulate;
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
    mediatorRdfMetadataAccumulate = <any> {
      async mediate(action: IActionRdfMetadataAccumulate) {
        if (action.mode === 'initialize') {
          return { metadata: { cardinality: { type: 'exact', value: 0 }}};
        }

        const metadata = { ...action.accumulatedMetadata };
        const subMetadata = action.appendingMetadata;
        if (!subMetadata.cardinality || !Number.isFinite(subMetadata.cardinality.value)) {
          // We're already at infinite, so ignore any later metadata
          metadata.cardinality.type = 'estimate';
          metadata.cardinality.value = Number.POSITIVE_INFINITY;
        } else {
          if (subMetadata.cardinality.type === 'estimate') {
            metadata.cardinality.type = 'estimate';
          }
          metadata.cardinality.value += subMetadata.cardinality.value;
        }
        if (metadata.requestTime ?? subMetadata.requestTime) {
          metadata.requestTime = metadata.requestTime ?? 0;
          subMetadata.requestTime = subMetadata.requestTime ?? 0;
          metadata.requestTime += subMetadata.requestTime;
        }
        if (metadata.pageSize ?? subMetadata.pageSize) {
          metadata.pageSize = metadata.pageSize ?? 0;
          subMetadata.pageSize = subMetadata.pageSize ?? 0;
          metadata.pageSize += subMetadata.pageSize;
        }

        return { metadata };
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

  describe('The ActorQueryOperationUnion module', () => {
    it('should be a function', () => {
      expect(ActorQueryOperationLateral).toBeInstanceOf(Function);
    });

    it('should be a ActorQueryOperationUnion constructor', () => {
      expect(new (<any> ActorQueryOperationLateral)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperationLateral);
      expect(new (<any> ActorQueryOperationLateral)({ name: 'actor', bus, mediatorQueryOperation }))
        .toBeInstanceOf(ActorQueryOperation);
    });

    it('should not be able to create new ActorQueryOperationUnion objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryOperationLateral)();
      }).toThrow(`Class constructor ActorQueryOperationLateral cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQueryOperationUnion instance', () => {
    let actor: ActorQueryOperationLateral;

    beforeEach(() => {
      actor = new ActorQueryOperationLateral(
        { name: 'actor', bus, mediatorQueryOperation },
      );
    });

    it('should test on union', async() => {
      const input = [ op3(), op2() ];
      await expect(actor.test(<any> {
        operation: { type: 'lateral', input },
        context,
      })).resolves.toPassTestVoid();
      for (const op of input) {
        op.stream.destroy();
      }
    });

    it('should not test on non-union', async() => {
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
  });
});
