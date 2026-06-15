import { toAlgebra, SparqlNextParser } from '@comunica/actor-query-parse-sparql-next';
import {
  dateTimeTyped,
  dateTyped,
  dayTimeDurationTyped,
  timeTyped,
} from '@comunica/utils-expression-evaluator/lib/test-util/Aliases';
import { Notation } from '@comunica/utils-expression-evaluator/lib/test-util/TestTable';
import { ActorFunctionFactoryTermAdjust } from '../lib';
import { runFuncTestTable } from './util';

describe('evaluation of \'ADJUST\'', () => {
  const parser = new SparqlNextParser({ lexerConfig: { positionTracking: 'full' }});
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermAdjust(args),
    ],
    arity: 2,
    notation: Notation.Function,
    toAlgebraParse: query => toAlgebra(parser.parse(query)),
    operation: 'ADJUST',
    testTable: `
    '${dateTimeTyped('2002-03-07T10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTimeTyped('2002-03-07T10:00:00-10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTimeTyped('2002-03-07T07:00:00-10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00-07:00')}' '${dayTimeDurationTyped('PT10H')}' = '${dateTimeTyped('2002-03-08T03:00:00+10:00')}'
    '${dateTimeTyped('2002-03-07T00:00:00+01:00')}' '${dayTimeDurationTyped('-PT8H')}' = '${dateTimeTyped('2002-03-06T15:00:00-08:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00')}' '${dayTimeDurationTyped('PT0H')}' = '${dateTimeTyped('2002-03-07T10:00:00')}'
    
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-07-10:00')}'
    '${dateTyped('2002-03-07-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-06-10:00')}'
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${dateTyped('2002-03-07-10:30')}'

    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('07:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('PT10H')}' = '${timeTyped('03:00:00+10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${timeTyped('10:00:00-10:30')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('PT30M')}' = '${timeTyped('10:00:00+00:30')}'
  `,
  });
});
