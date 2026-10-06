import { startAccountingScheduler } from './business/accounting-routes';
import {startRecurringInvoiceScheduler} from './business/recurring';
import { startPaymentScheduler } from './business/payments';
import { app } from './app';
import { startBillReminderScheduler } from './personal-finance/reminder-scheduler';
import { startInvoiceDeliveryScheduler } from './business/worker';
import { startNotificationScheduler } from './notifications/scheduler';

app.listen(Number(process.env.PORT ?? 3000));
startBillReminderScheduler();
startInvoiceDeliveryScheduler();
startAccountingScheduler();
startPaymentScheduler();
startRecurringInvoiceScheduler();
startNotificationScheduler();
console.log('CapyBudget API listening at ' + app.server?.url);
