import { TermFunctionBase } from '@comunica/bus-function-factory';
import type { IDateTimeRepresentation, IDurationRepresentation, ITimeZoneRepresentation } from '@comunica/types';
import type {
  DayTimeDurationLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  defaultedDateTimeRepresentation,

  toUTCDate,
  defaultedDurationRepresentation,
  addDurationToDateTime,
  DateTimeLiteral,
  declare,
  TypeURL,

  DateLiteral,

  TimeLiteral,
} from '@comunica/utils-expression-evaluator';

function numSerializer(num: number, min = 2): string {
  return num.toLocaleString(undefined, { minimumIntegerDigits: min, useGrouping: false });
}

// TODO: fix upstream
function serializeTimeZone(tz: Partial<ITimeZoneRepresentation>): string {
  // https://www.w3.org/TR/xmlschema-2/#dateTime-timezones
  if (tz.zoneHours === undefined && tz.zoneMinutes === undefined) {
    return '';
  }
  const hours = tz.zoneHours ?? 0;
  const minutes = tz.zoneMinutes ?? 0;
  // SerializeTimeZone({ zoneHours: 5, zoneMinutes: 4 }) returns +05:04
  return `${hours >= 0 ? `+${numSerializer(hours)}` : numSerializer(hours)}:${numSerializer(Math.abs(minutes))}`;
}

class MyDateTimeLiteral extends DateTimeLiteral {
  public override str(): string {
    // TODO: fix upstream
    return super.str() + serializeTimeZone(this.typedValue);
  }
}

class MyDateLiteral extends DateLiteral {
  public override str(): string {
    // Upstream serializeDate skips timezone when zoneMinutes is undefined; use local serializer in that case
    const { zoneHours, zoneMinutes } = this.typedValue;
    if (zoneHours !== undefined && zoneMinutes !== undefined) {
      return super.str();
    }
    return super.str() + serializeTimeZone(this.typedValue);
  }
}

class MyTimeLiteral extends TimeLiteral {
  public override str(): string {
    // Upstream serializeTime skips timezone when zoneMinutes is undefined; use local serializer in that case
    const { zoneHours, zoneMinutes } = this.typedValue;
    if (zoneHours !== undefined && zoneMinutes !== undefined) {
      return super.str();
    }
    return super.str() + serializeTimeZone(this.typedValue);
  }
}

function myFloor(x: number): number {
  if (x < 0) {
    return -1 * Math.floor(-1 * x);
  }
  return Math.floor(x);
}

function elapsedDuration(
  first: IDateTimeRepresentation,
  second: IDateTimeRepresentation,
  defaultTimeZone: ITimeZoneRepresentation,
): Partial<IDurationRepresentation> {
  const d1 = toUTCDate(first, defaultTimeZone);
  const d2 = toUTCDate(second, defaultTimeZone);
  const diff = d1.getTime() - d2.getTime();
  // Todo: something is off here for negative days
  return {
    day: myFloor(diff / (1_000 * 60 * 60 * 24)),
    hours: myFloor((diff % (1_000 * 60 * 60 * 24)) / (1_000 * 60 * 60)),
    minutes: myFloor(diff % (1_000 * 60 * 60) / (1_000 * 60)),
    seconds: diff % (1_000 * 60),
  };
}

function adjustDateTime([ date, timezone ]: [DateTimeLiteral, DayTimeDurationLiteral]): DateTimeLiteral {
  const typeDate = date.typedValue;
  const typeDur = timezone.typedValue;
  if (typeDate.zoneMinutes ?? typeDate.zoneHours === undefined) {
    return new MyDateTimeLiteral({
      ...typeDate,
      zoneHours: typeDur.hours,
      zoneMinutes: typeDur.minutes,
    });
  }
  // Take the timezone from the dateTime, subtract it from the dateTime, add the new timezone
  const timeDif = defaultedDurationRepresentation(elapsedDuration(
    defaultedDurationRepresentation(typeDur),
    defaultedDurationRepresentation({
      hours: typeDate.zoneHours,
      minutes: typeDate.zoneMinutes,
    }),
    { zoneHours: 0, zoneMinutes: 0 },
  ));
  const firstOp = addDurationToDateTime(typeDate, timeDif);
  return new MyDateTimeLiteral({
    ...firstOp,
    zoneHours: typeDur.hours,
    zoneMinutes: typeDur.minutes,
  });
}

/**
 * https://github.com/w3c/sparql-dev/blob/main/SEP/SEP-0002/sep-0002.md
 * https://www.w3.org/TR/xpath-functions/#func-adjust-dateTime-to-timezone
 */
export class TermFunctionAdjust extends TermFunctionBase {
  public constructor() {
    super({
      arity: 2,
      operator: 'adjust',
      overloads: declare('adjust')
        // ExprEval.context.getSafe(KeysExpressionEvaluator.defaultTimeZone)
        .set(
          [ TypeURL.XSD_DATE_TIME, TypeURL.XSD_DAY_TIME_DURATION ],
          () => adjustDateTime,
        ).set(
          [ TypeURL.XSD_DATE, TypeURL.XSD_DAY_TIME_DURATION ],
          () => ([ date, timezone ]: [DateLiteral, DayTimeDurationLiteral]) => {
            const asDateTime = new DateTimeLiteral(defaultedDateTimeRepresentation(date.typedValue));
            const asTimedDate = adjustDateTime([ asDateTime, timezone ]);
            const tv = asTimedDate.typedValue;
            // TODO: can introduce this trim function upstream
            return new MyDateLiteral({
              day: tv.day,
              month: tv.month,
              year: tv.year,
              zoneHours: tv.zoneHours,
              zoneMinutes: tv.zoneMinutes,
            });
          },
        ).set(
          [ TypeURL.XSD_TIME, TypeURL.XSD_DAY_TIME_DURATION ],
          () => ([ time, timezone ]: [TimeLiteral, DayTimeDurationLiteral]) => {
            const asDateTime = new DateTimeLiteral({
              ...time.typedValue,
              year: 1972,
              month: 12,
              day: 31,
            });
            const asTimedDate = adjustDateTime([ asDateTime, timezone ]);
            const tv = asTimedDate.typedValue;
            return new MyTimeLiteral({
              hours: tv.hours,
              minutes: tv.minutes,
              seconds: tv.seconds,
              zoneHours: tv.zoneHours,
              zoneMinutes: tv.zoneMinutes,
            });
          },
        ).collect(),
    });
  }
}
