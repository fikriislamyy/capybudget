import { app } from './app';
import { startBillReminderScheduler } from './personal-finance/reminder-scheduler';

app.listen(Number(process.env.PORT ?? 3000));
startBillReminderScheduler();
console.log('CapyBudget API listening at ' + app.server?.url);
