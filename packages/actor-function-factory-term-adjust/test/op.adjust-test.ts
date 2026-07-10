import { toAlgebra, SparqlNextParser } from '@comunica/actor-query-parse-sparql-next';
import { DateTimeLiteral, DayTimeDurationLiteral } from '@comunica/utils-expression-evaluator';
import {
  dateTimeTyped,
  dateTyped,
  dayTimeDurationTyped,
  Notation,
  timeTyped,
  runFuncTestTable,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermAdjust } from '../lib';
import { adjustDateTime } from '../lib/TermFunctionAdjust';

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
    '${dateTimeTyped('2002-03-07T10:00:00+05:30')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTimeTyped('2002-03-06T18:30:00-10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00-05:30')}' '${dayTimeDurationTyped('PT10H')}' = '${dateTimeTyped('2002-03-08T01:30:00+10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00+01:00')}' '${dayTimeDurationTyped('PT30M')}' = '${dateTimeTyped('2002-03-07T09:30:00+00:30')}'
    '${dateTimeTyped('2002-03-07T10:00:00+01:00')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${dateTimeTyped('2002-03-06T22:30:00-10:30')}'
    
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-07-10:00')}'
    '${dateTyped('2002-03-07-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-06-10:00')}'
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${dateTyped('2002-03-07-10:30')}'
    '${dateTyped('2002-03-07+05:30')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-06-10:00')}'

    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('07:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('PT10H')}' = '${timeTyped('03:00:00+10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${timeTyped('10:00:00-10:30')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('PT30M')}' = '${timeTyped('10:00:00+00:30')}'
    '${timeTyped('10:00:00+05:30')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('18:30:00-10:00')}'
    '${timeTyped('10:00:00-05:30')}' '${dayTimeDurationTyped('PT10H')}' = '${timeTyped('01:30:00+10:00')}'
  `,
  });
});

describe('adjustDateTime with violated ITimeZoneRepresentation invariant', () => {
  it('treats missing zoneMinutes as 0 when zoneHours is defined', () => {
    // DateTimeLiteral can be constructed with zoneHours defined but zoneMinutes omitted,
    // violating the invariant that both fields come together. The ?? 0 fallback handles this.
    const dateLiteral = new DateTimeLiteral({
      year: 2002,
      month: 3,
      day: 7,
      hours: 10,
      minutes: 0,
      seconds: 0,
      zoneHours: -7,
      // ZoneMinutes intentionally omitted
    });
    const zoneLiteral = new DayTimeDurationLiteral({ hours: -10 });
    const result = adjustDateTime([ dateLiteral, zoneLiteral ]);
    expect(result.str()).toBe('2002-03-07T07:00:00-10:00');
  });

  it('treats missing zoneHours as 0 when zoneMinutes is defined', () => {
    // The symmetric invariant violation: zoneMinutes defined but zoneHours omitted.
    // With the && condition the function reaches the adjust path, so (zoneHours ?? 0) fires.
    // Input: 2002-03-07T10:00:00 with zoneMinutes=30 (offset +00:30), zone = PT0H (UTC).
    // timeDif = { hours: 0 - 0, minutes: 0 - 30 } = { hours: 0, minutes: -30 }
    // → adjusted time: 09:30, new zone: Z → "2002-03-07T09:30:00Z"
    const dateLiteral = new DateTimeLiteral({
      year: 2002,
      month: 3,
      day: 7,
      hours: 10,
      minutes: 0,
      seconds: 0,
      // ZoneHours intentionally omitted
      zoneMinutes: 30,
    });
    const zoneLiteral = new DayTimeDurationLiteral({ hours: 0 });
    const result = adjustDateTime([ dateLiteral, zoneLiteral ]);
    expect(result.str()).toBe('2002-03-07T09:30:00Z');
  });
});
