import { t } from 'elysia';

const money=t.Union([t.String({pattern:'^-?[0-9]+(?:\\.[0-9]{1,4})?$'}),t.Null()]);

export const forecastRefreshAcceptedSchema=t.Object({
  runId:t.String({format:'uuid'}),
  status:t.Union([t.Literal('queued'),t.Literal('running'),t.Literal('ready')]),
  coalesced:t.Boolean()
});

export const forecastSummarySchema=t.Object({
  runId:t.String({format:'uuid'}),asOfDate:t.String({format:'date'}),timezone:t.String(),currency:t.String({minLength:3,maxLength:3}),
  horizonDays:t.Union([t.Literal(30),t.Literal(60),t.Literal(90)]),endDate:t.String({format:'date'}),engineVersion:t.String(),
  status:t.Literal('ready'),stale:t.Boolean(),coverage:t.String(),safeToSpend:money,safeToSpendReason:t.String(),
  protectedAmount:t.String(),minimumBalance:t.String(),firstShortfallDate:t.Union([t.String({format:'date'}),t.Null()]),
  firstLowBalanceDate:t.Union([t.String({format:'date'}),t.Null()]),qualityFlags:t.Array(t.String()),scenarios:t.Array(t.String()),
  assumptionCodes:t.Array(t.String()),history:t.Array(t.Any()),points:t.Array(t.Any())
},{additionalProperties:true});

export const forecastReadResponseSchema=t.Object({
  run:t.Object({id:t.String({format:'uuid'}),status:t.String(),asOfDate:t.String({format:'date'}),horizonDays:t.Number(),currency:t.String(),engineVersion:t.String()},{additionalProperties:true}),
  forecast:forecastSummarySchema,events:t.Array(t.Any()),historyTransactions:t.Array(t.Any()),uncertainReceivables:t.Array(t.Any()),
  suggestions:t.Array(t.Any()),disclaimer:t.String()
},{additionalProperties:false});

export const forecastRunReadResponseSchema=t.Object({
  run:t.Object({id:t.String({format:'uuid'}),status:t.Union([t.Literal('queued'),t.Literal('running'),t.Literal('ready'),t.Literal('failed'),t.Literal('superseded')])},{additionalProperties:true}),
  forecast:t.Object({runId:t.String({format:'uuid'}),asOfDate:t.String({format:'date'}),stale:t.Boolean()},{additionalProperties:true}),
  points:t.Array(t.Any()),events:t.Array(t.Any()),historyTransactions:t.Array(t.Any()),uncertainReceivables:t.Array(t.Any())
},{additionalProperties:false});
