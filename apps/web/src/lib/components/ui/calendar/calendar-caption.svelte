<script lang="ts">
	import { DateFormatter, getLocalTimeZone, type DateValue } from "@internationalized/date";
	import ChoiceSelect from "$lib/components/forms/choice-select.svelte";
	import type CalendarMonthSelect from "./calendar-month-select.svelte";
	import type CalendarYearSelect from "./calendar-year-select.svelte";
	import type Calendar from "./calendar.svelte";
	import type { ComponentProps } from "svelte";

	let {
		captionLayout,
		months,
		monthFormat,
		years,
		yearFormat,
		month,
		locale,
		placeholder = $bindable(),
		monthIndex = 0,
	}: {
		captionLayout: ComponentProps<typeof Calendar>["captionLayout"];
		months: ComponentProps<typeof CalendarMonthSelect>["months"];
		monthFormat: ComponentProps<typeof CalendarMonthSelect>["monthFormat"];
		years: ComponentProps<typeof CalendarYearSelect>["years"];
		yearFormat: ComponentProps<typeof CalendarYearSelect>["yearFormat"];
		month: DateValue;
		placeholder: DateValue | undefined;
		locale: string;
		monthIndex: number;
	} = $props();

	function formatYear(date: DateValue) {
		const dateObj = date.toDate(getLocalTimeZone());
		if (typeof yearFormat === "function") return yearFormat(dateObj.getFullYear());
		return new DateFormatter(locale, { year: yearFormat }).format(dateObj);
	}

	function formatMonth(date: DateValue) {
		const dateObj = date.toDate(getLocalTimeZone());
		if (typeof monthFormat === "function") return monthFormat(dateObj.getMonth() + 1);
		return new DateFormatter(locale, { month: monthFormat }).format(dateObj);
	}
</script>

{#snippet MonthSelect()}
  <ChoiceSelect value={month.month} aria-label={locale.startsWith('id') ? 'Bulan' : 'Month'} items={Array.from({length:12}, (_, index) => ({value:index + 1, label:formatMonth(month.set({month:index + 1}))}))} onValueChange={(value) => { placeholder = month.set({month:Number(value)}).subtract({months:monthIndex}); }} />
{/snippet}

{#snippet YearSelect()}
  <ChoiceSelect value={month.year} aria-label={locale.startsWith('id') ? 'Tahun' : 'Year'} items={Array.from({length:201}, (_, index) => ({value:month.year - 100 + index, label:String(month.year - 100 + index)}))} onValueChange={(value) => { placeholder = month.set({year:Number(value)}).subtract({months:monthIndex}); }} />
{/snippet}

{#if captionLayout === "dropdown"}
	{@render MonthSelect()}
	{@render YearSelect()}
{:else if captionLayout === "dropdown-months"}
	{@render MonthSelect()}
	{#if placeholder}
		{formatYear(placeholder)}
	{/if}
{:else if captionLayout === "dropdown-years"}
	{#if placeholder}
		{formatMonth(placeholder)}
	{/if}
	{@render YearSelect()}
{:else}
	{formatMonth(month)} {formatYear(month)}
{/if}
