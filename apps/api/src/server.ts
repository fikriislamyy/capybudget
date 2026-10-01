import { app } from './app';
import { startBillReminderScheduler } from './personal-finance/reminder-scheduler';
import { startInvoiceDeliveryScheduler } from './business/worker';
import { startNotificationScheduler } from './notifications/scheduler';

app.listen(Number(process.env.PORT ?? 3000));
startBillReminderScheduler();
startInvoiceDeliveryScheduler();
startNotificationScheduler();
console.log('CapyBudget API listening at ' + app.server?.url);
